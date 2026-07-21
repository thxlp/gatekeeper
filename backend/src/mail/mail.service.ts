import { Injectable, Logger } from '@nestjs/common';
// ห้าม default-import — backend ไม่เปิด esModuleInterop (nodemailer เป็น CJS)
import * as nodemailer from 'nodemailer';

/**
 * ช่องทางส่งอีเมลกลางของระบบ (notification + OTP) ผ่าน SMTP ทั่วไป — ตั้งค่าด้วย env:
 *   SMTP_HOST, SMTP_PORT (default 587, 465 = TLS ตรง), SMTP_USER/SMTP_PASS, MAIL_FROM
 * ไม่ตั้ง SMTP_HOST/MAIL_FROM = ระบบทำงานปกติแต่ "ข้าม" การส่งเมลทั้งหมด (log warn) —
 * การส่งเมลต้องไม่ทำ pipeline/login พังไม่ว่ากรณีไหน จึง fail-soft เสมอ ยกเว้นจุดที่
 * caller เช็ค isConfigured() เองเพื่อ fail-closed (เช่น เปิด 2FA ไม่ได้ถ้าเมลยังไม่พร้อม)
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private from = process.env.MAIL_FROM || '';

  constructor() {
    const host = process.env.SMTP_HOST;
    if (!host || !this.from) {
      this.logger.warn('SMTP ยังไม่ได้ตั้งค่า (SMTP_HOST/MAIL_FROM) — ระบบจะข้ามการส่งอีเมลทั้งหมด');
      return;
    }
    const port = Number(process.env.SMTP_PORT) || 587;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
        : undefined,
    });
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  /** ส่งเมล plain-text แบบ fire-and-safe — ล้มเหลวแค่ log ไม่ throw */
  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`SMTP ยังไม่ได้ตั้งค่า — ข้าม email "${subject}" ถึง ${to}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text });
    } catch (err: any) {
      this.logger.warn(`ส่งเมล "${subject}" ถึง ${to} ไม่สำเร็จ: ${err?.message}`);
    }
  }
}
