#!/usr/bin/env bash
# ออก Let's Encrypt cert (HTTP-01 webroot) + สร้าง nginx vhost ให้ custom domain ชี้เข้าแอป
# เรียกโดย backend ผ่าน `sudo -n issue-cert.sh <domain>` (ต้องมี NOPASSWD ให้ user ของ service)
# domain ถูก validate ทั้งฝั่ง backend (DOMAIN_RE) และซ้ำที่นี่ (defense-in-depth) ก่อนใช้เป็น arg
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${LETSENCRYPT_EMAIL:-admin@studiodup.com}"
WEBROOT="${CERTBOT_WEBROOT:-/var/www/certbot}"
VHOST="/etc/nginx/conf.d/gk-domain-${DOMAIN}.conf"

if ! [[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]]; then
  echo "invalid domain: $DOMAIN" >&2
  exit 2
fi

# 1) ออก cert — catch-all :80 (default_server) เสิร์ฟ /.well-known/acme-challenge จาก $WEBROOT อยู่แล้ว
certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" \
  --non-interactive --agree-tos -m "$EMAIL" --keep-until-expiring

# 2) เขียน nginx vhost (:443) — proxy เข้า backend ผ่าน /__domain (DomainProxyController หาแอปจาก Host)
cat > "$VHOST" <<EOF
# managed by gatekeeper issue-cert.sh — custom domain ${DOMAIN} (แก้มือไม่ได้ ถูกเขียนทับ)
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${DOMAIN};
    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        limit_req zone=gk_req_limit burst=20 nodelay;
        limit_conn gk_conn_limit 20;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        rewrite ^ /__domain\$request_uri break;
        proxy_pass http://backend_pool;
    }
}
EOF

# 3) test ก่อน reload เสมอ — พังให้ rollback vhost ที่เพิ่งเขียน (กัน nginx ทั้งเครื่องล่ม)
if nginx -t; then
  systemctl reload nginx
  echo "ok: ${DOMAIN} active"
else
  rm -f "$VHOST"
  echo "nginx -t failed, rolled back vhost for ${DOMAIN}" >&2
  exit 3
fi
