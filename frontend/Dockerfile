FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG GATEKEEPER_V1_URL=http://gatekeeper-v1:8088
ARG GATEKEEPER_V2_URL=http://gatekeeper-v2:8089
ENV GATEKEEPER_V1_URL=$GATEKEEPER_V1_URL
ENV GATEKEEPER_V2_URL=$GATEKEEPER_V2_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN addgroup -S gatekeeper && adduser -S gatekeeper -G gatekeeper
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
RUN chown -R gatekeeper:gatekeeper /app
USER gatekeeper
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
