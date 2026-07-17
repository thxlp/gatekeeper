import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { DATA_DIR } from '../common/paths';

const MAX_TOTAL_UNCOMPRESSED_BYTES = 200 * 1024 * 1024; // 200MB
const MAX_ENTRY_COUNT = 5000;
const MAX_DEBUG_DUMP_BYTES = 10 * 1024 * 1024; // ไม่ dump ไฟล์ใหญ่เกิน 10MB — เปลือง disk เปล่า

export class ZipExtractionError extends Error {}

// เก็บ byte ดิบที่ parse ไม่ผ่านไว้ให้ forensic ทีหลัง (อาการ upload เพี้ยนที่ reproduce ไม่ได้
// ต้องเห็น byte จริงถึงจะวินิจฉัยได้) + คืน hex หัว/ท้ายไว้แปะใน error message
// ล้มเหลวเงียบๆ ได้ — ห้าม error ของการ dump ไปกลบ error จริง
function dumpForDebug(buf: Buffer): string {
  const head = buf.subarray(0, 8).toString('hex');
  const tail = buf.subarray(Math.max(0, buf.length - 24)).toString('hex');
  let dumpNote = '';
  if (buf.length <= MAX_DEBUG_DUMP_BYTES) {
    try {
      const dir = path.join(DATA_DIR, 'upload-debug');
      fs.mkdirSync(dir, { recursive: true });
      const name = `${Date.now()}-${buf.length}b.bin`;
      fs.writeFileSync(path.join(dir, name), buf);
      dumpNote = ` dump=upload-debug/${name}`;
    } catch {
      /* dump ไม่ได้ก็ไม่เป็นไร */
    }
  }
  return `head=0x${head} tail=0x${tail}${dumpNote}`;
}

// ไฟล์ขยะจาก OS ที่ไม่มีผลต่อการ build — ข้ามทิ้งแทนที่จะปล่อยไปโผล่ใน staging
// (__MACOSX/ มากับ Finder ทุกครั้ง, .DS_Store/Thumbs.db มากับการ zip โฟลเดอร์บน mac/Windows)
function isJunkEntry(name: string): boolean {
  if (name.startsWith('__MACOSX/')) return true;
  const base = name.split('/').pop() || '';
  return base === '.DS_Store' || base === 'Thumbs.db';
}

/**
 * แตก zip ไปที่ destDir แบบปลอดภัย — กัน zip-slip ด้วยการ resolve absolute path ของทุก entry
 * แล้วเช็คว่าต้องอยู่ใต้ destDir จริงๆ เท่านั้น (path.resolve collapse "../" ตามจริง ต่างจาก
 * regex-strip ที่ v0.1 ใช้ใน src/server.js ซึ่งเช็คได้แค่บางเคส) และไม่เรียก extraction API ของ
 * library ตรงๆ (getData()+writeFileSync เอง) เพื่อไม่ให้ entry ที่เป็น symlink ถูกสร้างเป็น
 * symlink จริงบน disk (จะกลายเป็นแค่ regular file ที่มีเนื้อหาเป็น target path เฉยๆ ไม่ escape ได้)
 * กัน zip-bomb เบื้องต้นด้วย cap ทั้งจำนวน entry และขนาดรวมหลังแตกไฟล์ (เช็คทั้ง declared size ก่อน
 * decompress เพื่อ bail เร็ว และขนาดจริงหลัง decompress เป็น defense-in-depth ชั้นที่สอง)
 *
 * ความยืดหยุ่นเพิ่มเติม (ไม่ลดความเข้มของ security checks ข้างบน):
 *   - error แยกชัด "ไม่ใช่ zip" (บอก magic bytes + ขนาดที่ได้รับ) vs "zip ไม่สมบูรณ์/โดนตัด"
 *     เพื่อให้ log วินิจฉัยได้เลยว่า upload เพี้ยนที่ไหน
 *   - ถ้าทุกไฟล์อยู่ใต้โฟลเดอร์บนสุดเดียวกัน (zip ทั้งโฟลเดอร์แทน zip เนื้อใน — พฤติกรรม
 *     default ของ Windows/macOS) strip ชั้นนั้นออกให้ project root อยู่ที่ staging root จริง
 *   - ข้ามไฟล์ขยะ OS (__MACOSX/.DS_Store/Thumbs.db) ก่อนคิดทุกอย่าง
 */
export function extractZipSafely(zipBuffer: Buffer, destDir: string): void {
  // วินิจฉัยก่อน parse: zip ที่ถูกต้องต้องขึ้นต้น "PK" และยาวอย่างน้อย 22 byte (EOCD เปล่า)
  if (zipBuffer.length < 22 || !(zipBuffer[0] === 0x50 && zipBuffer[1] === 0x4b)) {
    throw new ZipExtractionError(
      `not_a_zip_file — ได้รับ ${zipBuffer.length} bytes ไม่ใช่ไฟล์ .zip (${dumpForDebug(zipBuffer)})`,
    );
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    // ขึ้นต้น PK แต่ parse ไม่ได้ = โครงสร้างเสีย (โดนตัดท้าย/byte เพี้ยนระหว่างทาง)
    throw new ZipExtractionError(
      `invalid_zip_file — ไฟล์ zip ไม่สมบูรณ์ ได้รับ ${zipBuffer.length} bytes (${dumpForDebug(zipBuffer)}) ลองอัปโหลดใหม่`,
    );
  }

  const entries = zip.getEntries().filter((e) => !e.isDirectory && !isJunkEntry(e.entryName));
  if (entries.length === 0) throw new ZipExtractionError('empty_zip_file');
  if (entries.length > MAX_ENTRY_COUNT) {
    throw new ZipExtractionError(`too_many_files_in_zip:${entries.length}`);
  }

  // zip ที่ครอบด้วยโฟลเดอร์บนสุดชั้นเดียว (my-app/package.json, my-app/src/...) — strip
  // ชั้นนั้นออกเพื่อให้ package.json/Dockerfile อยู่ root ตามที่ build stage คาดหวัง
  // strip เฉพาะเมื่อ "ทุกไฟล์" อยู่ใต้โฟลเดอร์เดียวกันเท่านั้น ไม่งั้นคงโครงสร้างเดิมไว้
  const firstSegment = entries[0].entryName.split('/')[0];
  const stripPrefix =
    firstSegment && entries.every((e) => e.entryName.startsWith(firstSegment + '/'))
      ? firstSegment + '/'
      : '';

  const destRoot = path.resolve(destDir);
  let totalBytes = 0;

  for (const entry of entries) {
    if (entry.header.size > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new ZipExtractionError(`zip_entry_too_large:${entry.entryName}`);
    }

    const relName = stripPrefix ? entry.entryName.slice(stripPrefix.length) : entry.entryName;
    if (!relName) continue;

    const targetPath = path.resolve(destRoot, relName);
    if (targetPath !== destRoot && !targetPath.startsWith(destRoot + path.sep)) {
      throw new ZipExtractionError(`zip_slip_detected:${entry.entryName}`);
    }

    const data = entry.getData();
    totalBytes += data.length;
    if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new ZipExtractionError('zip_uncompressed_size_exceeds_limit');
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, data);
  }
}
