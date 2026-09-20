# Gatekeeper — Pre-deploy Security & Management Gatekeeper

ระบบ **admission control สำหรับขั้นตอน deployment**: โค้ดของผู้ใช้ทุกชิ้นต้องผ่านด่านตรวจ
ความปลอดภัยและด่านตัดสินใจก่อน จึงจะถูกนำขึ้นรันเป็นคอนเทนเนอร์ที่เข้าถึงได้จากอินเทอร์เน็ต

ปริญญานิพนธ์วิชา 1101911 — กลุ่ม 76

---

## 1. ระบบนี้ทำอะไร

ผู้ใช้เชื่อม Git repository (GitHub / GitLab / Bitbucket) หรืออัปโหลดไฟล์ `.zip` เข้ามา
ระบบจะดึงซอร์สโค้ด → **สแกนหารูปแบบที่เป็นอันตราย** → **ให้คะแนนความเสี่ยงและตัดสิน**
(ALLOW / QUARANTINE / BLOCK) → build → นำขึ้นรันแยกเครือข่ายต่อผู้ใช้ พร้อมโดเมนสำหรับเข้าใช้งาน

จุดต่างจากระบบ deploy ทั่วไป (Vercel / Railway) คือ **ด่านตรวจและด่านตัดสินอยู่บนเส้นทางบังคับ**
ไม่ใช่รายงานที่ข้ามได้ — โค้ดที่ถูกตัดสินว่า BLOCK จะไม่มีทางไปถึงขั้นรันคอนเทนเนอร์

## 2. Pipeline 5 ขั้น (ทางเข้าเดียว ไม่มีทางลัด)

```
clone/extract → security_scan → risk engine → build → production_deploy
```

อยู่ที่ [`backend/src/deploy/deploy-pipeline.service.ts`](backend/src/deploy/deploy-pipeline.service.ts)
(`runPipeline`) — ทั้งทางเข้าแบบ git webhook และแบบอัปโหลด zip **ใช้โค้ดเส้นเดียวกันทั้งหมด**
ต่างกันแค่ callback `acquireSource(stagingDir)` ที่หาซอร์สโค้ดมาวางใน staging directory
การมีทางเข้าเดียวคือสิ่งที่ทำให้ "ข้ามด่านตรวจ" เป็นไปไม่ได้โดยโครงสร้าง ไม่ใช่โดยนโยบาย

| ขั้น | หน้าที่ | โค้ด |
|---|---|---|
| 1 | นำซอร์สลง staging (clone หรือแตก zip) | `apps/zip-extract.util.ts` |
| 2 | สแกนหา secret / รูปแบบอันตราย ด้วยกฎ regex | `scanner/scanner.service.ts` + `configs/detection-rules/` |
| 3 | รวมคะแนนความเสี่ยงแล้วตัดสิน | `decision/risk-engine.service.ts` |
| 4 | build image (Node / Python / static / Dockerfile ของผู้ใช้) | `deploy/docker-runtime.service.ts` |
| 5 | รันคอนเทนเนอร์ + healthcheck + ผูกโดเมน | `deploy/docker-runtime.service.ts` |

**เกณฑ์ตัดสิน:** LOW 5 / MEDIUM 20 / HIGH 40 / CRITICAL 100 คะแนน —
รวม ≥ 100 หรือพบ CRITICAL = **BLOCK**, ≥ 50 = **QUARANTINE**, ต่ำกว่านั้น = ผ่าน

## 3. กลไกความปลอดภัยที่เป็นโครงสร้างหลัก

- **Fail-closed ticket** — ก่อนเรียก `runContainer` ต้องเซ็นและตรวจ HMAC ticket (อายุ 60 วินาที,
  `ticket/ticket.service.ts`) ให้ผ่านก่อนเสมอ ตรวจไม่ผ่าน = ไม่ deploy
- **Origin isolation 3 ชั้น** — แอปของผู้ใช้รันคนละโดเมนกับ dashboard โดยเด็ดขาด
  (nginx `return 404` / `next.config.js` ไม่ rewrite บน production / ตรวจ `Host` ใน `live.controller.ts`)
  ถ้าหลุดชั้นใดชั้นหนึ่ง JavaScript ของผู้ใช้จะยิง `/api/*` แบบ same-origin ด้วย session cookie ได้
- **ไม่แตะ `docker.sock` โดยตรง** — คุยผ่าน docker-socket-proxy ที่ `127.0.0.1:2375` ซึ่งปิด EXEC
- **แยก network ต่อผู้ใช้** (`tenantNetworkFor`) + จำกัด memory / CPU / PID / read-only rootfs
- **ความลับถูกเข้ารหัส AES-256-GCM** ทุกตัวก่อนเขียนลง store (`common/crypto.util.ts`)
- **ยืนยันตัวตนสองขั้นตอน (2FA)** ผ่านรหัสทางอีเมล — ส่งอีเมลไม่สำเร็จ = ตอบ 503 ไม่ปล่อยผ่าน

