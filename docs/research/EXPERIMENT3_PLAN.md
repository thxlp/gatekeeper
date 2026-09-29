# EXPERIMENT3_PLAN.md — Performance Overhead ของด่านสแกน (ตรวจจากโค้ดจริง)

ปริญญานิพนธ์ **Gatekeeper** วิชา 1101911 — Experiment 3 (Performance)
คำถามวิจัย: **ด่าน security scan ทำให้ deploy ช้าลงกี่ %**
ตรวจเมื่อ **2026-09-18** กับ repo `/home/dup/gatekeeper` branch `fix/pentest-2026-09-06` (HEAD `d9a2cb4`)

> **วิธีการของเอกสารนี้:** อ่าน **source code + ไฟล์ข้อมูลที่ระบบเขียนไว้แล้ว** เท่านั้น
> **ไม่มีการ deploy, ไม่แก้โค้ด, ไม่รันสคริปต์ทดลอง, ไม่ยิง request ใดๆ** ตามที่สั่ง
> ทุกการเคลมอ้าง `path:line` จริง ข้อที่อ่านจากโค้ดไม่ได้ระบุว่า `[ไม่แน่ใจ]`

---

## 0. สรุปคำตอบ 4 ข้อ

| # | คำถาม | คำตอบสั้น |
|---|---|---|
| 1 | ระบบบันทึกเวลาแต่ละ stage ไหม | **บันทึกบางส่วน** — มี **timestamp ตอน stage เปลี่ยนสถานะ** (`PipelineStage.at`) เก็บใน `data/git-apps-store.json`; **ไม่มี field duration/ms ของ stage ที่ไหนเลย** |
| 2 | ดึงมาคำนวณ overhead ได้ไหม | **ได้ แต่เป็น "เวลาจบของแต่ละ stage" ไม่ใช่คู่ start/end** — pipeline เป็น sequential ล้วน จึงลบ timestamp ของ stage ติดกันเป็น duration ได้ (มีข้อจำกัด §2.3); ข้อจำกัดใหญ่คือ store เก็บ **แค่ deploy ล่าสุดของแต่ละ app** (n=6 ตอนนี้) |
| 3 | ถ้าจะบันทึกจริงต้องเพิ่มที่ไหน | 3 จุด: `PipelineStage` เพิ่ม `startedAt`/`durationMs` (`common/types.ts:43-48`), `persistStage()` (`deploy/deploy-pipeline.service.ts:113-123`), และ audit entry สรุป timing ตอนจบ pipeline (`:421-429`) — ดู §3 |
| 4 | วัด baseline (deploy ไม่รวม scan) อย่างไร | **ไม่ต้องปิดด่านสแกน** — เพราะ pipeline รันทีละ stage แบบ blocking, baseline = `total − scan` ได้ทางคณิตศาสตร์; + microbenchmark สแกนเนอร์ offline แบบ Experiment 1 เพื่อวัด scan cost ซ้ำหลายรอบโดยไม่แตะ production (§4) |

**ข่าวดี:** มีข้อมูลเวลาจริงของ production พอให้คำนวณ overhead ได้แล้ว **โดยไม่ต้องแก้โค้ดเลย**
**ข่าวร้าย:** sample เล็ก (n=6 จาก store) และ resolution เป็น "เวลาจบ stage" จึงควรเสริมด้วย §4

---

## 1. ระบบบันทึกเวลาของแต่ละ stage ไหม — บันทึกที่ไหน

### 1.1 ✅ Pipeline stages (แหล่งข้อมูลหลัก) — `PipelineStage.at`

โครงสร้างข้อมูล — `backend/src/common/types.ts:43-48`
```ts
export interface PipelineStage {
  key: PipelineStageKey;
  label: string;
  status: PipelineStageStatus;
  at?: string; // ISO timestamp ของครั้งล่าสุดที่ stage นี้เปลี่ยนสถานะ
}
```

