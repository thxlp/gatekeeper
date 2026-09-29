# ชุดทดสอบการหลบเลี่ยง (evasion) — ส่วนขยายของ Experiment 1

โค้ดในโฟลเดอร์นี้ **อันตรายจริง** (ถ้ารันจะทำงานได้จริง) แต่เขียนในรูปแบบที่ตั้งใจ
หลบ regex ของกฎแต่ละข้อใน `configs/detection-rules/` — payload สุดท้ายถูกทำให้ inert
เท่าที่จำเป็น (เช่น decode ออกมาเป็น `echo "ok";` / `Write-Host "ok"` / `console.log("ok")`)

- กฎละ 2 ไฟล์ × 11 กฎ = **22 ไฟล์**
- ตั้งชื่อ `eva_<slug>_NN.<ext>` (slug เดียวกับกอง positive)
- ใน `ground_truth.csv`: `category = evasion`, `expected = detect`
  (แปลว่า *ควร* ถูกจับ แต่คาดว่าจะหลุด — ตัววัดคือ "อัตราการหลบผ่าน")
- ไม่มี secret จริง ใช้ค่า example เดิม (AWS `AKIAIOSFODNN7EXAMPLE`, Slack เป็น token
  รูปแบบตัวอย่างที่มี `EXAMPLE`/`NOTREAL`, PEM body เป็น base64 ของข้อความ ไม่ใช่คีย์จริง)

## เทคนิคหลบต่อกฎ

| ไฟล์ | กฎเป้าหมาย | เทคนิค | ทำนาย (offline) |
|---|---|---|---|
| `eva_aws_01.js` | AWS-ACCESS-KEY | แยกสตริง `'AKIA' + 'IOSF...'` | หลุด |
| `eva_aws_02.py` | AWS-ACCESS-KEY | ประกอบจาก char code ผ่าน `chr()`/`join` | หลุด |
| `eva_privkey_01.js` | PRIVATE-KEY-BLOCK | แยก header/footer เป็นชิ้นแล้ว join ตอน runtime | หลุด |
| `eva_privkey_02.py` | PRIVATE-KEY-BLOCK | เก็บ PEM ทั้งก้อนเป็น base64 ชั้นนอก decode ตอน runtime | หลุด |
| `eva_slack_01.js` | SLACK-TOKEN | แยก prefix `'xoxb'` ออกจาก `-` และ body | หลุด |
| `eva_slack_02.sh` | SLACK-TOKEN | ประกอบ token จากตัวแปรหลายตัวผ่าน shell expansion | หลุด |
| `eva_generic_01.json` | GENERIC-HARDCODED-SECRET | ใส่ใน JSON (key มี quote เสมอ = ช่องว่าง F-01 กลายเป็นช่องหลบ) | หลุด |
| `eva_generic_02.py` | GENERIC-HARDCODED-SECRET | แยกค่า secret สองสตริงต่อกัน ให้ literal แรก < 16 ตัว (F-01) | หลุด |
| `eva_phpeval_01.php` | PHP-EVAL-BASE64 | เก็บชื่อ `base64_decode` ในตัวแปรแล้วเรียกผ่านตัวแปร | หลุด |
| `eva_phpeval_02.php` | PHP-EVAL-BASE64 | แทรกคอมเมนต์ `/* */` ระหว่าง `eval(` กับ `base64_decode` (ทำลาย `\s*`) | หลุด |
| `eva_phpsys_01.php` | PHP-SYSTEM-FROM-REQUEST | ย้าย `$_GET` เข้าตัวแปรกลางก่อนส่งให้ `system()` | หลุด |
| `eva_phpsys_02.php` | PHP-SYSTEM-FROM-REQUEST | เก็บชื่อ `system` ในตัวแปร แล้วเรียก `$fn($_REQUEST[...])` | หลุด |
| `eva_jsatob_01.js` | JS-EVAL-ATOB | alias `eval`/`atob` ไว้ในตัวแปรแล้วเรียกผ่าน alias | หลุด |
| `eva_jsatob_02.js` | JS-EVAL-ATOB | เข้าถึง `eval` ผ่าน `globalThis['ev'+'al']` | หลุด |
| `eva_dynfunc_01.js` | DYNAMIC-FUNC-CREATE | เรียก `Function(...)` โดยไม่ใช้ `new` (pattern บังคับ `new\s+Function`) | หลุด |
| `eva_dynfunc_02.php` | DYNAMIC-FUNC-CREATE | เก็บชื่อ `create_function` ในตัวแปรแล้วเรียกผ่านตัวแปร | หลุด |
| `eva_winps_01.bat` | WIN-ENCODED-PS | แทรก caret `power^shell` (cmd กลืน `^` แต่ literal พัง) | หลุด |
| `eva_winps_02.ps1` | WIN-ENCODED-PS | ใช้ `pwsh` แทน `powershell` + ย่อ `-en` (นอก alternation ของกฎ) | หลุด |
| `eva_certutil_01.bat` | CERTUTIL-DECODE | เก็บ `certutil` ในตัวแปร env แล้วเรียกผ่าน `%VAR%` | หลุด |
| `eva_certutil_02.bat` | CERTUTIL-DECODE | แทรก caret `cert^util` | หลุด |
| `eva_curlsh_01.sh` | SUSPICIOUS-CURL-PIPE-SH | pipe เข้า `/bin/sh` (มี `/bin/` คั่น ทำให้ `\|\s*(sh\|bash)` ไม่ติด) | หลุด |
| `eva_curlsh_02.sh` | SUSPICIOUS-CURL-PIPE-SH | ใช้ `eval "$(curl ...)"` แทน pipe (ไม่มี `\| sh` เลย) | หลุด |

## ผลทำนายแบบ offline (ยังไม่ใช่ผลจริงจาก ScannerService)

รัน regex ชุดเดียวกันด้วย Python `re` อ่านไฟล์ตรงๆ (ไม่ผ่าน scanner service, ไม่ผ่าน pipeline)
เพื่อยืนยันว่าแต่ละไฟล์ทำงานเป็น "การหลบ" จริง: **ทำนายว่าหลุดทั้ง 22/22 ไฟล์** และ
ไม่มีไฟล์ไหนไปสะดุดกฎอื่นโดยบังเอิญ (ไม่มี cross-hit)

> ระวัง: ระหว่างสร้าง มี 6 ไฟล์ที่ตอนแรก "ถูกจับ" เพราะ **คอมเมนต์อธิบายเทคนิคเผลอเขียน
> literal ของ pattern ลงไป** (เช่น คอมเมนต์ที่พิมพ์คำว่า `certutil -decode` ตรงๆ) ไม่ใช่
> เพราะโค้ดถูกจับ — แก้คอมเมนต์แล้วทั้งหมด นี่เองเป็นข้อสังเกตว่ากฎ regex ล้วนจับ "ข้อความ"
> ไม่ได้เข้าใจ "โครงสร้างโค้ด" จึงไวต่อทั้ง false positive (คอมเมนต์/เอกสาร) และ false
> negative (โค้ดที่หลบรูปแบบ)

ผลจริงต้องมาจากการรัน `tests/detection-experiment/` ผ่าน `ScannerService.scanText()`
(ดูวิธีรันใน `tests/detection-experiment/README.md`) — **หมายเหตุ**: runner ปัจจุบันยัง
ไม่รู้จัก `category = evasion` ต้องอัปเดตตรรกะการนับก่อนรัน (ดูหัวข้อในคำสรุปของ session)
