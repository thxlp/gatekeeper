# Experiment 1 (v2) — วิธีรัน (dataset ผสมโค้ดจริง)

`run-detection-test-v2.ts` เรียก `ScannerService.scanText()` **ตัวจริง** จาก `backend/src/scanner/`
มาสแกนไฟล์ใน `tests/detection-dataset-v2/` แล้วเทียบกับ `ground_truth.csv`
เหมือน v1 แต่รายงานแยก **synthetic / real / รวม / แยกตามแหล่ง / evasion / malicious**

> **ไม่ปรับกฎหรือ threshold** — อ่าน `configs/detection-rules/` อย่างเดียว วัดตามจริง
> **ไม่ deploy ไม่ build ไม่ restart** — เขียนผลเฉพาะ `tests/detection-experiment/output-v2/`

## วิธีรัน — แบ่ง 2 แบบ

กอง malicious คือ webshell/ATT&CK/payload ของจริง ที่สคริปต์จะดึงลง `/tmp` ผ่าน git (ต้องต่อเน็ต)
อ่านเป็นข้อความเท่านั้น **ไม่ execute** และ**ลบทิ้งทุกครั้งหลังรัน** (ใช้ `try/finally` จึงลบให้แม้รันพังกลางทาง)
**ไม่ควรดึงมาไว้บนเครื่อง production** เลยแบ่งการรันเป็น 2 แบบ

### 1) บนเครื่อง production — ข้ามกอง malicious (user `dup`)

```bash
cd /home/dup/gatekeeper/backend
SKIP_MALICIOUS=1 node_modules/.bin/ts-node --project ../tests/detection-experiment/tsconfig.json \
  ../tests/detection-experiment/run-detection-test-v2.ts
```

- `SKIP_MALICIOUS=1` = **ไม่เรียก `fetch-malicious.sh` เลย** ไม่ต่อเน็ต ไม่สร้างอะไรใน `/tmp`
- จะได้ผลของ synthetic / real / รวม / แยกแหล่ง / evasion ครบ ส่วนหน้าจอจะขึ้น **`malicious: skipped`**
- ถ้ามีไฟล์ `malicious-*.csv` จากรอบก่อนค้างอยู่ใน `output-v2/` จะถูกลบทิ้ง จะได้ไม่ปนกับผลรอบนี้

### 2) บนเครื่อง local — รันเต็ม รวมกอง malicious

แนะนำให้รันบน **Linux หรือ WSL** (สคริปต์ดึงไฟล์ด้วย bash + git และลบทิ้งใน `/tmp`)

> ⚠️ **Antivirus อาจแจ้งเตือนหรือกักไฟล์ webshell** ตอนดึงลงมา ถือเป็นเรื่องปกติ เพราะเป็นมัลแวร์ตัวอย่างของจริง
> ถ้า AV กักไฟล์ไปบางส่วน กองนั้นจะมีไฟล์ไม่ครบและ recall ที่ได้จะเพี้ยน
> ให้ดูจำนวนไฟล์ใน `malicious-results.csv` ว่าตรงกับตอนดึงไหม **อย่าปิด AV ทั้งเครื่อง**
> ถ้าจำเป็น ให้ยกเว้นเฉพาะโฟลเดอร์ `/tmp/gk-detect-malicious-*` ชั่วคราว

```bash
cd <repo>/backend
pnpm install          # เฉพาะ clone ใหม่บนเครื่อง local (บน production ห้ามรัน)
node_modules/.bin/ts-node --project ../tests/detection-experiment/tsconfig.json \
  ../tests/detection-experiment/run-detection-test-v2.ts
```

- ถ้าเครื่องบล็อก git หรือไม่มีเน็ต สคริปต์จะข้ามกอง malicious แล้วรายงานส่วนที่เหลือต่อ (และยังลบ `/tmp` ให้)

### ใช้ร่วมกันทั้งสองแบบ

- **ไม่ต้อง `sudo`** และ**ไม่ต้องรัน `deploy.sh`**
- บน production ใช้ `node_modules` ที่มีอยู่แล้ว ห้าม `pnpm install`
- ตั้ง ACL ให้ `dup` เขียน `output-v2/` และอ่าน dataset-v2 ได้แล้ว (rwx + default)
- รันซ้ำได้ ไม่มี side effect นอกจากเขียนไฟล์ผล (แบบเต็มจะดึงไฟล์ลง `/tmp` ชั่วคราวแล้วลบทิ้งด้วย)

รันจากที่อื่นได้ถ้าตั้ง `GATEKEEPER_ROOT=/home/dup/gatekeeper` เอง

### ดึงกอง malicious ดูเองก่อน (ไม่บังคับ)

```bash
bash /home/dup/gatekeeper/tests/detection-dataset-v2/malicious-remote/fetch-malicious.sh
# ดูไฟล์ (อย่า execute):  cat /tmp/gk-detect-malicious-XXXX/<path>
# ลบทิ้ง:                 rm -rf /tmp/gk-detect-malicious-XXXX
```

## ผลลัพธ์ (`output-v2/`)

| ไฟล์ | เนื้อหา |
|---|---|
| `metrics-synthetic.csv` | เมตริกรายกฎ+รวม — **synthetic เท่านั้น** (เทียบ v1) |
| `metrics-real.csv` | เมตริกรายกฎ+รวม — **real เท่านั้น** |
| `metrics-combined.csv` | เมตริกรายกฎ+รวม — **synthetic + real** |
| `results-main.csv` | ผลรายไฟล์ (positive/negative/clean) มีคอลัมน์ source + origin |
| `by-source.csv` | **แยกตามแหล่งที่มา** (origin repo) — TP/FP/FN/TN + malicious detected/bypassed |
| `false-positives-code.csv` / `false-positives-documentation.csv` | FP แยกกลุ่มโค้ด/เอกสาร |
| `evasion-results.csv` | ผลรายไฟล์กอง evasion (synthetic) |
| `malicious-metrics.csv` / `malicious-results.csv` | detection rate ของกอง malicious จริง (เฉพาะแบบเต็มที่ดึงไฟล์ได้ ถ้าใช้ `SKIP_MALICIOUS=1` จะไม่มี 2 ไฟล์นี้) |

หน้าจอสรุป: ตารางหลัก 3 ขอบเขต (synthetic/real/รวม), ตารางแยกแหล่ง, evasion, malicious

## สิ่งที่สคริปต์ **ไม่** ทำ (ยืนยันจากโค้ด)

- ไม่ `import`/เรียก `runPipeline` / `DeployPipelineService`; ไม่แตะ docker/postgres/ticket/GitAppStore
- ไม่เรียก `scanDependencies()` (SCA ยัง stub — นอกขอบเขต)
- ไม่แก้ `configs/` หรือ `src/`; เขียนเฉพาะ `output-v2/`
- ไม่ execute โค้ด malicious — อ่านเป็นข้อความ แล้วลบ `/tmp` ทิ้งเสมอ
