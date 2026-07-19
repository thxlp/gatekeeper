import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../common/paths';
import { GitAppStore } from '../apps/git-app.store';
import { DockerRuntimeService } from '../deploy/docker-runtime.service';

export interface UsageAppStat {
  id: string;
  name: string;
  running: boolean;
  // null = ยังไม่เคย deploy สำเร็จ (ไม่มี container) ต่างจาก running:false ที่มีแต่หยุดอยู่
  cpuPercent: number | null;
  memUsedMb: number | null;
  memLimitMb: number | null;
}

export interface UsageDeployMonth {
  month: string; // YYYY-MM
  total: number;
  allowed: number;
  blocked: number;
}

export interface UsageSummary {
  apps: UsageAppStat[];
  deploys: {
    total: number;
    allowed: number;
    blocked: number;
    months: UsageDeployMonth[];
  };
}

const MONTHS_SHOWN = 6;

/**
 * รวมผลการใช้งานต่อ account สำหรับหน้า Settings: resource สดของ container แต่ละ app
 * (docker stats) + สถิติ deploy ย้อนหลังจาก usage.jsonl ที่ UsageCollectorService append ไว้
 * ทุกครั้งที่ pipeline วิ่ง — อ่านไฟล์สดทุกครั้งเหมือน GitAppStore (หลาย instance แชร์ volume)
 */
@Injectable()
export class UsageStatsService {
  private usageFile = path.join(DATA_DIR, 'usage.jsonl');

  constructor(
    private gitAppStore: GitAppStore,
    private dockerRuntime: DockerRuntimeService,
  ) {}

  async summary(accountId: string): Promise<UsageSummary> {
    const [apps, deploys] = await Promise.all([this.collectAppStats(accountId), this.collectDeployStats(accountId)]);
    return { apps, deploys };
  }

  private async collectAppStats(accountId: string): Promise<UsageAppStat[]> {
    const apps = this.gitAppStore.findAll(accountId);
    return Promise.all(
      apps.map(async (app) => {
        const stats = await this.dockerRuntime.getContainerStats(`gatekeeper-app-${app.id}`);
        return {
          id: app.id,
          name: app.projectName || app.repoFullName || app.id,
          running: stats?.running ?? false,
          cpuPercent: stats?.running ? stats.cpuPercent : null,
          memUsedMb: stats?.running ? stats.memUsedMb : null,
          memLimitMb: stats?.running ? stats.memLimitMb : null,
        };
      }),
    );
  }

  private async collectDeployStats(accountId: string): Promise<UsageSummary['deploys']> {
    let raw = '';
    try {
      raw = await fs.promises.readFile(this.usageFile, 'utf8');
    } catch {
      // ยังไม่มีไฟล์ = ยังไม่เคยมี deploy เลย
    }

    let total = 0;
    let allowed = 0;
    const byMonth = new Map<string, UsageDeployMonth>();
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        continue; // บรรทัดเสีย (เช่น เขียนค้างตอน crash) ข้ามไป ไม่ให้ทั้ง endpoint พัง
      }
      if (event.accountId !== accountId) continue;
      total += 1;
      if (event.allowed) allowed += 1;
      const month = String(event.ts || '').slice(0, 7); // YYYY-MM
      if (month) {
        const bucket = byMonth.get(month) || { month, total: 0, allowed: 0, blocked: 0 };
        bucket.total += 1;
        if (event.allowed) bucket.allowed += 1;
        else bucket.blocked += 1;
        byMonth.set(month, bucket);
      }
    }

    const months = [...byMonth.values()]
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, MONTHS_SHOWN);
    return { total, allowed, blocked: total - allowed, months };
  }
}
