# 2FA ไม่ส่งรหัส — บันทึกเหตุการณ์ 2026-08-08

**สถานะ: ยังไม่ปิดเคส** — ต้นตออยู่นอกโค้ด แก้ไม่ได้จนกว่าจะตั้งค่าช่องทางส่งเมลใหม่
ตอนนี้ถอยโค้ดกลับแล้วแต่ **ยังไม่ได้ build ทับ** (ดูหัวข้อ "ต้องทำต่อ")

> **2026-08-09 — ตัดสินใจปิดฟีเจอร์ 2FA ทั้งระบบไปก่อน** (branch `chore/2fa-maintenance-mode`)
> มีสวิตช์ `FEATURE_2FA` ที่ default = ปิด: login ข้ามขั้น OTP ให้ทุกบัญชีแม้ธงใน DB ยังเปิดค้าง
> (ไม่แตะค่าใน DB) และหน้า Settings ขึ้นป้าย "ปิดปรับปรุง" ปุ่มกดไม่ได้
> = ข้อ 8.2 ทางหนีไฟด้วย SQL **ไม่จำเป็นแล้ว** ส่วนข้อ 8.3 ยังต้องทำก่อนเปิดกลับ

---

## 1. อาการที่แจ้ง

เปิด 2FA ไว้ แล้ว login ไม่มีรหัสยืนยันเข้าอีเมลเลย หน้าเว็บเด้งเข้าหน้ากรอกรหัส 6 หลัก
ตามปกติ ไม่มี error อะไรขึ้นให้เห็นสักจุด — พังแบบเงียบสนิท

## 2. ต้นตอ

**ไม่ได้อยู่ที่โค้ด 2FA เลย — โฮสต์บล็อก outbound TCP พอร์ต SMTP ทั้งหมด**

`.env` ชี้ `SMTP_HOST=smtp.gmail.com` `SMTP_PORT=587` ซึ่ง Gmail เปิดให้ใช้แค่พอร์ต
25 / 465 / 587 → ไม่มีพอร์ตไหนต่อออกได้เลยสักพอร์ต

## 3. หลักฐาน

**3.1 ต่อ SMTP ไม่ติด** (รัน `nodemailer.verify()` ด้วย env จริง)
```
host=smtp.gmail.com port=587 user=pazu***@gmail.com passLen=16
VERIFY FAIL: ETIMEDOUT — Connection timeout
```

**3.2 เป็นการบล็อกที่พอร์ต ไม่ใช่ที่ปลายทาง** — ยิงใส่ `portquiz.net` ซึ่งเปิดฟังทุกพอร์ต:

| พอร์ต | ผล | |
|---|---|---|
| 80 | ✅ OK | เน็ตออกได้ปกติ |
| 2525 | ✅ OK | พอร์ต SMTP ทางเลือก |
| 8080 | ✅ OK | |
| 25 | ❌ TIMEOUT | |
| 465 | ❌ TIMEOUT | |
| 587 | ❌ TIMEOUT | |

ทดสอบซ้ำโดยปิด sandbox ของ agent ได้ผลเดียวกัน = เป็นที่เครื่องจริง
และ **ไม่ใช่กฎจาก `deployments/docker/build-egress-firewall.sh`** ของเราเอง —
สคริปต์นั้นแตะแค่ chain FORWARD/INPUT ของ tenant ไม่เกี่ยวกับ OUTPUT ของ host
สรุปว่าเป็น provider บล็อกพอร์ต SMTP กันสแปมตามค่าเริ่มต้น

**3.3 backend ทำงานถูกต้องทุกขั้นจนถึงขั้นส่งเมล** — query `accounts` ตอนเกิดเหตุ:
```
who       two_factor_enabled  has_otp  purpose  attempts  otp_sent_at
papa***   true                true     login    0         2026-08-08T13:24:49Z
```
OTP ถูกสร้างและเขียนลง DB เรียบร้อย ค้างรอแค่เมลที่ไม่เคยออกไป

**3.4 ปลายทางที่ใช้ได้** (ทดสอบแล้ว)
`smtp-relay.brevo.com:2525` · `smtp.sendgrid.net:2525` · `smtp.mailgun.org:2525` ·
`api.resend.com:443` · `api.brevo.com:443`

