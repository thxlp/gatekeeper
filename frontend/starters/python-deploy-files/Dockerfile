# Dockerfile ตัวอย่างสำหรับแอป Python — ใช้กับ runtime "Docker" (คุม build เองทั้งหมด)
# หมายเหตุ: ถ้าใช้ runtime "Python" ไม่ต้องมีไฟล์นี้เลย ระบบ generate ให้อัตโนมัติ
FROM python:3.12-slim
WORKDIR /app

# copy เฉพาะ requirements ก่อน เพื่อให้ Docker cache layer ตอน pip install
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# แอปต้องฟัง PORT นี้ และ bind ที่ 0.0.0.0
ENV PORT=8000
EXPOSE 8000

CMD ["python", "main.py"]
