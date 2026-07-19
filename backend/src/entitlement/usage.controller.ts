import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { UsageStatsService } from './usage-stats.service';

@Controller('usage')
@UseGuards(CookieChallengeGuard, AuthGuard)
export class UsageController {
  constructor(private stats: UsageStatsService) {}

  // ผลการใช้งานของ account ตัวเอง (หน้า Settings) — ไม่มี endpoint ดูของ account อื่น
  @Get()
  summary(@Req() req: any) {
    return this.stats.summary(getAccount(req).id);
  }
}
