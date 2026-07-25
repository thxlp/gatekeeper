import { Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GithubWebhookService } from './github-webhook.service';
import { GitAppStore } from '../apps/git-app.store';
import { GitProvider } from '../common/types';
import { renderGreetingPage, renderNotFoundPage, renderDashboardPage } from './webhook-dashboard.html';

@Controller('webhooks')
export class GithubWebhookController {
  constructor(
    private svc: GithubWebhookService,
    private gitAppStore: GitAppStore,
  ) {}

  // เผื่อมีคนเปิดลิงก์ webhook ตรงๆ ในเบราว์เซอร์ (GET) แทน 404 เฉยๆ — ใส่ ?app=<id> เพื่อดู
  // Deployment & Pipeline Dashboard ของ app นั้น (id สุ่มมา ไม่ guess ง่าย — endpoint นี้ไม่มี auth
  // เพราะ provider ส่ง request แบบไม่มี cookie/token) ถ้าไม่ใส่ ?app= ได้แค่หน้าทักทาย ไม่ leak repo
  @Get('github')
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
