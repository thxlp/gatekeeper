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
