import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../common/paths';

export interface UsageEvent {
  requestId?: string;
  accountId?: string;
  plan?: string;
  feature?: string;
  runtime?: string;
  allowed?: boolean;
  stage?: string;
  [key: string]: unknown;
}

/**
 * บันทึกทุกครั้งที่มีการ "เรียกใช้สิทธิ์" feature/plugin ไม่ว่าผลจะ allow หรือ block
 * ของจริงควรยิงเข้า Kafka/NATS แล้วลง TimescaleDB/ClickHouse แบบ async
 * ที่นี่ใช้ append JSON line ลงไฟล์เพื่อให้รันได้จริงแบบไม่มี dependency ภายนอก
 */
@Injectable()
export class UsageCollectorService {
  private usageFile = path.join(DATA_DIR, 'usage.jsonl');

  recordUsage(event: UsageEvent): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
    fs.appendFileSync(this.usageFile, line);
  }
}
