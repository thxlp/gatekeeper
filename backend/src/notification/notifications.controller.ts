import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(CookieChallengeGuard, AuthGuard)
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  // feed กระดิ่งบน TopBar — frontend poll ทุก 30s (แพทเทิร์น polling เดียวกับหน้าอื่นทั้งแอป)
  @Get()
  list(@Req() req: any) {
    return this.svc.list(getAccount(req).id);
  }

  @Post('read')
  markRead(@Req() req: any) {
    return this.svc.markAllRead(getAccount(req).id);
  }
}
