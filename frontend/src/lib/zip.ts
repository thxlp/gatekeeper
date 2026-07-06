import { zip } from 'fflate';

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

export function zipEntriesToBlob(entries: Record<string, Uint8Array>): Promise<Blob> {
  return new Promise((resolve, reject) => {
    zip(entries, { level: 6 }, (err, data) => {
      if (err) return reject(err);
      resolve(new Blob([data], { type: 'application/zip' }));
    });
  });
}
