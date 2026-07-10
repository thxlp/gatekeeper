import { Injectable, Logger } from '@nestjs/common';
import * as Docker from 'dockerode';
import * as tarFs from 'tar-fs';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import * as crypto from 'crypto';
import { AddonConnection, AppAddon, GitApp } from '../common/types';

export interface BuildResult {
  ok: boolean;
  imageTag?: string;
  reason?: string;
  // port ที่ container จะ listen — เดาจาก EXPOSE ใน Dockerfile หรือ default ตาม runtime
  // ส่งต่อให้ runContainer ใช้ healthcheck และ persist กลับเข้า store ให้ live proxy ใช้ต่อ
  port?: number;
}

export interface RunResult {
  ok: boolean;
  port?: number;
  reason?: string;
  // true = container รันอยู่แต่ยังไม่ตอบ HTTP/TCP ภายใน timeout (deploy ผ่านแบบเฝ้าระวัง)
  degraded?: boolean;
}

// Port default ต่อ runtime เมื่อผู้ใช้ไม่ได้ระบุ app.port เองและ Dockerfile ไม่มี EXPOSE
export const RUNTIME_PORT: Record<string, number> = {
  static: 80,
  node: 8080,
  python: 8000,
};

const DEFAULT_SERVE_PORT = 80;

/**
 * หา port ที่ container ของแอป listen จริง ตามลำดับความน่าเชื่อถือ:
 *   1. app.port ที่ผู้ใช้ระบุเองตอนลงทะเบียน (แม่นที่สุด)
 *   2. EXPOSE จาก Dockerfile (own หรือ generated)
 *   3. default ตาม runtime
 *   4. 80 (fallback สุดท้าย — static/unknown)
 * ใช้ร่วมกันทั้งตอน healthcheck (stage 5) และตอน proxy /live/<id> (live.controller.ts)
 */
export function resolveServePort(app: GitApp, exposedPort?: number): number {
  if (app.port && Number.isFinite(app.port)) return app.port;
  if (exposedPort && Number.isFinite(exposedPort)) return exposedPort;
  return RUNTIME_PORT[app.runtime || 'static'] || DEFAULT_SERVE_PORT;
}

/** ดึงเลข port ตัวแรกจากบรรทัด EXPOSE ใน Dockerfile (รองรับ "EXPOSE 3000" / "EXPOSE 3000/tcp") */
function parseExposedPort(dockerfileContent: string): number | undefined {
  const m = dockerfileContent.match(/^\s*EXPOSE\s+(\d{1,5})/im);
  if (!m) return undefined;
  const port = Number(m[1]);
  return port >= 1 && port <= 65535 ? port : undefined;
}

// resource default + cap (ผู้ใช้ตั้ง memoryMb/cpu ได้ แต่ไม่เกิน cap เพื่อกัน 1 app กิน host หมด)
const DEFAULT_MEMORY_MB = 256;
const MAX_MEMORY_MB = Number(process.env.APP_MAX_MEMORY_MB || 1024);
const MIN_MEMORY_MB = 64;
const DEFAULT_CPU = 0.5;
const MAX_CPU = Number(process.env.APP_MAX_CPU || 2);
const MIN_CPU = 0.1;
// healthcheck รอนานขึ้นและตั้งค่าได้ผ่าน env — งานทั่วไปหลายตัว build/warm-up ตอน boot นานกว่า 30 วิ
const HEALTHCHECK_TIMEOUT_MS = Number(process.env.DEPLOY_HEALTHCHECK_TIMEOUT_MS || 60_000);
const HEALTHCHECK_INTERVAL_MS = 1_000;
const ADDON_READY_TIMEOUT_MS = 40_000;

// spec ต่อ addon: image + port + วิธี build connection URL/env ที่ inject เข้า app
const ADDON_SPEC: Record<
  AppAddon,
  {
    image: string;
    port: number;
    envKey: string;
    dataPath: string;
    cmd?: string[];
    containerEnv: (password: string) => string[];
    buildUrl: (host: string, port: number, password: string) => string;
  }
