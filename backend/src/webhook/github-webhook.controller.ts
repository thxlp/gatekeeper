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
