# Experiment 3 — วิธีรัน (Performance overhead ของด่านสแกน)

สคริปต์ `run-scan-benchmark.ts` วัดว่า **ด่าน `security_scan` กินเวลาเท่าไร** โดยเรียก
`ScannerService.scanText()` และ `GitAutomatorService.listTextFiles()` **ตัวจริง** จาก
`backend/src/` มาจับเวลากับชุดข้อมูล `tests/detection-dataset/` (152 ไฟล์) ที่มีอยู่แล้ว
แล้วเทียบกับเวลา `build + deploy` **จริง** ที่ระบบเคยเขียนไว้ใน log

ต่อยอดโครงจาก Experiment 1 (`tests/detection-experiment/run-detection-test.ts`) — รูปแบบ
การ `require` ข้าม project, การตั้ง `GATEKEEPER_ROOT`, การเขียน CSV ใช้แพทเทิร์นเดียวกัน

## คำสั่งที่ต้องให้ user `dup` รัน

รันจากโฟลเดอร์ `backend/` (เพื่อให้ resolve `ts-node` และ `node_modules` ได้):

```bash
cd /home/dup/gatekeeper/backend
node_modules/.bin/ts-node --project ../tests/perf-experiment/tsconfig.json \
  ../tests/perf-experiment/run-scan-benchmark.ts
```

- **ไม่ต้อง `sudo`**, **ไม่ต้อง `pnpm install`**, **ไม่ใช่ `deploy.sh`** — ไม่ build ไม่ deploy
  ไม่ restart service ใดๆ (เหมือน Experiment 1)
- ใช้เวลาไม่กี่วินาที กิน CPU 1 core — งานเป็น CPU-bound ล้วน ควรรัน **ตอนเครื่องว่าง**
  (เครื่องนี้ 2 GB RAM รัน production อยู่ — ถ้ารันตอน deploy กำลังวิ่ง ตัวเลขจะเพี้ยน)
- รันซ้ำได้ ไม่มี side effect นอกจากเขียนไฟล์ผลลง `tests/perf-experiment/output/`

ปรับพารามิเตอร์ได้ทาง env (ค่า default คือค่าที่ควรใช้รายงานในเล่ม):

| env | default | ความหมาย |
|---|---|---|
| `SCAN_BENCH_REPS` | 50 | รอบที่นำมาคิดสถิติ ต่อไฟล์ (152 × 50 = 7,600 ตัวอย่าง) |
| `SCAN_BENCH_WARMUP` | 5 | รอบอุ่นเครื่อง ไม่นับ (ให้ JIT / regex เข้าที่) |
| `SCAN_BENCH_IO_REPS` | 20 | รอบวัด `listTextFiles()` ทั้งชุด |
| `SCAN_BENCH_SCALE_MAX` | 64 | ทวีคูณสูงสุดของ input ในการทดสอบ scaling |
| `SCAN_BENCH_SCALE_REPS` | 20 | รอบวัดต่อจุดของ scaling |

## สิ่งที่สคริปต์ **ไม่** ทำ (ยืนยันได้จากตัวโค้ด)

- ไม่ `import`/เรียก `DeployPipelineService` / `runPipeline` — **ไม่ deploy อะไรเลย**
- ไม่แตะ docker, docker-socket-proxy (127.0.0.1:2375), Postgres, GitAppStore, ticket service
- **ไม่เขียน** ไฟล์ใดๆ ใน `data/` หรือ `configs/` — อ่าน `data/usage.jsonl` และ `data/audit.log`
  **อย่างเดียว** เพื่อดึงเวลา build+deploy ของ deploy ที่เคยเกิดขึ้นจริง
- ไม่เขียน `accountId` / `appId` ลงไฟล์ผลลัพธ์ (ตามกติกาเอกสารใน `docs/research/NOTES_PENTEST.md`);
  `request_id` ที่เขียนไว้เป็น uuid สุ่มที่ไม่ผูกกับตัวบุคคล
- ไม่วัด `scanDependencies()` เป็นเมตริกหลัก — SCA ยังเป็น stub
  (`backend/src/scanner/dependency-audit.service.ts:21-38`)

## วิธีวัด

1. **อ่านไฟล์ทั้งชุดเข้า memory ก่อน** แล้วจับเวลาเฉพาะ `scanText()` → แยก "ต้นทุน regex"
   ออกจาก "ต้นทุน I/O" ได้ชัด
2. **warmup 5 รอบ → วัด 50 รอบ** โดยวน **รอบเป็นวงนอก ไฟล์เป็นวงใน** เพื่อให้ผลของ GC และ
   ความถี่ CPU ที่แกว่งช้าๆ กระจายข้ามทุกไฟล์เท่ากัน ไม่ไปกองที่ไฟล์ใดไฟล์เดียว
3. จับเวลาด้วย `process.hrtime.bigint()` (ns) — ไม่ใช่ `Date.now()` (ละเอียดแค่ ms ใช้กับ µs ไม่ได้)
4. **วัด I/O แยก** ด้วย `listTextFiles()` ตัวจริง เพราะใน pipeline จริง stage `security_scan`
   รวมการเดินไฟล์ + อ่านทุกไฟล์เข้า memory ด้วย (`deploy/deploy-pipeline.service.ts:332`)
   → ต้นทุนด่านสแกน = `I/O + regex`
