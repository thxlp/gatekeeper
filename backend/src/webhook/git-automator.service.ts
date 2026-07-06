import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { GitApp } from '../common/types';
import { DATA_DIR } from '../common/paths';

const execFileAsync = promisify(execFile);

const CLONE_TIMEOUT_MS = 5 * 60 * 1000;
const STALE_LOCK_MS = 10 * 60 * 1000;
const MAX_SCAN_FILE_BYTES = 2 * 1024 * 1024; // ไฟล์ใหญ่กว่านี้ข้าม (ไม่ใช่ source code ทั่วไป)

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'vendor',
  '.venv',
  '__pycache__',
]);

export interface ScannedFile {
  relPath: string;
  content: string;
}

@Injectable()
export class GitAutomatorService {
  private readonly logger = new Logger(GitAutomatorService.name);
  private lockRoot = path.join(DATA_DIR, 'git-locks');

  /**
   * ล็อกแบบ fs-based (mkdir แบบ atomic) แทน in-memory mutex
   * เพราะ backend รันหลาย instance (backend-1/backend-2) แชร์ volume เดียวกัน
   * lock ในหน่วยความจำของ instance เดียวป้องกัน race ข้าม instance ไม่ได้
   */
  acquireLock(appId: string): void {
    fs.mkdirSync(this.lockRoot, { recursive: true });
    const lockDir = path.join(this.lockRoot, appId);
    try {
      fs.mkdirSync(lockDir);
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;
      const age = Date.now() - fs.statSync(lockDir).mtimeMs;
      if (age > STALE_LOCK_MS) {
        this.logger.warn(`stale lock for ${appId} (age=${age}ms) — reclaiming`);
        fs.rmSync(lockDir, { recursive: true, force: true });
        fs.mkdirSync(lockDir);
      } else {
        throw new Error('deploy_in_progress');
      }
    }
  }

  releaseLock(appId: string): void {
    fs.rmSync(path.join(this.lockRoot, appId), { recursive: true, force: true });
  }

  /**
   * Clone repo แบบ shallow ลง targetDir ใหม่ทุกครั้ง (isolation ระดับ filesystem เหมือน DeployService)
   * ใช้ execFile (ไม่ใช่ exec) — args ส่งเป็น array แยกช่อง ไม่ผ่าน shell จึงไม่มีช่องให้ shell injection
   * ใช้ cloneUrl/branch จาก config ที่เราลงทะเบียนเองเท่านั้น ไม่เชื่อค่าจาก webhook payload
   */
  async cloneShallow(app: GitApp, targetDir: string): Promise<void> {
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    await execFileAsync(
      'git',
      [
        'clone',
        '--depth',
        '1',
        '--branch',
        app.branch,
        '--single-branch',
        '--',
        app.cloneUrl,
        targetDir,
      ],
      {
        timeout: CLONE_TIMEOUT_MS,
        maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
    );
  }

  /** เดินไฟล์ทั้งหมดใน dir (ข้าม build artifact/dependency dir) เพื่อป้อนเข้า security scanner */
  listTextFiles(rootDir: string): ScannedFile[] {
    const results: ScannedFile[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          walk(path.join(dir, entry.name));
          continue;
        }
        if (!entry.isFile()) continue;

        const fullPath = path.join(dir, entry.name);
        const stat = fs.statSync(fullPath);
        if (stat.size > MAX_SCAN_FILE_BYTES) continue;

        const buf = fs.readFileSync(fullPath);
        if (isLikelyBinary(buf)) continue;

        results.push({
          relPath: path.relative(rootDir, fullPath).split(path.sep).join('/'),
          content: buf.toString('utf8'),
        });
      }
    };

    walk(rootDir);
    return results;
  }

  /** ย้ายจาก staging ที่ผ่านการสแกนแล้วไปเป็นเวอร์ชัน deploy จริง (แทนที่เวอร์ชันก่อนหน้า) */
  promote(stagingDir: string, deployedDir: string): void {
    fs.mkdirSync(path.dirname(deployedDir), { recursive: true });
    if (fs.existsSync(deployedDir)) {
      fs.rmSync(deployedDir, { recursive: true, force: true });
    }
    fs.renameSync(stagingDir, deployedDir);
  }

}

function isLikelyBinary(buf: Buffer): boolean {
  const sampleLen = Math.min(buf.length, 8000);
  for (let i = 0; i < sampleLen; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}
