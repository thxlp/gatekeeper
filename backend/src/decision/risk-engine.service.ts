import { Injectable } from '@nestjs/common';
import { Finding, RiskResult, Severity } from '../common/types';

const SEVERITY_SCORE: Record<Severity, number> = {
  LOW: 5,
  MEDIUM: 20,
  HIGH: 40,
  CRITICAL: 100,
};

const BLOCK_THRESHOLD = 100;    // มี CRITICAL อย่างน้อย 1 ตัว หรือคะแนนรวม >= 100
const QUARANTINE_THRESHOLD = 50; // คะแนนรวม >= 50

@Injectable()
export class RiskEngineService {
  evaluate(findings: Finding[]): RiskResult {
    const score = findings.reduce((sum, f) => sum + (SEVERITY_SCORE[f.severity] ?? 0), 0);
    const hasCritical = findings.some((f) => f.severity === 'CRITICAL');

    let decision: 'ALLOW' | 'BLOCK' | 'QUARANTINE';
    if (hasCritical || score >= BLOCK_THRESHOLD) {
      decision = 'BLOCK';
    } else if (score >= QUARANTINE_THRESHOLD) {
      decision = 'QUARANTINE';
    } else {
      decision = 'ALLOW';
    }

    return { decision, score, findings };
  }
}
