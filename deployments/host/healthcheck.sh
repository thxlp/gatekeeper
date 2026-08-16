#!/usr/bin/env bash
# ตรวจสุขภาพ gatekeeper บน host — ไม่ใช้ sudo และไม่แตะ docker (รันได้ทั้ง dup และ claudebot)
#
#   bash deployments/host/healthcheck.sh           # รายงานเต็ม
#   bash deployments/host/healthcheck.sh --quiet   # พิมพ์เฉพาะข้อที่ผิด (เหมาะกับ cron)
#
# exit code: 0 = ปกติหมด, 1 = มี [FAIL] (บริการล่ม/ใกล้ล่ม), 2 = มีแต่ [WARN] (ยังใช้งานได้)
set -uo pipefail

QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

API_HOST=gatekeeper.studiodup.com   # โดเมน origin (API/challenge ยิงตรงได้ ไม่โดน 301)
UI_HOST=studiodup.com               # โดเมนหลักที่ user เข้าจริง (ผ่าน Cloudflare)
CERT_DOMAINS=(gatekeeper.studiodup.com live.studiodup.com)

DISK_WARN=85; DISK_FAIL=92          # % ของ /
MEM_WARN_MB=250                     # available ต่ำกว่านี้ = เสี่ยง OOM
CERT_WARN_DAYS=14; CERT_FAIL_DAYS=3

fails=0; warns=0; stamped=0
# ใน --quiet (cron) จะพิมพ์หัวเวลาให้ครั้งเดียวเมื่อเจอปัญหาจริง — รอบที่ปกติจะไม่เขียน log เลย
stamp() { [ "$QUIET" = 1 ] && [ "$stamped" = 0 ] && { printf '===== %s =====\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"; stamped=1; }; return 0; }
ok()   { [ "$QUIET" = 1 ] || printf '[ OK ] %s\n' "$*"; }
warn() { warns=$((warns+1)); stamp; printf '[WARN] %s\n' "$*"; }
fail() { fails=$((fails+1)); stamp; printf '[FAIL] %s\n' "$*"; }

# --- 1. systemd units ---------------------------------------------------------
for u in gatekeeper-backend@8089 gatekeeper-backend@8090 gatekeeper-frontend nginx; do
  state=$(systemctl is-active "$u" 2>/dev/null)
  if [ "$state" = active ]; then
    n=$(systemctl show "$u" -p NRestarts --value 2>/dev/null)
    if [ "${n:-0}" -gt 0 ]; then
      warn "$u active แต่เคย restart มาแล้ว $n ครั้ง (systemctl status $u)"
    else
      ok "$u active"
    fi
  else
    fail "$u = ${state:-unknown} → sudo systemctl restart $u"
  fi
done

# --- 2. process ตอบจริงไหม (loopback) ----------------------------------------
for p in 8089 8090; do
  code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$p/healthz")
  [ "$code" = 200 ] && ok "backend :$p /healthz 200" || fail "backend :$p /healthz = $code"
done
code=$(curl -s -m 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000)
[ "$code" = 200 ] || [ "$code" = 307 ] && ok "frontend :3000 = $code" || fail "frontend :3000 = $code"

# --- 3. เส้นทางจริงผ่าน nginx (challenge cookie → API + หน้า login) ----------
jar=$(mktemp)
ch=$(curl -sk -m 8 -X POST "https://localhost/challenge/verify" -H "Host: $API_HOST" -c "$jar" -o /dev/null -w '%{http_code}')
if [ "$ch" = 201 ] || [ "$ch" = 200 ]; then
  ok "challenge/verify = $ch"
else
  fail "challenge/verify = $ch (ด่านแรกพัง = ทุกคนเข้าเว็บไม่ได้)"
fi
code=$(curl -sk -m 8 -o /dev/null -w '%{http_code}' "https://localhost/api/healthz" -H "Host: $API_HOST" -b "$jar")
[ "$code" = 200 ] && ok "nginx → /api/healthz 200" || fail "nginx → /api/healthz = $code"

curl -sk -m 8 -X POST "https://localhost/challenge/verify" -H "Host: $UI_HOST" -c "$jar" -o /dev/null
code=$(curl -sk -m 10 -o /dev/null -w '%{http_code}' "https://localhost/login" -H "Host: $UI_HOST" -b "$jar")
[ "$code" = 200 ] && ok "nginx → https://$UI_HOST/login 200" || fail "หน้า /login = $code (หน้าที่จะพรีเซ็นเข้าไม่ได้)"
rm -f "$jar"

# --- 4. ทรัพยากรเครื่อง (RAM 2GB / disk 67GB — สองอย่างนี้คือสาเหตุล่มที่เป็นไปได้มากสุด) ---
use=$(df -P / | awk 'NR==2{gsub(/%/,"",$5); print $5}')
avail=$(df -Ph / | awk 'NR==2{print $4}')
if   [ "$use" -ge "$DISK_FAIL" ]; then fail "disk / ใช้ไป $use% (เหลือ $avail) — เต็มเมื่อไหร่ postgres/docker พังทันที"
elif [ "$use" -ge "$DISK_WARN" ]; then warn "disk / ใช้ไป $use% (เหลือ $avail)"
else ok "disk / ใช้ไป $use% (เหลือ $avail)"; fi

mem=$(free -m | awk '/^Mem:/{print $7}')
if [ "$mem" -lt "$MEM_WARN_MB" ]; then warn "RAM available เหลือ ${mem}MB — อย่าเพิ่ง build/deploy ตอนนี้"
else ok "RAM available ${mem}MB"; fi

# --- 5. ใบรับรอง TLS ----------------------------------------------------------
now=$(date +%s)
for d in "${CERT_DOMAINS[@]}"; do
  end=$(echo | openssl s_client -connect 127.0.0.1:443 -servername "$d" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -z "$end" ]; then warn "อ่าน cert ของ $d ไม่ได้"; continue; fi
  days=$(( ($(date -d "$end" +%s) - now) / 86400 ))
  if   [ "$days" -le "$CERT_FAIL_DAYS" ]; then fail "cert $d เหลือ $days วัน (certbot ต่ออายุไม่สำเร็จ?)"
  elif [ "$days" -le "$CERT_WARN_DAYS" ]; then warn "cert $d เหลือ $days วัน"
  else ok "cert $d เหลือ $days วัน"; fi
done

# --- 6. ของค้างที่ทำให้เซอร์ไพรส์ทีหลัง --------------------------------------
[ -f /var/run/reboot-required ] && warn "มี /var/run/reboot-required ค้าง — reboot ให้จบก่อนวันพรีเซ็น อย่าปล่อยไว้"

[ "$QUIET" = 1 ] && [ "$stamped" = 0 ] && exit 0   # รอบที่ปกติหมด: เงียบสนิท ไม่เขียนอะไรลง log
echo "---"
if   [ "$fails" -gt 0 ]; then echo "สรุป: FAIL $fails / WARN $warns"; exit 1
elif [ "$warns" -gt 0 ]; then echo "สรุป: ปกติ แต่มี WARN $warns"; exit 2
else echo "สรุป: ปกติทั้งหมด"; exit 0; fi