## 4. ทำไมถึงพังแบบเงียบ

จุดนี้เป็นข้อบกพร่องของโค้ดเราจริง (คนละเรื่องกับต้นตอ แต่ทำให้หาสาเหตุยากขึ้นมาก):

- `MailService.send()` เป็น fail-soft — `catch` แล้ว `logger.warn` เฉยๆ ไม่ throw
- `auth.controller` เรียกแบบ `void this.mail.send(...)` ไม่ `await` ไม่เช็คผล
- `isConfigured()` เช็คแค่ว่า "สร้าง transporter ได้ไหม" ซึ่งไม่ได้ลองต่อจริง → คืน `true`
  ทั้งที่ต่อไม่ได้ เลยไม่เข้าเงื่อนไข 503 fail-closed ที่มีอยู่แล้ว
- ไม่มี timeout ให้ transporter เลย → ค้างยาว

ผลรวม: challenge ถูกเขียนลง DB สำเร็จ → ตอบ `{mfaRequired:true}` → UI พาไปหน้ากรอกรหัส
แถม cooldown 60 วิถูกกินไปตั้งแต่รอบแรก กด "ส่งรหัสอีกครั้ง" ก็ไม่ช่วย

## 5. สิ่งที่แก้ไป

commit `2b40b56` บน branch **`fix/otp-mail-transport`** (แตกจาก `main`)

| ไฟล์ | แก้อะไร |
|---|---|
| `backend/src/mail/mail.service.ts` | เพิ่มโหมด `http` (Resend/Brevo REST ผ่าน 443) คู่กับ `smtp` เดิม เลือกด้วย `MAIL_TRANSPORT` · ใส่ connection/greeting/socket timeout 10 วิ · `send()` คืน `boolean` |
| `backend/src/auth/auth.controller.ts` | OTP ทั้ง 3 จุด (`/auth/session`, `/session/resend`, `/2fa/otp`) เปลี่ยนเป็น `await` + fail-closed: ส่งไม่ออก = ล้าง challenge แล้วตอบ 503 |
| `backend/src/account/accounts.service.ts` | แยก `clearOtp()` ออกมาใช้ร่วมกัน |
| `deployments/host/.env.example` | เอกสารครบทั้งสองโหมด + วิธีเช็คว่าพอร์ตถูกบล็อกไหม |
| `docs/TEST-CHECKLIST.md` | เพิ่มข้อเทส + ย้าย "ส่งอีเมล + 2FA" ออกจากหมวดเทสผ่านแล้ว |

โหมด http ใช้ `fetch` ที่มีในตัว node — **ไม่ต้องลง dependency ใหม่**

**ทดสอบแล้ว:** type-check ผ่านสะอาดทั้ง 98 ไฟล์ · รัน `MailService` จริง 8 เคส สลับโหมดถูกทุกกรณี
และเคสตั้งค่าผิดทุกแบบให้ `configured=false` (fail-closed ตั้งแต่ต้น) · ยืนยัน timeout เด้งที่ 10,017ms

## 6. สิ่งที่เกิดขึ้นหลัง deploy — ล็อกเอาต์

deploy ขึ้น production ไปแล้ว (dist 14:35, service restart 14:36) **แต่ยังไม่ได้ตั้งค่า
provider ใน `.env`** — ยังเป็น Gmail SMTP ตัวเดิม ไม่มี `MAIL_TRANSPORT`/`MAIL_API_KEY`

โค้ด fail-closed เลยทำงานตามที่ออกแบบทุกประการ:
```
MAIL_FROM + SMTP_HOST มีอยู่ → isConfigured()=true → ออก OTP → ยิง gmail:587
→ timeout 10 วิ → clearOtp() → 503 mail_send_failed
```
ยืนยันจาก DB: แถว OTP ที่ค้างอยู่ถูกล้างเกลี้ยง (`has_otp=false`, `otp_sent_at=null`)
= มีคนลอง login จริงแล้วเจอ 503

**ความสามารถในการ login ไม่ได้แย่ลงกว่าเดิม** (ก่อนหน้านี้ก็เข้าไม่ได้ แค่ไม่มี error ขึ้น)
แต่กลายเป็นกำแพงชัดๆ ที่ปิดตายจนกว่าเมลจะใช้ได้ + รอ 10 วิก่อนขึ้น error

