import { Injectable, Logger } from '@nestjs/common';
import * as Docker from 'dockerode';
import * as tarFs from 'tar-fs';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
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
// default RAM แยกตาม runtime — static คือ nginx เสิร์ฟไฟล์ กินจริงหลัก MB ไม่ต้องกัน 256
// (สำคัญตั้งแต่มีโควต้าต่อ user: default ที่เล็กลงทำให้ deploy หลาย app ในโควต้าเดียวได้จริง)
const RUNTIME_DEFAULT_MEMORY_MB: Record<string, number> = { static: 64, node: 128, python: 128, docker: 128 };
const FALLBACK_DEFAULT_MEMORY_MB = 128;
const MAX_MEMORY_MB = Number(process.env.APP_MAX_MEMORY_MB || 1024);
const MIN_MEMORY_MB = 64;
const DEFAULT_CPU = 0.5;
const MAX_CPU = Number(process.env.APP_MAX_CPU || 2);
const MIN_CPU = 0.1;

// resource ของ addon ต่อตัว (ตรงกับ HostConfig ตอนสร้างใน ensureAddon) — export ให้ QuotaService
// เอาไปคิดรวมในโควต้าต่อ user ด้วย
export const ADDON_MEMORY_MB = 256;
export const ADDON_CPU = 0.5;

/**
 * ทรัพยากรที่ app จะถูกจำกัดจริงตอนรัน (หลัง clamp เข้ากรอบ MIN/MAX) — จุดเดียวที่ใช้ทั้ง
 * ตอนสร้าง container (runContainer) และตอนคิดโควต้าต่อ user (QuotaService) เพื่อให้เลขตรงกันเสมอ
 */
export function appResources(app: Pick<GitApp, 'runtime' | 'memoryMb' | 'cpu'>): { memoryMb: number; cpu: number } {
  const defaultMb = RUNTIME_DEFAULT_MEMORY_MB[app.runtime || 'static'] ?? FALLBACK_DEFAULT_MEMORY_MB;
  const memoryMb = Math.min(MAX_MEMORY_MB, Math.max(MIN_MEMORY_MB, app.memoryMb || defaultMb));
  const cpu = Math.min(MAX_CPU, Math.max(MIN_CPU, app.cpu || DEFAULT_CPU));
  return { memoryMb, cpu };
}
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
    // จุดที่ image ต้องเขียนนอก data volume — mount เป็น tmpfs เพื่อให้รัน rootfs read-only ได้
    tmpfs: Record<string, string>;
    cmd?: (password: string) => string[];
    containerEnv: (password: string) => string[];
    buildUrl: (host: string, port: number, password: string) => string;
  }
> = {
  postgres: {
    image: 'postgres:16-alpine',
    port: 5432,
    envKey: 'DATABASE_URL',
    dataPath: '/var/lib/postgresql/data',
    // postgres เขียนนอก PGDATA แค่ unix socket (/var/run/postgresql) กับไฟล์ spill ตอน sort (/tmp)
    tmpfs: { '/var/run/postgresql': 'rw,nosuid,size=8m', '/tmp': 'rw,nosuid,size=64m' },
    containerEnv: (pw) => [`POSTGRES_USER=appuser`, `POSTGRES_PASSWORD=${pw}`, `POSTGRES_DB=appdb`],
    buildUrl: (host, port, pw) => `postgres://appuser:${pw}@${host}:${port}/appdb`,
  },
  redis: {
    image: 'redis:7-alpine',
    port: 6379,
    envKey: 'REDIS_URL',
    dataPath: '/data',
    tmpfs: { '/tmp': 'rw,nosuid,size=16m' },
    // ตั้ง requirepass เสมอ — apps-net เป็น network ที่แชร์กันทุก tenant ถ้า redis ไม่มีรหัส
    // แอปของ tenant อื่นสแกนเจอแล้วต่อเข้ามาอ่าน/เขียนข้อมูลได้ทันทีโดยไม่ต้อง auth
    cmd: (pw) => ['redis-server', '--appendonly', 'yes', '--requirepass', pw],
    containerEnv: () => [],
    buildUrl: (host, port, pw) => `redis://:${pw}@${host}:${port}`,
  },
};

