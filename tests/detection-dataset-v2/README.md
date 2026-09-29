# Detection dataset v2 — Experiment 1 (ชุดข้อมูลผสมโค้ดจริง)

ชุดข้อมูลรุ่นที่ 2 สำหรับวัด precision / recall ของกฎใน `configs/detection-rules/`
(`secret-patterns.json` 4 กฎ + `heuristic-patterns.json` 7 กฎ = **11 กฎ**)

ต่างจาก v1 (`tests/detection-dataset/`) ตรงที่ **ผสมโค้ดจริงจากแหล่งสาธารณะ**
เข้ากับของสังเคราะห์เดิม เพื่อให้ตัวเลขน่าเชื่อถือขึ้นและสะท้อน false positive
ที่เกิดกับโค้ดจริง

> **ยังไม่ได้รันสแกนด้วย `ScannerService`** — เอกสารนี้รายงานเฉพาะที่มา/วิธีเลือก/
> โครงสร้าง และผลตรวจ integrity แบบ offline (Python `re` อ่านไฟล์ตรงๆ) เท่านั้น
> ผลจริงต้องได้จากการรัน scanner (ดู `tests/detection-experiment/`)

---

## 1. โครงสร้าง

```
detection-dataset-v2/
├── ground_truth.csv        # filename,rule_id,expected,category  (เฉพาะไฟล์ที่อยู่บนดิสก์)
├── sources.csv             # ที่มา+commit+license+note ของทุกไฟล์จริงใน real/
├── synthetic/              # สำเนา v1 ทั้งชุด (positive/negative/clean/evasion) ไว้เทียบ
├── real/
│   ├── positive/           # โค้ดจริงที่ "ควรถูกจับ" (secret ในบริบทจริง; private key ของจริง MASK แล้ว)
│   ├── negative/           # โค้ดจริงที่ "หน้าตาอันตรายแต่ปลอดภัย" → แหล่ง false positive
│   └── clean/              # โค้ดปกติจาก repo จริง ไม่ควรถูกจับด้วยกฎใด
└── malicious-remote/       # โค้ดอันตรายจริง (webshell/ATT&CK/payload) — ไม่เก็บลงเรโป
    ├── sources.csv         # repo + commit + วิธีเลือก
    └── fetch-malicious.sh  # ดึงลง /tmp ชั่วคราว อ่านอย่างเดียว แล้วลบทิ้ง
```

`category` ใน `ground_truth.csv` มี prefix บอกที่มา: `synthetic-*` (ของเดิม v1),
`real-positive` / `real-negative` / `real-clean` (โค้ดจริง)

## 2. จำนวนไฟล์ต่อกฎ (บนดิสก์)

รวม synthetic เดิม (positive 5 + negative 5 ต่อกฎ) กับโค้ดจริงที่เพิ่มเข้ามา:

| rule_id | synthetic (5+5) | real positive | real negative | รวมบนดิสก์ |
|---|---|---|---|---|
| AWS-ACCESS-KEY | 10 | 2 | 2 | **14** |
| PRIVATE-KEY-BLOCK | 10 | 4 | 1 | **15** |
| SLACK-TOKEN | 10 | 0 | 5 | **15** |
| GENERIC-HARDCODED-SECRET | 10 | 0 | 5 | **15** |
| PHP-EVAL-BASE64 | 10 | 0 | 0 | **10** ➊ |
| PHP-SYSTEM-FROM-REQUEST | 10 | 0 | 2 | **12** ➊ |
| JS-EVAL-ATOB | 10 | 0 | 0 | **10** ➊ |
| DYNAMIC-FUNC-CREATE | 10 | 0 | 4 | **14** |
| WIN-ENCODED-PS | 10 | 0 | 4 | **14** |
| CERTUTIL-DECODE | 10 | 0 | 2 | **12** |
| SUSPICIOUS-CURL-PIPE-SH | 10 | 0 | 3 | **13** |

นอกจากนี้มี clean จริง 25 ไฟล์ + clean สังเคราะห์ 20 ไฟล์ (rule_id = `NONE`)

➊ **positive ของกฎ heuristic (webshell/attack) ไม่เก็บบนดิสก์** — ตัวอย่างอันตรายจริง
ทั้งหมดอยู่ในกอง `malicious-remote/` ที่ดึงมาชั่วคราวเท่านั้น (ดูข้อ 5) ทำให้กฎกลุ่มนี้
มี positive จริงเพิ่มอีกหลายสิบไฟล์ตอนรันจริง แต่ **ไม่มีโค้ดโจมตีค้างในเรโป**

## 3. ที่มาและ license ของโค้ดจริง (`real/`)

