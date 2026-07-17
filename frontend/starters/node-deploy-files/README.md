# ไฟล์ deploy สำหรับโปรเจค Node.js ที่มีอยู่แล้ว

ชุดไฟล์นี้เอาไปวางใน root ของโปรเจค Node.js ที่คุณมีอยู่ เพื่อให้ deploy บนระบบนี้ได้

## มี 2 ทางเลือก

### ทาง 1: runtime Node.js (ง่ายสุด — ไม่ต้องใช้ Dockerfile)

ไม่ต้อง copy ไฟล์อะไรเลย แค่เช็คว่าโปรเจคคุณเข้าเงื่อนไข:

- มี `scripts.start` ใน `package.json` (หรือมีไฟล์ `server.js` / `index.js` / `app.js`)
- แอปฟัง port จาก `process.env.PORT` (ระบบตั้งเป็น 8080) และ bind ที่ `0.0.0.0`
- ถ้ามี `scripts.build` ระบบจะรัน build ให้ก่อน start อัตโนมัติ

แล้วอัปโหลดโปรเจค (ไม่รวม `node_modules`) ที่หน้า Deploy เลือก runtime **Node.js**

### ทาง 2: runtime Docker (คุม build เอง)

copy `Dockerfile` และ `.dockerignore` จากชุดนี้ไปวางใน root ของโปรเจค
แก้คำสั่ง build/start ใน Dockerfile ตามโปรเจคของคุณ แล้ว deploy ด้วย runtime **Docker**