> = {
  postgres: {
    image: 'postgres:16-alpine',
    port: 5432,
    envKey: 'DATABASE_URL',
    dataPath: '/var/lib/postgresql/data',
    containerEnv: (pw) => [`POSTGRES_USER=appuser`, `POSTGRES_PASSWORD=${pw}`, `POSTGRES_DB=appdb`],
    buildUrl: (host, port, pw) => `postgres://appuser:${pw}@${host}:${port}/appdb`,
  },
  redis: {
    image: 'redis:7-alpine',
    port: 6379,
    envKey: 'REDIS_URL',
    dataPath: '/data',
    cmd: ['redis-server', '--appendonly', 'yes'],
    containerEnv: () => [],
    buildUrl: (host, port) => `redis://${host}:${port}`,
  },
};

/** จำกัด memory/cpu ให้อยู่ในกรอบ (คืน bytes + nanoCpus ตามที่ Docker ต้องการ) */
function clampResources(memoryMb?: number, cpu?: number): { memoryBytes: number; nanoCpus: number } {
  const mb = Math.min(MAX_MEMORY_MB, Math.max(MIN_MEMORY_MB, memoryMb || DEFAULT_MEMORY_MB));
  const c = Math.min(MAX_CPU, Math.max(MIN_CPU, cpu || DEFAULT_CPU));
  return { memoryBytes: mb * 1024 * 1024, nanoCpus: Math.round(c * 1e9) };
}

// network ภายในแยกต่างหากสำหรับ app ที่ deploy มา (ไม่ใช่ default network ที่ backend/postgres อยู่)
// ต้องสร้าง network นี้ไว้ล่วงหน้าผ่าน docker-compose.yml (ดู deployments/docker/docker-compose.yml)
const APPS_NETWORK = process.env.GATEKEEPER_APPS_NETWORK || 'gatekeeper-apps-net';

/**
 * รัน container จริงต่อแอป — คุยกับ Docker ผ่าน dockerode ซึ่งชี้ไปที่ docker-socket-proxy
 * (จำกัดสิทธิ์ API ไว้แคบๆ) แทนการ mount /var/run/docker.sock ตรงเข้า backend เอง ดู
 * deployments/docker/docker-compose.yml สำหรับการตั้งค่า proxy นี้ (ต้องรันเองโดย user)
 */
@Injectable()
export class DockerRuntimeService {
  private readonly logger = new Logger(DockerRuntimeService.name);
  private docker: Docker;

