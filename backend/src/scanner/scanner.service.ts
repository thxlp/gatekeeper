import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Finding, Severity } from '../common/types';
import { CONFIGS_DIR } from '../common/paths';
import { DependencyAuditService } from './dependency-audit.service';

interface PatternRule {
  id: string;
  pattern: string;
  flags: string;
  severity: Severity;
  description: string;
}

@Injectable()
export class ScannerService {
  private secretRules: PatternRule[];
  private heuristicRules: PatternRule[];

  constructor(private dependencyAudit: DependencyAuditService) {
    const base = path.join(CONFIGS_DIR, 'detection-rules');
    this.secretRules = JSON.parse(fs.readFileSync(path.join(base, 'secret-patterns.json'), 'utf8'));
    this.heuristicRules = JSON.parse(
      fs.readFileSync(path.join(base, 'heuristic-patterns.json'), 'utf8'),
    );
  }

  scanDependencies(files: { path: string }[]): Finding[] {
    return this.dependencyAudit.scanDependencies(files);
  }

  scanText(filePath: string, content: string): Finding[] {
    const findings: Finding[] = [];

    for (const rule of this.secretRules) {
      const re = new RegExp(rule.pattern, rule.flags);
      if (re.test(content)) {
        findings.push({
          type: 'secret',
          rule_id: rule.id,
          severity: rule.severity,
          description: rule.description,
          file: filePath,
        });
      }
    }

    for (const rule of this.heuristicRules) {
      const re = new RegExp(rule.pattern, rule.flags);
      if (re.test(content)) {
        findings.push({
          type: 'heuristic',
          rule_id: rule.id,
          severity: rule.severity,
          description: rule.description,
          file: filePath,
        });
      }
    }

    return findings;
  }
}
