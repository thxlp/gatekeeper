# ตัวอย่าง Dockerfile ที่ deploy บนระบบนี้ได้ทันที (runtime: Docker)
FROM node:20-alpine
WORKDIR /app

COPY server.js .

# สำคัญ: ใส่ EXPOSE เพื่อให้ระบบรู้ว่าแอปฟัง port ไหน (ไม่งั้นต้องกรอก port เองตอน deploy)
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
