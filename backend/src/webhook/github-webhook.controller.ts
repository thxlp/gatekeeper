import { Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GithubWebhookService } from './github-webhook.service';
import { GitAppStore } from '../apps/git-app.store';
import { renderGreetingPage, renderNotFoundPage, renderDashboardPage } from './webhook-dashboard.html';

@Controller('webhooks/github')
export class GithubWebhookController {
  constructor(
    private svc: GithubWebhookService,
    private gitAppStore: GitAppStore,
  ) {}

  // เผื่อมีคนเปิดลิงก์ webhook นี้ตรงๆ ในเบราว์เซอร์ (GET) แทนที่จะขึ้น 404 เฉยๆ — ไม่กระทบ
  // POST endpoint จริงด้านล่างเลย (คนละ method) ใส่ ?app=<gitapp_id> เพื่อดู Deployment
  // & Pipeline Dashboard ของ app นั้นได้ (id สุ่มมา ไม่ guess ได้ง่ายๆ — endpoint นี้ไม่มี auth
  // เพราะ GitHub ส่ง request มาแบบไม่มี cookie/token เลยตั้งใจไม่ list ทุก app แบบไม่ auth
  // ถ้าไม่ใส่ ?app= จะได้แค่หน้าทักทายทั่วไป ไม่ leak รายชื่อ repo ของใครทั้งนั้น)
  @Get()
  serveInfoPage(@Query('app') appId: string | undefined, @Res() res: Response) {
    if (!appId) {
      res.type('html').send(renderGreetingPage());
      return;
    }
    const app = this.gitAppStore.findById(appId);
    if (!app) {
      res.status(404).type('html').send(renderNotFoundPage());
      return;
    }
    res.type('html').send(renderDashboardPage(app));
  }

  // ไม่ใส่ AuthGuard/CookieChallengeGuard — GitHub ส่ง request แบบไม่มี cookie/Bearer token
  // การยืนยันตัวตนทำผ่าน X-Hub-Signature-256 (HMAC) ข้างในนี้แทน
  @Post()
  @HttpCode(200)
  handle(@Req() req: any) {
    // rawBody มาจาก express.json()/express.urlencoded() ({ verify }) ที่ตั้งไว้ใน main.ts —
    // ถ้าไม่มี (ตั้งค่าผิด) จะ fallback ไป re-serialize จาก parsed body ซึ่งไบต์จะไม่ตรงกับที่
    // GitHub เซ็นมาแน่นอน ผลคือ signature verify fail ปิดประตูไว้ (fail-closed) ไม่ใช่การข้ามการเช็ค signature
    const rawBody: Buffer = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));

    // GitHub webhook ตั้ง Content-Type เป็น application/x-www-form-urlencoded ได้ (เป็นค่า
    // default ตอนสร้าง webhook เองจากหน้า GitHub UI ถ้าไม่ได้เปลี่ยนเป็น application/json) —
    // กรณีนี้ payload จริงจะถูกห่อไว้ใน req.body.payload เป็น JSON string ไม่ใช่ req.body ตรงๆ
    const contentType: string = req.headers['content-type'] || '';
    const payload = contentType.includes('application/x-www-form-urlencoded')
      ? JSON.parse(req.body?.payload || '{}')
      : req.body;

    return this.svc.handleWebhook(rawBody, req.headers, payload);
  }
}
