#!/usr/bin/env bash
# จำกัด egress ของ network ช่วง build (gatekeeper-build-net) — RUN ใน Dockerfile ของลูกค้า
# (โดยเฉพาะ runtime 'docker' ที่คุม FROM/RUN เองทั้งหมด) ต้องติดตั้ง dependency จาก registry
# สาธารณะได้ (npm/pip/apt) แต่ต้องแตะ internal ของเราไม่ได้: docker-socket-proxy/backend/postgres,
# cloud metadata (169.254.169.254) และ host/LAN
#
# กลไก: เพิ่มกฎ DROP ใน DOCKER-USER chain ซึ่ง Docker เรียกก่อน forward ทุก packet และ "ไม่"
# flush กฎที่เราใส่เองตอน daemon restart สำหรับ source = build subnet ปลายทาง private/metadata
# packet ที่ไปปลายทาง public ไม่ match กฎเหล่านี้ → ตกไป forward ปกติ (ออกเน็ตสาธารณะได้)
# DNS ของ build container ใช้ embedded resolver 127.0.0.11 (loopback ใน netns เอง) ไม่โดนกฎนี้
#
# idempotent: ใช้ -C เช็คก่อน insert ทุกกฎ รันซ้ำได้ไม่ซ้อน — รันผ่าน systemd oneshot ตอน boot
# (gatekeeper-build-egress.service) เพราะ iptables ไม่รอดข้าม host reboot
set -euo pipefail

BUILD_SUBNET="${GATEKEEPER_BUILD_SUBNET:-172.31.238.0/24}"

# ปลายทางที่ห้าม build แตะ — private (RFC1918) + cloud metadata/link-local + CGNAT
# 172.16.0.0/12 ครอบ subnet ของ docker network ภายในทั้งหมด (proxy/backend/postgres มักได้ IP
# ในช่วงนี้) และครอบ build subnet เอง = ตัด build→build ไปในตัว (build→host ดูกฎ INPUT ล่างสุด)
BLOCKED_DESTS=(
  169.254.0.0/16   # cloud metadata (169.254.169.254) + link-local
  10.0.0.0/8
  172.16.0.0/12
  192.168.0.0/16
  100.64.0.0/10    # CGNAT
)

# กัน race ตอน boot: ปกติ dockerd สร้าง DOCKER-USER + jump จาก FORWARD ให้แล้ว (After=docker.service)
# ถ้ายังไม่มีจริงๆ สร้าง chain เปล่าไว้ให้ -C/-I ไม่ error (dockerd จะมา insert jump ให้ทีหลังเอง)
iptables -N DOCKER-USER 2>/dev/null || true

ensure_drop() {
  local dest="$1"
  if iptables -C DOCKER-USER -s "$BUILD_SUBNET" -d "$dest" -j DROP 2>/dev/null; then
    echo "exists  DROP $BUILD_SUBNET -> $dest"
  else
    iptables -I DOCKER-USER -s "$BUILD_SUBNET" -d "$dest" -j DROP
    echo "added   DROP $BUILD_SUBNET -> $dest"
  fi
}

for dest in "${BLOCKED_DESTS[@]}"; do
  ensure_drop "$dest"
done

# กฎ DOCKER-USER ทั้งหมดข้างบนคุมเฉพาะขา FORWARD (container→container/ออกเน็ต) — packet จาก
# build container "ตรงเข้า host เอง" (gateway IP / service ที่ bind บน host เช่น sshd) เดินเข้า
# chain INPUT ไม่ผ่าน DOCKER-USER เลย ต้อง DROP แยกที่นี่ ไม่มี traffic ที่ถูกต้องจาก build มา
# หา host ตรงๆ (DNS ใช้ embedded resolver 127.0.0.11 ใน netns ของ container ซึ่ง daemon proxy
# ออกให้จากฝั่ง host เอง reply ไม่นับเป็น INPUT จาก subnet นี้)
if iptables -C INPUT -s "$BUILD_SUBNET" -j DROP 2>/dev/null; then
  echo "exists  DROP $BUILD_SUBNET -> host (INPUT)"
else
  iptables -I INPUT -s "$BUILD_SUBNET" -j DROP
  echo "added   DROP $BUILD_SUBNET -> host (INPUT)"
fi

echo "build-egress firewall applied for $BUILD_SUBNET"