ทุกไฟล์ pin ไว้ที่ commit เฉพาะ (ดู `sources.csv` สำหรับ path + commit + note ครบทุกแถว)
เลือกเฉพาะ repo ที่ license ใช้เชิงวิชาการได้:

| repo | license | ใช้เป็น |
|---|---|---|
| gitleaks/gitleaks | MIT | positive AWS/secret (test token), negative rule-def |
| Yelp/detect-secrets | Apache-2.0 | positive private key (dummy), negative, clean (ซอร์สตัวตรวจ) |
| slackapi/bolt-js, slackapi/python-slack-sdk | MIT | negative SLACK/GENERIC (token ตัวอย่าง/เทสต์) |
| boto/boto3 | Apache-2.0 | negative AWS (เอกสาร), clean |
| psf/requests | Apache-2.0 | positive private key (test cert, **MASK**), clean, cert สาธารณะ |
| expressjs/express, sindresorhus/got | MIT | clean |
| symfony/process | MIT | negative PHP-SYSTEM (adjacency), clean |
| laravel/framework | MIT | negative GENERIC (crypto), clean |
| ajv-validator/ajv, jashkenas/underscore, vuejs/vue | MIT | negative DYNAMIC-FUNC-CREATE (`new Function()` โดยชอบ) |
| auth0/jwt-decode | MIT | clean (ใช้ `atob()` แต่ไม่ `eval(atob())`) |
| nvm-sh/nvm, ohmyzsh/ohmyzsh, rust-lang/rustup, devcontainers/images | MIT / Apache-2.0 | negative/clean สำหรับ curl-pipe-sh |
| MicrosoftDocs/PowerShell-Docs | CC-BY-4.0 | negative WIN-ENCODED-PS (เอกสาร) |
| SigmaHQ/sigma | DRL-1.1 | negative (กฎ detection ที่อ้าง pattern เอง) |

**แหล่งที่งานวิจัยด้าน detection ใช้จริง (ตรวจแล้วมีอยู่จริง):**
- **SecretBench** (Basak, Neil, Reaves, Williams. *SecretBench: A Dataset of Software Secrets.*
  MSR 2023, arXiv:2303.06729) — repo license MIT แต่ **ตัวข้อมูลถูก gate**: ต้องอีเมลขอ
  + เซ็นข้อตกลง และเก็บใน BigQuery เพราะมี secret จริง → **ไม่นำมาใช้** (ขัดกฎ "ห้ามใช้ secret จริง")
  RELATED_WORK.md A.3 อ้างชุดนี้ว่าเป็นตัวที่ควรใช้ประเมิน
- **tennc/webshell** (MIT) — ชุด webshell ที่ paper ด้าน webshell detection อ้างเป็น benchmark
  บ่อย → ใช้เป็นแหล่ง positive ของกฎ webshell (ดึงชั่วคราว ข้อ 5)

**paper ที่ผู้ใช้อ้าง (ตรวจ dataset ให้ ไม่ได้นำ dataset มาใช้):**
- Wang, Ko, Chiang, Wang. *WebShell Detection Based on CodeBERT and Deep Learning Model.*
  CNIOT 2024, **DOI 10.1145/3670105.3670190** — ตรวจ Crossref แล้วชื่อ/ผู้แต่งตรง
  วิธีการ: BPE + CodeBERT + GRU บนซอร์ส **PHP**; ชุดข้อมูลเป็น webshell/normal PHP
  (รายละเอียดจำนวน sample/ที่มาของชุด ต้องเปิด full text ยืนยัน — **ยังไม่ยืนยัน**)
- Zeng, Chai, Wu. *A Webshell detection method based on feature fusion and federated learning.*
  Int. J. Information Security 2025, **DOI 10.1007/s10207-025-01078-0** — ตรวจ Crossref แล้วตรง
  ใช้ชุด **AMWD'22** (Alibaba Cloud Security Webshell text-detection dataset, Tianchi
  dataset/146669) เป็นหลัก ร่วมกับชุดอื่น — AMWD'22 เป็น AST/opcode sequence ไม่ใช่ raw source
  จึงใช้กับ regex กฎเราตรงๆ ไม่ได้ (**บันทึกไว้เป็นข้อมูล ไม่นำมาใช้**)

## 4. วิธีเลือกและ label (สำคัญต่อการตีความตัวเลข)

- **real positive เลือกจากบริบทจริง ไม่ใช่เพราะ regex จับได้** แต่การที่ positive จริง
  ของ secret มาจากไฟล์ที่ regex จับได้อยู่แล้ว **ทำให้ recall ดูดีเกินจริงได้** —
  ตัวเลข recall ที่มีความหมายจริงมาจากกอง `malicious-remote/` (ข้อ 5) ที่เลือกโดย
  ไม่ดูผลกฎ
