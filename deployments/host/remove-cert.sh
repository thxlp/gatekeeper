#!/usr/bin/env bash
# ลบ nginx vhost + cert ของ custom domain — เรียกโดย backend ผ่าน `sudo -n remove-cert.sh <domain>`
set -euo pipefail

DOMAIN="${1:-}"
VHOST="/etc/nginx/conf.d/gk-domain-${DOMAIN}.conf"

if ! [[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]]; then
  echo "invalid domain: $DOMAIN" >&2
  exit 2
fi

rm -f "$VHOST"
# reload ให้ vhost หายไป (ถ้า test พังก็ยัง reload ไม่ได้ แต่ vhost ถูกลบแล้ว รอบหน้า test ผ่านเอง)
nginx -t && systemctl reload nginx || true
# ลบ cert ทิ้งด้วย (best-effort) — ไม่ให้ certbot renew โดเมนที่เลิกใช้แล้ว
certbot delete --cert-name "$DOMAIN" --non-interactive 2>/dev/null || true
echo "removed ${DOMAIN}"
