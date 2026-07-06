import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { GithubApiService } from './github-api.service';
import { GithubTokenStore } from './github-token.store';
import { ConnectGithubDto } from './connect-github.dto';

@Controller('github')
@UseGuards(CookieChallengeGuard, AuthGuard)
export class GithubController {
  constructor(
    private api: GithubApiService,
    private tokens: GithubTokenStore,
  ) {}

  @Get('status')
  status(@Req() req: any) {
    const conn = this.tokens.get(getAccount(req).id);
    if (!conn) return { connected: false };
    return { connected: true, username: conn.username, scopes: conn.scopes, connectedAt: conn.connectedAt };
  }

  /**
   * เชื่อมบัญชี GitHub — รับ token ได้สองทาง (ฝั่ง backend มองเหมือนกันหมด):
   * 1. provider_token จาก Supabase GitHub OAuth (frontend ขอ scope repo เพิ่มตอน sign-in)
   * 2. Personal Access Token ที่ user สร้างเองแล้ว paste เข้ามา
   */
  @Post('connect')
  async connect(@Body() dto: ConnectGithubDto, @Req() req: any) {
    const account = getAccount(req);
    const token = dto.token?.trim();
    if (!token) throw new BadRequestException('ต้องส่ง token มาด้วย');

    const user = await this.api.validateToken(token);
    this.tokens.save({
      accountId: account.id,
      token,
      username: user.username,
      scopes: user.scopes,
      connectedAt: new Date().toISOString(),
    });
    return { connected: true, username: user.username, scopes: user.scopes };
  }

  @Delete('connect')
  disconnect(@Req() req: any) {
    this.tokens.delete(getAccount(req).id);
    return { connected: false };
  }

  @Get('repos')
  async repos(@Req() req: any) {
    const conn = this.requireConnection(req);
    return this.api.listRepos(conn.token);
  }

  @Get('repos/:owner/:repo/branches')
  async branches(@Param('owner') owner: string, @Param('repo') repo: string, @Req() req: any) {
    const conn = this.requireConnection(req);
    return this.api.listBranches(conn.token, owner, repo);
  }

  private requireConnection(req: any) {
    const conn = this.tokens.get(getAccount(req).id);
    if (!conn) throw new BadRequestException('github_not_connected');
    return conn;
  }
}
