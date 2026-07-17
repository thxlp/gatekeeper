# ไฟล์ deploy สำหรับโปรเจค Python ที่มีอยู่แล้ว

ชุดไฟล์นี้เอาไปวางใน root ของโปรเจค Python ที่คุณมีอยู่ เพื่อให้ deploy บนระบบนี้ได้

## มี 2 ทางเลือก

### ทาง 1: runtime Python (ง่ายสุด — ไม่ต้องใช้ Dockerfile)

ไม่ต้อง copy ไฟล์อะไรเลย แค่เช็คว่าโปรเจคคุณเข้าเงื่อนไข:

- มีไฟล์ entry ชื่อ `main.py` / `app.py` / `run.py` (ระบบรันด้วย `python <ไฟล์นั้น>`)
- dependency ทั้งหมดอยู่ใน `requirements.txt`
- แอปฟัง port จาก environment variable `PORT` (ระบบตั้งเป็น 8000) และ bind ที่ `0.0.0.0`
- ถ้าใช้ FastAPI ให้เรียก `uvicorn.run(...)` ใน block `if __name__ == "__main__":`

แล้วอัปโหลดโปรเจคที่หน้า Deploy เลือก runtime **Python**

### ทาง 2: runtime Docker (คุม build เอง)

copy `Dockerfile` และ `.dockerignore` จากชุดนี้ไปวางใน root ของโปรเจค
แก้คำสั่งติดตั้ง/รันใน Dockerfile ตามโปรเจคของคุณ (เช่น gunicorn, Django)
แล้ว deploy ด้วย runtime **Docker**
