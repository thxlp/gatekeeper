# Dockerfile ตัวอย่างสำหรับแอป Node.js — ใช้กับ runtime "Docker" (คุม build เองทั้งหมด)
# หมายเหตุ: ถ้าใช้ runtime "Node.js" ไม่ต้องมีไฟล์นี้เลย ระบบ generate ให้อัตโนมัติ
FROM node:20-alpine
WORKDIR /app

# copy เฉพาะไฟล์ dependency ก่อน เพื่อให้ Docker cache layer ตอน npm install
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY . .

# แอปต้องฟัง PORT นี้ และ bind ที่ 0.0.0.0
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