คนเขียนค่านี้มีที่เดียว — `backend/src/deploy/deploy-pipeline.service.ts:113-123`
```ts
persistStage(app: GitApp, key: PipelineStageKey, status: PipelineStageStatus): void {
  if (!this.gitAppStore.findById(app.id)) return;
  const stages = (app.pipelineStages?.length ? app.pipelineStages : initialPipelineStages()).map((s) =>
    s.key === key ? { ...s, status, at: new Date().toISOString() } : s,
  );
  ...
  this.gitAppStore.save(app);
}
```

- 5 stage ตาม `backend/src/common/pipeline.util.ts:5-11` — `payload_verification`, `repo_cloning`,
  `security_scan`, `app_build`, `production_deploy`
- **ที่เก็บ:** ไฟล์ JSON `data/git-apps-store.json` (field `pipelineStages` ต่อ app —
  `backend/src/common/types.ts:180`) ผ่าน `apps/git-app.store.ts` — **ไม่ใช่ database**
- **ไม่ใช่ audit log** และ **ไม่ใช่ Postgres**

### 1.2 ❌ ไม่มี field duration ใดๆ ในฝั่ง pipeline

ค้นทั้ง `backend/src` ด้วย `durationMs|elapsed|hrtime|startedAt|finishedAt|Date.now()`:
มี `durationMs` อยู่ที่ **SQL console เท่านั้น** (`backend/src/database/db-query.service.ts:34`,
`:79`, `:84` — `const started = Date.now()` … `outcome.durationMs = Date.now() - started`)
ซึ่ง **ไม่เกี่ยวกับ deploy pipeline เลย** ส่วน `Date.now()` ที่เหลือใช้ทำ TTL/timeout/cache
(`ticket/ticket.service.ts:15`, `deploy/docker-runtime.service.ts:968`, `:1209` ฯลฯ) ไม่ใช่การวัดเวลา

→ **สรุป: ไม่มีที่ใดในระบบวัด "ระยะเวลา" ของ stage ไว้เลย มีแต่ "เวลาที่เกิดเหตุการณ์"**

### 1.3 ⚠️ Audit log — มี `ts` แต่ **ไม่มีแถวต่อ stage ตอนสำเร็จ**

`backend/src/audit/audit.service.ts:29-32` เขียน `ts` ให้ทุกแถว (`data/audit.log`, JSON line)
แต่ `runPipeline` เรียก `audit.append()` เฉพาะกรณีต่อไปนี้:

| จุดเรียก | path:line | ได้ timestamp ของ |
|---|---|---|
| `stage:'decision'` ตอน ALLOW | `deploy/deploy-pipeline.service.ts:421-429` | **จบ pipeline ทั้งหมด** (หลัง promote) |
| `stage:'decision'` ตอน QUARANTINE / BLOCK | `:448`, `:455` | จบตอนสแกนไม่ผ่าน |
| `stage:'app_build'` BLOCK | `:362`, `:371` | build ล้ม |
| `stage:'deploy'` BLOCK | `:386`, `:393` | ticket/container ล้ม |
| `stage:'fatal'` BLOCK | `:460` | exception |

→ **deploy ที่สำเร็จปกติจะมี audit แถวเดียวคือ `decision:ALLOW`** ไม่มีแถว "scan เริ่ม/scan จบ"
ดังนั้น **audit log เดี่ยวๆ แยก scan ออกจาก build ไม่ได้**

### 1.4 ✅ Usage log — มี timestamp "จบสแกน" ของ deploy ย้อนหลังทุกครั้ง (แหล่งข้อมูลที่ใช้ได้จริง)

`deploy/deploy-pipeline.service.ts:341-348` เรียก `recordUsage()` **ทันทีหลัง risk engine ตัดสิน
และก่อนเข้า stage build**:
```ts
const result = this.riskEngine.evaluate(findings);
this.usageCollector.recordUsage({ requestId, accountId: app.accountId, appId: app.id, ... });
```
`entitlement/usage-collector.service.ts:29-32` เขียน `{ts, requestId, ...}` ต่อบรรทัดลง
`data/usage.jsonl`

**นี่คือของสำคัญ:** `usage.jsonl.ts` ≈ **เวลาจบ security_scan** และ `audit.log` แถว
`decision:ALLOW` `.ts` ≈ **เวลาจบ production_deploy** และ **สองแหล่งนี้ join กันได้ด้วย `requestId`
(เป็นตัวเดียวกัน)** → ได้ `build + deploy` ของ deploy ย้อนหลังทุกครั้งที่ ALLOW

