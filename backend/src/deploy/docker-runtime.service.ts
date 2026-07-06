import { Injectable, Logger } from '@nestjs/common';
import * as Docker from 'dockerode';
import * as tarFs from 'tar-fs';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { GitApp } from '../common/types';

export interface BuildResult {
  ok: boolean;
  imageTag?: string;
  reason?: string;
}

export interface RunResult {
  ok: boolean;
  port?: number;
  reason?: string;
}

// Scope เบื้องต้น: รองรับแค่ static/node เต็มรูปแบบก่อน — python/docker (Dockerfile ของลูกค้าเอง)
// คืน runtime_not_yet_supported ชัดเจนแทนที่จะทำแบบครึ่งๆ กลางๆ ต่อยอดทีหลังด้วย service เดียวกันนี้ได้
export const RUNTIME_PORT: Record<string, number> = {
  static: 80,
  node: 8080,
};

const CONTAINER_MEMORY_BYTES = 256 * 1024 * 1024; // 256MB ต่อ container — mirror mem_limit pattern ที่ใช้กับ service อื่นใน docker-compose.yml
const CONTAINER_NANO_CPUS = 0.5 * 1e9; // 0.5 vCPU
const HEALTHCHECK_TIMEOUT_MS = 30_000;
const HEALTHCHECK_INTERVAL_MS = 1_000;

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

    if (runtime === 'python' || runtime === 'docker') {
      return { ok: false, reason: `runtime_not_yet_supported:${runtime}` };
    }
    if (!RUNTIME_PORT[runtime]) {
      return { ok: false, reason: `unknown_runtime:${runtime}` };
    }

    const hasOwnDockerfile = fs.existsSync(path.join(stagingDir, 'Dockerfile'));
    if (!hasOwnDockerfile) {
      const generated = this.generateDockerfile(runtime, stagingDir);
      if (!generated.ok) return generated;
    }

    const imageTag = `gatekeeper-app-${app.id}:${requestId}`;
    const tarStream = tarFs.pack(stagingDir);

    try {
      const buildStream = await this.docker.buildImage(tarStream, { t: imageTag });
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

    return { ok: true, imageTag };
  }

  private generateDockerfile(runtime: string, stagingDir: string): BuildResult {
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
      if (!pkg?.scripts?.start) {
        return { ok: false, reason: 'node_runtime_requires_start_script' };
      }
      fs.writeFileSync(
        path.join(stagingDir, 'Dockerfile'),
        [
          'FROM node:20-alpine',
          'WORKDIR /app',
          'COPY . .',
          'RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi',
          'ENV PORT=8080',
          'EXPOSE 8080',
          'CMD ["npm", "start"]',
          '',
        ].join('\n'),
      );
      return { ok: true };
    }

    // static
    fs.writeFileSync(
      path.join(stagingDir, 'Dockerfile'),
      ['FROM nginx:alpine', 'COPY . /usr/share/nginx/html', 'EXPOSE 80', ''].join('\n'),
    );
    return { ok: true };
  }

  /**
   * สร้าง container ใหม่จาก image ที่ build เสร็จแล้ว รอ healthcheck ผ่านก่อนค่อยสลับเข้าแทน
   * container เดิม (ถ้ามี) — ถ้า healthcheck ไม่ผ่าน container เดิมยังรันให้บริการต่อเหมือนเดิม
   * ทุกอย่าง (rollback-safe เหมือน philosophy เดิมของฝั่ง BLOCK ที่ไม่แตะ deployedDir เก่า)
   */
  async runContainer(app: GitApp, imageTag: string): Promise<RunResult> {
    const containerName = `gatekeeper-app-${app.id}`;
    const runtime = app.runtime || 'static';
    const port = RUNTIME_PORT[runtime];

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

    let container: Docker.Container;
    try {
      container = await this.docker.createContainer({
        name: stagingContainerName,
        Image: imageTag,
        HostConfig: {
          Memory: CONTAINER_MEMORY_BYTES,
          NanoCpus: CONTAINER_NANO_CPUS,
          SecurityOpt: ['no-new-privileges'],
          NetworkMode: APPS_NETWORK,
          RestartPolicy: { Name: 'unless-stopped' },
        },
      });
      await container.start();
    } catch (err: any) {
      return { ok: false, reason: `container_start_failed:${err.message}` };
    }

    const healthy = await this.waitForHealthy(container, port);
    if (!healthy) {
      await container.remove({ force: true }).catch(() => undefined);
      return { ok: false, reason: 'healthcheck_timed_out' };
    }

    if (previousExisted) {
      await previous.remove({ force: true }).catch(() => undefined);
    }
    await container.rename({ name: containerName } as any);

    return { ok: true, port };
  }

  private async waitForHealthy(container: Docker.Container, port: number): Promise<boolean> {
    const deadline = Date.now() + HEALTHCHECK_TIMEOUT_MS;
    const info = await container.inspect();
    const ip = info.NetworkSettings?.Networks?.[APPS_NETWORK]?.IPAddress;
    if (!ip) return false;

    while (Date.now() < deadline) {
      const ok = await this.httpProbe(ip, port);
      if (ok) return true;
      await new Promise((r) => setTimeout(r, HEALTHCHECK_INTERVAL_MS));
    }
    return false;
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
}
