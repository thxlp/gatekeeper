# รัน gatekeeper บน host (ถอดออกจาก Docker)

backend (NestJS ×2) / frontend (Next.js) / nginx ย้ายมารันบน host ตรงๆ — เหลือใน Docker แค่
`postgres` + `docker-socket-proxy` (ดู `deployments/docker/docker-compose.yml`) และ tenant apps
ของลูกค้าซึ่งยังเป็น container เหมือนเดิมทุกอย่าง

ทำไม: backend บน host มี route ไปทุก docker bridge network อยู่แล้ว เข้าถึง tenant container
ได้ตรงๆ (probe/proxy ด้วย IP จาก inspect) ไม่ต้อง network-connect ตัวเองเข้า tenant network
ทีละวงเหมือนตอนเป็น container และ deploy ตัวระบบเองเร็วขึ้นเพราะไม่ต้อง build image

หลักความปลอดภัย: ทุกอย่างบน host bind `127.0.0.1` เท่านั้น (backend 8089/8090, frontend 3000,
postgres 5432, socket-proxy 2375) — tenant container ยิงเข้า loopback ของ host ผ่าน bridge
gateway IP ไม่ได้ มีแค่ nginx ที่เปิด 80/443 สาธารณะ

## ติดตั้งครั้งแรก (cutover จาก docker) — รันเป็น user dup

### 1. เตรียมของบน host (ยังไม่แตะระบบเดิม — ทำล่วงหน้าได้ ไม่มี downtime)

```bash
# Node 22+ ระดับระบบ (systemd ชี้ /usr/bin/node) — ตอนนี้เครื่องมีแต่ node ใน nvm ของ user
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
# เปิด pnpm ผ่าน corepack (มากับ node) — เวอร์ชันจริงปักไว้ใน package.json field packageManager
# ถ้า corepack ดึง pnpm ไม่ได้ (integrity error): sudo npm i -g pnpm@11.15.1 แทน
sudo corepack enable
# nginx บน host (ยังไม่ start — port 80/443 ยังถูก container เดิมจับอยู่)
# mask ก่อนติดตั้ง: กัน postinst ของ apt auto-start แล้วชน port จน dpkg error
sudo systemctl mask nginx
sudo apt-get install -y nginx
sudo systemctl unmask nginx   # ปล่อยให้ start ได้ตอน cutover ข้อ 6 (ยังไม่ enable)
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /home/dup/gatekeeper/deployments/host/gatekeeper-host.conf /etc/nginx/conf.d/gatekeeper.conf
sudo nginx -t   # ต้องผ่าน — ถ้าไม่ผ่านห้ามไปต่อ
```

### 2. สร้าง .env ของ host จากค่าเดิม

```bash
cd /home/dup/gatekeeper
set -a; source deployments/docker/.env; set +a
sed -e "s|^COOKIE_CHALLENGE_SECRET=$|COOKIE_CHALLENGE_SECRET=$COOKIE_CHALLENGE_SECRET|" \
    -e "s|^GATEKEEPER_TICKET_SECRET=$|GATEKEEPER_TICKET_SECRET=$GATEKEEPER_TICKET_SECRET|" \
    -e "s|^GATEKEEPER_MASTER_KEY=$|GATEKEEPER_MASTER_KEY=$GATEKEEPER_MASTER_KEY|" \
    -e "s|^DATABASE_URL=$|DATABASE_URL=postgres://gatekeeper:$POSTGRES_PASSWORD@127.0.0.1:5432/gatekeeper|" \
    -e "s|^SUPABASE_URL=$|SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL|" \
    -e "s|^SUPABASE_ANON_KEY=$|SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY|" \
    -e "s|^NEXT_PUBLIC_SUPABASE_URL=$|NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL|" \
    -e "s|^NEXT_PUBLIC_SUPABASE_ANON_KEY=$|NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY|" \
    -e "s|^FRONTEND_URL=.*|FRONTEND_URL=$FRONTEND_URL|" \
    deployments/host/.env.example > deployments/host/.env
chmod 600 deployments/host/.env
grep "=$" deployments/host/.env && echo "^^ มีค่าว่างค้าง เติมเองก่อนไปต่อ" || echo "ครบทุกค่า"
```

### 3. build + ติดตั้ง systemd units (ยังไม่มี downtime)

```bash
cd /home/dup/gatekeeper && bash -c '
  cd backend && pnpm install --frozen-lockfile && pnpm run build && cd ..
  cd frontend && pnpm install --frozen-lockfile
  set -a; source ../deployments/host/.env; set +a
  pnpm run build
  cp -r .next/static .next/standalone/.next/static
  cp -r public .next/standalone/public'
sudo cp deployments/systemd/gatekeeper-backend@.service deployments/systemd/gatekeeper-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
```

### 4. สลับ infra container + ย้ายข้อมูล (postgres โดน recreate — DB วูบไม่กี่วินาที)

```bash
cd /home/dup/gatekeeper/deployments/docker
sudo docker compose up -d postgres docker-socket-proxy   # ได้ ports 127.0.0.1 ใหม่ (จะเตือน orphans — ปกติ ยังไม่ต้องลบ)
# ย้ายข้อมูลจาก volume backend-data เดิม (audit.log, master.key, git-deployed ฯลฯ)
mkdir -p /home/dup/gatekeeper/data
sudo docker cp backend-1:/app/data/. /home/dup/gatekeeper/data/
sudo chown -R dup:dup /home/dup/gatekeeper/data
```

### 5. start ฝั่ง host แล้วเช็คก่อนสลับ

```bash
sudo systemctl enable --now gatekeeper-backend@8089 gatekeeper-backend@8090 gatekeeper-frontend
curl -sf http://127.0.0.1:8089/healthz && curl -sf http://127.0.0.1:8090/healthz && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000
```

### 6. จุดสลับจริง (downtime วินาทีเดียว)

```bash
cd /home/dup/gatekeeper/deployments/docker
docker compose -p docker stop nginx frontend backend-1 backend-2 2>/dev/null; \
  docker stop gatekeeper-proxy frontend backend-1 backend-2 2>/dev/null; \
  sudo systemctl enable --now nginx
```

### 7. verify + เก็บกวาด

- ยิงทดสอบผ่าน nginx ตามสูตร challenge cookie เดิม, login, deploy แอปทดสอบ, เปิด `/live/<id>`
- ผ่านหมดแล้วค่อย: `docker rm gatekeeper-proxy frontend backend-1 backend-2` (ทำแล้ว 2026-07-21;
  volume `backend-data` เก็บไว้ก่อนก็ได้ ลบเมื่อมั่นใจ: `docker volume rm docker_backend-data`)
- ลบ `deployments/nginx/gatekeeper.conf` (เวอร์ชัน container) ออกจาก repo แล้ว 2026-07-21

**Rollback**: ทางลัด `docker start` container เดิมใช้ไม่ได้แล้ว (rm ไปแล้ว 2026-07-21) — ถ้าจำเป็นต้อง
กลับไปรันใน docker ต้อง checkout compose เวอร์ชันก่อน host migration แล้ว build ใหม่

## Deploy รอบถัดไป

```bash
bash deployments/host/deploy.sh   # build + rolling restart (แทน docker compose up -d --build เดิม)
```
