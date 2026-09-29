# EXPERIMENT2_ANALYSIS.md — Enforcement Effectiveness (วิเคราะห์จากโค้ด)

ปริญญานิพนธ์ **Gatekeeper** วิชา 1101911 — Experiment 2 (Enforcement Effectiveness)
วิเคราะห์เมื่อ **2026-09-08** กับ repo `/home/dup/gatekeeper` branch `fix/pentest-2026-09-06`
(HEAD `d9a2cb4`; main = production ที่ `61d55d9` + 2 commit ของ pentest รอ merge)

> **วิธีการ:** วิเคราะห์จาก **source code แบบ static เท่านั้น** — ระบบเป็น production
> **ไม่มีการยิง request ทดสอบใดๆ ทั้งสิ้น** ข้อที่ยืนยันด้วยการอ่านโค้ดไม่ได้ ระบุไว้ว่า `[ไม่แน่ใจ]`
>
> **กติกาเอกสาร** (ตาม `NOTES_PENTEST.md` + `THREE_TIER_REVIEW.md`): ทุกการเคลมอ้าง `path:line`
> จริง; ไม่มี secret / IP จริง / โดเมนจริงในเอกสารนี้ (`127.0.0.1` ที่ปรากฏคือ loopback
> ซึ่งเป็นข้อกำหนดการออกแบบ ไม่ใช่ที่อยู่ของเครื่อง)

---

## 0. สรุปผลรวม

| # | Scenario | ผล | สาระสำคัญ |
|---|---|---|---|
| 1 | Direct deployment API | **กันได้** (มีข้อสังเกต 1) | ทุกทางเข้าลง `runPipeline` เดียว สแกนก่อนเสมอ ข้ามไม่ได้ — ยกเว้น **rollback** ที่เป็น path แยก |
| 2 | Modified frontend request | **กันได้** | frontend ไม่มีอำนาจตัดสินใจใดๆ; `ValidationPipe({whitelist:true})` ตัดฟิลด์แปลกปลอมทิ้ง |
| 3 | Forged deployment request | **กันได้** (แต่ ticket ไม่ใช่ด่านกันปลอม) | ด่านจริงคือ AuthGuard + webhook HMAC; **ticket เซ็นและ verify ในฟังก์ชันเดียวกัน** จึงไม่ใช่ security boundary ต่อ input ภายนอก |
| 4 | Replay request | **มีช่องโหว่ (ระดับกลาง)** | webhook ไม่มี nonce/delivery-id dedup และไม่เช็ค timestamp → replay ได้ตลอดอายุ secret |
| 5 | Modified decision | **กันได้** | decision คำนวณใน `risk-engine` ฝั่ง server ล้วน ไม่มี input path; audit log เขียนอย่างเดียว (ข้อจำกัด: ไม่มี integrity chain) |
| 6 | Direct container invocation | **กันได้** (มีข้อสังเกต 2) | container ไม่ publish port เลย + network ต่อ tenant + docker API ผ่าน proxy loopback ที่ปิด EXEC |

**ช่องโหว่ที่พบ 1 ข้อ (scenario 4)** + **ข้อสังเกตเชิงออกแบบ 3 ข้อ** (F-1, F-2, F-3 ในส่วนท้าย)

---

## 1. Scenario 1 — Direct deployment API (เรียก API deploy ตรงข้ามด่านสแกน)

### [กันได้] — ป้องกันด้วยการรวมทางเข้าเป็น pipeline เดียว + guard ระดับ controller

**1.1 ทุก endpoint ที่ deploy ได้ ถูกครอบ guard 2 ชั้นที่ระดับ class**
`backend/src/apps/apps.controller.ts:38-39`
```ts
@Controller('apps')
@UseGuards(CookieChallengeGuard, AuthGuard)
```
ครอบทุก route ในไฟล์รวมถึง `POST /apps/manual/deploy` (`:57`), `POST /apps/:id/deploy` (`:72`),
`POST /apps/:id/rollback` (`:79`) — ไม่มี route ไหนใน controller นี้ที่ override guard ออก

