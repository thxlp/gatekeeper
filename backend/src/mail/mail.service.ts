import { Injectable, Logger } from '@nestjs/common';
// ห้าม default-import — backend ไม่เปิด esModuleInterop (nodemailer เป็น CJS)
import * as nodemailer from 'nodemailer';

/**
 * ช่องทางส่งอีเมลกลางของระบบ (notification + OTP) — มีสองโหมด เลือกด้วย MAIL_TRANSPORT:
 *
 *   MAIL_TRANSPORT=smtp (ค่าเริ่มต้นถ้าไม่ได้ตั้ง MAIL_API_KEY)
 *     SMTP_HOST, SMTP_PORT (default 587, 465 = TLS ตรง), SMTP_USER/SMTP_PASS, MAIL_FROM
 *   MAIL_TRANSPORT=http (ค่าเริ่มต้นถ้าตั้ง MAIL_API_KEY ไว้)
 *     MAIL_HTTP_PROVIDER=resend|brevo (default resend), MAIL_API_KEY, MAIL_FROM
 *
 * ทำไมต้องมีโหมด http: โฮสต์บางที่ (รวมเครื่องนี้ — พบ 2026-08-08) บล็อก outbound TCP
 * พอร์ต 25/465/587 ทั้งหมด ทำให้ SMTP ต่อไม่ติดถาวร ส่วน 443 ใช้ได้ปกติ → ยิงผ่าน REST API
 * ของผู้ให้บริการแทน (ถ้า provider มีพอร์ต 2525 เช่น Brevo/SendGrid/Mailgun จะอยู่โหมด smtp
 * แล้วตั้ง SMTP_PORT=2525 ก็ได้เหมือนกัน — ไม่ต้องแก้โค้ด)
 *
 * ตั้งค่าไม่ครบ = ระบบทำงานปกติแต่ "ข้าม" การส่งเมลทั้งหมด (log warn) — การส่งเมลต้องไม่ทำ
 * pipeline/login พังไม่ว่ากรณีไหน จึง fail-soft เสมอ (ไม่ throw) แต่ send() คืน boolean บอก
 * ผลจริง ให้ caller ที่ต้อง fail-closed (เช่น OTP ของ 2FA) เช็คเองได้ว่าเมล "ออกจริง" ไหม
 * — isConfigured() บอกได้แค่ว่า "ตั้งค่าไว้" ไม่ได้แปลว่าส่งสำเร็จ
 */

type MailTransport = 'smtp' | 'http';
type HttpProvider = 'resend' | 'brevo';

// ไม่ใส่ timeout = nodemailer รอ TCP handshake ยาวมากเมื่อพอร์ตถูกบล็อก (อาการคือ "เงียบ")
// 10 วิพอสำหรับ SMTP ที่ปกติ และสั้นพอให้ผู้ใช้ได้ error จริงแทนที่จะค้าง
const SMTP_TIMEOUT_MS = 10_000;
const HTTP_TIMEOUT_MS = 10_000;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private http: { provider: HttpProvider; apiKey: string } | null = null;
  private from = process.env.MAIL_FROM || '';

  constructor() {
    if (!this.from) {
      this.logger.warn('MAIL_FROM ยังไม่ได้ตั้งค่า — ระบบจะข้ามการส่งอีเมลทั้งหมด');
      return;
    }
    if (this.resolveTransport() === 'http') this.initHttp();
    else this.initSmtp();
  }

  /** ระบุชัดด้วย MAIL_TRANSPORT ได้ ไม่งั้นเดาจากว่ามี MAIL_API_KEY ไหม (ตั้ง key = ตั้งใจใช้ http) */
  private resolveTransport(): MailTransport {
    const explicit = (process.env.MAIL_TRANSPORT || '').trim().toLowerCase();
    if (explicit === 'http' || explicit === 'smtp') return explicit;
    return process.env.MAIL_API_KEY ? 'http' : 'smtp';
  }

  private initHttp(): void {
    const apiKey = (process.env.MAIL_API_KEY || '').trim();
    if (!apiKey) {
      this.logger.warn('MAIL_TRANSPORT=http แต่ยังไม่ได้ตั้ง MAIL_API_KEY — ระบบจะข้ามการส่งอีเมลทั้งหมด');
      return;
    }
    const provider = (process.env.MAIL_HTTP_PROVIDER || 'resend').trim().toLowerCase();
    if (provider !== 'resend' && provider !== 'brevo') {
      this.logger.warn(`MAIL_HTTP_PROVIDER="${provider}" ไม่รู้จัก (รองรับ resend|brevo) — ข้ามการส่งอีเมล`);
      return;
    }
    this.http = { provider, apiKey };
    this.logger.log(`ส่งอีเมลผ่าน HTTP API ของ ${provider} (from: ${this.from})`);
  }

  private initSmtp(): void {
    const host = process.env.SMTP_HOST;
    if (!host) {
      this.logger.warn('SMTP ยังไม่ได้ตั้งค่า (SMTP_HOST) — ระบบจะข้ามการส่งอีเมลทั้งหมด');
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
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
    this.logger.log(`ส่งอีเมลผ่าน SMTP ${host}:${port} (from: ${this.from})`);
  }

  isConfigured(): boolean {
    return this.transporter !== null || this.http !== null;
  }

  /**
   * ส่งเมล plain-text — ล้มเหลวแค่ log ไม่ throw
   * @returns true = ส่งออกจริงแล้ว, false = ข้าม (ไม่ได้ตั้งค่า) หรือส่งไม่สำเร็จ
   */
  async send(to: string, subject: string, text: string): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.warn(`ยังไม่ได้ตั้งค่าช่องทางส่งเมล — ข้าม email "${subject}" ถึง ${to}`);
      return false;
    }
    try {
      if (this.http) await this.sendViaHttp(to, subject, text);
      else await this.transporter.sendMail({ from: this.from, to, subject, text });
      return true;
    } catch (err: any) {
      this.logger.warn(`ส่งเมล "${subject}" ถึง ${to} ไม่สำเร็จ: ${err?.message}`);
      return false;
    }
  }

  /** ยิง REST API ของ provider ผ่าน 443 — มี timeout เองเพราะ fetch ไม่มี default */
  private async sendViaHttp(to: string, subject: string, text: string): Promise<void> {
    const { provider, apiKey } = this.http;
    const req =
      provider === 'resend'
        ? {
            url: 'https://api.resend.com/emails',
            headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
            body: { from: this.from, to: [to], subject, text },
          }
        : {
            url: 'https://api.brevo.com/v3/smtp/email',
            headers: { 'api-key': apiKey, 'content-type': 'application/json' },
            body: { sender: { email: this.from }, to: [{ email: to }], subject, textContent: text },
          };

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: ctl.signal,
      });
      if (!res.ok) {
        // body ของ error มีเหตุผลที่ provider ปฏิเสธ (เช่น from ยังไม่ verify) — ตัดสั้นกัน log บวม
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        throw new Error(`${provider} API ตอบ ${res.status}: ${detail}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
