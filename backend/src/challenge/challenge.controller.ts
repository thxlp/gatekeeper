import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ChallengeService } from './challenge.service';

@Controller('challenge')
export class ChallengeController {
  constructor(private readonly challengeService: ChallengeService) {}

  @Get()
  servePage(@Req() req: Request, @Res() res: Response) {
    const redirectTo = (req.query.redirect as string) || '/';
    res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>กำลังตรวจสอบ...</title></head>
<body>
  <p>กำลังตรวจสอบเบราว์เซอร์ของคุณ กรุณารอสักครู่...</p>
  <script>
    fetch('/challenge/verify', { method: 'POST', credentials: 'include' })
      .then(() => { window.location.href = ${JSON.stringify(redirectTo)}; })
      .catch(() => { document.body.innerHTML = '<p>เกิดข้อผิดพลาด กรุณาลองใหม่</p>'; });
  </script>
</body></html>`);
  }

  @Post('verify')
  verify(@Req() req: Request, @Res() res: Response) {
    const ip = req.ip || req.socket.remoteAddress || '';
    const token = this.challengeService.issueToken(ip);
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