- `CookieChallengeGuard` — `backend/src/challenge/challenge.guard.ts:13-19` (ไม่มี cookie ที่ HMAC ผ่าน = 403)
- `AuthGuard` — `backend/src/auth/auth.guard.ts:15-41` (หา account จาก hash ของ API key
  `account/accounts.service.ts:44`, แยก `expired`/`invalid`/`suspended` `:46-50`, `:26-28`)

**1.2 ownership check ทุก entry point** — `apps.service.ts:652-656`
```ts
private getOwnedOrThrow(id: string, accountId: string): GitApp {
  ...
  if (app.accountId !== accountId) throw new ForbiddenException('not_your_app');
```
ถูกเรียกที่ `:246` (triggerGitDeploy), `:273` (rollback), `:324` (manual redeploy) และอีก 15 จุด
→ ยิง API ด้วย session ของตัวเองแล้วใส่ appId ของคนอื่น = 403 ไม่ใช่ deploy

**1.3 ไม่มีทางเข้าที่ข้ามสเตจสแกนได้ — สแกนถูกเรียกแบบ unconditional**
`backend/src/deploy/deploy-pipeline.service.ts:329-339`
```ts
currentStage = 'security_scan';
this.persistStage(app, 'security_scan', 'running');
const files = this.automator.listTextFiles(stagingDir);
for (const f of files) findings = findings.concat(this.scanner.scanText(f.relPath, f.content));
findings = findings.concat(this.scanner.scanDependencies(...));
const result = this.riskEngine.evaluate(findings);
```
- ไม่มี `if` / flag / env / query param ใดที่ข้ามบล็อกนี้ได้ — ไม่มี "skip scan" ในโค้ดเลย
- ทางเข้าทั้ง 3 ทางเรียก `runPipeline` ตัวเดียวกัน ต่างแค่ callback `acquireSource`:
  - git webhook → `webhook/github-webhook.service.ts:92-94`
  - กด Deploy เอง → `apps/apps.service.ts:306`
  - อัปโหลด zip → `apps/apps.service.ts:390`
- `build` และ `runContainer` อยู่ **ใต้ `if (result.decision === 'ALLOW')`** เท่านั้น
  (`deploy-pipeline.service.ts:350`) — QUARANTINE/BLOCK ตกที่ `:445-457` โดยไม่แตะ docker

**1.4 fail-closed** — exception ที่ไม่คาดคิดจบเป็น BLOCK ไม่ใช่ผ่าน — `:441-463`
และมี lock กันยิงซ้อน `:315-321` (`deploy_already_in_progress`)

### ⚠️ ข้อสังเกต F-1 — rollback เป็น deploy path ที่ **ไม่ผ่านด่านสแกน** (โดยเจตนา)

`POST /apps/:id/rollback` → `apps.service.ts:272-293` → `deploy-pipeline.service.ts:198`
`runRollback()` **ไม่เรียก `scanner` เลย** และตั้ง 4 stage แรกเป็น `success` ทันทีโดยไม่ได้รัน:
```ts
// deploy-pipeline.service.ts:214-217
app.pipelineStages = initialPipelineStages().map((s) =>
  s.key === 'production_deploy' ? {...s, status:'running'} : {...s, status:'success'});
```
**ประเมิน: ยอมรับได้ ไม่ใช่ช่องโหว่** เพราะ:
- `release.imageTag` มาจาก release history ที่ระบบเขียนเอง ไม่ใช่ค่าจาก client
  (client ส่งได้แค่ `releaseId` แล้ว lookup ใน `app.releases` `apps.service.ts:277-278`)
- `getAppDetail` ตั้งใจไม่ echo `imageTag` กลับไป (`apps.service.ts:447`)
- image ทุกตัวใน history เคยผ่าน `security_scan` = ALLOW มาแล้วตอนถูกสร้าง

