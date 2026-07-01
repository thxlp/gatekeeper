import { Controller, HttpCode, Post, Req } from '@nestjs/common';
import { GithubWebhookService } from './github-webhook.service';

@Controller('webhooks/github')
export class GithubWebhookController {
  constructor(private svc: GithubWebhookService) {}

  // ไม่ใส่ AuthGuard/CookieChallengeGuard — GitHub ส่ง request แบบไม่มี cookie/Bearer token
  // การยืนยันตัวตนทำผ่าน X-Hub-Signature-256 (HMAC) ข้างในนี้แทน
  @Post()
  @HttpCode(200)
  handle(@Req() req: any) {
    // rawBody มาจาก express.json({ verify }) ที่ตั้งไว้ใน main.ts — ถ้าไม่มี (ตั้งค่าผิด)
    // จะ fallback ไป re-serialize จาก parsed body ซึ่งไบต์จะไม่ตรงกับที่ GitHub เซ็นมาแน่นอน
    // ผลคือ signature verify fail ปิดประตูไว้ (fail-closed) ไม่ใช่การข้ามการเช็ค signature
    const rawBody: Buffer = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    return this.svc.handleWebhook(rawBody, req.headers, req.body);
  }
}
