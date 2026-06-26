import { Module, Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuthGuard, getAccount } from '../auth/auth.guard';

@Controller('audit')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private svc: AuditService) {}

  @Get()
  getMyLogs(@Req() req: any) {
    return this.svc.readByAccount(getAccount(req).id);
  }
}

@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
