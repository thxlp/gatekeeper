import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { DomainService } from './domain.service';
import { AddDomainDto } from './domain.dto';

// จัดการ custom domain ต่อแอป (owner-only) — คนละตัวกับ DomainProxyController ที่เสิร์ฟ public
@Controller('apps/:id/domains')
@UseGuards(CookieChallengeGuard, AuthGuard)
export class DomainController {
  constructor(private svc: DomainService) {}

  @Get()
  list(@Param('id') id: string, @Req() req: any) {
    return this.svc.list(id, getAccount(req));
  }

  @Post()
  add(@Param('id') id: string, @Body() dto: AddDomainDto, @Req() req: any) {
    return this.svc.add(id, dto.domain, getAccount(req));
  }

  @Post(':domain/verify')
  verify(@Param('id') id: string, @Param('domain') domain: string, @Req() req: any) {
    return this.svc.verify(id, domain, getAccount(req));
  }

  @Delete(':domain')
  remove(@Param('id') id: string, @Param('domain') domain: string, @Req() req: any) {
    return this.svc.remove(id, domain, getAccount(req));
  }
}