  constructor() {
    const dockerHost = process.env.DOCKER_HOST;
    this.docker = dockerHost
      ? new Docker({ host: dockerHost.replace(/^tcp:\/\//, ''), port: Number(process.env.DOCKER_PORT || 2375) })
      : new Docker({ socketPath: '/var/run/docker.sock' });
  }

  async buildImage(stagingDir: string, app: GitApp, requestId: string): Promise<BuildResult> {
    const runtime = app.runtime || 'static';
    const dockerfilePath = path.join(stagingDir, 'Dockerfile');
    const hasOwnDockerfile = fs.existsSync(dockerfilePath);

    // ยึด Dockerfile ของลูกค้าเป็นหลักถ้ามี — bring-your-own-Dockerfile รองรับได้ทุกภาษา/เฟรมเวิร์ก
    // (runtime 'docker' = "ผมมี Dockerfile เอง") ถ้าไม่มีค่อย generate ให้ตาม runtime ที่รู้จัก
    if (!hasOwnDockerfile) {
      if (runtime === 'docker') {
        return { ok: false, reason: 'docker_runtime_requires_dockerfile — ต้องมีไฟล์ Dockerfile ใน repo' };
      }
      const generated = this.generateDockerfile(app, stagingDir);
      if (!generated.ok) return generated;
    }

    // อ่าน EXPOSE จาก Dockerfile (own หรือ generated) เพื่อรู้ port ที่ container จะ listen
    let exposedPort: number | undefined;
    try {
      exposedPort = parseExposedPort(fs.readFileSync(dockerfilePath, 'utf8'));
    } catch {
      // อ่านไม่ได้ก็ปล่อย ให้ resolveServePort ตกไป default ตาม runtime
    }
    const servePort = resolveServePort(app, exposedPort);

    // build args (เช่น token/flag ตอน build) — value ถูก decrypt มาจาก store แล้ว
    const buildargs: Record<string, string> = {};
    for (const a of app.buildArgs || []) {
      if (a.key) buildargs[a.key] = a.value;
    }

    const imageTag = `gatekeeper-app-${app.id}:${requestId}`;
    const tarStream = tarFs.pack(stagingDir);

    try {
      const buildStream = await this.docker.buildImage(tarStream, { t: imageTag, buildargs });
      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(buildStream, (err: any, res: any[]) => {
          if (err) return reject(err);
          const errorEvent = (res || []).find((e: any) => e.error);
          if (errorEvent) return reject(new Error(errorEvent.error));
          resolve();
        });
      });
    } catch (err: any) {
      this.logger.error(`build failed for ${app.id}: ${err.message}`);
      return { ok: false, reason: `build_failed:${err.message}` };
    }

    return { ok: true, imageTag, port: servePort };
  }

  private generateDockerfile(app: GitApp, stagingDir: string): BuildResult {
    const runtime = app.runtime || 'static';
    if (runtime === 'node') {
      const pkgPath = path.join(stagingDir, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        return { ok: false, reason: 'node_runtime_requires_package_json' };
      }
      let pkg: any;
      try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      } catch {
        return { ok: false, reason: 'node_runtime_invalid_package_json' };
      }

      // เลือกคำสั่งรัน: scripts.start ก่อน ถ้าไม่มีค่อย fallback ไป main field / ไฟล์ entry ที่พบบ่อย
      // (แอป node ทั่วไปจำนวนมากไม่ได้ตั้ง scripts.start แต่มี server.js/index.js ให้รันตรงๆ ได้)
      let cmd: string[] | null = null;
      if (pkg?.scripts?.start) {
        cmd = ['npm', 'start'];
      } else {
        const entry = [pkg?.main, 'server.js', 'index.js', 'app.js', 'src/index.js', 'src/server.js'].find(
          (e) => typeof e === 'string' && e && fs.existsSync(path.join(stagingDir, e)),
        );
        if (entry) cmd = ['node', entry];
      }
      if (!cmd) {
        return {
          ok: false,
          reason: 'node_runtime_no_start — เพิ่ม "scripts.start" ใน package.json, ระบุ "main", หรือมีไฟล์ server.js/index.js/app.js',
        };
      }

      // ถ้ามี scripts.build (Next.js/React/Vite/TS) ต้องติดตั้ง devDependencies + รัน build ก่อน start
      // — ไม่งั้น --omit=dev จะตัด toolchain ที่ build ต้องใช้ทิ้ง แล้ว build พังหรือรันไม่ขึ้น
      const hasBuild = !!pkg?.scripts?.build;
      const installCmd = hasBuild
        ? 'RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi'
        : 'RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi';

      fs.writeFileSync(
        path.join(stagingDir, 'Dockerfile'),
        [
          'FROM node:20-alpine',
          'WORKDIR /app',
          'COPY . .',
          installCmd,
          ...(hasBuild ? ['RUN npm run build'] : []),
          'ENV PORT=8080',
          'EXPOSE 8080',
          `CMD ${JSON.stringify(cmd)}`,
          '',
        ].join('\n'),
      );
      return { ok: true };
    }

    if (runtime === 'python') {
      // เลือก entry ที่พบบ่อย — ถ้าไม่เจอไฟล์เหล่านี้และไม่ได้แนบ Dockerfile เอง บอกให้ชัด
      const entry = ['main.py', 'app.py', 'run.py', 'wsgi.py', 'manage.py'].find((e) =>
        fs.existsSync(path.join(stagingDir, e)),
      );
      if (!entry) {
        return {
          ok: false,
          reason: 'python_runtime_no_entry — ต้องมี main.py/app.py/run.py หรือแนบ Dockerfile เอง',
        };
      }
      const hasRequirements = fs.existsSync(path.join(stagingDir, 'requirements.txt'));
      fs.writeFileSync(
        path.join(stagingDir, 'Dockerfile'),
        [
          'FROM python:3.12-slim',
          'WORKDIR /app',
          'COPY . .',
          hasRequirements
            ? 'RUN pip install --no-cache-dir -r requirements.txt'
            : '# ไม่มี requirements.txt — ข้ามการติดตั้ง dependency',
          'ENV PORT=8000',
          'EXPOSE 8000',
          `CMD ["python", "${entry}"]`,
          '',
        ].join('\n'),
      );
      return { ok: true };
    }

    // static (default)
    const dockerfileLines = ['FROM nginx:alpine', 'COPY . /usr/share/nginx/html'];
    if (app.spa) {
      // SPA history-fallback: route ที่ไม่ตรงไฟล์จริงให้ตกไป /index.html (client-side routing ไม่ 404)
      fs.writeFileSync(
        path.join(stagingDir, '.gatekeeper-spa.conf'),
        [
          'server {',
          '  listen 80;',
          '  root /usr/share/nginx/html;',
          '  location / { try_files $uri $uri/ /index.html; }',
          '}',
          '',
        ].join('\n'),
      );
      dockerfileLines.push('COPY .gatekeeper-spa.conf /etc/nginx/conf.d/default.conf');
    }
    dockerfileLines.push('EXPOSE 80', '');
    fs.writeFileSync(path.join(stagingDir, 'Dockerfile'), dockerfileLines.join('\n'));
    return { ok: true };
  }

