# ไฟล์ deploy (Docker) สำหรับโปรเจคที่มีอยู่แล้ว

สำหรับโปรเจคภาษา/เฟรมเวิร์กใดก็ได้ที่อยากคุมการ build เองด้วย Dockerfile

## วิธีใช้

1. copy `Dockerfile` และ `.dockerignore` ไปวางใน root ของโปรเจคคุณ
2. แก้ `Dockerfile` ตามโปรเจค: base image, คำสั่งติดตั้ง dependency, คำสั่ง start
3. ทดสอบ build บนเครื่องก่อนถ้ามี docker: `docker build -t test . && docker run -p 8080:8080 test`
4. อัปโหลดโปรเจคที่หน้า **Deploy** เลือก runtime **Docker**

## เงื่อนไขที่ต้องรักษาไว้

- ไฟล์ต้องชื่อ `Dockerfile` และอยู่ root ของโฟลเดอร์ที่อัปโหลด
- ใส่ `EXPOSE <port>` ให้ตรงกับ port ที่แอปฟังจริง
- แอปต้อง bind ที่ `0.0.0.0` ไม่ใช่ `localhost`
- ควรมี route ที่ตอบ HTTP 200 เร็วๆ (เช่น `/health`) เพื่อให้ healthcheck ผ่านไว
