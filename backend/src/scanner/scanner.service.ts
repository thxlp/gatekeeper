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

  // สแกน URL/base_url ของ plugin (Step 3)
  scanPluginEndpoint(baseUrl: string): Finding[] {
    const findings: Finding[] = [];
    try {
      const url = new URL(baseUrl);

      // เช็ค private IP ranges
      const privateRanges = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^192\.168\./,
        /^127\./,
        /^0\.0\.0\.0$/,
        /^localhost$/i,
        /^::1$/,
      ];
      const hostname = url.hostname;
      for (const re of privateRanges) {
        if (re.test(hostname)) {
          findings.push({
            type: 'heuristic',
            rule_id: 'SSRF-PRIVATE-IP',
            severity: 'CRITICAL',
            description: `base_url ชี้ไปที่ private IP/localhost (${hostname}) — อาจเป็นช่องโหว่ SSRF`,
            file: 'plugin.base_url',
          });
          break;
        }
      }

      // ต้องใช้ HTTPS ยกเว้น development
      if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
        findings.push({
          type: 'heuristic',
          rule_id: 'INSECURE-HTTP',
          severity: 'HIGH',
          description: 'Plugin endpoint ใช้ HTTP แทน HTTPS — ข้อมูลส่งแบบ plaintext',
          file: 'plugin.base_url',
        });
      }
    } catch {
      findings.push({
        type: 'heuristic',
        rule_id: 'INVALID-URL',
        severity: 'HIGH',
        description: `base_url ไม่ใช่ URL ที่ valid: ${baseUrl}`,
        file: 'plugin.base_url',
      });
    }
    return findings;
  }
}