  /**
   * สร้าง container ใหม่จาก image ที่ build เสร็จแล้ว รอ healthcheck ผ่านก่อนค่อยสลับเข้าแทน
   * container เดิม (ถ้ามี) — ถ้า healthcheck ไม่ผ่าน container เดิมยังรันให้บริการต่อเหมือนเดิม
   * ทุกอย่าง (rollback-safe เหมือน philosophy เดิมของฝั่ง BLOCK ที่ไม่แตะ deployedDir เก่า)
   */
  async runContainer(app: GitApp, imageTag: string, servePort?: number): Promise<RunResult> {
    const containerName = `gatekeeper-app-${app.id}`;
    const port = servePort ?? resolveServePort(app);

    const previous = this.docker.getContainer(containerName);
    let previousExisted = true;
    try {
      await previous.inspect();
    } catch {
      previousExisted = false;
    }

    const stagingContainerName = `${containerName}-staging`;
    try {
      await this.docker.getContainer(stagingContainerName).remove({ force: true });
    } catch {
      // ไม่มี container ค้างจากรอบก่อน ก็ไม่เป็นไร
    }

    const { memoryBytes, nanoCpus } = clampResources(app.memoryMb, app.cpu);
    const dataVolume = `${containerName}-data`; // named volume (auto-create ตอน create ไม่ต้องใช้ /volumes API)

    let container: Docker.Container;
    try {
      container = await this.docker.createContainer({
        name: stagingContainerName,
        Image: imageTag,
        Env: this.buildContainerEnv(app, port),
        HostConfig: {
          Memory: memoryBytes,
          NanoCpus: nanoCpus,
          SecurityOpt: ['no-new-privileges'],
          NetworkMode: APPS_NETWORK,
          RestartPolicy: { Name: 'unless-stopped' },
          // persistent storage: named volume mount ที่ /data — แอปเขียนข้อมูลถาวรไว้ที่นี่ได้
          // (คงอยู่ข้าม redeploy เพราะ volume ไม่ถูกลบตอน container ถูกแทนที่)
          Binds: [`${dataVolume}:/data`],
        },
      });
      await container.start();
    } catch (err: any) {
      return { ok: false, reason: `container_start_failed:${err.message}` };
    }

    const health = await this.waitForHealthy(container, port);
    // rollback เฉพาะกรณี container ตายจริง (exit/crash) — ถ้ายังรันอยู่แต่ยังไม่ตอบ probe ('degraded')
    // ถือว่า deploy ได้ (งานทั่วไปหลายตัวไม่ตอบ HTTP ที่ '/' หรือไม่ใช่ HTTP เลย แต่ทำงานปกติ)
    if (health === 'dead') {
      await container.remove({ force: true }).catch(() => undefined);
      return { ok: false, reason: 'container_exited_before_ready' };
    }

    if (previousExisted) {
      await previous.remove({ force: true }).catch(() => undefined);
    }
    await container.rename({ name: containerName } as any);

    if (health === 'degraded') {
      this.logger.warn(
        `app ${app.id} deployed but not responding on port ${port} within healthcheck window — serving anyway (container is running)`,
      );
    }
    return { ok: true, port, degraded: health === 'degraded' };
  }