// network กลางเดิม — เหลือไว้เป็น fallback สำหรับ app เก่าที่ยังไม่ได้ย้าย (ดู
// deployments/docker/migrate-tenant-networks.sh) app ที่ deploy ใหม่ทุกตัวไปอยู่ network
// ต่อ tenant (tenantNetworkFor) แทน เพื่อให้ app ข้าม user มองไม่เห็นกันเลยในระดับ network
const APPS_NETWORK = process.env.GATEKEEPER_APPS_NETWORK || 'gatekeeper-apps-net';

const TENANT_NETWORK_PREFIX = 'gatekeeper-tenant-';

// network เฉพาะช่วง build — RUN ใน Dockerfile ของลูกค้า (โดยเฉพาะ runtime 'docker' ที่คุม FROM/RUN
// เองทั้งหมด) ถูกบังคับให้รันบน network นี้แทน default bridge ของ daemon เพื่อให้ปิด egress ที่
// firewall ฝั่ง host ได้ (deployments/docker/build-egress-firewall.sh): ออก registry สาธารณะได้
// (npm/pip ยังลงได้) แต่แตะ internal (docker-socket-proxy/backend/postgres) + cloud metadata ไม่ได้
// subnet ต้อง pin ให้ตรงกับสคริปต์ firewall + docker-compose เพราะกฎ iptables อ้าง subnet นี้ตรงๆ
const BUILD_NETWORK = process.env.GATEKEEPER_BUILD_NETWORK || 'gatekeeper-build-net';
const BUILD_NETWORK_SUBNET = process.env.GATEKEEPER_BUILD_SUBNET || '172.31.238.0/24';

// capabilities ของ container ลูกค้า/addon — drop ทั้งหมดแล้วคืนเฉพาะที่ image ทางการยังต้องใช้:
// nginx bind :80 (NET_BIND_SERVICE), entrypoint chown data dir + สลับลง user ธรรมดา
// (CHOWN/SETUID/SETGID), postgres init แตะไฟล์ข้าม owner (DAC_OVERRIDE/FOWNER)
// ตัวสำคัญที่หายไปคือ NET_RAW — ปิดทาง ARP spoof/sniff traffic ของ container อื่นในวง bridge เดียวกัน
const CONTAINER_CAP_ADD = ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID', 'NET_BIND_SERVICE'];
// หมายเหตุ seccomp: การไม่ใส่ seccomp ใน SecurityOpt = container ได้ default profile ของ daemon
// อยู่แล้ว (บล็อก syscall อันตรายราว 40 กลุ่ม) — ห้ามเติม 'seccomp=unconfined' เด็ดขาด

// เพดานจำนวน process ต่อ container — กัน fork bomb ในโค้ดลูกค้ากิน PID/scheduler ของทั้งเครื่อง
// (memory limit เดิมกันไม่ได้: process เปล่าๆ หลายพันตัวใช้ RAM รวมกันนิดเดียวแต่ host ค้างทั้งตัว)
// 256 เหลือเฟือสำหรับ web app ปกติ (nginx/node/python ใช้จริงหลักสิบ) — ปรับผ่าน env ได้
const CONTAINER_PIDS_LIMIT = Number(process.env.APP_PIDS_LIMIT || 256);

// tmpfs ที่ mount ให้ container static (nginx) ตอนบังคับ rootfs เป็น read-only — สามที่นี้คือ
// จุดเดียวที่ nginx official image ต้องเขียนตอนรัน (tmpfs ถูก charge เข้า memory limit ของ
// container เอง จึงใส่ size กันโค้ดลูกค้าเขียน tmpfs แทน disk จนดัน limit)
const STATIC_READONLY_TMPFS: Record<string, string> = {
  '/var/cache/nginx': 'rw,nosuid,size=32m',
  '/var/run': 'rw,nosuid,size=4m',
  '/tmp': 'rw,nosuid,size=16m',
};

