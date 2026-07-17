# Python Starter

โปรเจคตัวอย่าง Python (FastAPI) ที่ deploy บนระบบนี้ได้ทันที

## วิธี deploy

1. แก้โค้ดใน `main.py` ตามต้องการ (หรือ deploy ตามนี้เลยเพื่อทดสอบ)
2. ไปที่หน้า **Deploy** ในแดชบอร์ด
3. ลากทั้งโฟลเดอร์นี้มาวาง (หรือ zip โฟลเดอร์แล้วลากไฟล์ .zip มาวาง)
4. เลือก runtime **Python** แล้วกด Deploy

## เงื่อนไขที่ต้องรักษาไว้

- ต้องมีไฟล์ entry ชื่อ `main.py` / `app.py` / `run.py` (ระบบรันด้วย `python main.py`)
- dependency ทั้งหมดอยู่ใน `requirements.txt` — ระบบ `pip install` ให้เองตอน build
- แอปต้องฟัง port จาก environment variable `PORT` (ระบบตั้งให้เป็น 8000) — ห้าม hardcode
- bind ที่ `0.0.0.0` ไม่ใช่ `localhost`

## ทดสอบบนเครื่องตัวเอง

```bash
pip install -r requirements.txt
python main.py
# เปิด http://localhost:8000
```
