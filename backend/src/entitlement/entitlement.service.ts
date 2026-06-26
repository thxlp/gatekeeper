import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Account } from '../common/types';
import { CONFIGS_DIR } from '../common/paths';
import { UsageCollectorService } from './usage-collector.service';

interface Policy {
  plans: Record<
    string,
    {
      allowed_runtimes: string[];
      allowed_features: string[];
      max_artifact_mb: number;
    }
  >;
}

export interface EntitlementResult {
  allowed: boolean;
  reason?: string;
}

@Injectable()
export class EntitlementService {
  private policy: Policy;

  constructor(private usageCollector: UsageCollectorService) {
    const configPath = path.join(CONFIGS_DIR, 'policy.json');
    this.policy = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  check(
    account: Account,
    opts: {
      runtime?: string;
      feature?: string;
      artifactSizeMb?: number;
      requestId?: string;
    },
  ): EntitlementResult {
    const plan = this.policy.plans[account.plan];
    if (!plan) return { allowed: false, reason: `unknown_plan:${account.plan}` };

    let result: EntitlementResult;

    if (opts.runtime && !plan.allowed_runtimes.includes(opts.runtime)) {
      result = { allowed: false, reason: `runtime_not_entitled:${opts.runtime}` };
    } else if (opts.feature && !plan.allowed_features.includes(opts.feature)) {
      result = { allowed: false, reason: `feature_not_entitled:${opts.feature}` };
    } else if (opts.artifactSizeMb && opts.artifactSizeMb > plan.max_artifact_mb) {
      result = {
        allowed: false,
        reason: `artifact_too_large:${opts.artifactSizeMb.toFixed(1)}mb_max:${plan.max_artifact_mb}mb`,
      };
    } else {
      result = { allowed: true };
    }

    this.usageCollector.recordUsage({
      requestId: opts.requestId,
      accountId: account.id,
      plan: account.plan,
      feature: opts.feature,
      runtime: opts.runtime,
      allowed: result.allowed,
      stage: 'entitlement',
    });

    return result;
  }

  assertPlugin(account: Account): void {
    // plugin registry ต้องการ plan ใดก็ได้ที่ active (ตรวจสอบใน guard แล้ว)
    // เพิ่ม quota check ตรงนี้ในอนาคตได้
  }
}