**บทเรียน: ห้าม deploy โค้ด fail-closed ก่อนตั้งค่าสิ่งที่มันบังคับ** — ควรตั้ง `.env`
ให้เมลใช้ได้จริงก่อน แล้วค่อย deploy โค้ดที่บังคับว่าเมลต้องส่งออกได้

## 7. สถานะปัจจุบัน

| | commit | |
|---|---|---|
| ซอร์สใน repo | `4c41b50` (main) | ✅ ถอยแล้ว |
| **ที่รันอยู่จริง** | `2b40b56` | ⚠️ **ยังเป็นตัวใหม่** — `dist/` ที่ build ไว้ 14:35 ยังอยู่ |

`git checkout` เปลี่ยนแค่ซอร์ส ไม่แตะ `dist/` ที่ systemd รันอยู่
commit `2b40b56` ยังอยู่ครบบน branch `fix/otp-mail-transport` ไม่ได้หายไปไหน

service ทุกตัวปกติดี ไม่มีอะไรค้าง: backend :8089/:8090 healthz 200 · frontend :3000 200 · nginx active

## 8. ต้องทำต่อ

**8.1 build ทับให้การถอยมีผลจริง** (ต้องรันเป็น dup ห้าม sudo)
```bash
bash deployments/host/deploy.sh
```
เสร็จแล้วจะกลับไปเป็นอาการเดิม: เด้งเข้าหน้ากรอกรหัสแล้วรอรหัสที่ไม่มา (ไม่มี error แดง)
— **การถอยโค้ดไม่ได้ทำให้ login ได้** แก้แค่เรื่อง "ตกใจว่าพัง"

**8.2 ทางเข้าระบบตอนนี้**
- บัญชี `pazu***` ปิด 2FA อยู่ → เข้าได้ปกติทันที ไม่ต้องทำอะไร
- หรือปิด 2FA ของ `papa***` ใน DB (ทางหนีไฟที่เขียนไว้ใน comment ของ `auth.controller` เอง):
  ```sql
  UPDATE accounts SET two_factor_enabled=false WHERE email='papa...';
  ```

**8.3 แก้ที่ต้นตอจริง** — สมัคร provider แล้วเติมใน `deployments/host/.env`:
```bash
MAIL_TRANSPORT=http
MAIL_HTTP_PROVIDER=resend
MAIL_API_KEY=re_xxxxx
MAIL_FROM=onboarding@resend.dev   # หรือโดเมนที่ verify แล้ว
```
หรืออยู่โหมด smtp แล้วย้ายไป provider ที่เปิดพอร์ต 2525 (Brevo/SendGrid/Mailgun — Gmail ไม่มี)

แล้วค่อยเอา `fix/otp-mail-transport` กลับเข้ามา + เปิด 2FA ใหม่
ตอนนั้นค่อยเทสตามข้อที่เพิ่มไว้ใน `docs/TEST-CHECKLIST.md`

---

## ภาคผนวก — วิธีเช็คว่าพอร์ตถูกบล็อกไหม

```bash
node -e "
const net=require('net');
const t=(h,p)=>new Promise(r=>{const s=net.connect({host:h,port:p});
  const to=setTimeout(()=>{s.destroy();r(\`\${p} TIMEOUT\`)},8000);
  s.on('connect',()=>{clearTimeout(to);s.destroy();r(\`\${p} OK\`)});
  s.on('error',e=>{clearTimeout(to);r(\`\${p} \${e.code}\`)})});
(async()=>{for(const p of [80,25,465,587,2525]) console.log(await t('portquiz.net',p))})();
"
```
`portquiz.net` เปิดฟังทุกพอร์ต — พอร์ตไหน TIMEOUT แปลว่าโดนบล็อกขาออก ไม่ใช่ปลายทางล่ม

> หมายเหตุ: claudebot อ่าน `journalctl` ไม่ได้ (ไม่ได้อยู่ใน group `adm`/`systemd-journal`)
> log warn ของ `MailService` ต้องรันเองด้วย
> `sudo journalctl -u gatekeeper-backend@8089 --since today | grep -i mail`