**สิ่งที่ต้องเขียนในเล่ม:** stage 1-4 ที่โชว์ `success` บน UI ตอน rollback **ไม่ได้รันจริง** —
เป็นการแสดงความหมายว่า "artifact นี้เคยผ่านด่านมาแล้ว" ถ้าเขียนในเล่มว่า "ทุก deploy ผ่าน 5 stage"
จะไม่ตรงกับโค้ด ต้องเขียนว่า **"ทุกการ deploy ของ artifact ใหม่"**

---

## 2. Scenario 2 — Modified frontend request (แก้ request ให้ข้ามการตรวจ)

### [กันได้] — frontend ไม่ได้ถือการตัดสินใจใดๆ ไว้เลย

**2.1 ไม่มีฟิลด์ใดใน DTO ที่สั่งข้าม/ผ่อนการสแกนได้**
- `ManualDeployDto` — `apps/manual-deploy.dto.ts:4-32`: มีแค่ `appId`, `projectName`,
  `runtime` (`@IsIn(['node','python','static','docker'])` `:16`), `port` (1-65535 `:24-25`),
  `config` (string)
- `AppConfigDto` — `apps/app-config.dto.ts:20-53`: `envVars`, `buildArgs`, `addons`
  (`@IsIn(['postgres','redis'])` `:35`), `memoryMb`, `cpuMilli`, `spa`
- `UpdateGitAppDto` — `apps/update-git-app.dto.ts:4-27`: `branch`, `runtime`, `port`,
  `enabled`, `autoDeploy`
→ **ไม่มี** `pipelineStatus`, `pipelineStages`, `decision`, `score`, `findings`, `skipScan`,
`imageTag`, `accountId` ให้ client เขียน

**2.2 ฟิลด์นอก DTO ถูกตัดทิ้งทั้งหมด (ไม่ใช่แค่ไม่สนใจ)**
`backend/src/main.ts:26`
```ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```
ยิง `{"appId":"x","decision":"ALLOW","pipelineStatus":"deployed"}` → 2 ฟิลด์หลังหายก่อนถึง service

**2.3 config ที่มาทาง multipart ถูก validate ซ้ำด้วย schema เดียวกัน** — `apps.service.ts:355-364`
(`plainToInstance` + `validate(..., { whitelist: true })`) ไม่ใช่ `JSON.parse` แล้ว spread เข้า app

**2.4 accountId มาจาก guard ไม่ใช่จาก body** — `auth.guard.ts:30-38` เซ็ต `req.account` เอง
แล้ว controller ส่งต่อด้วย `getAccount(req)` (`auth.guard.ts:45`) ทุก handler
→ ปลอม `accountId` ใน body ไม่มีผล

**2.5 quota ตรวจฝั่ง server ทุกรอบ** — `apps.service.ts:367` (`assertWithinQuota`)
คอมเมนต์ `:366` ระบุชัดว่าเช็คทั้งตอนสร้างและ redeploy เพราะ config ที่แนบมาอาจดัน memoryMb เกิน

**สรุปสำหรับเล่ม:** frontend เป็นแค่ตัว render — **ไม่มี security control ใดอยู่ฝั่ง client**
ดังนั้น scenario นี้ไม่มีอะไรให้ bypass โดยนิยาม

---

## 3. Scenario 3 — Forged deployment request (ปลอมตั๋ว/ลายเซ็น)

### [กันได้] — แต่ต้องแยกให้ชัดว่า "ตั๋ว" กับ "ลายเซ็น" คนละตัวกัน

**3.1 ปลอม session (API key / cookie) — กันได้**
- key เก็บเป็น SHA-256 hash เท่านั้น (`common/crypto.util.ts:80-81`, ใช้ที่
  `account/accounts.service.ts:44,76`) plaintext ไม่มีเก็บที่ไหน (`auth.guard.ts:33`)
- ต้องเดา key สุ่มให้ตรง hash — ไม่มี oracle ใดให้ทดสอบทีละส่วน

**3.2 ปลอม challenge cookie — กันได้** — `challenge/challenge.service.ts:27-43`
HMAC-SHA256 ครอบ `nonce|expires` ด้วย `COOKIE_CHALLENGE_SECRET` (env, ไม่มี fallback ที่เดาได้:
`:10` คืน `''` แล้ว `:28` ตีเป็น false ทันที = fail-closed)

