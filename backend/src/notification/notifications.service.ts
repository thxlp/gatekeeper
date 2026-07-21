import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Notification } from './notification.entity';
import { Account } from '../account/account.entity';
import { MailService } from '../mail/mail.service';

// เก็บแจ้งเตือนย้อนหลังต่อ account เท่านี้พอ — feed กระดิ่งโชว์แค่หน้าล่าสุด ของเก่ากว่านี้
// มี Audit Log เป็นแหล่งอ้างอิงถาวรอยู่แล้ว
const KEEP_PER_ACCOUNT = 100;

export interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  meta?: Record<string, unknown>;
  // true = ส่งอีเมลด้วย "ถ้า" ผู้ใช้เปิด notify_email และ SMTP ถูกตั้งค่า (in-app ได้เสมอ)
  email?: boolean;
  // เนื้อเมลฉบับเต็ม (จาก mail-templates) — ไม่ใส่ = ใช้ body สั้นๆ ของ in-app แทน
  emailText?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private repo: Repository<Notification>,
    @InjectRepository(Account) private accounts: Repository<Account>,
    private mail: MailService,
  ) {}

  /**
   * บันทึกแจ้งเตือน + ส่งเมลตาม preference — fail-soft ทั้งก้อน: การแจ้งเตือนพังต้องไม่ทำ
   * pipeline/rollback พังตาม (caller ทั้งหมดเรียกแบบ fire-and-forget ผ่าน void/await ก็ได้)
   * accountId ว่าง = app แบบ static/ops-managed ไม่มีเจ้าของให้แจ้ง — ข้ามเงียบๆ
   */
  async notify(accountId: string | undefined, n: NotifyInput): Promise<void> {
    if (!accountId) return;
    try {
      await this.repo.save(
        this.repo.create({
          id: `ntf_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
          accountId,
          type: n.type,
          title: n.title,
          body: n.body ?? '',
          meta: n.meta ?? null,
        }),
      );

      // retention: ตัดแถวเก่าที่เกินโควตาต่อ account (กันตารางโตไม่หยุดโดยไม่ต้องมี sweeper แยก)
      await this.repo.query(
        `DELETE FROM notifications
         WHERE account_id = $1 AND id NOT IN (
           SELECT id FROM notifications WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2
         )`,
        [accountId, KEEP_PER_ACCOUNT],
      );

      if (n.email && this.mail.isConfigured()) {
        const account = await this.accounts.findOne({ where: { id: accountId } });
        if (account?.notifyEmail) {
          await this.mail.send(account.email, `[Gatekeeper] ${n.title}`, n.emailText || n.body || n.title);
        }
      }
    } catch (err: any) {
      this.logger.warn(`notify(${accountId}, ${n.type}) failed: ${err?.message}`);
    }
  }

  async list(accountId: string, limit = 20) {
    const [items, unread] = await Promise.all([
      this.repo.find({ where: { accountId }, order: { createdAt: 'DESC' }, take: limit }),
      this.repo.count({ where: { accountId, readAt: IsNull() } }),
    ]);
    return {
      items: items.map((x) => ({
        id: x.id,
        type: x.type,
        title: x.title,
        body: x.body,
        meta: x.meta,
        read: x.readAt !== null,
        createdAt: x.createdAt,
      })),
      unread,
    };
  }

  /** mark-all-read — feed กระดิ่งเปิดดูแล้วถือว่าอ่านหมด (ไม่ทำ per-item ให้ซับซ้อนเกินงาน) */
  async markAllRead(accountId: string): Promise<{ ok: true }> {
    await this.repo.update({ accountId, readAt: IsNull() }, { readAt: new Date() });
    return { ok: true };
  }
}
