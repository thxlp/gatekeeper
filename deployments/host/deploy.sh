#!/usr/bin/env bash
# Build + restart gatekeeper บน host — ใช้แทน `docker compose up -d --build` เดิม
# รันจาก user dup: bash deployments/host/deploy.sh   (ขอ sudo ตอน restart service)
# restart backend ทีละ instance (รอ healthz ก่อนไปตัวถัดไป) — nginx pool มีอีกตัวรับ traffic
# ระหว่างนั้น จึงไม่มี downtime ฝั่ง API; frontend มีตัวเดียว restart แล้ววูบสั้นๆ เหมือน docker เดิม
set -euo pipefail

# ต้องรันเป็น user dup ไม่ใช่ sudo — ไม่งั้นไฟล์ build เป็นของ root แล้วรอบถัดไปติด EACCES
[ "$(id -u)" = "0" ] && { echo "อย่ารันด้วย sudo — รัน: bash deployments/host/deploy.sh (สคริปต์ขอ sudo เองตอน restart)"; exit 1; }
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0   # ให้ corepack โหลด pnpm ครั้งแรกโดยไม่ถาม

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/deployments/host/.env"
[ -f "$ENV_FILE" ] || { echo "ยังไม่มี $ENV_FILE — copy จาก .env.example แล้วเติมค่าก่อน"; exit 1; }
# pnpm ผ่าน corepack — เวอร์ชันปักไว้ใน package.json (field packageManager)
command -v pnpm >/dev/null 2>&1 || { echo "ยังไม่มี pnpm — รันครั้งเดียว: sudo corepack enable แล้วลองใหม่"; exit 1; }

echo "== build backend =="
cd "$ROOT/backend"
pnpm install --frozen-lockfile
pnpm run build

echo "== build frontend =="
cd "$ROOT/frontend"
pnpm install --frozen-lockfile
# NEXT_PUBLIC_* ต้องอยู่ใน env ตอน build — next build inline ค่าเข้า client bundle เลย
# (ตั้งตอน runtime ไม่มีผล) เลย source ทั้งไฟล์เอา key พวกนั้นมา
set -a; source "$ENV_FILE"; set +a
pnpm run build
# standalone ไม่ copy static/public ให้เอง (ตาม design ของ Next — ดู frontend/Dockerfile เดิม)
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

wait_healthz() {
  local port="$1"
  for _ in $(seq 1 30); do
    curl -sf -o /dev/null "http://127.0.0.1:$port/healthz" && return 0
    sleep 1
  done
  echo "backend :$port ไม่ตอบ /healthz ใน 30 วิ — เช็ค journalctl -u gatekeeper-backend@$port" >&2
  return 1
}

echo "== rolling restart backend =="
sudo systemctl restart gatekeeper-backend@8089
wait_healthz 8089
sudo systemctl restart gatekeeper-backend@8090
wait_healthz 8090

echo "== restart frontend =="
sudo systemctl restart gatekeeper-frontend
for _ in $(seq 1 30); do
  curl -s -o /dev/null "http://127.0.0.1:3000" && break
  sleep 1
done

echo "== deploy เสร็จ =="
