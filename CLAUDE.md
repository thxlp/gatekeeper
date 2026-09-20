# กฎสำหรับ gatekeeper project
- ห้ามรันคำสั่ง docker โดยตรง (claudebot ไม่มีสิทธิ์) ให้ขอให้ user รันแทนเสมอ
- แก้ nginx config ต้อง nginx -t ผ่านก่อนทุกครั้ง ก่อนแนะนำให้ reload
- backend เป็น NestJS + Express, ใช้ AuthGuard เดิมอยู่แล้วที่ src/auth/
- ทำงานบน branch แยกเสมอ ไม่ commit ตรงเข้า main โดยไม่ถามก่อน
- ตัว gatekeeper (backend ×2 :8089/:8090, frontend :3000, nginx) รันบน host ผ่าน systemd
  ไม่ได้อยู่ใน docker แล้ว — deploy ด้วย deployments/host/deploy.sh (ดู deployments/host/README.md)
  ใน docker เหลือแค่ postgres + docker-socket-proxy (127.0.0.1) กับ tenant apps ของลูกค้า
- ทุก service บน host ต้อง bind 127.0.0.1 เท่านั้น (ยกเว้น nginx) — กัน tenant container
  ยิงเข้า host ผ่าน bridge gateway IP
- build ได้ทางเดียวคือ `bash deployments/host/deploy.sh` และต้องรันโดย user dup (ห้าม sudo, ห้าม claudebot)
  ห้ามสั่ง `pnpm build` เดี่ยวๆ — NEXT_PUBLIC_* หายตอน build แล้ว prerender พังทุกหน้า เว็บล่ม
- ตรวจสุขภาพระบบ: `bash deployments/host/healthcheck.sh` (ไม่ต้อง sudo/docker — unit, healthz,
  เส้นทางผ่าน nginx, disk/RAM, วันหมดอายุ cert) ดูวิธีดูแลช่วงปล่อยรันยาวที่ deployments/host/OPS-PRESENTATION.md
- claudebot อ่าน journalctl ไม่ได้ (ไม่อยู่ใน group adm) — verify หลัง deploy ให้ยิง HTTP probe ผ่าน nginx
  (challenge cookie → /api/healthz) แทนการอ่าน log

## สถาปัตยกรรมภาพใหญ่ (อ่านก่อนแก้ deploy flow)
- **Pipeline เดียว 5 stage ใช้ร่วมกันทั้งสองทางเข้า** (git webhook / อัปโหลด zip):
  clone-extract → security_scan → risk engine → build → production_deploy
  อยู่ที่ `backend/src/deploy/deploy-pipeline.service.ts` (`runPipeline`) — สองทางเข้าต่างกัน
  แค่ callback `acquireSource(stagingDir)` ที่หา source code มาลง staging เท่านั้น
  ที่เหลือใช้โค้ดเดียวกันทุกตัวอักษร → แก้ตรงนี้กระทบทั้งสองทาง ห้าม fork logic แยก
- **Fail-closed boundary**: ก่อน `runContainer` ต้อง sign + verify HMAC ticket (TTL 60s,
  `ticket/ticket.service.ts`) ผ่านก่อนเสมอ — verify ไม่ผ่าน = BLOCK ไม่ deploy
- **risk engine** (`decision/risk-engine.service.ts`): LOW 5 / MEDIUM 20 / HIGH 40 / CRITICAL 100,
  ≥100 หรือมี CRITICAL = BLOCK, ≥50 = QUARANTINE; กฎ scan เป็น regex ใน `configs/detection-rules/`
- **SCA (`scanner/dependency-audit.service.ts`) ยังเป็น stub** ตรวจแค่ว่ามีไฟล์ manifest ไหม
  ห้ามเคลมว่าทำ dependency scanning จริงทั้งในโค้ด เอกสาร และรูปเล่ม (ดู docs/research/NOTES_PENTEST.md)
- **GitAppStore** (`apps/git-app.store.ts`) เป็น source of truth ของ app + secret ทั้งหมด
  secret ทุกตัวถูกเข้ารหัส AES-256-GCM ผ่าน `common/crypto.util.ts` ตอน save
- **backend ไม่แตะ docker.sock ตรง** — คุยผ่าน docker-socket-proxy ที่ 127.0.0.1:2375 เท่านั้น
  (`deploy/docker-runtime.service.ts`); tenant container แยก network ต่อ user (`tenantNetworkFor`)

## ค่าคงที่ด้านความปลอดภัยที่ห้ามพังโดยไม่รู้ตัว
- **origin isolation ของ `/live/<id>` กัน 3 ชั้น ห้ามถอดชั้นใดชั้นหนึ่งโดยไม่เข้าใจอีกสองชั้น**:
  (1) nginx `return 404` ให้ `~* ^/(api/)?(live|__domain)` บน vhost ของ dashboard
  (2) `frontend/next.config.js` คืน `[]` จาก `rewrites()` เมื่อ NODE_ENV=production
  (3) `live/live.controller.ts` เช็ค Host เองว่าเป็น live origin
  หลุดเมื่อไหร่ = JS ของ tenant ยิง `/api/*` แบบ same-origin ด้วย session cookie ได้ = account takeover
  (httpOnly ช่วยไม่ได้ ไม่ต้องอ่าน cookie ก็ใช้มันได้) — เคยหลุดจริงบน production 2 ทางพร้อมกัน
- **ห้ามใส่ `add_header` ใน location ย่อยของ vhost dashboard** — nginx เลิก inherit header
  ระดับ server ทั้งชุดทันที (CSP/HSTS/nosniff/X-Frame-Options หายทั้งก้อนแบบเงียบๆ)
- **`decryptSecret` ต้องยอม ciphertext ว่าง** (`ct === ''` คือ secret ที่ค่าว่างจริงๆ)
  ห้ามเช็ค `!ct` — เคยทำ readAll() throw แล้ว backend crash-loop ทั้งสองตัว เว็บล่มทั้งระบบ
- **ห้ามเปิด `trust proxy`** — prod อยู่หลัง Cloudflare → nginx, trust แค่ 1 hop ทำให้ req.ip
  เป็น IP ของ Cloudflare edge ที่เปลี่ยนทุก request → challenge token พัง login ล่มทั้งระบบ
  (ด้วยเหตุผลเดียวกัน challenge token จึงจงใจไม่ผูก IP)
- **ห้าม default-import CJS ใน backend** — ไม่ได้เปิด esModuleInterop
- **`@All()` ของ Nest ต้องเป็น array เดียว** (`@All([':appId', ':appId/*'])`) — ซ้อนสอง decorator
  ตัวหลังทับตัวแรกเงียบๆ ไม่ error ไม่ warn (เคยทำ sub-path ของทุก live app ตอบ 404 หมด)
- งานเบื้องหลัง (setInterval / fire-and-forget) ต้อง `.catch()` เสมอ — unhandled rejection
  ฆ่าทั้ง process = backend ตายทั้ง instance