  /**
   * ประกอบ env ที่ inject เข้า container ตามลำดับ (ท้ายสุดชนะ):
   *   1. default ช่วยให้ bind ถูก interface — HOST/HOSTNAME/FLASK_RUN_HOST=0.0.0.0 + PORT
   *      (แอปที่ default listen 127.0.0.1 จะเข้าไม่ถึงจาก container อื่น/healthcheck)
   *   2. connection ของ addon ที่ provision ให้ (DATABASE_URL/REDIS_URL)
   *   3. env ที่ผู้ใช้ตั้งเอง (override ค่า default/addon ได้ถ้าตั้งใจ)
   */
  private buildContainerEnv(app: GitApp, port: number): string[] {
    const merged: Record<string, string> = {
      HOST: '0.0.0.0',
      HOSTNAME: '0.0.0.0',
      FLASK_RUN_HOST: '0.0.0.0',
      PORT: String(port),
    };
    for (const c of app.addonConnections || []) merged[c.envKey] = c.url;
    for (const e of app.envVars || []) {
      if (e.key) merged[e.key] = e.value;
    }
    return Object.entries(merged).map(([k, v]) => `${k}=${v}`);
  }

  /**
   * provision backing service ที่ผู้ใช้ขอ (app.addons) เป็น container พี่น้องบน apps-network
   * แล้วอัปเดต app.addonConnections (มี URL/secret) ให้ caller เอาไป persist + inject เป็น env
   * idempotent: ถ้า container มีอยู่แล้ว reuse connection เดิม (password เดิมใน volume)
   */
  async provisionAddons(app: GitApp): Promise<{ ok: boolean; reason?: string }> {
    const wanted = app.addons || [];
    const connections: AddonConnection[] = [];
    for (const type of wanted) {
      try {
        connections.push(await this.ensureAddon(app, type));
      } catch (err: any) {
        return { ok: false, reason: `addon_${type}_failed:${err.message}` };
      }
    }
    app.addonConnections = connections;
    return { ok: true };
  }

  private async ensureAddon(app: GitApp, type: AppAddon): Promise<AddonConnection> {
    const spec = ADDON_SPEC[type];
    const containerName = `gatekeeper-app-${app.id}-${type}`;
    const existing = app.addonConnections?.find((c) => c.type === type);

    // reuse password เดิมถ้าเคย provision แล้ว (volume ผูกกับ password ตอน init ครั้งแรก
    // ถ้าเปลี่ยน password แต่ volume เดิม auth จะพัง) — postgres ดึงจาก URL, redis ไม่มี password
    let password = '';
    if (type === 'postgres') {
      password = existing ? this.parsePassword(existing.url) : crypto.randomBytes(18).toString('hex');
    }

    const container = this.docker.getContainer(containerName);
    let state: string | undefined;
    try {
      state = (await container.inspect()).State?.Status;
    } catch {
      state = undefined; // ยังไม่มี container
    }

    if (state === 'running') {
      // มีอยู่และรันอยู่แล้ว — reuse connection เดิม (หรือประกอบใหม่จาก password ที่ parse ได้)
      return existing ?? this.buildAddonConnection(type, containerName, password);
    }
    if (state) {
      // มี container แต่ไม่ได้รัน (stopped) — start แล้วใช้ connection เดิม
      await container.start().catch(() => undefined);
      return existing ?? this.buildAddonConnection(type, containerName, password);
    }

    // ยังไม่มี — สร้างใหม่
    try {
      await this.docker.getContainer(`${containerName}-old`).remove({ force: true });
    } catch {
      /* ไม่มีของค้าง */
    }
    const created = await this.docker.createContainer({
      name: containerName,
      Image: spec.image,
      Env: spec.containerEnv(password),
      ...(spec.cmd ? { Cmd: spec.cmd } : {}),
      HostConfig: {
        Memory: 256 * 1024 * 1024,
        NanoCpus: Math.round(0.5 * 1e9),
        NetworkMode: APPS_NETWORK,
        RestartPolicy: { Name: 'unless-stopped' },
        Binds: [`${containerName}-data:${spec.dataPath}`],
      },
    });
    await created.start();

    // รอ addon เปิดรับ TCP ก่อนให้แอปต่อ (แอปมักต่อ DB ตอน boot)
    const ready = await this.waitForAddon(created, spec.port);
    if (!ready) {
      throw new Error(`${type}_not_ready`);
    }
    return this.buildAddonConnection(type, containerName, password);
  }

