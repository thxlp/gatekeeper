import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as httpProxy from 'http-proxy';
import { GitAppStore } from '../apps/git-app.store';
import { DockerRuntimeService, resolveServePort, tenantNetworkFor } from '../deploy/docker-runtime.service';

/**
 * เสิร์ฟ custom domain สู่สาธารณะ — nginx vhost ของแต่ละโดเมน (สร้างโดย issue-cert.sh) rewrite
 * request เป็น /__domain<path> แล้ว proxy เข้ามาที่นี่ พร้อม Host = โดเมนจริง เราหาแอปจาก Host
 * แล้ว proxy ต่อเข้า container (แนวเดียวกับ live.controller.ts) — ไม่มี auth/challenge (แอป public)
 */
@Controller('__domain')
export class DomainProxyController {
  private proxy = httpProxy.createProxyServer({});

  constructor(
    private store: GitAppStore,
    private dockerRuntime: DockerRuntimeService,
  ) {
    this.proxy.on('error', (_err, _req, res) => {
      const r = res as Response;
      if (!r.headersSent) r.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      r.end('live_app_unreachable — container ยังไม่พร้อมให้บริการ');
    });
  }

  @All()
  @All('*')
  async handle(@Req() req: Request, @Res() res: Response) {
    const host = String(req.headers.host || '').split(':')[0].toLowerCase();
    const app = host ? this.store.findByCustomDomain(host) : undefined;
    if (!app) {
      res.status(404).type('text/plain').send('domain_not_configured');
      return;
    }

    await this.dockerRuntime.ensureSelfConnected(tenantNetworkFor(app)).catch(() => undefined);
    const port = resolveServePort(app);
    const ip = await this.dockerRuntime.resolveContainerIp(`gatekeeper-app-${app.id}`);
    if (!ip) {
      res.status(502).type('text/plain').send('live_app_unreachable — ยังไม่เคย deploy สำเร็จ');
      return;
    }

    // ตัด prefix /__domain ที่ nginx เติมมา เหลือ path จริงของแอป
    const originalUrl = req.originalUrl || req.url;
    const sub = originalUrl.replace(/^\/__domain/, '');
    req.url = sub.length ? sub : '/';

    this.proxy.web(req, res, { target: `http://${ip}:${port}` });
  }
}
