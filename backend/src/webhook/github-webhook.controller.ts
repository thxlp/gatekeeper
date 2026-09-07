import { Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GithubWebhookService } from './github-webhook.service';
import { GitProvider } from '../common/types';
import { renderGreetingPage } from './webhook-dashboard.html';

@Controller('webhooks')
export class GithubWebhookController {
  constructor(private svc: GithubWebhookService) {}

  // เผื่อมีคนเปิดลิงก์ webhook ตรงๆ ในเบราว์เซอร์ (GET) แทน 404 เฉยๆ — ได้แค่หน้าทักทาย
  //
  // ⚠️ endpoint นี้ไม่มี auth (ตั้งใจ — provider ยิงมาแบบไม่มี cookie/Bearer) ห้ามให้มัน
  // ตอบข้อมูลของ app กลับไปเด็ดขาด ของเดิม ?app=<id> เคย render dashboard ที่โชว์
  // repoFullName (repo private ก็โชว์) + branch + runtime + timeline ทุก stage ให้ทุกคนที่รู้
  // app id ซึ่งไม่ใช่ความลับเลย มันอยู่ใน URL live.<domain>/live/<app-id> ที่ลูกค้าแชร์กันอยู่แล้ว
  // (พบ 2026-09-06) → ตอนนี้เด้งไปหน้า /apps/<id> ของ dashboard ซึ่งมี AuthGuard + เช็คเจ้าของ
  // จริงแทน และเด้งโดยไม่แตะ store เลย = ไม่ยืนยันด้วยซ้ำว่า app id นั้นมีอยู่จริงไหม
  @Get('github')
  serveInfoPage(@Query('app') appId: string | undefined, @Res() res: Response) {
    if (appId && /^[A-Za-z0-9_-]{1,64}$/.test(appId)) {
      // จำกัด charset ของ appId ก่อนต่อเป็น URL — กัน open redirect / header injection
      const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
      res.redirect(302, `${base}/apps/${encodeURIComponent(appId)}`);
      return;
    }
    res.type('html').send(renderGreetingPage());
  }

  // ไม่ใส่ AuthGuard/CookieChallengeGuard — provider ส่ง request แบบไม่มี cookie/Bearer
  // ยืนยันตัวตนด้วยกลไกของแต่ละเจ้า (HMAC / secret token) ใน verifyWebhook แทน
  @Post('github')
  @HttpCode(200)
  handleGithub(@Req() req: any, @Query() query: Record<string, any>) {
    return this.dispatch('github', req, query);
  }

  @Post('gitlab')
  @HttpCode(200)
  handleGitlab(@Req() req: any, @Query() query: Record<string, any>) {
    return this.dispatch('gitlab', req, query);
  }

  @Post('bitbucket')
  @HttpCode(200)
  handleBitbucket(@Req() req: any, @Query() query: Record<string, any>) {
    return this.dispatch('bitbucket', req, query);
  }

  private dispatch(provider: GitProvider, req: any, query: Record<string, any>) {
    // rawBody จาก express.json/urlencoded ({ verify }) ใน main.ts — ถ้าไม่มีจะ fallback ไป
    // re-serialize (ไบต์ไม่ตรงที่ provider เซ็นมา → verify fail = fail-closed ไม่ใช่ข้ามการเช็ค)
    const rawBody: Buffer = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));

    // GitHub/GitLab ส่ง form-urlencoded ได้ (payload ห่อใน req.body.payload เป็น JSON string)
    const contentType: string = req.headers['content-type'] || '';
    const payload = contentType.includes('application/x-www-form-urlencoded')
      ? JSON.parse(req.body?.payload || '{}')
      : req.body;

    return this.svc.handleWebhook(provider, rawBody, req.headers, payload, query);
  }
}