5. **scaling sweep**: เอาไฟล์ใหญ่สุดของกอง `clean` และ `positive` มาทำซ้ำเนื้อหา ×1…×64
   เพื่อกวาดขนาด input หลาย decade แล้วดูว่า µs/KB คงที่ไหม
6. **baseline** = `build + deploy` จริง จาก join `data/usage.jsonl` × `data/audit.log` ด้วย
   `requestId` (usage เขียนทันทีหลัง risk engine ตัดสิน = จบสแกน; audit `decision:ALLOW`
   เขียนหลัง deploy สำเร็จ) → ได้ n ≈ 48 deploy ย้อนหลัง
7. `overhead % = ต้นทุนด่านสแกน ÷ เวลา build+deploy × 100`
   ใช้ build+deploy เป็น baseline ได้เพราะทุก stage ใน `runPipeline` รันแบบ blocking ต่อกัน
   ไม่มีงานคู่ขนาน (`deploy/deploy-pipeline.service.ts:324-419`) → **ไม่ต้องปิดด่านสแกน
   บน production เพื่อวัด baseline** (เหตุผลเต็มอยู่ใน `docs/research/EXPERIMENT3_PLAN.md` §4)

## ผลลัพธ์

| ไฟล์ | เนื้อหา |
|---|---|
| `output/experiment3-timing.csv` | **รายไฟล์**: `bytes, lines, rules_hit, reps, median_us, p95_us, mean_us, stdev_us, variance_us2, cv, min_us, max_us, us_per_kb_median` |
| `output/experiment3-scaling.csv` | ขนาด input ×1…×64 ต่อไฟล์ต้นแบบ: `bytes, median_us, p95_us, us_per_kb_median` |
| `output/experiment3-baseline.csv` | build+deploy จริงรายครั้ง: `request_id, feature, scan_end_ts, deploy_end_ts, build_deploy_seconds` |
| `output/experiment3-summary.csv` | เมตริกรวมทั้งหมดแบบ `metric,value` (รวม `overhead_pct_*`, Pearson r, throughput, สเปกเครื่อง) |
| `output/experiment3-summary.md` | สรุปอ่านง่าย + ตารางแยกตาม category + ข้อจำกัดที่ต้องเขียนกำกับในเล่ม |

## ข้อควรรู้ตอนอ่านผล

- **`RegExp.test()` หยุดที่ match แรก** (`scanner.service.ts:37-38`, `:50-51`) → ไฟล์ที่
  **สะอาด** ต้องถูกไล่ทุกกฎจนจบไฟล์ และมัก **ช้ากว่า** ไฟล์ที่มี secret ชัดๆ
  กรณีแย่สุดของด่านสแกนคือตอนโค้ดไม่มีปัญหา ไม่ใช่ตอนเจอช่องโหว่ — ตาราง "แยกตาม category"
  ใน `experiment3-summary.md` มีไว้ให้เห็นข้อนี้
- **µs/KB ของไฟล์เล็กจะสูงผิดปกติ** เพราะมี fixed cost ต่อการเรียก (คอมไพล์ 11 regex ใหม่
  ทุกครั้งที่ `scanText` ถูกเรียก — `new RegExp(...)` ใน loop) ดูคอลัมน์ `fit_intercept_us`
  ใน summary ประกอบ; ค่าที่เอาไปประมาณ repo ใหญ่ควรใช้ **slope (µs/KB)** ไม่ใช่ค่าเฉลี่ยดิบ
- **`p95` ที่กระโดดเป็นหลัก ms ในบางแถวของ scaling** คือ GC pause ของ Node ไม่ใช่ต้นทุนของกฎ —
  รายงานคู่กับ median เสมอ และดู `cv` ว่าแถวนั้นผันผวนแค่ไหน
- **I/O จะเร็วเกินจริง** ถ้าชุดข้อมูลอยู่ใน page cache แล้ว (รันซ้ำติดๆ กัน) — ค่า I/O ที่ได้
  เป็น **ขอบล่าง** ของต้นทุนจริงตอน clone ใหม่สดๆ ให้เขียนกำกับไว้ในเล่ม

## สถานะ

สคริปต์ **ยังไม่ได้รันใน repo** — รอ user `dup` รันตามคำสั่งด้านบน (claudebot รัน toolchain
ใน repo ไม่ได้: ไฟล์ผลที่เขียนจะเป็นของ claudebot แล้ว `dup` จะเขียนทับไม่ได้ในรอบถัดไป —
ดูกฎเรื่อง ACL ใน `CLAUDE.md`)

ผ่านการตรวจแล้ว 2 อย่าง: type-check สะอาด (`tsc --noEmit`) และ smoke test ของ **สำเนา**
สคริปต์ที่รันนอก repo ด้วย reps ต่ำ (ผลเขียนลง /tmp ไม่แตะ repo) — flow ทั้งเส้นทำงาน
รวมถึงการ join baseline ได้ n=48 ตัวเลขจาก smoke test **ไม่ใช่ผลที่ใช้รายงาน** (reps ต่ำ)

แผนการทดลองฉบับเต็ม + ที่มาของ `path:line` ทุกจุด: [`EXPERIMENT3_PLAN.md`](../../docs/research/EXPERIMENT3_PLAN.md)