**3.3 ปลอม webhook — กันได้ (ตามกลไกของแต่ละ provider)** — `webhook/providers.ts:67-87`
- GitHub: HMAC-SHA256 ของ **raw body** (`webhook-signature.util.ts:15-20`) เทียบด้วย
  `timingSafeEqual` + เช็คความยาวก่อน (`:19`)
- GitLab: เทียบ secret token ตรงด้วย `safeEqual` (`providers.ts:76`, `:15-20`)
- Bitbucket: HMAC ถ้ามี `X-Hub-Signature` ไม่งั้น secret ใน query (`:78-85`)
- **ไม่มี dynamic registration จาก payload** — ต้องมี app ที่ลงทะเบียนไว้ก่อน
  (`github-webhook.service.ts:49-61`) และ **provider ต้องตรงกับที่ลงทะเบียน** (`:53`)
- ตอบ 401 ข้อความเดียวกันทุกกรณี กัน enumerate repo (`:52-61`)
- rawBody หายไป (parser ไม่ทำงาน) → fallback re-serialize → HMAC ไม่ตรง = **fail-closed**
  ไม่ใช่ข้ามการเช็ค (`github-webhook.controller.ts:51-53`)

**3.4 ปลอม "ตั๋ว deploy" (HMAC ticket)**
`ticket/ticket.service.ts:14-34` — HMAC-SHA256 + TTL 60s + `timingSafeEqual` (`:27`)

### ⚠️ ข้อสังเกต F-2 — ticket ไม่ได้ทำหน้าที่กันการปลอมจากภายนอก

`deploy-pipeline.service.ts:380-388`
```ts
const signed = this.ticket.sign({ request_id: requestId, account_id: app.accountId });
try { this.ticket.verify(signed); } catch (err) { ... return { decision:'BLOCK', reason:'ticket_rejected' }; }
```
**ตั๋วถูกเซ็นและ verify ในบรรทัดติดกัน ในฟังก์ชันเดียวกัน ในโปรเซสเดียวกัน** — ไม่มี
attacker-controlled input ไหลเข้า `verify()` เลย (grep ทั้ง repo: ผู้เรียก `ticket.` มีแค่จุดนี้)

**ผลต่อการวิเคราะห์:**
- **ปลอมตั๋วไม่ได้ เพราะไม่มีที่ให้ยัดตั๋วเข้าไป** ไม่ใช่เพราะ crypto แข็งแรง
- มันคือ **structural fail-closed control**: ถ้าโค้ดในอนาคตแยก build/run ออกไปคนละโปรเซส
  หรือมี code path ใหม่ที่เรียก `runContainer` โดยไม่ผ่าน `runPipeline` ตั๋วจะกลายเป็นด่านจริง
- ตอนนี้ **มี code path แบบนั้นแล้ว 1 จุด**: `runRollback` เรียก `runContainer`
  ที่ `deploy-pipeline.service.ts:245` **โดยไม่ sign/verify ticket** → ขัดกับข้อความใน
  `CLAUDE.md` ที่ว่า "ก่อน `runContainer` ต้อง sign + verify HMAC ticket ผ่านก่อนเสมอ"

**ข้อเสนอ (ยังไม่ได้แก้ รอ user ตัดสินใจ):** เพิ่ม sign+verify ใน `runRollback` ก่อน `:245`
ให้ครบตามที่เอกสารเคลม หรือแก้ถ้อยคำใน CLAUDE.md ให้ตรงกับโค้ด — **ห้ามเคลมในเล่มว่า
"ทุกการเรียก runContainer มี ticket"** จนกว่าจะแก้

