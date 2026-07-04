import { Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GithubWebhookService } from './github-webhook.service';

@Controller('webhooks/github')
export class GithubWebhookController {
  constructor(private svc: GithubWebhookService) {}

  // เผื่อมีคนเปิดลิงก์ webhook นี้ตรงๆ ในเบราว์เซอร์ (GET) แทนที่จะขึ้น 404 เฉยๆ
  // — ไม่กระทบ POST endpoint จริงด้านล่างเลย เพราะ method ต่างกัน
  @Get()
  serveInfoPage(@Res() res: Response) {
    res.type('html').send(`<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>Gatekeeper Webhook Service</title>
<style>
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d1117;
    color: #e6edf3;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }
  .card {
    text-align: center;
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 16px;
    padding: 40px 48px;
    box-shadow: 0 0 40px rgba(88,166,255,0.12);
  }
  .icon { font-size: 40px; margin-bottom: 12px; }
  h1 {
    font-size: 16px;
    font-weight: 600;
    color: #3fb950;
    margin: 0 0 8px;
  }
  p {
    font-size: 12px;
    color: #8b949e;
    margin: 4px 0;
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #3fb950;
    margin-right: 6px;
    box-shadow: 0 0 8px #3fb950;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">🔐🚀</div>
    <h1>Gatekeeper Webhook Service is running smoothly! 🚀</h1>
    <p><span class="dot"></span>listening for POST /api/v2/webhooks/github</p>
    <p>สำหรับ GitHub ยิง event เข้ามาเท่านั้น — endpoint นี้ไม่มีหน้าให้ใช้งานเอง</p>
  </div>
</body>
</html>`);
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
