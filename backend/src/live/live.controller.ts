import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as httpProxy from 'http-proxy';
import { GitAppStore } from '../apps/git-app.store';
import { resolveServePort } from '../deploy/docker-runtime.service';

/**
 * Reverse-proxy path-based ต่อแอปที่ deploy แล้ว: /live/<app-id>/... -> container ชื่อ
 * gatekeeper-app-<app-id> ผ่าน Docker internal DNS (container อยู่ network เดียวกันกับ backend
 * เอง — ดู GATEKEEPER_APPS_NETWORK ใน docker-compose.yml)
 *
 * ตั้งใจไม่เช็ค app.pipelineStatus === 'success' ก่อน proxy เพราะ deploy ที่ fail รอบล่าสุด
 * (rollback-safe) container เวอร์ชันก่อนหน้ายังรันอยู่จริงแม้ pipelineStatus ปัจจุบันจะเป็น
 * 'failed' ก็ตาม — เช็คแค่ app.enabled แล้วปล่อยให้ต่อ container ไม่ติดจริง (ยังไม่เคย deploy
 * สำเร็จเลยสักครั้ง) กลายเป็น proxy error -> 502 แทน ถูกต้องกว่าเชื่อ flag ที่อาจ stale
 */
@Controller('live')
export class LiveController {
  private proxy = httpProxy.createProxyServer({});

  constructor(private gitAppStore: GitAppStore) {
    this.proxy.on('error', (_err, _req, res) => {
      const r = res as Response;
      if (!r.headersSent) {
        r.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      r.end('live_app_unreachable — ยังไม่เคย deploy สำเร็จ หรือ container ยังไม่พร้อมให้บริการ');
    });
  }

  @All(':appId')
  @All(':appId/*')
  handle(@Req() req: Request, @Res() res: Response) {
    const appId = (req.params as any).appId as string;
    const app = this.gitAppStore.findById(appId);
    if (!app || !app.enabled) {
      res.status(404).type('text/plain').send('app_not_found');
      return;
    }

    // port ที่ container listen จริง: app.port (จำไว้ตอน deploy) → default ตาม runtime
    const port = resolveServePort(app);

    const prefix = `/live/${appId}`;
    const originalUrl = req.originalUrl || req.url;
    const subPath = originalUrl.startsWith(prefix) ? originalUrl.slice(prefix.length) : '/';
    req.url = subPath.length ? subPath : '/';

    this.proxy.web(req, res, { target: `http://gatekeeper-app-${app.id}:${port}` });
  }
}
