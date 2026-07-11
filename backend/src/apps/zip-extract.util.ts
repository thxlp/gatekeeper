import * as fs from 'fs';
import * as path from 'path';
// ต้องใช้ `import = require` เพราะ adm-zip เป็น CJS ที่ `export =` constructor ตรงๆ และ
// tsconfig ไม่ได้เปิด esModuleInterop — `import AdmZip from 'adm-zip'` จะ compile เป็น
// `adm_zip_1.default` ซึ่ง undefined ตอน runtime → `new undefined()` throw → invalid_zip_file
// (ทำให้ manual zip deploy พังทุกไฟล์ที่ stage 2)
import AdmZip = require('adm-zip');

const MAX_TOTAL_UNCOMPRESSED_BYTES = 200 * 1024 * 1024; // 200MB
const MAX_ENTRY_COUNT = 5000;

export class ZipExtractionError extends Error {}

/**
 * แตก zip ไปที่ destDir แบบปลอดภัย — กัน zip-slip ด้วยการ resolve absolute path ของทุก entry
 * แล้วเช็คว่าต้องอยู่ใต้ destDir จริงๆ เท่านั้น (path.resolve collapse "../" ตามจริง ต่างจาก
 * regex-strip ที่ v0.1 ใช้ใน src/server.js ซึ่งเช็คได้แค่บางเคส) และไม่เรียก extraction API ของ
 * library ตรงๆ (getData()+writeFileSync เอง) เพื่อไม่ให้ entry ที่เป็น symlink ถูกสร้างเป็น
 * symlink จริงบน disk (จะกลายเป็นแค่ regular file ที่มีเนื้อหาเป็น target path เฉยๆ ไม่ escape ได้)
 * กัน zip-bomb เบื้องต้นด้วย cap ทั้งจำนวน entry และขนาดรวมหลังแตกไฟล์ (เช็คทั้ง declared size ก่อน
 * decompress เพื่อ bail เร็ว และขนาดจริงหลัง decompress เป็น defense-in-depth ชั้นที่สอง)
 */
export function extractZipSafely(zipBuffer: Buffer, destDir: string): void {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw new ZipExtractionError('invalid_zip_file');
  }

  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  if (entries.length === 0) throw new ZipExtractionError('empty_zip_file');
  if (entries.length > MAX_ENTRY_COUNT) {
    throw new ZipExtractionError(`too_many_files_in_zip:${entries.length}`);
  }

  const destRoot = path.resolve(destDir);
  let totalBytes = 0;

  for (const entry of entries) {
    if (entry.header.size > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new ZipExtractionError(`zip_entry_too_large:${entry.entryName}`);
    }

    const targetPath = path.resolve(destRoot, entry.entryName);
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
