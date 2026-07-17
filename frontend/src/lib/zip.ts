import { zipSync } from 'fflate';

// เดินไฟล์ทั้งหมดใน FileList (จาก webkitdirectory) ให้เป็น map path -> Uint8Array สำหรับป้อนเข้า fflate
export async function filesToZipEntries(fileList: FileList): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {};
  await Promise.all(
    Array.from(fileList).map(async (f) => {
      // webkitRelativePath เช่น "my-app/src/index.js" — ตัดชื่อ folder บนสุดออก ให้ zip root ตรงกับ project root
      const rel = (f as any).webkitRelativePath || f.name;
      const parts = rel.split('/');
      const path = parts.length > 1 ? parts.slice(1).join('/') : rel;
      if (!path) return;
      const buf = new Uint8Array(await f.arrayBuffer());
      entries[path] = buf;
    }),
  );
  return entries;
}

// zipSync แทน zip (async) — ตัวหลังบีบอัดใน Web Worker ซึ่งเป็นตัวแปรที่คุมไม่ได้
// (โดน extension/นโยบาย browser รบกวนได้ และเคยได้ archive เพี้ยนส่งขึ้น backend เป็น
// invalid_zip_file) โฟลเดอร์ที่อัปโหลดกันจริงเล็กพอที่ sync จะไม่ทำ UI ค้างรู้สึกได้
// คง signature Promise ไว้ให้ caller เดิมไม่ต้องแก้
export function zipEntriesToBlob(entries: Record<string, Uint8Array>): Promise<Blob> {
  try {
    const data = zipSync(entries, { level: 6 });
    return Promise.resolve(new Blob([data], { type: 'application/zip' }));
  } catch (err) {
    return Promise.reject(err);
  }
}

// เช็คว่า Blob เป็น zip จริงก่อนอัปโหลด (ขึ้นต้น "PK") — จับไฟล์เพี้ยนตั้งแต่ฝั่ง client
// จะได้ error ที่อ่านรู้เรื่องแทนที่จะไปตายที่ pipeline ฝั่ง server
export async function isZipBlob(blob: Blob): Promise<boolean> {
  if (blob.size < 22) return false; // เล็กกว่า EOCD เปล่า = ไม่ใช่ zip แน่นอน
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b;
}

// ── drag-drop support ────────────────────────────────────────────────────────
// ลากโฟลเดอร์เข้ามาต้องเดินผ่าน webkitGetAsEntry() — dataTransfer.files ให้แค่ไฟล์ ไม่ให้เนื้อในโฟลเดอร์
// (รองรับใน Chromium/Firefox/Safari) ถ้าเบราว์เซอร์ไม่มี entry API ค่อย fallback ไป dataTransfer.files

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (cb: (e: FsEntry[]) => void, err?: (e: unknown) => void) => void };
};

// readEntries คืนทีละ batch (สูงสุด ~100 รายการ) — ต้องเรียกซ้ำจนได้ batch ว่างถึงจะครบทั้งโฟลเดอร์
function readAllDirEntries(reader: { readEntries: (cb: (e: FsEntry[]) => void, err?: (e: unknown) => void) => void }): Promise<FsEntry[]> {
  return new Promise((resolve, reject) => {
    const acc: FsEntry[] = [];
    const pump = () =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(acc);
        acc.push(...batch);
        pump();
      }, reject);
    pump();
  });
}

async function walkEntry(entry: FsEntry, prefix: string, out: Record<string, Uint8Array>): Promise<void> {
  if (entry.isFile && entry.file) {
    const file: File = await new Promise((res, rej) => entry.file!(res, rej));
    out[prefix + entry.name] = new Uint8Array(await file.arrayBuffer());
  } else if (entry.isDirectory && entry.createReader) {
    const children = await readAllDirEntries(entry.createReader());
    for (const child of children) await walkEntry(child, prefix + entry.name + '/', out);
  }
}

/**
 * แปลงของที่ลากมาวาง (DataTransfer) เป็น archive:
 *   - ลาก .zip ไฟล์เดียว → คืน zipFile ตรงๆ (ไม่ต้อง re-zip)
 *   - ลากโฟลเดอร์เดียว → zip เนื้อในโฟลเดอร์ (strip ชื่อโฟลเดอร์บนสุด ให้ zip root = project root)
 *   - ลากหลายไฟล์/หลายอย่าง → zip ตามชื่อเดิม
 */
export async function readDropped(dt: DataTransfer): Promise<{ zipFile: File | null; entries: Record<string, Uint8Array> }> {
  const roots = Array.from(dt.items || [])
    .map((it) => (it.webkitGetAsEntry ? (it.webkitGetAsEntry() as FsEntry | null) : null))
    .filter((e): e is FsEntry => !!e);

  // เบราว์เซอร์ไม่มี entry API — ใช้ได้แค่ไฟล์ (โฟลเดอร์ลากไม่ได้)
  if (roots.length === 0) {
    const files = Array.from(dt.files || []);
    if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) return { zipFile: files[0], entries: {} };
    const out: Record<string, Uint8Array> = {};
    for (const f of files) out[f.name] = new Uint8Array(await f.arrayBuffer());
    return { zipFile: null, entries: out };
  }

  if (roots.length === 1 && roots[0].isFile && roots[0].name.toLowerCase().endsWith('.zip')) {
    const zipFile: File = await new Promise((res, rej) => roots[0].file!(res, rej));
    return { zipFile, entries: {} };
  }

  const out: Record<string, Uint8Array> = {};
  if (roots.length === 1 && roots[0].isDirectory && roots[0].createReader) {
    // โฟลเดอร์เดียว → เดินเนื้อในโดยไม่เอาชื่อโฟลเดอร์บนสุดมาเป็น prefix
    const children = await readAllDirEntries(roots[0].createReader());
    for (const child of children) await walkEntry(child, '', out);
  } else {
    for (const r of roots) await walkEntry(r, '', out);
  }
  return { zipFile: null, entries: out };
}