  private buildAddonConnection(type: AppAddon, containerName: string, password: string): AddonConnection {
    const spec = ADDON_SPEC[type];
    return {
      type,
      containerName,
      envKey: spec.envKey,
      url: spec.buildUrl(containerName, spec.port, password),
    };
  }

  private parsePassword(url: string): string {
    try {
      return new URL(url).password;
    } catch {
      return '';
    }
  }

  private async waitForAddon(container: Docker.Container, port: number): Promise<boolean> {
    const deadline = Date.now() + ADDON_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const info = await container.inspect();
        const ip = info.NetworkSettings?.Networks?.[APPS_NETWORK]?.IPAddress;
        if (ip && (await this.tcpProbe(ip, port))) return true;
      } catch {
        return false;
      }
      await new Promise((r) => setTimeout(r, HEALTHCHECK_INTERVAL_MS));
    }
    return false;
  }

  /** ลบ container ของแอป + addon ทั้งหมด (เรียกตอนลบ app) — named volume ยังคงค้าง (proxy ปิด /volumes API) */
  async removeAppContainers(app: GitApp): Promise<void> {
    const names = [`gatekeeper-app-${app.id}`, ...(app.addons || []).map((t) => `gatekeeper-app-${app.id}-${t}`)];
    for (const name of names) {
      await this.docker.getContainer(name).remove({ force: true }).catch(() => undefined);
    }
  }

  /**
   * รอให้ container พร้อมรับ traffic แบบยืดหยุ่น คืนค่า 3 สถานะ:
   *   'healthy'  — ตอบ HTTP <500 หรือเปิด TCP port แล้ว (พร้อมจริง)
   *   'degraded' — หมด timeout แล้วยังไม่ตอบ probe แต่ container ยังรันอยู่ (ไม่ crash) → ปล่อยผ่าน
   *   'dead'     — container exit/crash ระหว่างรอ → ให้ caller rollback
   * เดิมบังคับ HTTP 200-499 ที่ '/' เท่านั้น ทำให้แอปที่ใช้ port อื่น/boot ช้า/ไม่มี route '/'
   * โดน rollback ทั้งที่ทำงานได้ — ผ่อนเป็น "container ไม่ตาย = deploy ได้"
   */
  private async waitForHealthy(
    container: Docker.Container,
    port: number,
  ): Promise<'healthy' | 'degraded' | 'dead'> {
    const deadline = Date.now() + HEALTHCHECK_TIMEOUT_MS;

    while (Date.now() < deadline) {
      let info: Docker.ContainerInspectInfo;
      try {
        info = await container.inspect();
      } catch {
        return 'dead';
      }
      const state = info.State;
      // exit/crash ชัดเจน หรือ crash-loop (restart policy เด้งซ้ำหลายรอบ) = ตายจริง
      if (state?.Status === 'exited' || state?.Dead || (state?.Restarting && (info.RestartCount ?? 0) > 3)) {
        return 'dead';
      }

      const ip = info.NetworkSettings?.Networks?.[APPS_NETWORK]?.IPAddress;
      if (ip) {
        if (await this.httpProbe(ip, port)) return 'healthy';
        if (await this.tcpProbe(ip, port)) return 'healthy';
      }
      await new Promise((r) => setTimeout(r, HEALTHCHECK_INTERVAL_MS));
    }

    // หมดเวลา — ตัดสินจากสภาพ container: ยังรันอยู่ = degraded (ปล่อยผ่าน), ไม่งั้น = dead
    try {
      const info = await container.inspect();
      return info.State?.Running ? 'degraded' : 'dead';
    } catch {
      return 'dead';
    }
  }

  private httpProbe(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get({ host, port, path: '/', timeout: 2000 }, (res) => {
        res.resume();
        resolve((res.statusCode ?? 500) < 500);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /** เปิด TCP ไปที่ port ได้ = มี server listen อยู่ ถือว่าพร้อม (เผื่อแอปที่ไม่ตอบ HTTP ที่ '/') */
  private tcpProbe(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port, timeout: 2000 });
      const done = (ok: boolean) => {
        socket.destroy();
        resolve(ok);
      };
      socket.on('connect', () => done(true));
      socket.on('error', () => done(false));
      socket.on('timeout', () => done(false));
    });
  }
}