/**
 * network ต่อ tenant: app ทุกตัวของ account เดียวกันอยู่วงเดียวกัน (คุยกันเองได้เหมือน
 * Railway project) แต่มองไม่เห็น app ของ account อื่น — ชื่อ network ผูกกับ accountId
 * ตรงๆ (sanitize อักขระที่ Docker ไม่รับ) ให้ migration script ฝั่ง shell ประกอบชื่อ
 * เดียวกันได้โดยไม่ต้องพึ่งโค้ดนี้
 */
export function tenantNetworkFor(app: Pick<GitApp, 'accountId'>): string {
  if (!app.accountId) return APPS_NETWORK;
  return TENANT_NETWORK_PREFIX + app.accountId.replace(/[^A-Za-z0-9_.-]/g, '-');
}

/**
 * รัน container จริงต่อแอป — คุยกับ Docker ผ่าน dockerode ซึ่งชี้ไปที่ docker-socket-proxy
 * (จำกัดสิทธิ์ API ไว้แคบๆ) แทนการ mount /var/run/docker.sock ตรงเข้า backend เอง ดู
 * deployments/docker/docker-compose.yml สำหรับการตั้งค่า proxy นี้ (ต้องรันเองโดย user)
 */
@Injectable()
export class DockerRuntimeService {
  private readonly logger = new Logger(DockerRuntimeService.name);
  private docker: Docker;

  // network ที่ instance นี้ต่อตัวเองเข้าไปแล้ว — กันการยิง connect ซ้ำทุก request /live
  // (in-memory ต่อ instance พอ: connect ซ้ำเป็น no-op อยู่แล้ว แค่ประหยัด round-trip)
  private selfConnectedNetworks = new Set<string>();

