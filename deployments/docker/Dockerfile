# --- หมายเหตุ: เขียนตามมาตรฐาน Node alpine image ทั่วไป
#     แต่ sandbox ที่ใช้พัฒนาไฟล์นี้ไม่มี Docker/network ให้ build จริง
#     แนะนำให้ build+ทดสอบในเครื่อง/VPS ของคุณเองก่อนใช้งานจริง

FROM node:20-alpine

# รันด้วย non-root user เสมอ (ตามแนวคิด least privilege ที่ออกแบบไว้)
RUN addgroup -S gatekeeper && adduser -S gatekeeper -G gatekeeper

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY configs ./configs

RUN mkdir -p /app/data && chown -R gatekeeper:gatekeeper /app

USER gatekeeper

ENV PORT=8088
EXPOSE 8088

# Healthcheck ยิงเข้า /healthz ของตัวเอง
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8088/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
