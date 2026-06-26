FROM node:20-alpine AS builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:20-alpine
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
