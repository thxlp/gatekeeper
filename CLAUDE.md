# กฎสำหรับ gatekeeper project
- ห้ามรันคำสั่ง docker โดยตรง (claudebot ไม่มีสิทธิ์) ให้ขอให้ user รันแทนเสมอ
- แก้ nginx config ต้อง nginx -t ผ่านก่อนทุกครั้ง ก่อนแนะนำให้ reload
- backend เป็น NestJS + Express, ใช้ AuthGuard เดิมอยู่แล้วที่ src/auth/
- ทำงานบน branch แยกเสมอ ไม่ commit ตรงเข้า main โดยไม่ถามก่อน
