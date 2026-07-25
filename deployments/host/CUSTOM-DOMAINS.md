# Custom domain + auto-TLS — setup (host)

Backend รับคำขอ custom domain แล้วเรียก script ผ่าน `sudo -n` เพื่อออก cert + สร้าง nginx vhost
(backend/claudebot รัน certbot/nginx/sudo เองไม่ได้ — ต้องเปิดสิทธิ์เฉพาะ 2 script นี้)

## 1. ทำให้ script รันได้
```bash
chmod +x /home/dup/gatekeeper/deployments/host/issue-cert.sh
chmod +x /home/dup/gatekeeper/deployments/host/remove-cert.sh
```

## 2. เปิด NOPASSWD sudo เฉพาะ 2 script (แก้ user ให้ตรงกับ user ที่รัน gatekeeper-backend)
```bash
sudo visudo -f /etc/sudoers.d/gatekeeper-certs
```
ใส่ (สมมติ service รันเป็น user `dup`):
```
dup ALL=(root) NOPASSWD: /home/dup/gatekeeper/deployments/host/issue-cert.sh, /home/dup/gatekeeper/deployments/host/remove-cert.sh
```
> ปลอดภัย: จำกัดแค่ 2 path นี้ + backend validate domain ด้วย DOMAIN_RE ก่อนเสมอ และส่งเป็น
> arg เดียวผ่าน execFile (ไม่ผ่าน shell) — ไม่มีช่องแทรกคำสั่ง

## 3. nginx: catch-all :80 (อยู่ใน gatekeeper-host.conf แล้ว)
block แรกเป็น `listen 80 default_server` เพื่อให้ ACME ของทุก custom domain ตกมาที่ webroot
`/var/www/certbot` — ถ้ามี `default_server :80` เจ้าอื่นใน nginx.conf ให้เอาออกก่อน แล้ว
`sudo nginx -t && sudo systemctl reload nginx`

## 4. env (ตั้งใน .env ของ backend ตามต้องการ)
```
LETSENCRYPT_EMAIL=you@yourdomain.com     # อีเมลจดทะเบียน Let's Encrypt (default admin@studiodup.com)
LIVE_ORIGIN_HOST=live.studiodup.com      # โดเมนที่ลูกค้า CNAME มา (ใช้เช็ค DNS ก่อนออก cert)
CERTBOT_WEBROOT=/var/www/certbot         # webroot ของ ACME challenge
# RESERVED_DOMAINS=studiodup.com         # โดเมนที่ห้ามลูกค้าเคลม (คั่นด้วย ,)
```

## flow ที่ลูกค้าทำ
1. ในหน้าแอป → แท็บ Domains → ใส่โดเมน (เช่น `app.customer.com`) → Add
2. ตั้ง DNS: `CNAME app.customer.com → live.studiodup.com` (ไม่ผ่าน Cloudflare proxy — ต้องเป็น DNS-only ให้ HTTP-01 ผ่าน)
3. กลับมากด Verify (หรือรอ background) — ระบบเช็ค DNS → ออก cert → สร้าง vhost → สถานะเป็น active
4. vhost ที่สร้าง: `/etc/nginx/conf.d/gk-domain-<domain>.conf` (ลบตอนถอดโดเมน)

## renew
certbot ต่ออายุอัตโนมัติผ่าน systemd timer เดิม (`certbot renew`) — cert ของ custom domain รวมอยู่ด้วย
เพราะออกผ่าน certbot ตัวเดียวกัน ไม่ต้องตั้งเพิ่ม