  constructor() {
    const dockerHost = process.env.DOCKER_HOST;
    this.docker = dockerHost
      ? new Docker({ host: dockerHost.replace(/^tcp:\/\//, ''), port: Number(process.env.DOCKER_PORT || 2375) })
      : new Docker({ socketPath: '/var/run/docker.sock' });
  }

  /** สร้าง network ของ tenant ถ้ายังไม่มี (idempotent — deploy พร้อมกันสอง app ของ user เดียวกันไม่ชน) */
  private async ensureTenantNetwork(networkName: string): Promise<void> {
    if (networkName === APPS_NETWORK) return; // network กลางถูกสร้างโดย docker-compose อยู่แล้ว
    try {
      await this.docker.getNetwork(networkName).inspect();
      return;
    } catch {
      // ยังไม่มี — สร้างข้างล่าง; connection ที่เคย cache ไว้ผูกกับ network เก่าที่หายไปแล้ว
      // (เช่นอีก instance cleanup ตอนลบ app สุดท้ายของ user) ต้องล้างให้ ensureSelfConnected ต่อใหม่
      this.selfConnectedNetworks.delete(networkName);
    }
    try {
      await this.docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        Labels: { 'gatekeeper.role': 'tenant-network' },
      });
    } catch (err: any) {
      // 409 = อีก instance/deploy สร้างตัดหน้าไปแล้ว — จบเหมือนกัน
      if (err?.statusCode !== 409) throw err;
    }
  }

  /**
   * ต่อ container ของ backend เอง (instance นี้) เข้า network ของ tenant — จำเป็นทั้งตอน
   * healthcheck (probe ด้วย IP) และตอน proxy /live (ต่อผ่าน Docker DNS) เพราะ bridge network
   * คนละวงมองไม่เห็นกัน ต้องทำแบบ lazy ต่อ instance: docker compose recreate แล้ว connection
   * ที่เคยต่อไว้หายหมด จะมาพึ่งการต่อครั้งเดียวตอนสร้าง network ไม่ได้
   */
  async ensureSelfConnected(networkName: string): Promise<void> {
    if (networkName === APPS_NETWORK) return; // อยู่แล้วผ่าน docker-compose
    if (this.selfConnectedNetworks.has(networkName)) return;
    await this.ensureTenantNetwork(networkName);
    try {
      // hostname ใน container = short container id (compose ไม่ได้ override hostname)
      await this.docker.getNetwork(networkName).connect({ Container: os.hostname() });
    } catch (err: any) {
      // 403 "endpoint already exists" = ต่ออยู่แล้ว (เช่นจาก instance restart โดยไม่ recreate)
      const msg = String(err?.message || '');
      if (err?.statusCode !== 403 && !msg.includes('already exists')) throw err;
    }
    this.selfConnectedNetworks.add(networkName);
  }

  /**
   * network สำหรับ build (idempotent) — แยกจาก default bridge ของ daemon และ pin subnet ให้
   * firewall ฝั่ง host (build-egress-firewall.sh) อ้างอิงได้แน่นอน มี egress ออกเน็ตสาธารณะได้
   * (bridge NAT ปกติ — npm/pip ยังลง dependency ได้) แต่ firewall ตัดปลายทาง private/metadata ทิ้ง
   * enable_icc=false: build สองงานพร้อมกันของคนละ tenant คุยข้ามกันเองไม่ได้แม้อยู่ network เดียว
   */
  private async ensureBuildNetwork(): Promise<void> {
    try {
      await this.docker.getNetwork(BUILD_NETWORK).inspect();
      return;
    } catch {
      // ยังไม่มี — สร้างข้างล่าง (ปกติ docker-compose สร้างให้แล้วตอน up แต่ ensure ไว้กันกรณีถูกลบ)
    }
    try {
      await this.docker.createNetwork({
        Name: BUILD_NETWORK,
        Driver: 'bridge',
        IPAM: { Config: [{ Subnet: BUILD_NETWORK_SUBNET }] },
        Options: { 'com.docker.network.bridge.enable_icc': 'false' },
        Labels: { 'gatekeeper.role': 'build-network' },
      });
    } catch (err: any) {
      // 409 = อีก instance/deploy สร้างตัดหน้าไปแล้ว — จบเหมือนกัน
      if (err?.statusCode !== 409) throw err;
    }
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

    // fail-closed: ถ้า ensure network ไม่ผ่าน หยุด build ไปเลย ดีกว่าปล่อยให้ตกไป build บน
    // default bridge ที่ egress ไม่ถูกจำกัด (RUN ของลูกค้าจะแตะ internal/metadata ได้)
    try {
      await this.ensureBuildNetwork();
    } catch (err: any) {
      this.logger.error(`build network ensure failed for ${app.id}: ${err.message}`);
      return { ok: false, reason: `build_network_failed:${err.message}` };
    }

    try {
      // networkmode: บังคับให้ RUN ตอน build อยู่บน build-network ที่ firewall จำกัด egress ไว้
      const buildStream = await this.docker.buildImage(tarStream, { t: imageTag, buildargs, networkmode: BUILD_NETWORK });
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
    const network = tenantNetworkFor(app);
    try {
      // เช็ค network ของจริงทุก deploy — cache ใน ensureSelfConnected เป็น per-instance
      // อีก instance อาจ cleanupTenantNetwork ไปแล้ว (ตอนลบ app สุดท้ายของ user) โดย instance นี้ไม่รู้
      await this.ensureTenantNetwork(network);
      await this.ensureSelfConnected(network); // ต่อ backend เข้าไปให้ probe ถึง
    } catch (err: any) {
      return { ok: false, reason: `tenant_network_failed:${err.message}` };
    }

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

    const { memoryMb, cpu } = appResources(app);
    const dataVolume = `${containerName}-data`; // named volume (auto-create ตอน create ไม่ต้องใช้ /volumes API)

    let container: Docker.Container;
    try {
      container = await this.docker.createContainer({
        name: stagingContainerName,
        Image: imageTag,
        Env: this.buildContainerEnv(app, port),
        HostConfig: {
          Memory: memoryMb * 1024 * 1024,
          NanoCpus: Math.round(cpu * 1e9),
          SecurityOpt: ['no-new-privileges'],
          CapDrop: ['ALL'],
          CapAdd: CONTAINER_CAP_ADD,
          PidsLimit: CONTAINER_PIDS_LIMIT,
          // read-only rootfs เฉพาะ runtime static — image nginx ที่เรา generate เองรู้แน่ว่า
          // เขียนแค่ cache/run/tmp (tmpfs ด้านบน) ส่วน node/python/docker รันโค้ดลูกค้าที่มัก
          // เขียนลง working dir ของตัวเอง บังคับ read-only จะพังงานจริงเป็นวงกว้าง จึงปล่อย rw
          // ขอบเคส: app runtime static ที่แนบ Dockerfile เอง (ไม่ใช่ nginx) อาจ start ไม่ขึ้น
          // → healthcheck rollback ให้เอง ทางแก้ฝั่ง user คือเปลี่ยน runtime เป็น docker
          ...((app.runtime || 'static') === 'static'
            ? { ReadonlyRootfs: true, Tmpfs: STATIC_READONLY_TMPFS }
            : {}),
          NetworkMode: network,
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

    const health = await this.waitForHealthy(container, port, network);
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
    // กวาด addon ที่ถูกถอดออกก่อนเสมอ — deploy ทุก path ผ่านตรงนี้ จึงเป็นตาข่ายรองรับ
    // เคสที่ PATCH config ไม่ได้เกิด (เช่น แนบ config มากับ manual deploy / git push)
    await this.removeUnwantedAddons(app);
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
    const network = tenantNetworkFor(app);
    await this.ensureTenantNetwork(network); // เช็คของจริงก่อน กัน cache stale ข้าม instance (ดู runContainer)
    await this.ensureSelfConnected(network); // backend ต้อง probe addon ถึง
    const existing = app.addonConnections?.find((c) => c.type === type);

    // reuse password เดิมถ้าเคย provision แล้ว (volume ผูกกับ password ตอน init ครั้งแรก
    // ถ้าเปลี่ยน password แต่ volume เดิม auth จะพัง) — ทั้ง postgres และ redis ดึง password
    // เดิมจาก URL ที่เก็บไว้ (parsePassword ใช้ URL().password ได้กับทั้งสอง scheme)
    let password = '';
    if (type === 'postgres' || type === 'redis') {
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
      ...(spec.cmd ? { Cmd: spec.cmd(password) } : {}),
      HostConfig: {
        Memory: ADDON_MEMORY_MB * 1024 * 1024,
        NanoCpus: Math.round(ADDON_CPU * 1e9),
        SecurityOpt: ['no-new-privileges'],
        CapDrop: ['ALL'],
        CapAdd: CONTAINER_CAP_ADD,
        PidsLimit: CONTAINER_PIDS_LIMIT,
        // addon เป็น image ทางการที่เรารู้ write path ครบ (data volume + tmpfs ตาม spec)
        // จึง read-only ได้เต็มตัว — มีผลเฉพาะ addon ที่สร้างใหม่ ตัวเดิมต้อง recreate เอง
        ReadonlyRootfs: true,
        Tmpfs: spec.tmpfs,
        NetworkMode: network,
        RestartPolicy: { Name: 'unless-stopped' },
        Binds: [`${containerName}-data:${spec.dataPath}`],
      },
    });
    await created.start();

    // รอ addon เปิดรับ TCP ก่อนให้แอปต่อ (แอปมักต่อ DB ตอน boot)
    const ready = await this.waitForAddon(created, spec.port, network);
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

  private async waitForAddon(container: Docker.Container, port: number, network: string): Promise<boolean> {
    const deadline = Date.now() + ADDON_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const info = await container.inspect();
        const ip = info.NetworkSettings?.Networks?.[network]?.IPAddress;
        if (ip && (await this.tcpProbe(ip, port))) return true;
      } catch {
        return false;
      }
      await new Promise((r) => setTimeout(r, HEALTHCHECK_INTERVAL_MS));
    }
    return false;
  }

  /**
   * ลบ container + volume ของ addon ที่ "ไม่อยู่ใน app.addons แล้ว" (user ถอดออกจาก dashboard)
   * — ถ้าไม่กวาด container จะรันกิน RAM ต่อไปเรื่อยๆ และ volume ค้างเป็นซากแบบที่เคยเจอ
   * ระวัง: ลบ volume = ข้อมูลของ addon นั้นหายถาวร ถ้า user ติ๊กกลับมาใหม่จะได้ instance เปล่า
   * (ตั้งใจ — ตรงกับความคาดหวังว่า "ถอดแล้วต้องไม่เหลืออะไร") best-effort ไม่ throw:
   * เรียกทั้งจาก PATCH config (มีผลทันที) และต้นทางของ provisionAddons (กันหลุดทุก deploy)
   */
  async removeUnwantedAddons(app: GitApp): Promise<void> {
    const wanted = new Set(app.addons || []);
    for (const type of Object.keys(ADDON_SPEC) as AppAddon[]) {
      if (wanted.has(type)) continue;
      const containerName = `gatekeeper-app-${app.id}-${type}`;
      await this.docker.getContainer(containerName).remove({ force: true }).catch(() => undefined);
      try {
        await this.docker.getVolume(`${containerName}-data`).remove();
      } catch (err: any) {
        // 404 = ไม่เคยมี addon ชนิดนี้ (เคสปกติของทุก app ที่ไม่ได้ใช้) — เงียบได้
        if (err?.statusCode !== 404) {
          this.logger.warn(`addon volume ${containerName}-data not removed: ${err?.message}`);
        }
      }
    }
  }

  /** ลบ container + named volume ของแอปและ addon ทั้งหมด (เรียกตอนลบ app) */
  async removeAppContainers(app: GitApp): Promise<void> {
    // ลบ volume ของ addon ทุกชนิดที่ระบบรู้จัก ไม่ใช่แค่ app.addons ปัจจุบัน — user ที่เคยเปิด
    // addon แล้วถอดออกทีหลังจะมี volume กำพร้าค้างอยู่ ซึ่งลบตอนนี้เป็นจังหวะสุดท้ายที่ทำได้
    // รวม `-staging` ด้วย: deploy ที่พังกลางทางอาจทิ้ง staging container ที่ mount data volume
    // เดียวกันค้างไว้ ถ้าไม่ลบก่อน volume จะติดสถานะ in-use แล้วลบไม่ผ่าน
    const containerNames = [
      `gatekeeper-app-${app.id}`,
      `gatekeeper-app-${app.id}-staging`,
      ...(app.addons || []).map((t) => `gatekeeper-app-${app.id}-${t}`),
    ];
    const volumeNames = [
      `gatekeeper-app-${app.id}-data`,
      ...Object.keys(ADDON_SPEC).map((t) => `gatekeeper-app-${app.id}-${t}-data`),
    ];
    for (const name of containerNames) {
      await this.docker.getContainer(name).remove({ force: true }).catch(() => undefined);
    }
    // ลบ volume หลัง container หายแล้วเท่านั้น (volume ที่ยังถูก mount จะลบไม่ผ่าน) — ถ้าพลาด
    // log ไว้ให้เห็น ไม่เงียบ: volume ค้างสะสมคือสาเหตุ disk เต็มที่ตั้งใจปิดในรอบนี้
    for (const name of volumeNames) {
      try {
        await this.docker.getVolume(name).remove();
      } catch (err: any) {
        // 404 = ไม่เคยมี (เช่น app ไม่เคย deploy สำเร็จ / ไม่เคยเปิด addon ชนิดนั้น) — เงียบได้
        if (err?.statusCode !== 404) {
          this.logger.warn(`volume ${name} not removed while deleting app ${app.id}: ${err?.message}`);
        }
      }
    }
    await this.cleanupTenantNetwork(tenantNetworkFor(app));
  }

  /**
   * ลบ network ของ tenant เมื่อไม่เหลือ container ของแอปสักตัว (app สุดท้ายของ user ถูกลบ) —
   * default address pool ของ Docker มี subnet จำกัด (~30 วง) ปล่อย network เปล่าค้างไว้ไม่ได้
   * endpoint ที่เหลือได้มีแค่ backend-1/2 ที่ต่อตัวเองเข้าไป ต้อง disconnect ก่อนถึงจะ remove ผ่าน
   */
  private async cleanupTenantNetwork(networkName: string): Promise<void> {
    if (networkName === APPS_NETWORK) return;
    try {
      const network = this.docker.getNetwork(networkName);
      const info = await network.inspect();
      const endpoints: Record<string, { Name?: string }> = info?.Containers || {};
      const hasAppContainers = Object.values(endpoints).some((c) => (c.Name || '').startsWith('gatekeeper-app-'));
      if (hasAppContainers) return;
      for (const id of Object.keys(endpoints)) {
        await network.disconnect({ Container: id, Force: true }).catch(() => undefined);
      }
      await network.remove();
      this.selfConnectedNetworks.delete(networkName);
    } catch {
      // best-effort — network ไม่มีอยู่แล้ว หรือมี deploy อื่นแทรกเข้ามาใช้อยู่ ก็ปล่อยไว้
    }
  }

  /**
   * ดึง CPU/memory สดของ container หนึ่งตัวจาก docker stats แบบ one-shot (stream:false =
   * daemon เก็บสองจังหวะให้แล้วคืน sample เดียวที่มี precpu ครบ เอามาคำนวณ % ได้เลย)
   * คืน null ถ้า container ไม่มีอยู่/ยังไม่เคย deploy — caller แสดงเป็น "ไม่ได้รัน"
   */
  async getContainerStats(
    containerName: string,
  ): Promise<{ running: boolean; cpuPercent: number; memUsedMb: number; memLimitMb: number } | null> {
    try {
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();
      if (!info.State?.Running) {
        return { running: false, cpuPercent: 0, memUsedMb: 0, memLimitMb: 0 };
      }
      const stats: any = await container.stats({ stream: false });
      const cpuDelta = (stats?.cpu_stats?.cpu_usage?.total_usage || 0) - (stats?.precpu_stats?.cpu_usage?.total_usage || 0);
      const sysDelta = (stats?.cpu_stats?.system_cpu_usage || 0) - (stats?.precpu_stats?.system_cpu_usage || 0);
      const onlineCpus = stats?.cpu_stats?.online_cpus || 1;
      const cpuPercent = sysDelta > 0 ? (cpuDelta / sysDelta) * onlineCpus * 100 : 0;
      // หัก cache/inactive_file ออก (cgroup v2/v1) ให้ตรงกับที่ `docker stats` โชว์ ไม่ใช่ราคา page cache
      const rawUsage = stats?.memory_stats?.usage || 0;
      const cache = stats?.memory_stats?.stats?.inactive_file ?? stats?.memory_stats?.stats?.cache ?? 0;
      const memUsed = Math.max(0, rawUsage - cache);
      return {
        running: true,
        cpuPercent: Math.round(cpuPercent * 10) / 10,
        memUsedMb: Math.round(memUsed / (1024 * 1024)),
        memLimitMb: Math.round((stats?.memory_stats?.limit || 0) / (1024 * 1024)),
      };
    } catch {
      return null;
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
    network: string,
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

      const ip = info.NetworkSettings?.Networks?.[network]?.IPAddress;
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