ตรวจกับข้อมูลจริงบนเครื่อง (อ่านอย่างเดียว): join ได้ **48 deploy** — `build+deploy`
min 1.57 s / median 4.83 s / max 82.13 s

### 1.5 ❌ ไม่มีเวลา "เริ่ม" pipeline ใน log — เพราะ requestId ไม่ตรงกัน (บั๊กเล็กที่มีผลกับการทดลอง)

`apps/apps.service.ts:373-383` — แถว audit ตอนรับคำขอ deploy **สร้าง uuid ใหม่แยกจาก
requestId ของ pipeline**:
```ts
const requestId = uuidv4();            // :373  ← ตัวที่ส่งเข้า runPipeline (:390)
...
this.audit.append({
  requestId: uuidv4(),                 // :378  ← uuid คนละตัว! join กลับไม่ได้
  stage: 'gitapp:manual-deploy', ...
});
```
ยืนยันกับข้อมูลจริง: แถว `gitapp:manual-deploy` มี requestId ที่ไม่ปรากฏใน `decision` เลย

→ **เวลา "ผู้ใช้กดปุ่ม deploy" กับ pipeline ของมัน ผูกกันไม่ได้จาก log** (ดูข้อเสนอ §3.4 — แก้ 1 บรรทัด)

---

## 2. มีเวลาเริ่ม-จบของแต่ละ stage ให้คำนวณ overhead ได้ไหม

### 2.1 ได้ — ด้วยการลบ timestamp ของ stage ที่ติดกัน (pipeline เป็น sequential ล้วน)

`runPipeline` (`deploy/deploy-pipeline.service.ts:307-473`) เรียกทุก stage แบบ `await` ต่อกัน
ไม่มี `Promise.all` / งาน background คู่ขนานใน path นี้เลย — ลำดับคือ
`repo_cloning` (`:324-328`) → `security_scan` (`:330-351`) → `app_build` (`:353-375`) →
`production_deploy` (`:377-419`)

แต่ `persistStage` เขียนทับ field `at` เดิมของ stage นั้น (`:117`) → เก็บได้แค่ **status ล่าสุด**
พอ deploy จบ ทุก stage เป็น `success` ดังนั้น `at` ที่เหลืออยู่ = **เวลาที่ stage นั้นจบ**

```
scan duration      ≈ security_scan.at     − repo_cloning.at
build duration     ≈ app_build.at         − security_scan.at
deploy duration    ≈ production_deploy.at − app_build.at
total (หลังได้ source) = production_deploy.at − repo_cloning.at
overhead ของด่านสแกน  = scanΔ / (totalΔ − scanΔ) × 100 %   (เทียบกับ baseline ที่ไม่มีสแกน)
```

### 2.2 ข้อมูลจริงที่มีอยู่แล้ว (อ่านจาก `data/git-apps-store.json` — ไม่ได้แก้ไข)

n=6 (deploy ล่าสุดของแต่ละ app) หน่วยวินาที:

| app | source | clone/extract→scan จบ (scanΔ) | buildΔ | deployΔ | totalΔ | scan เป็น % ของ total |
|---|---|---|---|---|---|---|
| `gitapp_22ecc2af8631` | manual | 0.004 | 0.697 | 1.343 | 2.044 | 0.20 % |
| `gitapp_2c087f3e583e` | manual | 0.018 | 2.291 | 1.510 | 3.801 | 0.47 % |
| `gitapp_47015d299e38` | git | 0.003 | 6.399 | 1.506 | 7.908 | 0.04 % |
| `gitapp_9c1b05a9d134` | git | 0.013 | 2.053 | 1.724 | 3.790 | 0.34 % |
| `gitapp_6e1a27da603b` | manual | 0.106 | 7.533 | 1.439 | 9.078 | 1.17 % |
| `gitapp_712ff31a5da5` | manual | 0.146 | 7.307 | 1.314 | 8.767 | 1.67 % |

