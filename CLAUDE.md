# กฎสำหรับ gatekeeper project
- ห้ามรันคำสั่ง docker โดยตรง (claudebot ไม่มีสิทธิ์) ให้ขอให้ user รันแทนเสมอ
- แก้ nginx config ต้อง nginx -t ผ่านก่อนทุกครั้ง ก่อนแนะนำให้ reload
- backend เป็น NestJS + Express, ใช้ AuthGuard เดิมอยู่แล้วที่ src/auth/
- ทำงานบน branch แยกเสมอ ไม่ commit ตรงเข้า main โดยไม่ถามก่อน
- ตัว gatekeeper (backend ×2 :8089/:8090, frontend :3000, nginx) รันบน host ผ่าน systemd
  ไม่ได้อยู่ใน docker แล้ว — deploy ด้วย deployments/host/deploy.sh (ดู deployments/host/README.md)
  ใน docker เหลือแค่ postgres + docker-socket-proxy (127.0.0.1) กับ tenant apps ของลูกค้า
- ทุก service บน host ต้อง bind 127.0.0.1 เท่านั้น (ยกเว้น nginx) — กัน tenant container
  ยิงเข้า host ผ่าน bridge gateway IP
- build ได้ทางเดียวคือ `bash deployments/host/deploy.sh` และต้องรันโดย user dup (ห้าม sudo, ห้าม claudebot)
  ห้ามสั่ง `pnpm build` เดี่ยวๆ — NEXT_PUBLIC_* หายตอน build แล้ว prerender พังทุกหน้า เว็บล่ม
- ตรวจสุขภาพระบบ: `bash deployments/host/healthcheck.sh` (ไม่ต้อง sudo/docker — unit, healthz,
  เส้นทางผ่าน nginx, disk/RAM, วันหมดอายุ cert) ดูวิธีดูแลช่วงปล่อยรันยาวที่ deployments/host/OPS-PRESENTATION.md
- claudebot อ่าน journalctl ไม่ได้ (ไม่อยู่ใน group adm) — verify หลัง deploy ให้ยิง HTTP probe ผ่าน nginx
  (challenge cookie → /api/healthz) แทนการอ่าน log
