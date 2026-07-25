import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { CookieChallengeGuard } from '../challenge/challenge.guard';
import { ManagedDbService } from './managed-db.service';
import { AttachDbDto, CreateManagedDbDto } from './managed-db.dto';

@Controller('databases')
@UseGuards(CookieChallengeGuard, AuthGuard)
export class ManagedDbController {
  constructor(private svc: ManagedDbService) {}

  @Get()
  list(@Req() req: any) {
    return this.svc.list(getAccount(req));
  }

  @Post()
  create(@Body() dto: CreateManagedDbDto, @Req() req: any) {
    return this.svc.create(dto, getAccount(req));
  }

  // connection string เต็ม (มี password) — endpoint แยก ไม่ปนกับ list
  @Get(':id/connection')
  connection(@Param('id') id: string, @Req() req: any) {
    return this.svc.connection(id, getAccount(req));
  }

  @Post(':id/attach')
  attach(@Param('id') id: string, @Body() dto: AttachDbDto, @Req() req: any) {
    return this.svc.attach(id, dto.appId, getAccount(req));
  }

  @Post(':id/detach')
  detach(@Param('id') id: string, @Body() dto: AttachDbDto, @Req() req: any) {
    return this.svc.detach(id, dto.appId, getAccount(req));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.remove(id, getAccount(req));
  }
}
