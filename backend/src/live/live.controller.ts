import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as httpProxy from 'http-proxy';
import { GitAppStore } from '../apps/git-app.store';
import { DockerRuntimeService, resolveServePort, tenantNetworkFor } from '../deploy/docker-runtime.service';

/**
 * Reverse-proxy path-based ต่อแอปที่ deploy แล้ว: /live/<app-id>/... -> container ชื่อ
 * gatekeeper-app-<app-id> โดยต่อด้วย IP จริงจาก docker inspect (backend รันบน host ซึ่งมี
 * route ไปทุก bridge network อยู่แล้ว — ไม่ได้พึ่ง Docker DNS เหมือนตอนเป็น container)
 *
 * ตั้งใจไม่เช็ค app.pipelineStatus === 'success' ก่อน proxy เพราะ deploy ที่ fail รอบล่าสุด
 * (rollback-safe) container เวอร์ชันก่อนหน้ายังรันอยู่จริงแม้ pipelineStatus ปัจจุบันจะเป็น
 * 'failed' ก็ตาม — เช็คแค่ app.enabled แล้วปล่อยให้ต่อ container ไม่ติดจริง (ยังไม่เคย deploy
 * สำเร็จเลยสักครั้ง) กลายเป็น proxy error -> 502 แทน ถูกต้องกว่าเชื่อ flag ที่อาจ stale
 *
 * ⚠️ Origin isolation: route นี้ต้องเสิร์ฟจาก origin ของ live เท่านั้น (live.studiodup.com)
 * ห้ามหลุดไปโผล่บน origin ของ dashboard เด็ดขาด เพราะ JS ของแอปลูกค้า (โค้ดที่ไม่ควรไว้ใจ)
 * จะยิง /api/* ด้วย session cookie ของคนที่เปิดลิงก์ได้ทันทีแบบ same-origin = account takeover
 * (httpOnly ช่วยไม่ได้ — ไม่ต้องอ่าน cookie ก็ใช้มันได้) หลังย้ายไป live.studiodup.com แล้ว
 * ยังหลุดมาจริงบน production ถึง 2 ทาง (พบ+ปิด 2026-07-31 ทั้งคู่ตอบ 200 พร้อม HTML ของ tenant):
 *   1) https://studiodup.com/api/live/<id> — `location /api/` ของ nginx proxy ทุก route ของ Nest
 *      รวมถึงตัวนี้ด้วย (และ /api/Live/<id> ก็ได้ เพราะ router ของ Express case-insensitive)
 *   2) https://studiodup.com/live/<id> — `location /` ส่งเข้า Next.js ซึ่งมี rewrite /live/:path*
 *      ชี้กลับมาที่ backend ค้างอยู่ใน next.config.js (เขียนคอมเมนต์ว่า dev-only แต่ prod ก็ทำงาน)
 * ตอนนี้กัน 3 ชั้น: nginx return 404 ให้ ~* ^/(api/)?(live|__domain) บน vhost ของ dashboard,
 * next.config.js ตัด rewrites ทิ้งเมื่อ NODE_ENV=production, และ guard ข้างล่างนี้เช็ค Host เอง
 * เผื่อชั้นบนถูกแก้ผิดอีกในอนาคต — ห้ามถอดชั้นใดชั้นหนึ่งออกโดยไม่เข้าใจอีกสองชั้น
 */

// Host ที่ยอมให้เสิร์ฟ /live/<id> ได้ — ตรงกับ vhost ของ live origin เท่านั้น (เทียบแบบตัด
// port ออกและ lowercase) ตอน dev (NODE_ENV != production) ยอม localhost/127.0.0.1 ด้วย
// เพื่อให้ยิงตรงเข้า backend :8089 ทดสอบได้ — prod ตั้ง NODE_ENV=production ใน systemd unit อยู่แล้ว
function isAllowedLiveHost(rawHost: string | undefined): boolean {
  const host = String(rawHost || '').split(':')[0].toLowerCase();
  if (!host) return false;
  if (host === (process.env.LIVE_ORIGIN_HOST || 'live.studiodup.com').toLowerCase()) return true;
  if (process.env.NODE_ENV !== 'production' && (host === 'localhost' || host === '127.0.0.1')) return true;
  return false;
}

@Controller('live')
export class LiveController {
  private proxy = httpProxy.createProxyServer({});

  constructor(
    private gitAppStore: GitAppStore,
    private dockerRuntime: DockerRuntimeService,
  ) {
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
  async handle(@Req() req: Request, @Res() res: Response) {
    // เช็คก่อนแตะ store: ขอมาผิด origin = ทำเหมือนไม่มี route นี้อยู่เลย (ไม่ยืนยันว่า id
    // มีจริงไหมด้วย) — ดูเหตุผลเต็มในคอมเมนต์หัวไฟล์
    if (!isAllowedLiveHost(req.headers.host)) {
      res.status(404).type('text/plain').send('not_found');
      return;
    }

    const appId = (req.params as any).appId as string;
    const app = this.gitAppStore.findById(appId);
    if (!app || !app.enabled) {
      res.status(404).type('text/plain').send('app_not_found');
      return;
    }

    // host mode: แค่ ensure network ของ tenant มีจริง (ตอนเป็น container เคยต้อง connect
    // ตัวเองเข้า network ด้วย) — พังก็ปล่อยให้ตอบ 502 ข้างล่างตามปกติ ไม่ต้องตายตรงนี้
    await this.dockerRuntime.ensureSelfConnected(tenantNetworkFor(app)).catch(() => undefined);

    // port ที่ container listen จริง: app.port (จำไว้ตอน deploy) → default ตาม runtime
    const port = resolveServePort(app);

    const ip = await this.dockerRuntime.resolveContainerIp(`gatekeeper-app-${app.id}`);
    if (!ip) {
      res
        .status(502)
        .type('text/plain')
        .send('live_app_unreachable — ยังไม่เคย deploy สำเร็จ หรือ container ยังไม่พร้อมให้บริการ');
      return;
    }

    const prefix = `/live/${appId}`;
    const originalUrl = req.originalUrl || req.url;
    const subPath = originalUrl.startsWith(prefix) ? originalUrl.slice(prefix.length) : '/';
    req.url = subPath.length ? subPath : '/';

    this.proxy.web(req, res, { target: `http://${ip}:${port}` });
  }
}
