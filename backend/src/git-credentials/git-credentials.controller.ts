import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { GitCredentialApiService } from './git-credential-api.service';
import { CredentialProvider, GitCredentialStore } from './git-credential.store';
import { ConnectGitCredentialDto } from './connect-git-credential.dto';

const PROVIDERS: CredentialProvider[] = ['gitlab', 'bitbucket'];

/**
 * จัดการ credential ของ GitLab/Bitbucket ที่ผู้ใช้ paste เอง — ใช้ตอน clone private repo
 * (GitHub ไม่ผ่านที่นี่ เพราะมี OAuth flow แยกอยู่แล้วที่ /github/connect)
 *
 * ไม่มี endpoint ไหนคืนค่า token กลับไปเลย — คืนแค่สถานะ connected + username
 */
@Controller('git-credentials')
@UseGuards(CookieChallengeGuard, AuthGuard)
export class GitCredentialsController {
  constructor(
    private api: GitCredentialApiService,
    private store: GitCredentialStore,
  ) {}

  @Get('status')
  status(@Req() req: any) {
    const connected = this.store.listByAccount(getAccount(req).id);
    return {
      providers: PROVIDERS.map((provider) => {
        const conn = connected.find((c) => c.provider === provider);
        return conn
          ? { provider, connected: true, username: conn.username, connectedAt: conn.connectedAt }
          : { provider, connected: false };
      }),
    };
  }

  @Post('connect')
  async connect(@Body() dto: ConnectGitCredentialDto, @Req() req: any) {
    const account = getAccount(req);
    const token = dto.token?.trim();
    if (!token) throw new BadRequestException('ต้องส่ง token มาด้วย');

    const verified = await this.api.verify(dto.provider, token, dto.username?.trim() || undefined);
    // gitlab ทำ Basic auth ด้วย user คงที่ 'oauth2' ส่วน bitbucket ใช้ username จริงของเจ้าของ app password
    const username = dto.provider === 'gitlab' ? 'oauth2' : verified.username;

    this.store.save({
      accountId: account.id,
      provider: dto.provider,
      username,
      token,
      connectedAt: new Date().toISOString(),
    });

    return { provider: dto.provider, connected: true, username: verified.username };
  }

  @Delete('connect/:provider')
  disconnect(@Param('provider') provider: string, @Req() req: any) {
    if (!PROVIDERS.includes(provider as CredentialProvider)) {
      throw new BadRequestException('unsupported_provider');
    }
    this.store.delete(getAccount(req).id, provider as CredentialProvider);
    return { provider, connected: false };
  }
}
