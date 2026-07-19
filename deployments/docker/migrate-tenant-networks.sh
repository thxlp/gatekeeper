#!/usr/bin/env bash
# ย้าย container ของแอปที่รันอยู่แล้ว จาก network กลาง (gatekeeper-apps-net) ไป network
# ต่อ tenant (gatekeeper-tenant-<accountId>) — รันครั้งเดียวหลังเปิด NETWORKS=1 บน
# docker-socket-proxy และ restart backend แล้ว (deploy ใหม่หลังจากนั้นไปลง network ต่อ
# tenant เองอัตโนมัติ ไม่ต้องรันสคริปต์นี้ซ้ำ)
#
# ต้องรันด้วย user ที่มีสิทธิ์ docker + มี jq ติดตั้ง:
#   ./migrate-tenant-networks.sh [path/to/data/git-apps-store.json]
#
# ลำดับต่อ container: connect เข้า network ใหม่ก่อน แล้วค่อย disconnect จากวงเดิม
# (ช่วง overlap สั้นๆ ยังให้บริการได้ ไม่ dead ระหว่างย้าย)

set -euo pipefail

STORE="${1:-$(cd "$(dirname "$0")/../.." && pwd)/data/git-apps-store.json}"
OLD_NET="gatekeeper-apps-net"
BACKENDS="backend-1 backend-2"

if ! command -v jq >/dev/null; then
  echo "ต้องติดตั้ง jq ก่อน (apt install jq)" >&2
  exit 1
fi
if [ ! -f "$STORE" ]; then
  echo "ไม่พบไฟล์ store: $STORE" >&2
  exit 1
fi

# sanitize ชื่อ network ให้ตรงกับ tenantNetworkFor() ใน docker-runtime.service.ts
sanitize() { printf '%s' "$1" | sed 's/[^A-Za-z0-9_.-]/-/g'; }

connected() { # connected <network> <container> — เช็คว่า container ต่ออยู่กับ network แล้วหรือยัง
  docker network inspect "$1" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -qw "$2"
}

move() { # move <container> <new_net>
  local c="$1" net="$2"
  if ! docker inspect "$c" >/dev/null 2>&1; then
    echo "  - $c: ไม่มี container (ยังไม่เคย deploy สำเร็จ) ข้าม"
    return
  fi
  if connected "$net" "$c"; then
    echo "  - $c: อยู่บน $net แล้ว"
  else
    docker network connect "$net" "$c"
    echo "  - $c: connect -> $net"
  fi
  if connected "$OLD_NET" "$c"; then
    docker network disconnect "$OLD_NET" "$c"
    echo "  - $c: disconnect <- $OLD_NET"
  fi
}

# jq: ดึงคู่ (accountId, id, addons[]) ของทุก app — accountId/id เป็น plaintext ใน store
# (secret เท่านั้นที่ถูกเข้ารหัส)
jq -r '.[] | [.accountId, .id, ((.addons // []) | join(","))] | @tsv' "$STORE" |
while IFS=$'\t' read -r account_id app_id addons; do
  [ -n "$account_id" ] || { echo "ข้าม $app_id: ไม่มี accountId (app เก่าก่อนยุค account) — คงไว้บน $OLD_NET"; continue; }
  net="gatekeeper-tenant-$(sanitize "$account_id")"
  echo "app $app_id (account $account_id) -> $net"

  if ! docker network inspect "$net" >/dev/null 2>&1; then
    docker network create --driver bridge --label gatekeeper.role=tenant-network "$net" >/dev/null
    echo "  - สร้าง network $net"
  fi

  # backend ทั้งสอง instance ต้องมองเห็น network นี้ (proxy /live + healthcheck) — backend
  # ต่อเองแบบ lazy ได้อยู่แล้ว แต่ต่อให้เลยตรงนี้เพื่อไม่ให้ request แรกหลัง migrate สะดุด
  for b in $BACKENDS; do
    if docker inspect "$b" >/dev/null 2>&1 && ! connected "$net" "$b"; then
      docker network connect "$net" "$b" && echo "  - $b: connect -> $net"
    fi
  done

  move "gatekeeper-app-$app_id" "$net"
  IFS=',' read -ra addon_list <<<"$addons"
  for a in "${addon_list[@]}"; do
    [ -n "$a" ] && move "gatekeeper-app-$app_id-$a" "$net"
  done
done

echo
echo "เสร็จ — ตรวจผลด้วย: docker network ls --filter label=gatekeeper.role=tenant-network"
echo "และดูว่าเหลือใครบน $OLD_NET: docker network inspect $OLD_NET --format '{{range .Containers}}{{.Name}} {{end}}'"