- **secret จริงถูก mask หรือใช้ค่า example เท่านั้น**:
  - private key ของจริง (requests test cert, gitleaks test key) → **เก็บแค่บรรทัด
    `BEGIN/END`** แล้วแทน body ด้วย `REDACTED-...` (กฎ `PRIVATE-KEY-BLOCK` match ที่ header
    อยู่แล้ว จึงยัง positive ได้โดยไม่มี key material จริง)
  - AWS/Slack ใช้ค่า test/example ที่ผู้ให้บริการหรือเครื่องมือประกาศเอง
    (`AKIAIOSFODNN7EXAMPLE`, `xoxb-your-bot-token`, `xoxb-ratelimited`, ฯลฯ) ไม่ใช่ของใครจริง
- **negative = โค้ดจริงที่ปลอดภัยแต่หน้าตาเหมือนอันตราย เก็บไว้ตามจริง ไม่คัดออก**
  เพื่อให้ตัวเลข false positive ซื่อสัตย์ (ตามที่ร้องขอ) ตัวอย่างที่จะเป็น FP จริง:
  - `xoxb-*` ในเทสต์/เอกสารของ Slack SDK
  - `new Function(...)` ที่ ajv / vue / underscore ใช้ compile โดยชอบ
  - `curl ... | bash` ในคำสั่งติดตั้ง nvm และ Dockerfile ของ devcontainers (ยิงจริงแต่ตั้งใจ)
  - เอกสาร Microsoft / กฎ Sigma ที่ "พูดถึง" pattern (`-EncodedCommand`, `certutil -decode`)
- **label ตรวจ integrity แบบ offline แล้ว**: `real/positive` ทั้ง 6 ไฟล์ match กฎของตัวเอง,
  `real/clean` ทั้ง 25 ไฟล์ไม่ match กฎใดเลย, `real/negative` ที่ตั้งใจให้เป็น FP ก็ match จริง
  (ที่เหลือเป็น true-negative วัดความจำเพาะ)

## 5. กอง malicious ดึงชั่วคราว (`malicious-remote/`)

> **ไม่มีโค้ดโจมตีเก็บอยู่ในเรโปนี้** — เครื่องนี้เป็น production

- `sources.csv` บอก repo + commit + **วิธีเลือกแบบไม่ดูผล regex**: เอา *ทั้งโฟลเดอร์* หรือ
  *ทั้ง batch ตามชื่อไฟล์* (เช่น `php/phpspy/`, `php/2020.08.20.*.php`, `atomics/T1140/T1140.yaml`,
  `XSS Injection/`) → ตัวอย่างที่หลบกฎได้ (เช่น China-chopper `@eval($_POST[c])`) จะถูกรวมด้วย
  ทำให้ recall ที่วัดได้ไม่สวยเกินจริง
- `fetch-malicious.sh` ดึงลง `/tmp` (นอก web root) อ่านเป็นข้อความเท่านั้น **ห้าม execute**
  และพิมพ์คำสั่ง `rm -rf` ให้ลบทิ้งทันทีหลังใช้ พร้อมสร้าง `ground_truth.malicious.csv`
  (`expected=detect`) ที่ผูก rule เป้าหมายต่อกลุ่ม
- แหล่ง: `tennc/webshell` (MIT), `redcanaryco/atomic-red-team` (MIT),
  `swisskyrepo/PayloadsAllTheThings` (MIT)

## 6. ข้อจำกัด / สิ่งที่ต้องระวัง

- `GENERIC-HARDCODED-SECRET` และ `SLACK-TOKEN` **ไม่มี real positive บนดิสก์** เพราะโค้ดจริง
  สาธารณะที่มี secret รูปแบบนี้มักเป็นค่า example/test (ถ้าใส่เป็น positive จะกลายเป็นการปลอม
  secret) → positive ของสองกฎนี้จึงมาจาก synthetic v1 เท่านั้น บันทึกไว้ตรงนี้อย่างซื่อสัตย์
- ช่องว่างของ `GENERIC-HARDCODED-SECRET` (จับคีย์ที่ถูก quote ไม่ได้) ที่ v1 พบ ยังคงอยู่
  (ไม่แตะ `configs/`)
- ตัวรัน `tests/detection-experiment/run-detection-test.ts` เดิมชี้ที่ `detection-dataset/`
  และรองรับ **1 label ต่อไฟล์** + split CSV ด้วย comma — v2 จึงตั้งชื่อไฟล์ไม่มี comma และ
  เก็บ provenance แยกใน `sources.csv` ถ้าจะรัน v2 ต้องชี้ path มาที่โฟลเดอร์นี้ (ยังไม่ทำ
  ในรอบนี้ตามที่สั่ง "ยังไม่ต้องรันสแกน")