*(ตัวเลขคำนวณจาก `at` ที่มีอยู่แล้วในไฟล์ — ยังไม่ใช่ผลการทดลองที่รายงานในเล่ม เป็นแค่
หลักฐานว่า "ข้อมูลเวลามีอยู่และคำนวณได้")*

→ ทิศทางที่เห็น: **ด่านสแกนกินเวลาระดับ ~4–150 ms ขณะที่ build กินหลายวินาที** overhead ต่ำกว่า 2 %
ในทุก sample แต่ **ยังไม่พอเป็นข้อสรุปในเล่ม** เพราะ n=6, ขนาด repo ไม่ได้ควบคุม, และ
ไม่มีการทำซ้ำ (no repetition → ไม่มี variance/CI)

### 2.3 ข้อจำกัดที่ต้องเขียนกำกับไว้เสมอ (เพื่อไม่ให้เคลมเกินข้อมูล)

1. **`at` = เวลาจบ ไม่ใช่คู่ start/end** — ค่าที่ได้คือช่วงระหว่าง "จบ stage ก่อน" ถึง "จบ stage นี้"
   ซึ่งรวม overhead ของ `persistStage('running')` เองด้วย (1 ครั้ง save ไฟล์ store; `:122`)
2. **scanΔ ไม่ใช่เวลา regex ล้วน** — ในช่วงนั้นมี **การเดินไฟล์ + อ่านไฟล์ทั้ง staging**
   (`automator.listTextFiles(stagingDir)` `:332`, นิยามที่ `webhook/git-automator.service.ts:150-178`
   อ่านทุกไฟล์เข้า memory) + `scanText` ต่อไฟล์ (`:334-336`) + `scanDependencies` (`:337`)
   + `riskEngine.evaluate` (`:339`) + `recordUsage` append ไฟล์ (`:341`)
   → ถ้าจะเคลมว่า "ด่านสแกนช้าลง X %" ต้องนิยามว่า **X นับ I/O ของการอ่านไฟล์รวมอยู่ด้วย** (แนะนำให้นับ — เป็นต้นทุนที่เกิดเพราะมีด่านสแกนจริง)
3. **store เก็บแค่รอบล่าสุด** — `resetStages()` (`:125-127`) ทับทุกครั้งที่ deploy ใหม่
   (`apps/apps.service.ts:302`, `:374`, `webhook/github-webhook.service.ts:70`) →
   **ไม่มี time-series ย้อนหลังของ stage** ได้แค่ n = จำนวน app
4. **`payload_verification` ไม่ใช้วัดเวลา** — ถูก set `success` ก่อนเข้า pipeline
   (`apps/apps.service.ts:303`, `:375`, `webhook/github-webhook.service.ts:71`) จึงเป็นจุดอ้างอิง
   ของ "เวลาที่รับคำขอ" ได้คร่าวๆ เท่านั้น
5. **`repo_cloning` ปนสองอย่างที่ต่างกันมาก** — git clone (network) กับแตก zip (CPU/disk)
   `deploy/deploy-pipeline.service.ts:325` `acquireSource()` → เวลาช่วงนี้ห้ามเอามารวมเฉลี่ยข้ามชนิด
6. **SCA เป็น stub** (`scanner/dependency-audit.service.ts:21-38` ตรวจแค่ว่ามีไฟล์ manifest ไหม)
   → ต้นทุนเวลาของ SCA ที่วัดได้ ≈ 0 และ **ห้ามเคลมว่านี่คือต้นทุนของ dependency scanning จริง**
   (กฎใน `CLAUDE.md` + `NOTES_PENTEST.md`)

---

## 3. ถ้าจะบันทึกเวลาจริง ต้องเพิ่มที่ไหน (ยังไม่แก้ — ข้อเสนอเท่านั้น)

### 3.1 เพิ่ม field ใน `PipelineStage` — `backend/src/common/types.ts:43-48`
เพิ่ม `startedAt?: string` และ `durationMs?: number` (optional ทั้งคู่ — entry เก่าใน
`git-apps-store.json` ไม่มี field นี้ ต้องอ่านแบบ backward-compatible เหมือน `releases`/`sourceType`)