**ประเด็นความปลอดภัยของ `TicketService` เอง (ยังไม่เป็นปัญหาตอนนี้)**
`ticket/ticket.service.ts:4` — `process.env.GATEKEEPER_TICKET_SECRET || 'dev-secret-change-me'`
มี fallback ที่เดาได้ (ต่างจาก `ChallengeService` ที่ fail-closed) ตรวจแล้วว่า
`deployments/host/.env` **มีคีย์ `GATEKEEPER_TICKET_SECRET` ประกาศอยู่** (ไม่เปิดค่า)
แต่ถ้าวันหนึ่ง ticket กลายเป็นด่านจริง fallback นี้จะกลายเป็นช่องโหว่ทันที → ควรทำให้ fail-closed
แบบเดียวกับ `challenge.service.ts:28`

---

## 4. Scenario 4 — Replay request (ยิง request เดิมซ้ำ)

### [มีช่องโหว่] — ระดับกลาง: webhook ไม่มีกลไกกัน replay

**สิ่งที่ตรวจแล้วว่า "ไม่มี" ในโค้ด** (`webhook/github-webhook.service.ts:29-95` ทั้งฟังก์ชัน,
`webhook/providers.ts:67-87`):
- ❌ ไม่มีการอ่าน/เก็บ `X-GitHub-Delivery` (หรือ `X-Request-UUID` ของ Bitbucket) → ไม่มี dedup
- ❌ ไม่มีการเช็ค timestamp / อายุของ payload
- ❌ ไม่มีการจำ commit SHA ล่าสุดเพื่อกันซ้ำ (`parseWebhook` ไม่ได้เก็บ `after` ไปใช้เลย —
  `providers.ts:52-57` ดึงแค่ `repoFullName`/`ref`/`deleted`)
- ❌ signature ครอบแค่ body → **body เดิม = signature เดิมใช้ได้ตลอดไป** จนกว่าจะหมุน secret

**ผลกระทบจริง (ประเมินแบบระมัดระวัง):**
- ผู้ที่ **ดักจับ webhook request ได้ 1 ครั้ง** (เช่น เห็น log ฝั่ง proxy/CI ที่บันทึก body+header)
  ยิงซ้ำได้ไม่จำกัด → บังคับให้ระบบ clone + scan + build + deploy ใหม่ทุกครั้ง
- **ไม่ใช่การข้ามด่านสแกน**: replay ทำให้ pipeline วิ่งใหม่ทั้งชุด (clone HEAD ปัจจุบันของ branch
  แล้วสแกนใหม่) — ผลลัพธ์ยังต้องผ่าน `security_scan` เหมือนเดิม
- ผลกระทบหลักคือ **resource exhaustion / unwanted redeploy**: build ใช้ CPU+RAM+disk เต็มที่
  บนเครื่อง 1 CPU / 2 GB (ตัวเลขเครื่องตาม `THREE_TIER_REVIEW.md` §4)
- **ตัวลดความรุนแรงที่มีจริง**: `acquireLock` ทำให้ยิงซ้อนกันไม่ได้ ตอบ `deploy_already_in_progress`
  (`deploy-pipeline.service.ts:315-321`) → ทำได้แค่ทีละรอบเรียงกัน ไม่ใช่ขนานไม่จำกัด
  และ nginx มี `limit_req 10r/s` + `limit_conn 20` (ตาม `THREE_TIER_REVIEW.md` §3)

**ระดับความเสี่ยง:** ต่ำ-กลาง — ต้องได้ signature ที่ถูกต้องมาก่อน (ซึ่งต้องรั่วจากที่อื่น)
เทียบเคียง **CWE-294 (Authentication Bypass by Capture-replay)**

**ทางแก้ที่ตรงจุดที่สุด:** เก็บ delivery id ที่เคยเห็นใน Postgres (มี 2 instance ต้อง shared state —
แพทเทิร์นเดียวกับ `otp_attempts` ที่ระบุใน `THREE_TIER_REVIEW.md` §4) แล้วปฏิเสธ id ซ้ำ

### ประเด็น replay อื่นๆ ที่ตรวจแล้ว

