# Experiment 1 — วิธีรัน

สคริปต์ `run-detection-test.ts` เรียก `ScannerService.scanText()` **ตัวจริง** จาก
`backend/src/scanner/` มาสแกนไฟล์ใน `tests/detection-dataset/` ทีละไฟล์
แล้วเทียบกับ `ground_truth.csv`

## คำสั่งที่ต้องให้ user `dup` รัน

รันจากโฟลเดอร์ `backend/` (เพื่อให้ resolve `ts-node` และ `node_modules` ได้):

```bash
cd /home/dup/gatekeeper/backend
node_modules/.bin/ts-node --project ../tests/detection-experiment/tsconfig.json \
  ../tests/detection-experiment/run-detection-test.ts
```

- **ไม่ต้อง `sudo`** และ **ไม่ต้อง `pnpm install`** — ใช้ `node_modules` ที่มีอยู่แล้ว
- **ไม่ใช่ `deploy.sh`** — สคริปต์นี้ไม่ build ไม่ deploy ไม่ restart service
  (กฎ "build ได้ทางเดียวคือ deploy.sh" ใช้กับการ build ของจริง ไม่ใช่สคริปต์ทดสอบตัวนี้)
- รันซ้ำได้ ไม่มี side effect นอกจากเขียนไฟล์ผลลง `tests/detection-experiment/output/`

ถ้าอยากรันจากที่อื่น ตั้ง `GATEKEEPER_ROOT` เอง:

```bash
GATEKEEPER_ROOT=/home/dup/gatekeeper node_modules/.bin/ts-node ...
```

## สิ่งที่สคริปต์ **ไม่** ทำ (ยืนยันได้จากตัวโค้ด)

- ไม่ `import` หรือเรียก `DeployPipelineService` / `runPipeline` เลย
- ไม่แตะ docker, docker-socket-proxy (127.0.0.1:2375), Postgres, GitAppStore, ticket service
- ไม่เรียก `scanDependencies()` — SCA ยังเป็น stub (ตรวจแค่ว่ามีไฟล์ manifest ไหม)
  จึงอยู่นอกขอบเขตการวัดของการทดลองนี้ ต้องสร้าง `DependencyAuditService` แค่เพราะ
  constructor ของ `ScannerService` ต้องการ
- อ่านอย่างเดียวจาก `configs/detection-rules/` — ไม่แก้ไฟล์กฎ
- เขียนไฟล์เฉพาะใน `tests/detection-experiment/output/`

## ผลลัพธ์

| ไฟล์ | เนื้อหา |
|---|---|
| `output/results.csv` | รายไฟล์: `filename, category, expected_rule, expected, detected_rules, unexpected_rules, verdict, group` |
| `output/metrics.csv` | รายกฎ + แถว `TOTAL (micro-avg)`: TP/FP/FN/TN, precision, recall, F1 และคอลัมน์ `*_excl_docs` |
| `output/false-positives-documentation.csv` | FP ที่เกิดในไฟล์ `.md` กอง negative (แยกรายงานตามที่ตกลง) |
| `output/false-positives-code.csv` | FP ที่เกิดในไฟล์โค้ด/คอนฟิก — กลุ่มนี้คือ FP ที่น่ากังวลจริง |

## วิธีนับเมตริก

คิด confusion matrix **ต่อกฎ × ทุกไฟล์ในชุดข้อมูล** (11 กฎ × 130 ไฟล์ = 1,430 ช่อง):

- **TP** — ground truth บอกว่าไฟล์นี้ควรถูกกฎนี้จับ และกฎนี้จับได้
- **FN** — ควรถูกจับ แต่ไม่ถูกจับ
- **FP** — ไม่ควรถูกจับด้วยกฎนี้ แต่กฎนี้จับ (รวมกรณีกฎ A ไปจับไฟล์ positive ของกฎ B)
- **TN** — ที่เหลือ

แถวรวมเป็น **micro-average** (บวก TP/FP/FN ข้ามกฎแล้วค่อยหารครั้งเดียว) ไม่ใช่ macro
เพราะแต่ละกฎมี positive เท่ากัน (5 ไฟล์) แต่จำนวน FP ต่างกันมาก micro จึงสะท้อน
ภาระงานจริงของด่านสแกนได้ตรงกว่า — ถ้าจะรายงาน macro ในเล่มด้วย คำนวณจาก `metrics.csv` ได้เลย

คอลัมน์ `precision_excl_docs` / `f1_excl_docs` คือค่าเดียวกันแต่ตัดไฟล์ `.md`
ในกอง negative ออก เพื่อแยกให้เห็นว่า precision ที่เสียไปมาจาก "เอกสารที่พูดถึงกฎ"
มากแค่ไหน เทียบกับ FP ในโค้ดจริง

## สถานะ

สคริปต์เขียนเสร็จแล้วแต่ **ยังไม่ได้รัน** — รอ user `dup` รันตามคำสั่งด้านบน
(claudebot รัน toolchain ใน repo ไม่ได้ เพราะ ACL ของไฟล์จะทำให้ `dup` ติด EACCES ภายหลัง)

ข้อจำกัดของกฎที่พบระหว่างสร้างชุดข้อมูล บันทึกไว้ที่ [FINDINGS.md](FINDINGS.md)
