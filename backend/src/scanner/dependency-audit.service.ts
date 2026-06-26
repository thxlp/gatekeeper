import { Injectable } from '@nestjs/common';
import { Finding } from '../common/types';

export interface DependencyScanFile {
  path: string;
}

/**
 * Stage 3c: Dependency Audit (Software Composition Analysis)
 *
 * TODO: plug in `trivy fs --format json <stagingDir>` via child_process.execFile,
 * parse JSON output into Finding[] (see gatekeeper v0.1 dependencyAudit.js for stub behavior).
 *
 * Sandbox ที่ใช้พัฒนาไฟล์นี้ไม่มี network ออกไปดึง vulnerability DB จึงทำเป็น stub
 * ที่ตรวจแค่ "มี manifest dependency ไหม" และแจ้งตรงๆ ว่ายังไม่ได้ผูก engine จริง
 */
@Injectable()
export class DependencyAuditService {
  private manifestFiles = ['package.json', 'requirements.txt', 'go.sum', 'composer.lock'];

  scanDependencies(files: DependencyScanFile[]): Finding[] {
    const found = files.find((f) =>
      this.manifestFiles.some((m) => f.path.endsWith(m)),
    );

    if (!found) {
      return [];
    }

    return [
      {
        type: 'dependency',
        rule_id: 'SCA-NOT-CONFIGURED',
        severity: 'LOW',
        description: `พบไฟล์ manifest (${found.path}) แต่ SCA engine จริง (Trivy/OSV) ยังไม่ได้ผูกเข้ามา — ดูวิธีต่อยอดใน README`,
        file: found.path,
      },
    ];
  }
}
