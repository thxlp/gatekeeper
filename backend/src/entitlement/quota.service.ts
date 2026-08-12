import { BadRequestException, Injectable } from '@nestjs/common';
import { GitApp } from '../common/types';
import { GitAppStore } from '../apps/git-app.store';
import { ADDON_CPU, ADDON_MEMORY_MB, appResources } from '../deploy/docker-runtime.service';

// โควต้าทรัพยากรรวมต่อ user — หารพูลรวมเท่าๆ กันตามจำนวน user ที่ตั้งใจรองรับ
// พูลรวมเดิม (ฐาน 30 user × 256 MB / 0.5 CPU) = 7680 MB / 15 CPU
// แบ่งใหม่ให้ 15 user เท่าๆ กัน → 7680/15 = 512 MB, 15/15 = 1 CPU ต่อคน
// แบบ overcommit: เป็นเพดานของ "ผลรวม limit" ไม่ใช่การจองจริง (app ส่วนใหญ่ idle ต่ำกว่า limit มาก)
// เครื่องจริงมีแค่ 1 CPU / 2GB — ตัวเลขนี้จึงเป็นเพดานกันคนเดียวกินหมด ไม่ใช่การรับประกันทรัพยากร
// จำนวน app ไม่จำกัด — จำกัดแค่ผลรวมทรัพยากร ใครอยากได้หลาย app ให้ตั้ง memoryMb ต่อ app เล็กลง
const USER_QUOTA_MEMORY_MB = Number(process.env.USER_QUOTA_MEMORY_MB || 512);
const USER_QUOTA_CPU = Number(process.env.USER_QUOTA_CPU || 1);

export interface QuotaSummary {
  memoryUsedMb: number; // ผลรวม limit ที่ app+addon ของ user จองไว้ (ไม่ใช่ RAM ที่ใช้จริงขณะนี้)
  memoryQuotaMb: number;
  cpuUsed: number;
  cpuQuota: number;
}

@Injectable()
export class QuotaService {
  constructor(private store: GitAppStore) {}

  /** ทรัพยากรที่ app หนึ่งตัวกินโควต้า = ตัว app (หลัง clamp) + addon ทุกตัวของมัน */
  private allocationOf(app: GitApp): { memoryMb: number; cpu: number } {
    const base = appResources(app);
    const addonCount = app.addons?.length || 0;
    return {
      memoryMb: base.memoryMb + addonCount * ADDON_MEMORY_MB,
      cpu: base.cpu + addonCount * ADDON_CPU,
    };
  }

  /** ผลรวมโควต้าที่ใช้ไปของ account (ข้าม app ที่ระบุใน excludeAppId — ใช้ตอนคิดค่าใหม่แทนค่าเก่า) */
  private usedBy(accountId: string, excludeAppId?: string): { memoryMb: number; cpu: number } {
    let memoryMb = 0;
    let cpu = 0;
    for (const app of this.store.findAll(accountId)) {
      if (app.id === excludeAppId) continue;
      const alloc = this.allocationOf(app);
      memoryMb += alloc.memoryMb;
      cpu += alloc.cpu;
    }
    return { memoryMb, cpu };
  }

  /**
   * เช็คก่อน save ว่า app (สร้างใหม่ หรือแก้ config แล้ว) ทำให้ผลรวมทรัพยากรของ account
   * เกินโควต้าไหม — เกินแล้ว throw 400 พร้อมตัวเลขให้ user รู้ว่าต้องลดอะไร
   */
  assertWithinQuota(candidate: GitApp): void {
    const used = this.usedBy(candidate.accountId, candidate.id);
    const alloc = this.allocationOf(candidate);
    const totalMb = used.memoryMb + alloc.memoryMb;
    const totalCpu = Math.round((used.cpu + alloc.cpu) * 100) / 100;

    if (totalMb > USER_QUOTA_MEMORY_MB || totalCpu > USER_QUOTA_CPU) {
      throw new BadRequestException(
        `quota_exceeded — ทรัพยากรรวมของบัญชีจะเป็น RAM ${totalMb}/${USER_QUOTA_MEMORY_MB} MB, ` +
          `CPU ${totalCpu}/${USER_QUOTA_CPU} (app นี้ขอ RAM ${alloc.memoryMb} MB, CPU ${alloc.cpu}` +
          `${candidate.addons?.length ? ` รวม addon ${candidate.addons.length} ตัว ตัวละ ${ADDON_MEMORY_MB} MB` : ''}) ` +
          `— ลด memoryMb/cpu ของ app นี้ หรือลบ/ลด app อื่นก่อน`,
      );
    }
  }

  summary(accountId: string): QuotaSummary {
    const used = this.usedBy(accountId);
    return {
      memoryUsedMb: used.memoryMb,
      memoryQuotaMb: USER_QUOTA_MEMORY_MB,
      cpuUsed: Math.round(used.cpu * 100) / 100,
      cpuQuota: USER_QUOTA_CPU,
    };
  }
}
