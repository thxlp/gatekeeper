#!/usr/bin/env bash
# ตัวอย่าง git pre-receive hook ที่ส่ง artifact ไปให้ Gatekeeper ตรวจก่อนรับ push จริง
# วางที่ .git/hooks/pre-receive บนฝั่ง git server แล้ว chmod +x
set -euo pipefail

GATEKEEPER_URL="${GATEKEEPER_URL:-http://localhost:8088/deploy}"
API_KEY="${GATEKEEPER_API_KEY:?ต้องตั้งค่า GATEKEEPER_API_KEY}"

while read -r oldrev newrev refname; do
  echo "[pre-receive] ส่งตรวจกับ Gatekeeper: $refname ($oldrev -> $newrev)"

  # หมายเหตุ: ตัวอย่างนี้แสดงแค่จุดเรียก ในงานจริงต้อง:
  # 1) git archive $newrev เพื่อ export ไฟล์ที่จะ deploy
  # 2) แปลงแต่ละไฟล์เป็น base64 ใส่ใน payload ตาม schema
  #    { runtime, feature, files: [{path, content_base64}] }
  # 3) curl -sf -X POST "$GATEKEEPER_URL" -H "Authorization: Bearer $API_KEY" \
  #        -H "Content-Type: application/json" -d @payload.json
  # 4) เช็ค exit code / decision field — ถ้าไม่ใช่ ALLOW ให้ exit 1 เพื่อปฏิเสธ push

done

echo "[pre-receive] ผ่านการตรวจจาก Gatekeeper แล้ว อนุญาตให้ push เข้า repo"
exit 0