### 3.2 ให้ `persistStage()` คำนวณ duration เอง — `deploy/deploy-pipeline.service.ts:113-123`
ตอน `status === 'running'` → เขียน `startedAt`; ตอน `'success'`/`'failed'` → `durationMs =
Date.parse(at) − Date.parse(startedAt)` ข้อดีคือ **แก้ที่เดียวได้ทั้ง webhook และ zip-upload**
(pipeline เดียวตาม `CLAUDE.md`) และไม่ต้องแตะ call site ทั้ง 14 จุด
*ข้อควรระวัง:* ฟังก์ชันนี้ `return` ทันทีถ้า app ไม่อยู่ใน store (`:114`) — app แบบ static/ops-managed
จะไม่มี timing ตามเดิม

### 3.3 เพิ่ม timing สรุปลง audit ตอนจบ pipeline — `deploy/deploy-pipeline.service.ts:421-429`
ใส่ใน `deployResult` (เป็น `object` อยู่แล้ว — `common/types.ts:199` ไม่ต้องแก้ type):
`deployResult: { deployedPath, port, timings: { scanMs, buildMs, deployMs, totalMs, filesScanned } }`
→ ได้ **time-series ย้อนหลังถาวรใน append-only log** แก้ข้อจำกัด §2.3(3) ได้ตรงจุด
เป็นวิธีที่คุ้มที่สุดสำหรับงานวิจัย (audit.log ไม่ถูกทับ ต่างจาก store)

### 3.4 แก้ requestId ที่ไม่ตรงกัน — `apps/apps.service.ts:378`
เปลี่ยน `requestId: uuidv4()` เป็น `requestId` (ตัวจาก `:373`) → join "กดปุ่ม → จบ deploy" ได้
เป็นการแก้ 1 บรรทัด และทำให้ audit trail ของ deploy หนึ่งครั้งเป็นก้อนเดียวกันจริง
*(ผลข้างเคียง: ไม่มี — ไม่มีโค้ดไหน query ด้วย requestId ของแถวนี้)*

### 3.5 (ทางเลือก) นับจำนวนไฟล์/ไบต์ที่สแกน
`automator.listTextFiles()` (`webhook/git-automator.service.ts:150-178`) คืน array อยู่แล้ว —
`files.length` และผลรวม `content.length` เอามาใส่ `timings` ได้เลย ไม่ต้องเดินไฟล์ซ้ำ
**จำเป็นสำหรับเล่ม** เพราะ overhead ของสแกนขึ้นกับขนาด input ถ้าไม่มีตัวเลขนี้ กราฟจะอธิบายไม่ได้

---

## 4. วิธีวัด baseline (เวลา deploy ไม่รวม scan) — เสนอ 3 ทาง

### ทาง A (แนะนำเป็นหลัก) — Baseline เชิงคำนวณจาก stage timestamp: `baseline = total − scan`

**เหตุผลที่ถูกต้องเชิงวิธีวิจัย:** stage รันแบบ blocking ต่อกันใน `runPipeline` ไม่มีงานคู่ขนาน
(`deploy/deploy-pipeline.service.ts:324-419`) → การถอดด่านสแกนออกจะลดเวลาลงเท่ากับ scanΔ พอดี
จึง **ไม่จำเป็น (และไม่ควร) ปิดด่านสแกนบน production เพื่อวัด baseline**

- ตัววัด: `overhead % = scanΔ / (totalΔ − scanΔ) × 100`
- ข้อมูล: ใช้ §2.2 ได้เลยตอนนี้ (n=6) และเพิ่ม n ได้ด้วยการ deploy แอปทดสอบซ้ำหลายรอบ
  **แต่ต้องดึงค่าออกทันทีหลังแต่ละรอบ** เพราะรอบถัดไปทับ (§2.3-3) — หรือทำ §3.3 ก่อนแล้วเก็บจาก audit
- รายงานคู่กับ **จำนวนไฟล์/ขนาด repo** ของแต่ละรอบ (ดู §3.5) ไม่งั้นตัวเลขเทียบข้ามแอปไม่ได้