| จุด | ผล | อ้างอิง |
|---|---|---|
| challenge cookie | replay ได้ภายใน TTL 1 ชม. — **โดยเจตนา** (เป็น bot speed-bump ไม่ใช่ auth) | `challenge/challenge.service.ts:5,13-18` |
| session cookie / API key | replay ได้ตามนิยามของ bearer token; จำกัดด้วย idle timeout 15 นาที | `account/accounts.service.ts:38-48` |
| deploy ticket | TTL 60s (`ticket.service.ts:14`) แต่ไม่มีผลจริง เพราะไม่มี input ภายนอก (ดู F-2) | `ticket.service.ts:32` |
| OTP | ใช้แล้วมี cooldown 60s + เพดาน attempt ใน DB | `account/accounts.service.ts:129,133,164` |

**⚠️ [ไม่แน่ใจ]** — ผมยืนยันไม่ได้จากโค้ดว่า nginx จะ rate-limit webhook replay ได้จริงแค่ไหน
เพราะขึ้นกับ `limit_req` zone key และ IP ต้นทางของ provider ต้องดู config จริง +
ยิงทดสอบถึงจะรู้ (ทำไม่ได้ตามข้อกำหนด)

---

## 5. Scenario 5 — Modified decision (แก้ผล BLOCK เป็น ALLOW)

### [กันได้] — decision ไม่มี input path จากภายนอกเลย

**5.1 decision คำนวณจาก findings ล้วนๆ ในโปรเซส**
`decision/risk-engine.service.ts:17-29`
```ts
const score = findings.reduce((sum, f) => sum + (SEVERITY_SCORE[f.severity] ?? 0), 0);
const hasCritical = findings.some((f) => f.severity === 'CRITICAL');
if (hasCritical || score >= BLOCK_THRESHOLD) decision = 'BLOCK';
else if (score >= QUARANTINE_THRESHOLD) decision = 'QUARANTINE';
```
- `findings` มาจาก `scanner.scanText()` เท่านั้น (`deploy-pipeline.service.ts:335-337`)
- `evaluate()` ไม่รับ request/DTO/env ใดเข้ามา — ไม่มีทางแทรกค่า
- น้ำหนัก 5/20/40/100 และ threshold 100/50 เป็น **ค่าคงที่ compile-time**
  (`risk-engine.service.ts:4-12`) ไม่ใช่ env ที่แก้ตอน runtime ได้

**5.2 ผลตัดสินไหลตรงเข้า control flow ไม่ผ่านตัวกลางที่เขียนได้**
`deploy-pipeline.service.ts:350` — `if (result.decision === 'ALLOW')` ใช้ตัวแปร local
ที่เพิ่งได้จาก `evaluate()` บรรทัด `:339` ไม่ได้อ่านซ้ำจาก store/DB/cache
→ ต่อให้แก้ไฟล์ store ระหว่างนั้นก็ไม่เปลี่ยนผล

**5.3 client เขียนสถานะ pipeline ไม่ได้**
`app.pipelineStatus` / `app.pipelineStages` เขียนโดย `persistStage()` ฝั่ง server เท่านั้น
(`deploy-pipeline.service.ts:331,351,445` ฯลฯ) และไม่มีใน DTO ใดๆ + ถูก `whitelist:true` ตัดทิ้ง
(`main.ts:26`) → PATCH `/apps/:id` ยัด `pipelineStatus:'deployed'` ไม่มีผล

**5.4 artifact ที่ถูกปัดตกถูกกักจริง ไม่ได้แค่ทำเครื่องหมาย**
`deploy-pipeline.service.ts:446` ย้ายไป `data/git-quarantine/<appId>-<requestId>`
และไม่มี endpoint ใดใน repo ที่อ่าน/deploy จาก quarantine dir (grep แล้วไม่พบ)

**5.5 audit ของทุก decision ถูกเขียนทันทีที่ตัดสิน** — `:448,455` (BLOCK/QUARANTINE),
`:381-386` (ticket), `webhook 'bad_signature'` ที่ `github-webhook.service.ts:66`

### ⚠️ ข้อสังเกต F-3 — audit log ไม่มี integrity protection

