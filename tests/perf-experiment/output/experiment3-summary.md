# Experiment 3 — ผลการวัด (สร้างโดย run-scan-benchmark.ts)

> ไฟล์นี้ถูกเขียนใหม่ทุกครั้งที่รันสคริปต์ — อย่าแก้มือ

วัดเมื่อ **2026-09-18T06:49:18.491Z** บน linux x64 / node v24.18.0
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
| ไฟล์ในชุดข้อมูล | 152 ไฟล์ / 42487 bytes / 1534 บรรทัด |
| scanText ต่อไฟล์ (median ของ median) | 5.362 µs |
| scanText ต่อไฟล์ (p95) | 11.691 µs |
| scanText ทั้งชุด | 0.952 ms (p95 2.049 ms, CV 0.4547) |
| listTextFiles (เดินไฟล์ + อ่าน) | 4.155 ms (p95 10.283 ms) |
| **ต้นทุนด่านสแกนรวม** | **5.107 ms** |
| throughput (regex) | 42.548 MB/s |
| Pearson r (ขนาด vs เวลา) | 0.9304 (บรรทัด: 0.6626) |
| least squares | 9.6382 µs/KB + 2.9490 µs |

## เวลา median ต่อไฟล์ แยกตามกองข้อมูล

| category | ไฟล์ | median µs | p95 µs |
|---|---|---|---|
| clean | 20 | 5.607 | 8.143 |
| evasion | 22 | 5.231 | 7.468 |
| negative | 55 | 6.235 | 7.758 |
| positive | 55 | 4.843 | 6.729 |

> หมายเหตุการอ่านผล: `RegExp.test()` หยุดที่ match แรก (`scanner.service.ts:37-38`, `:50-51`)
> ไฟล์ที่ "สะอาด" จึงต้องถูกไล่ทุกกฎจนจบไฟล์ และมักช้ากว่าไฟล์ที่มี secret ชัดๆ —
> เวลาที่แย่ที่สุดของด่านสแกนคือตอนโค้ดไม่มีปัญหา ไม่ใช่ตอนเจอช่องโหว่

## เทียบกับเวลา build+deploy จริง (baseline)

แหล่งข้อมูล: data/usage.jsonl × data/audit.log (join requestId) — n = **48** deploy ที่ ALLOW

| เมตริก | ค่า |
|---|---|
| build+deploy median | 4.834 s |
| build+deploy min | 1.573 s |
| build+deploy p95 | 15.339 s |
| **overhead ของด่านสแกน (กรณีกลาง)** | **0.1056 %** |
| overhead กรณีแย่สุด (scan p95 / build+deploy เร็วสุด) | 0.7840 % |

นิยาม: `overhead % = ต้นทุนด่านสแกน (5.107 ms) ÷ เวลา build+deploy × 100`
ใช้ build+deploy เป็น baseline ได้เพราะทุก stage ใน `runPipeline` รันแบบ blocking ต่อกัน
ไม่มีงานคู่ขนาน (`backend/src/deploy/deploy-pipeline.service.ts:324-419`) — ถอดด่านสแกนออก
เวลาก็ลดลงเท่ากับต้นทุนของมันพอดี จึงไม่ต้องปิดด่านสแกนบน production เพื่อวัด

## ข้อจำกัดที่ต้องเขียนกำกับในเล่ม

1. **SCA ยังเป็น stub** — `scanDependencies()` ตรวจแค่ว่ามีไฟล์ manifest ไหม
   (`backend/src/scanner/dependency-audit.service.ts:21-38`) ตัวเลขนี้จึงไม่ใช่ต้นทุนของ
   dependency scanning จริง ถ้าผูก Trivy/OSV เข้ามาต้นทุนจะเปลี่ยนไปทั้งอันดับ
2. **ชุดข้อมูลไม่ใช่ repo จริง** — 152 ไฟล์เล็กที่ออกแบบมาวัด detection
   ตัวเลข "ต้นทุนรวม" จึงเป็นของ repo สังเคราะห์ขนาด 42487 bytes
   ให้ใช้ค่า µs/KB + throughput ในการประมาณ repo ขนาดอื่น
3. **baseline มาจาก log ของ production ที่ผ่านมา** ไม่ได้ควบคุมชนิด/ขนาดโปรเจกต์
   จึงกระจายตัวสูง (min 1.573 s ถึง p95 15.339 s)
   — รายงานเป็นช่วง ไม่ใช่ตัวเลขเดียว
4. เครื่องที่วัดเป็นเครื่องเดียวกับที่รัน production (2 GB RAM) — งานอื่นบนเครื่องรบกวนได้
   ดูคอลัมน์ `cv` ใน `experiment3-timing.csv` ประกอบเสมอ

