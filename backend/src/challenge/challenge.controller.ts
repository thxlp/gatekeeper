import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ChallengeService } from './challenge.service';

/**
 * รับเฉพาะ redirect ที่เป็น path ภายในเว็บเราเท่านั้น กัน 2 เรื่อง:
 *  1. Reflected XSS — ค่านี้ถูกฝังลงใน <script> ผ่าน JSON.stringify ซึ่ง "ไม่" escape `/`
 *     ดังนั้น `</script>...` จะปิด tag แล้วแทรกสคริปต์ได้ถ้าไม่กรอง (ตัด < > " ' ` \ และ
 *     whitespace ออกจึงแหก string/tag ไม่ได้เลย)
 *  2. Open redirect — ต้องขึ้นต้นด้วย "/" เดียว (ไม่ใช่ "//" หรือ "/\") ไม่งั้นเบราว์เซอร์
 *     ตีความเป็น absolute URL ไปโดเมนอื่นได้
 * ค่าที่ไม่ผ่านเงื่อนไข fallback กลับไป "/" (หน้าแรกของ dashboard)
 */
function safeRedirectPath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (/[<>"'`\\\s]/.test(raw)) return '/';
  return raw;
}

@Controller('challenge')
export class ChallengeController {
  constructor(private readonly challengeService: ChallengeService) {}

  @Get()
  servePage(@Req() req: Request, @Res() res: Response) {
    const redirectTo = safeRedirectPath(req.query.redirect);
    // title/description ตั้งใจใช้ "ชื่อเว็บจริง" ไม่ใช่ "กำลังตรวจสอบ…" — หน้านี้เป็น interstitial
    // ที่ nginx เด้งมาเมื่อยังไม่มี cookie และ search engine ที่หลุด allowlist ใน
    // gatekeeper-host.conf จะเก็บ <title> ของหน้านี้ไปขึ้น SERP แทนชื่อเว็บ
    // (ให้ตรงกับ metadata ใน frontend/src/app/layout.tsx — แก้ที่นั่นแล้วแก้ที่นี่ด้วย)
    res.type('html').send(`<!doctype html>
<html lang="th"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gatekeeper</title>
  <meta name="description" content="Railway-style deploy platform where every deploy runs through a security scan + risk engine before going live.">
</head>
<body>
  <p>กำลังตรวจสอบเบราว์เซอร์ของคุณ กรุณารอสักครู่...</p>
  <noscript><p>หน้านี้ต้องเปิดใช้งาน JavaScript เพื่อตรวจสอบเบราว์เซอร์ก่อนเข้าใช้งาน</p></noscript>
  <script>
    fetch('/challenge/verify', { method: 'POST', credentials: 'include' })
      .then(() => { window.location.href = ${JSON.stringify(redirectTo)}; })
      .catch(() => { document.body.innerHTML = '<p>เกิดข้อผิดพลาด กรุณาลองใหม่</p>'; });
  </script>
</body></html>`);
  }

  @Post('verify')
  verify(@Req() _req: Request, @Res() res: Response) {
    const token = this.challengeService.issueToken();
    res.cookie(this.challengeService.cookieName(), token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 1000,
    });
    res.json({ ok: true });
  }
}
