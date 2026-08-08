#!/usr/bin/env node
// กัน build ที่ NEXT_PUBLIC_* ว่าง — next build จะ inline ค่าพวกนี้เข้า client bundle
// ถ้าว่างตอน build แล้วเว็บจะพังทุกหน้า (prerender ล้ม) และ .next เก่าโดนลบไปแล้ว = เว็บล่ม
//
// จงใจให้พังก่อนเรียก next build (ผูกไว้ใน package.json: node scripts/check-build-env.js && next build)
// next จะได้ยังไม่ทันลบ .next ของเดิม ระบบที่รันอยู่จึงไม่ล่มตาม
//
// ต้องรันผ่าน deployments/host/deploy.sh เท่านั้น (สคริปต์นั้น source .env ให้ก่อน build)
const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];

const missing = REQUIRED.filter((k) => !(process.env[k] || '').trim());

if (missing.length > 0) {
  console.error(`
❌ build ไม่ผ่าน — ไม่มีค่า env ที่ต้องใช้ตอน build:
${missing.map((k) => `   - ${k}`).join('\n')}

ห้ามรัน \`pnpm build\` เดี่ยวๆ ให้ deploy ด้วย:
   bash deployments/host/deploy.sh

(สคริปต์นั้น source deployments/host/.env ให้ก่อน build — ค่า NEXT_PUBLIC_* ถูก inline
 เข้า bundle ตอน build ตั้งตอน runtime ไม่มีผล)
`);
  process.exit(1);
}