`audit/audit.service.ts:29-32` เป็น `fs.appendFileSync` ลง JSON Lines ธรรมดา
- ❌ ไม่มี hash chain / HMAC ต่อบรรทัด / WORM
- ใครที่ได้สิทธิ์เขียนไฟล์บน host แก้ประวัติ decision ย้อนหลังได้แบบไม่มีร่องรอย

**ประเมิน: ไม่ใช่ช่องโหว่ remote** (ต้องมีสิทธิ์บน host อยู่แล้ว ซึ่งจบเกมไปนานแล้ว) แต่ควรระบุ
เป็น **ข้อจำกัด** ในบทที่ 5 — โดยเฉพาะถ้าจะเคลมว่า audit log ใช้เป็นหลักฐานเชิงนิติวิทยาศาสตร์ได้

---

## 6. Scenario 6 — Direct container invocation (เรียก container ตรงข้ามระบบ)

### [กันได้] — กัน 4 ชั้นซ้อนกัน

**6.1 container ผู้ใช้ไม่ publish port ออกมาเลย**
ตรวจทั้ง `deploy/docker-runtime.service.ts` แล้ว **ไม่มี `PortBindings` และไม่มี `ExposedPorts`
แม้แต่จุดเดียว** — มีแต่ `NetworkMode` (`:789` แอป, `:934` addon, `:1069` managed DB)
→ ไม่มี port ของ tenant โผล่บน host ให้ยิงตรง (ยืนยันตรงกับ `THREE_TIER_REVIEW.md` §4)

**6.2 ทางเข้าเดียวคือ proxy ของ backend ที่ resolve container IP เอง**
- `live/live.controller.ts:100-113` — หา IP จากชื่อ `gatekeeper-app-<id>` แล้ว proxy
- custom domain: `domain/domain-proxy.controller.ts:33-54` — หา app จาก **Host header**
  ที่ตรงกับ custom domain ที่ลงทะเบียน (`:35`) ไม่งั้น 404
- client ระบุ target/IP/port เองไม่ได้ — `port` มาจาก `resolveServePort(app)` ที่อ่านจาก store
  (`live.controller.ts:98`) ไม่ใช่จาก query/header

**6.3 network segmentation ต่อ tenant**
`docker-runtime.service.ts:302-307,336-351` — `gatekeeper-tenant-<accountId>` แยกต่อ user
→ container ของคนละ account ยิงหากันตรงๆ ไม่ได้ที่ระดับ network
(**ภายใน account เดียวกัน container เห็นกันได้** — เป็น design ที่ตั้งใจ ให้แอปคุย addon ของตัวเอง)

**6.4 สั่ง Docker ตรงไม่ได้**
- backend ไม่แตะ `docker.sock` — คุยผ่าน docker-socket-proxy
- proxy publish **`127.0.0.1:2375` เท่านั้น** (`deployments/docker/docker-compose.yml:64-65`)
  → tenant container ยิงผ่าน bridge gateway IP ไม่ถึง
- `EXEC=0` (`:42`) → **สั่ง `docker exec` เข้า container ไม่ได้แม้ผ่าน proxy**
  ปิดเพิ่ม: `SWARM/SYSTEM/SERVICES/TASKS/NODES/PLUGINS/COMMIT/CONFIGS/SESSION = 0` (`:48-58`)
- backend เองก็ bind loopback (`main.ts:44`) ตามกฎใน `CLAUDE.md`

**6.5 container hardening ถ้าหลุดเข้าไปได้จริง**
`docker-runtime.service.ts:775-790` — `no-new-privileges`, `CapDrop:['ALL']`, `PidsLimit`,
`ReadonlyRootfs`+`Tmpfs` (`:787`) เท่ากันกับ addon (`:926-932`) และ managed DB (`:1063-1071`)

### ⚠️ ข้อสังเกตที่ต้องเขียนตามจริง
- **`/live/<id>` และ custom domain ไม่มี auth โดยเจตนา** (แอปลูกค้าเป็น public web)
  — "direct container invocation" ในความหมาย "เปิดเว็บของ tenant โดยไม่ล็อกอิน" **ทำได้และตั้งใจให้ทำได้**
  สิ่งที่กันคือการ **ข้าม proxy ไปคุยกับ container ตรงๆ** และการ **เข้าถึง container ของ account อื่น**