## 4. โครงสร้างไดเรกทอรี

```
backend/          NestJS + Express — API, pipeline, scanner, risk engine, docker runtime
frontend/         Next.js (App Router) — dashboard, i18n ไทย/อังกฤษ 582 คีย์
configs/          กฎตรวจจับ (regex) + รายการแอปแบบ ops-managed
deployments/host/ สคริปต์ deploy / healthcheck / ออกใบรับรอง + nginx vhost   ← ห้ามย้าย
docs/             เอกสารประกอบ (ดูข้อ 6)
tests/            ชุดข้อมูลและสคริปต์การทดลอง (ดูข้อ 5)
tools/            เครื่องมือประกอบรูปเล่มรายงาน (Python)
data/             ข้อมูลขณะทำงาน — ไม่อยู่ใน git
```

> `deployments/host/` ถูกอ้างถึงจาก nginx (symlink), systemd unit, cron และ sudoers ของเครื่องจริง
> การย้ายไดเรกทอรีนี้ทำให้ระบบที่รันอยู่หยุดทำงาน

## 5. การทดลอง

| การทดลอง | คำถาม | ที่อยู่ |
|---|---|---|
| 1 — Detection | กฎตรวจจับจับได้แม่นแค่ไหน และหลบได้ง่ายแค่ไหน | `tests/detection-experiment/` + ชุดข้อมูล `tests/detection-dataset/` |
| 2 — Enforcement | ข้ามด่านตรวจด้วยวิธีใดได้บ้าง (6 สถานการณ์) | `docs/research/EXPERIMENT2_ANALYSIS.md` |
| 3 — Performance | ด่านสแกนทำให้ deploy ช้าลงกี่เปอร์เซ็นต์ | `tests/perf-experiment/` + `docs/research/EXPERIMENT3_PLAN.md` |

## 6. เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| `CLAUDE.md` | กฎการทำงานกับเรโปนี้ + ค่าคงที่ด้านความปลอดภัยที่ห้ามทำพัง |
| `deployments/host/README.md` | วิธี deploy และดูแลเครื่อง production |
| `docs/TEST-CHECKLIST.md` | รายการทดสอบด้วยมือ |
| `docs/UX-AUDIT.md` | ผลตรวจการใช้งานส่วนติดต่อผู้ใช้ |
| `docs/INCIDENT-2026-08-08-2fa-mail.md` | บันทึกเหตุการณ์ระบบล่ม + สาเหตุราก |
| `docs/research/` | เอกสารประกอบปริญญานิพนธ์ (งานที่เกี่ยวข้อง, ผลการทดลอง, ผลตรวจความปลอดภัย) |
| `docs/presentation/` | สไลด์นำเสนอ |

## 7. การติดตั้งและรัน

ต้องมี Node.js ≥ 18, pnpm (ผ่าน corepack), Docker (สำหรับ PostgreSQL และคอนเทนเนอร์ของผู้ใช้)

```bash
cp deployments/host/.env.example deployments/host/.env   # แล้วเติมค่าให้ครบ
pnpm run deploy        # = bash deployments/host/deploy.sh (build ทั้งระบบแล้ว restart)
pnpm run healthcheck   # ตรวจสุขภาพระบบ 15 รายการ
```

> การ build มีทางเดียวคือผ่าน `deploy.sh` — การสั่ง `next build` แยกเองจะไม่มีตัวแปร
> `NEXT_PUBLIC_*` ตอน build ทำให้การ prerender ล้มเหลวทุกหน้า

## 8. ข้อจำกัดที่ทราบ

- **Software Composition Analysis ยังเป็น stub** — `scanner/dependency-audit.service.ts`
  ตรวจเพียงว่ามีไฟล์ manifest (`package.json` ฯลฯ) อยู่หรือไม่ **ยังไม่ได้ตรวจช่องโหว่ของ
  dependency จริง** ระบบจึงไม่เคลมความสามารถนี้ทั้งในโค้ด เอกสาร และรูปเล่ม
- **การตรวจจับอาศัย regex ระดับข้อความ** ไม่ได้วิเคราะห์โครงสร้างภาษา (ไม่มี AST / dataflow)
  จึงแยกโค้ดจริงออกจากคอมเมนต์ไม่ได้ และหลบได้ด้วยการแยกสตริงหรือเรียกฟังก์ชันผ่านตัวแปร
  (หลักฐานเชิงประจักษ์อยู่ใน `tests/detection-experiment/FINDINGS.md`)
- **Webhook ยังไม่กัน replay** — ไม่มี nonce และไม่ตรวจ timestamp
