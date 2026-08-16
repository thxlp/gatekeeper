import { Module, Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuthGuard, getAccount } from '../auth/auth.guard';
import { AccountModule } from '../account/account.module';

const DECISIONS = ['ALLOW', 'QUARANTINE', 'BLOCK', 'INFO'];

@Controller('audit')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private svc: AuditService) {}

  /**
   * คืนแบบตัดหน้า (ใหม่สุดก่อน) — client เดิมที่ไม่ส่ง query มาก็ยังใช้ได้ แค่ได้ 100 แถวล่าสุด
   * แทนทั้งหมด ซึ่งเป็นสิ่งที่หน้า UI ต้องการอยู่แล้ว
   */
  @Get()
  getMyLogs(
    @Req() req: any,
    @Query('decision') decision?: string,
    @Query('stage') stage?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    const toInt = (v?: string) => (v && /^\d{1,6}$/.test(v) ? Number(v) : undefined);
    return this.svc.queryByAccount(getAccount(req).id, {
      // ค่าที่ไม่รู้จักถือว่าไม่กรอง — ดีกว่าตอบ 400 ให้หน้าเว็บพังเพราะ query เพี้ยน
      decision: decision && DECISIONS.includes(decision) ? decision : undefined,
      // stage เป็น free-form string ฝั่ง backend (ดู AuditEntry) — ไม่มี enum ตายตัวให้เช็ค
      // เหมือน decision จึงส่งผ่านตรงๆ (แค่ตัดว่างทิ้งกัน query string เพี้ยน)
      stage: stage?.trim() || undefined,
      q,
      // from/to เป็น ISO instant (frontend คำนวณขอบวันตาม timezone ของผู้ใช้มาให้แล้ว)
      // ค่าที่ parse ไม่ได้ถูกมองข้ามใน service
      from,
      to,
      offset: toInt(offset),
      limit: toInt(limit),
    });
  }
}

@Module({
  imports: [AccountModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
