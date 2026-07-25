import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { GitAppStore } from '../apps/git-app.store';
import { NotificationsService } from '../notification/notifications.service';
import { DockerRuntimeService } from './docker-runtime.service';

// รอบการตรวจ + เกณฑ์ crash-loop (ปรับผ่าน env ได้)
const INTERVAL_MS = Number(process.env.CRASH_MONITOR_INTERVAL_MS || 30_000);
// นับ restart สะสมในหน้าต่างเวลานี้ — เกินเกณฑ์ = crash-loop
const WINDOW_MS = Number(process.env.CRASHLOOP_WINDOW_MS || 5 * 60_000);
const THRESHOLD = Number(process.env.CRASHLOOP_THRESHOLD || 3);
// กันแจ้งซ้ำถี่ๆ ต่อแอปเดียวกัน
const COOLDOWN_MS = Number(process.env.CRASHLOOP_COOLDOWN_MS || 30 * 60_000);

interface AppCrashState {
  lastRestartCount: number; // ค่า RestartCount ที่เห็นรอบก่อน (ดู delta)
  windowStart: number; // เวลาเริ่มหน้าต่างนับปัจจุบัน
  restartsInWindow: number; // จำนวน restart สะสมในหน้าต่าง
  lastAlertAt: number; // กัน spam (cooldown)
}

/**
 * เฝ้า container ของทุกแอปเป็นระยะ ตรวจ crash-loop จาก delta ของ RestartCount (docker เพิ่มค่านี้
 * ทุกครั้งที่ restart policy 'unless-stopped' เด้ง container ที่ crash กลับมา) — เกิน THRESHOLD
 * ครั้งใน WINDOW = แจ้งเตือนเจ้าของ (in-app + email) พร้อม cooldown กันรัว. อ่านสถานะอย่างเดียว
 * ไม่แตะ container ของ user (ตามที่ตกลง: แจ้งเตือนอย่างเดียว)
 */
@Injectable()
export class CrashMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrashMonitorService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private states = new Map<string, AppCrashState>();
  private ticking = false;

  constructor(
    private store: GitAppStore,
    private docker: DockerRuntimeService,
    private notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    // gatekeeper รัน backend 2 instance หลัง nginx LB — ถ้าทั้งคู่เฝ้าจะยิง alert ซ้ำ (2 เมล/ครั้ง)
    // ตั้ง CRASH_MONITOR_ENABLED=0 บน instance ที่ไม่ต้องการให้เฝ้า (เปิดตัวเดียวพอ) default = เปิด
    if (process.env.CRASH_MONITOR_ENABLED === '0') {
      this.logger.log('crash-monitor disabled on this instance (CRASH_MONITOR_ENABLED=0)');
      return;
    }
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
    // unref เพื่อไม่ให้ timer ค้าง process ตอน shutdown (test/CLI)
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.ticking) return; // กัน tick ซ้อนถ้า inspect รอบก่อนยังไม่จบ (docker ช้า)
    this.ticking = true;
    try {
      const apps = this.store.findAll().filter((a) => a.enabled);
      const seen = new Set<string>();
      for (const app of apps) {
        seen.add(app.id);
        try {
          await this.checkApp(app.id, app.accountId, app.projectName || app.repoFullName || app.id);
        } catch (err: any) {
          this.logger.warn(`crash-check ${app.id} failed: ${err?.message}`);
        }
      }
      // เก็บกวาด state ของแอปที่ถูกลบไปแล้ว
      for (const id of this.states.keys()) if (!seen.has(id)) this.states.delete(id);
    } finally {
      this.ticking = false;
    }
  }

  private async checkApp(appId: string, accountId: string | undefined, name: string): Promise<void> {
    const info = await this.docker.inspectContainerState(`gatekeeper-app-${appId}`);
    if (!info) {
      this.states.delete(appId); // ไม่มี container — รีเซ็ต ไม่เตือน
      return;
    }
    const now = Date.now();
    const prev = this.states.get(appId);

    // ครั้งแรกที่เห็นแอปนี้ — ตั้ง baseline เฉยๆ ไม่ตัดสิน (ไม่งั้น restart สะสมเก่านับรวมผิด)
    if (!prev) {
      this.states.set(appId, {
        lastRestartCount: info.restartCount,
        windowStart: now,
        restartsInWindow: 0,
        lastAlertAt: 0,
      });
      return;
    }

    // เลื่อนหน้าต่างเมื่อหมดอายุ
    if (now - prev.windowStart > WINDOW_MS) {
      prev.windowStart = now;
      prev.restartsInWindow = 0;
    }

    const delta = info.restartCount - prev.lastRestartCount;
    // delta < 0 = container ถูก recreate (deploy ใหม่ นับใหม่จาก 0) — reset baseline
    if (delta < 0) {
      prev.restartsInWindow = 0;
    } else if (delta > 0) {
      prev.restartsInWindow += delta;
    }
    prev.lastRestartCount = info.restartCount;

    if (prev.restartsInWindow >= THRESHOLD && now - prev.lastAlertAt > COOLDOWN_MS) {
      prev.lastAlertAt = now;
      const mins = Math.round(WINDOW_MS / 60_000);
      await this.notifications.notify(accountId, {
        type: 'app.crashloop',
        title: `แอป "${name}" กำลัง crash ซ้ำ`,
        body: `container restart ${prev.restartsInWindow} ครั้งภายใน ~${mins} นาที — เปิดแท็บ Logs เพื่อดูสาเหตุ`,
        email: true,
        emailText:
          `แอป "${name}" ของคุณมีอาการ crash-loop: container ถูก restart ${prev.restartsInWindow} ครั้ง` +
          ` ภายในเวลาประมาณ ${mins} นาที\n\n` +
          `แนะนำให้เปิดหน้าแอป → แท็บ Logs เพื่อดู error ล่าสุด แล้วแก้แล้ว deploy ใหม่ ` +
          `หรือ rollback กลับ release ก่อนหน้าที่ทำงานได้`,
        meta: { appId, restartsInWindow: prev.restartsInWindow, windowMinutes: mins },
      });
      this.logger.warn(`crash-loop alert sent for app ${appId} (${prev.restartsInWindow} restarts)`);
    }
  }
}
