# Experiment 3 — ผลการวัด (สร้างโดย run-scan-benchmark.ts)

> ไฟล์นี้ถูกเขียนใหม่ทุกครั้งที่รันสคริปต์ — อย่าแก้มือ

วัดเมื่อ **2026-10-08T11:10:26.895Z** บน linux x64 / node v24.18.0
CPU: 1 × DO-Premium-Intel

## วิธีวัด

- เรียก `ScannerService.scanText()` ตัวจริง (`backend/src/scanner/scanner.service.ts:33-63`) ต่อไฟล์
- warmup 5 รอบ แล้ววัด 50 รอบต่อไฟล์ (รวม 7600 ตัวอย่าง) วนรอบเป็นวงนอก
- จับเวลาด้วย `process.hrtime.bigint()` (ความละเอียดระดับ ns)
- วัด I/O ของด่านสแกนแยก: `GitAutomatorService.listTextFiles()` ตัวจริง (`backend/src/webhook/git-automator.service.ts:150-178`) 155 ไฟล์
- **ไม่แตะ production**: ไม่เรียก `runPipeline`, ไม่ใช้ docker/Postgres, ไม่ deploy; อ่าน `data/usage.jsonl` + `data/audit.log` อย่างเดียว

## ผลหลัก

| เมตริก | ค่า |
|---|---|
| ไฟล์ในชุดข้อมูล | 152 ไฟล์ / 42488 bytes / 1534 บรรทัด |
| scanText ต่อไฟล์ (median ของ median) | 7.175 µs |
| scanText ต่อไฟล์ (p95) | 14.347 µs |
| scanText ทั้งชุด | 1.231 ms (p95 2.878 ms, CV 0.5229) |
| listTextFiles (เดินไฟล์ + อ่าน) | 5.369 ms (p95 9.262 ms) |
| **ต้นทุนด่านสแกนรวม** | **6.600 ms** |
| throughput (regex) | 32.918 MB/s |
| Pearson r (ขนาด vs เวลา) | 0.9191 (บรรทัด: 0.6393) |
| least squares | 11.5100 µs/KB + 4.3479 µs |

## เวลา median ต่อไฟล์ แยกตามกองข้อมูล

| category | ไฟล์ | median µs | p95 µs |
|---|---|---|---|
| clean | 20 | 7.183 | 10.819 |
| evasion | 22 | 6.986 | 9.905 |
| negative | 55 | 8.360 | 10.140 |
| positive | 55 | 6.617 | 8.860 |

> หมายเหตุการอ่านผล: `RegExp.test()` หยุดที่ match แรก (`scanner.service.ts:37-38`, `:50-51`)
> ไฟล์ที่ "สะอาด" จึงต้องถูกไล่ทุกกฎจนจบไฟล์ และมักช้ากว่าไฟล์ที่มี secret ชัดๆ —
> เวลาที่แย่ที่สุดของด่านสแกนคือตอนโค้ดไม่มีปัญหา ไม่ใช่ตอนเจอช่องโหว่

## เทียบกับเวลา build+deploy จริง (baseline)

แหล่งข้อมูล: data/usage.jsonl × data/audit.log (join requestId) — n = **87** deploy ที่ ALLOW

| เมตริก | ค่า |
|---|---|
| build+deploy median | 6.942 s |
| build+deploy min | 1.573 s |
| build+deploy p95 | 48.104 s |
| **overhead ของด่านสแกน (กรณีกลาง)** | **0.0951 %** |
| overhead กรณีแย่สุด (scan p95 / build+deploy เร็วสุด) | 0.7718 % |

นิยาม: `overhead % = ต้นทุนด่านสแกน (6.600 ms) ÷ เวลา build+deploy × 100`
ใช้ build+deploy เป็น baseline ได้เพราะทุก stage ใน `runPipeline` รันแบบ blocking ต่อกัน
ไม่มีงานคู่ขนาน (`backend/src/deploy/deploy-pipeline.service.ts:324-419`) — ถอดด่านสแกนออก
เวลาก็ลดลงเท่ากับต้นทุนของมันพอดี จึงไม่ต้องปิดด่านสแกนบน production เพื่อวัด

## ข้อจำกัดที่ต้องเขียนกำกับในเล่ม

1. **SCA ยังเป็น stub** — `scanDependencies()` ตรวจแค่ว่ามีไฟล์ manifest ไหม
   (`backend/src/scanner/dependency-audit.service.ts:21-38`) ตัวเลขนี้จึงไม่ใช่ต้นทุนของ
   dependency scanning จริง ถ้าผูก Trivy/OSV เข้ามาต้นทุนจะเปลี่ยนไปทั้งอันดับ
2. **ชุดข้อมูลไม่ใช่ repo จริง** — 152 ไฟล์เล็กที่ออกแบบมาวัด detection
   ตัวเลข "ต้นทุนรวม" จึงเป็นของ repo สังเคราะห์ขนาด 42488 bytes
   ให้ใช้ค่า µs/KB + throughput ในการประมาณ repo ขนาดอื่น
3. **baseline มาจาก log ของ production ที่ผ่านมา** ไม่ได้ควบคุมชนิด/ขนาดโปรเจกต์
   จึงกระจายตัวสูง (min 1.573 s ถึง p95 48.104 s)
   — รายงานเป็นช่วง ไม่ใช่ตัวเลขเดียว
4. เครื่องที่วัดเป็นเครื่องเดียวกับที่รัน production (2 GB RAM) — งานอื่นบนเครื่องรบกวนได้
   ดูคอลัมน์ `cv` ใน `experiment3-timing.csv` ประกอบเสมอ

