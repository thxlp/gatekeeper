import os

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI()


@app.get("/", response_class=HTMLResponse)
def index():
    return "<h1>สวัสดี! แอป Python ของคุณ deploy สำเร็จแล้ว 🎉</h1><p>แก้ไขไฟล์ main.py เพื่อเริ่มงานของคุณ</p>"


# route สำหรับ healthcheck — ตอบเร็วๆ ไม่ต้องมี logic
@app.get("/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    # สำคัญ: ต้องฟัง PORT จาก environment เสมอ — ระบบ deploy จะตั้งค่าให้ (default 8000)
    # และระบบรันแอปด้วยคำสั่ง `python main.py` จึงต้องมี block นี้
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
