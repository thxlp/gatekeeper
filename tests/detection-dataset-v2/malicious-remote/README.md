# malicious-remote — โค้ดอันตรายจริง (ดึงชั่วคราว ไม่เก็บลงเรโป)

กองนี้เก็บ **แค่ manifest** (`sources.csv`) และสคริปต์ดึง (`fetch-malicious.sh`)
ตัวไฟล์ webshell / ATT&CK / payload ของจริง **ไม่ถูก commit** — เครื่องนี้เป็น production

## ใช้ยังไง

```bash
bash tests/detection-dataset-v2/malicious-remote/fetch-malicious.sh
# → ดึงลง /tmp/gk-detect-malicious-XXXX (นอก web root)
# → สร้าง ground_truth.malicious.csv (expected=detect)
# ... รันสแกนอ่านไฟล์เป็นข้อความ ...
rm -rf /tmp/gk-detect-malicious-XXXX      # ลบทิ้งทันทีหลังใช้ (สคริปต์พิมพ์คำสั่งให้)
```

## กติกาความปลอดภัย

- **ห้าม execute** ไฟล์ที่ดึงมา — อ่านเป็นข้อความอย่างเดียว
- **ห้ามวางใน web root** — ดึงลง `/tmp` เท่านั้น
- **ลบทิ้งทันทีหลังใช้**
- ถ้าเป็นไปได้ ให้รันบนเครื่องที่ไม่ใช่ production

## วิธีเลือก (ไม่ดูผล regex ก่อน)

เลือก *ทั้งโฟลเดอร์* หรือ *ทั้ง batch ตามชื่อไฟล์* ตามที่ระบุใน `sources.csv`
ไม่ได้คัดด้วยว่ากฎจับได้หรือไม่ → ตัวอย่างที่หลบกฎได้จะถูกรวมไว้ด้วย
ทำให้ค่า recall ที่วัดได้สะท้อนความจริง (ไม่สวยเกินจริง)

แหล่งทั้งหมดเป็น MIT: `tennc/webshell`, `redcanaryco/atomic-red-team`,
`swisskyrepo/PayloadsAllTheThings` — pin ที่ commit ใน `sources.csv`
