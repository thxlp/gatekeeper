# Detection dataset — Experiment 1 (วัดประสิทธิภาพด่านสแกน)

ชุดข้อมูลสำหรับวัด precision / recall ของกฎใน `configs/detection-rules/`
(`secret-patterns.json` 4 กฎ + `heuristic-patterns.json` 7 กฎ = **11 กฎ**)

## โครงสร้าง

| โฟลเดอร์ | จำนวน | ความหมาย |
|---|---|---|
| `positive/` | 55 (11 กฎ × 5) | โค้ดที่ **ควรถูกจับ** โดยกฎที่ระบุใน ground truth |
| `negative/` | 55 (11 กฎ × 5) | โค้ดที่ **หน้าตาคล้าย** positive แต่ปลอดภัยจริง → วัด false positive |
| `clean/` | 20 | โค้ดปกติทั่วไป ไม่ควรถูกจับด้วยกฎใดเลย |
| `ground_truth.csv` | 130 แถว | `filename, rule_id, expected, category` |

ชื่อไฟล์: `pos_<slug>_NN.<ext>` / `neg_<slug>_NN.<ext>` โดย `<slug>` map กับ rule ดังนี้

| slug | rule_id |
|---|---|
| `aws` | AWS-ACCESS-KEY |
| `privkey` | PRIVATE-KEY-BLOCK |
| `slack` | SLACK-TOKEN |
| `generic` | GENERIC-HARDCODED-SECRET |
| `phpeval` | PHP-EVAL-BASE64 |
| `phpsys` | PHP-SYSTEM-FROM-REQUEST |
| `jsatob` | JS-EVAL-ATOB |
| `dynfunc` | DYNAMIC-FUNC-CREATE |
| `winps` | WIN-ENCODED-PS |
| `certutil` | CERTUTIL-DECODE |
| `curlsh` | SUSPICIOUS-CURL-PIPE-SH |

ไฟล์ `clean/` ใช้ `rule_id = NONE`

## ความปลอดภัยของชุดข้อมูล

- **ไม่มี secret จริงในชุดนี้เลย** — ใช้เฉพาะค่าตัวอย่างที่ผู้ให้บริการประกาศเอง
  (AWS: `AKIAIOSFODNN7EXAMPLE`) หรือค่าที่แต่งขึ้นให้เห็นชัดว่าไม่จริง
  (มีคำว่า `EXAMPLE` / `notreal` / เลข 0 ซ้ำ)
- private key block เป็น PEM ปลอม — body เป็น base64 ของข้อความภาษาอังกฤษ
  ("EXAMPLE... NOT REAL") ไม่ใช่คีย์ที่ใช้งานได้
- payload ของกฎ heuristic ทำให้ **ไม่มีผลจริง (inert)** เท่าที่กฎเปิดช่องให้
  เช่น `eval(base64_decode(...))` ที่ decode ออกมาเป็น `echo "ok";`
  และ `powershell -enc ...` ที่ decode ออกมาเป็น `Write-Host "ok"`
- ไฟล์ `positive/` ทุกไฟล์มีคอมเมนต์กำกับว่าเป็น test fixture
- **ห้ามนำโฟลเดอร์นี้เข้า deploy pipeline** — ใช้เรียก scanner อ่านไฟล์ตรงๆ เท่านั้น

## เจตนาในการออกแบบ negative/

ไฟล์ negative จำลอง "โค้ดปลอดภัยที่หน้าตาเหมือนของอันตราย" 5 แบบต่อกฎ:

1. อ่านค่าจาก environment (`process.env` / `os.environ`)
2. placeholder / `.env.example` ที่เว้นค่าว่าง
3. เอกสาร (`.md`) ที่อธิบายกฎและ**พูดถึงรูปแบบนั้นตรงๆ**
4. โค้ดที่ validate/redact รูปแบบนั้น (มี regex ของกฎอยู่ในซอร์ส)
5. การใช้งานที่ถูกต้อง (allow-list, `escapeshellarg`, verify checksum, closure)

แบบที่ 3 และ 4 คือแหล่ง false positive ที่คาดว่าจะเกิดจริง — ตั้งใจใส่ไว้เพื่อวัด

## สถานะการตรวจสอบ (offline)

ตรวจ ground truth ด้วย regex เดียวกันแบบ offline (Python `re` อ่านไฟล์ตรงๆ ไม่ผ่าน
scanner service และไม่ผ่าน pipeline) ผลคือ:

- positive ทั้ง 55 ไฟล์ match กฎของตัวเองครบ และไม่ไป match กฎอื่นเลย
- clean ทั้ง 20 ไฟล์ ไม่ match กฎใดเลย
- negative 4 ไฟล์ match กฎ = **false positive ที่คาดไว้**:
  `neg_aws_03.md`, `neg_slack_02.md`, `neg_dynfunc_03.md`, `neg_generic_05.md`
  (ทั้งหมดเป็นเอกสารที่อธิบายกฎ) → ผลจริงต้องมาจากการรัน `ScannerService.scanText()`

## ช่องว่างของกฎที่เจอระหว่างสร้างชุดข้อมูล

`GENERIC-HARDCODED-SECRET` ใช้ pattern `(api[_-]?key|secret|token|password)\s*[:=]\s*["']...`
ซึ่ง **ไม่ครอบคลุมคีย์ที่ถูก quote** จึงจับไม่ได้ในสองกรณีที่พบบ่อยมาก:

- JSON: `"token": "…"` (คีย์ต้องมี quote เสมอตาม spec)
- PHP array: `'password' => '…'`

จึงย้าย `pos_generic_04` จาก `.json` ไปเป็น `.yml` และเขียน `pos_generic_05.php`
เป็น `$password = '…'` แทน array — เพื่อให้ positive ยังเป็น positive จริง
**ช่องว่างนี้ยังไม่ได้แก้** (ไม่แตะ `configs/`) บันทึกไว้เป็นข้อค้นพบของ Experiment 1
