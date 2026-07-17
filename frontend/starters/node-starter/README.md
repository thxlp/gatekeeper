# Node.js Starter

โปรเจคตัวอย่าง Node.js (Express) ที่ deploy บนระบบนี้ได้ทันที

## วิธี deploy

1. แก้โค้ดใน `server.js` ตามต้องการ (หรือ deploy ตามนี้เลยเพื่อทดสอบ)
2. ไปที่หน้า **Deploy** ในแดชบอร์ด
3. ลากทั้งโฟลเดอร์นี้มาวาง (หรือ zip โฟลเดอร์แล้วลากไฟล์ .zip มาวาง)
   - **ไม่ต้อง**รวม `node_modules` — ระบบติดตั้ง dependency ให้เองตอน build
4. เลือก runtime **Node.js** แล้วกด Deploy

## เงื่อนไขที่ต้องรักษาไว้

- ต้องมี `scripts.start` ใน `package.json` (หรือมีไฟล์ `server.js` / `index.js`)
- แอปต้องฟัง port จาก `process.env.PORT` (ระบบตั้งให้เป็น 8080) — ห้าม hardcode port
- bind ที่ `0.0.0.0` ไม่ใช่ `localhost`
- ถ้ามี `scripts.build` (เช่น TypeScript, Next.js) ระบบจะรัน build ให้อัตโนมัติก่อน start

## ทดสอบบนเครื่องตัวเอง

```bash
npm install
npm start
# เปิด http://localhost:8080
```
