#!/usr/bin/env node
// สร้าง zip จาก frontend/starters/<name>/ ลง frontend/public/starters/<name>.zip
// รัน: node frontend/scripts/build-starters.js (จาก root repo หรือที่ไหนก็ได้)
//
// ใช้ adm-zip จาก backend/node_modules เพราะ frontend ไม่มี dependency นี้
// (zip เป็นไฟล์ commit ลง repo — สคริปต์นี้ใช้ตอนแก้ template แล้ว regenerate เท่านั้น)
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const repoRoot = path.resolve(__dirname, '..', '..');
const backendRequire = createRequire(path.join(repoRoot, 'backend', 'package.json'));
const AdmZip = backendRequire('adm-zip');

const srcRoot = path.join(repoRoot, 'frontend', 'starters');
const outRoot = path.join(repoRoot, 'frontend', 'public', 'starters');

fs.mkdirSync(outRoot, { recursive: true });

const dirs = fs
  .readdirSync(srcRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const name of dirs) {
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(srcRoot, name));
  const outPath = path.join(outRoot, `${name}.zip`);
  zip.writeZip(outPath);
  console.log(`✓ ${outPath} (${fs.statSync(outPath).size} bytes)`);
}

console.log(`สร้าง zip ${dirs.length} ไฟล์เสร็จแล้ว`);