### ทาง B (เสริม, ทำได้เลยวันนี้ ไม่แตะ production) — microbenchmark สแกนเนอร์ offline

ทำซ้ำแพทเทิร์นของ Experiment 1 ที่มีอยู่แล้ว: `tests/detection-experiment/run-detection-test.ts`
เรียก `ScannerService` ตัวจริงตรงๆ (`:56-58` ใช้ `require()` + ตั้ง `GATEKEEPER_ROOT` ก่อนโหลด
เพราะ `common/paths.ts` คำนวณตอน module load — และ **ห้าม default-import CJS** ตาม `CLAUDE.md`)

- สคริปต์ใหม่ `tests/perf-experiment/run-scan-benchmark.ts`: วน `listTextFiles` + `scanText`
  บน repo ตัวอย่างหลายขนาด × N รอบ (เช่น N=30 + warmup 5) วัดด้วย `process.hrtime.bigint()`
  รายงาน median/p95 ต่อขนาด input
- ได้สิ่งที่ทาง A ให้ไม่ได้: **variance, จำนวนรอบที่ควบคุมได้, ความสัมพันธ์ scan time vs. ขนาด input**
  โดยไม่รบกวนระบบจริงและไม่ต้องใช้ docker (ซึ่ง claudebot รันไม่ได้อยู่แล้วตาม `CLAUDE.md`)
- ขอบเขต: **ห้ามเรียก `runPipeline`/docker/store/ticket** — จำกัดแบบเดียวกับ Experiment 1

### ทาง C (สำหรับตัวเลขในเล่มที่หนักแน่นที่สุด) — ทำ §3.3 ก่อน แล้วเก็บ n≥30 จาก audit.log
เมื่อมี `timings` ใน audit แล้ว deploy แอปชุดทดสอบ (เล็ก/กลาง/ใหญ่ × ซ้ำ 10 รอบ) จะได้
time-series ถาวรที่ไม่ถูกทับ พร้อมคำนวณ overhead % แบบมี CI ได้ **ต้องรอ user deploy จริง**
(build ต้องผ่าน `deployments/host/deploy.sh` โดย user `dup` เท่านั้น)

### สิ่งที่ **ไม่ควร** ทำเป็น baseline
- ❌ ปิด/บายพาสด่านสแกนบน production เพื่อจับเวลา — ทำลาย fail-closed boundary และไม่จำเป็น (ทาง A)
- ❌ ใช้ `build+deploy` จาก join `usage.jsonl` × `audit.log` (§1.4, n=48) เป็น "baseline"
  **ตรงๆ** — ช่วงนั้นไม่รวม clone/extract และไม่รวม scan จึงเป็น baseline ของ *ส่วนหลังสแกน*
  เท่านั้น ใช้เป็น **หลักฐานเสริมว่า build ครองเวลาส่วนใหญ่** ได้ (median 4.83 s เทียบ scan ~ms) แต่ห้ามใช้เป็นตัวหารของ overhead %

---

## 5. Checklist ก่อนลงมือ (ลำดับที่แนะนำ)

1. [x] ทาง B — `tests/perf-experiment/run-scan-benchmark.ts` **เขียนแล้ว** (ไม่แตะ production)
   → รอ user `dup` รันตาม `tests/perf-experiment/README.md`; สคริปต์ทำ ทาง B + เทียบ baseline
   จาก log จริง (n=48) + คำนวณ overhead % ให้ในรอบเดียว
2. [ ] เสนอ user แก้ §3.1–3.3 + §3.4 (แก้โค้ด backend → ต้องให้ `dup` build/deploy เอง)
3. [ ] ทาง C — เก็บ n≥30 จาก audit.log หลัง deploy ชุดทดสอบ
4. [ ] เขียนผลเป็น `EXPERIMENT3_ANALYSIS.md` รูปแบบเดียวกับ `EXPERIMENT2_ANALYSIS.md`
5. [ ] ในเล่ม: ระบุชัดว่า overhead ที่วัดได้ **รวม I/O การอ่านไฟล์** และ **SCA ยังเป็น stub** (§2.3-2, §2.3-6)
