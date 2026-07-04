# ต้อง Node 22+ เพราะ @supabase/supabase-js createClient() init RealtimeClient ทันทีเสมอ
# (แม้ไม่ได้ใช้ realtime feature เลย) ซึ่งต้องการ native WebSocket global — Node 20 ไม่มี ทำให้
# crash ตอน boot ("Node.js detected but native WebSocket not found")
FROM node:22-alpine AS builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:22-alpine
# git ต้องมีใน runtime image จริง (ไม่ใช่แค่ build stage) เพราะ GitAutomatorService
# เรียก `git clone` ผ่าน execFile ตอน container รันอยู่ (webhook auto-deploy)
RUN apk add --no-cache git openssh-client ca-certificates
RUN addgroup -S gatekeeper && adduser -S gatekeeper -G gatekeeper
WORKDIR /app/backend
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY configs /app/configs
RUN mkdir -p /app/data && chown -R gatekeeper:gatekeeper /app
USER gatekeeper
ENV GATEKEEPER_ROOT=/app
ENV PORT=8089
ENV AUDIT_LOG_PATH=/app/data/audit.log
EXPOSE 8089
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8089/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "dist/main"]
