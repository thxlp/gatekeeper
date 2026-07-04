import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { AppsService } from './apps.service';
import { RegisterGitAppDto } from './register-git-app.dto';
import { UpdateGitAppDto } from './update-git-app.dto';

@Controller('apps')
@UseGuards(CookieChallengeGuard, AuthGuard)
export class AppsController {
  constructor(private svc: AppsService) {}

  @Post('register')
  register(@Body() dto: RegisterGitAppDto, @Req() req: any) {
    return this.svc.registerGitApp(dto, getAccount(req));
  }

  @Get()
  list(@Req() req: any) {
    return this.svc.listMyApps(getAccount(req));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateGitAppDto, @Req() req: any) {
    return this.svc.updateGitApp(id, dto, getAccount(req));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.removeGitApp(id, getAccount(req));
  }
}