- `POST=1` และ `VOLUMES=1` ที่ proxy (`docker-compose.yml:41,47`) เป็น **tradeoff ที่รับไว้แล้ว**
  โดยมีคอมเมนต์อธิบายในไฟล์: ถ้า backend หลุด RCE จะสร้าง/ลบ container+volume ได้
  (แต่ยัง exec / แตะ host ไม่ได้) — ควรระบุตรงๆ ในเล่มว่าเป็นข้อจำกัดที่รู้ตัว
- **[ไม่แน่ใจ]** ผมยืนยันจากโค้ดไม่ได้ว่า firewall จริงบนเครื่อง (`build-egress-firewall.sh` +
  กฎ FORWARD/INPUT ที่ติดตั้งไว้) ยังโหลดอยู่ครบตอนนี้ไหม — ต้อง `iptables -L` บนเครื่องถึงจะรู้
  (ทำไม่ได้ด้วยสิทธิ์ claudebot) นี่คือชั้นที่กัน tenant → host โดยตรง

---

## 7. สรุปสิ่งที่ค้นพบ (สำหรับบทที่ 4-5 ของเล่ม)

### ช่องโหว่
| id | เรื่อง | ระดับ | ที่ | สถานะ |
|---|---|---|---|---|
| V-1 | Webhook replay — ไม่มี delivery-id dedup / timestamp check (CWE-294) | ต่ำ-กลาง | `webhook/github-webhook.service.ts:29-95`, `webhook/providers.ts:67-87` | ยังไม่แก้ |

### ข้อสังเกตเชิงออกแบบ (ไม่ใช่ช่องโหว่ แต่ห้ามเคลมเกินจริงในเล่ม)
| id | เรื่อง | ที่ |
|---|---|---|
| F-1 | rollback deploy image เดิมโดยไม่รันสเตจสแกนใหม่ + แสดง stage 1-4 เป็น success ทั้งที่ไม่ได้รัน | `deploy-pipeline.service.ts:198,214-217` |
| F-2 | ticket ถูก sign+verify ในฟังก์ชันเดียวกัน = ไม่ใช่ด่านกันปลอมจากภายนอก; และ `runRollback` เรียก `runContainer` **โดยไม่มี ticket** ขัดกับข้อความใน CLAUDE.md; `TicketService` มี secret fallback ที่เดาได้ | `ticket/ticket.service.ts:4`, `deploy-pipeline.service.ts:245,380-388` |
| F-3 | audit log ไม่มี hash chain / integrity protection | `audit/audit.service.ts:29-32` |

### สิ่งที่ยืนยันไม่ได้ด้วย static analysis (ต้องยิงจริง — ไม่ได้ทำ)
1. rate limit ของ nginx ต้านการ replay ได้จริงแค่ไหน (ขึ้นกับ zone key + IP ต้นทาง)
2. สถานะ firewall rule ปัจจุบันบนเครื่อง (tenant → host)
3. พฤติกรรมจริงของ `timingSafeEqual` ตอนได้ signature ความยาวผิดปกติในทุก provider path
4. ว่า production ตั้ง `GATEKEEPER_TICKET_SECRET` เป็นค่าที่แข็งแรงจริง (ตรวจได้แค่ว่าคีย์ถูกประกาศ)

### ข้อเสนอเรียงตามความคุ้มค่า
1. **V-1** — เก็บ delivery id ใน Postgres (shared 2 instance) แล้วปฏิเสธ id ซ้ำ
2. **F-2** — ใส่ sign+verify ticket ใน `runRollback` ก่อน `:245` และทำ secret ให้ fail-closed
   เหมือน `challenge.service.ts:28`
3. **F-3** — ถ้าจะอ้าง audit log เป็นหลักฐานในเล่ม ควรเพิ่ม hash chain ต่อบรรทัด
