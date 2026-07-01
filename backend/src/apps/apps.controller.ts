import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { AppsService } from './apps.service';
import { RegisterGitAppDto } from './register-git-app.dto';

@Controller('apps')
@UseGuards(CookieChallengeGuard, AuthGuard)
export class AppsController {
  constructor(private svc: AppsService) {}

  @Post('register')
  register(@Body() dto: RegisterGitAppDto, @Req() req: any) {
    return this.svc.registerGitApp(dto, getAccount(req));
  }
}
