# ไฟล์ deploy สำหรับเว็บ static ที่มีอยู่แล้ว

## มี 2 ทางเลือก

### ทาง 1: runtime Static (ง่ายสุด — ไม่ต้องใช้ไฟล์ในชุดนี้เลย)

เว็บ static ไม่ต้องมีไฟล์ config พิเศษ แค่:

- มี `index.html` อยู่ที่ root ของโฟลเดอร์ที่อัปโหลด
- ถ้าเป็นแอปที่ต้อง build (React/Vue/Vite) ให้ build ก่อน แล้วอัปโหลดเฉพาะโฟลเดอร์ผลลัพธ์
  (`dist/` หรือ `build/`)
- ถ้าเป็น SPA ให้เปิดตัวเลือก **SPA** ตอน deploy เพื่อให้ client-side routing ไม่ขึ้น 404

### ทาง 2: runtime Docker (อยากคุม nginx เอง)

copy `Dockerfile` (และ `nginx-spa.conf` ถ้าเป็น SPA) ไปวางใน root ของโฟลเดอร์เว็บ
แล้ว deploy ด้วย runtime **Docker**
