# ดูแล server ช่วงเปิดทิ้งไว้รอพรีเซ็น

คู่มือสั้นๆ สำหรับช่วงที่ปล่อย gatekeeper รันยาวๆ โดยไม่มีคนเฝ้า เป้าหมายเดียว: **วันพรีเซ็นเปิดเว็บแล้วต้องขึ้น**
เครื่องมือหลักคือ `deployments/host/healthcheck.sh` (ไม่ใช้ sudo/docker รันได้ทุก user)

## 1. baseline ณ 2026-08-16 (ไว้เทียบเวลาสงสัยว่าอะไรเปลี่ยน)

- uptime 26 วัน, ทุก unit `NRestarts=0` (ไม่เคยล้มเลยตั้งแต่ boot)
- disk `/` ใช้ไป **81%** (เหลือ 14G จาก 67G) · RAM **1.9G** total, available ~0.9–1.0G, swap 1G
- cert หมดอายุ 22 ก.ย. (gatekeeper) / 5 ต.ค. (live) — `certbot.timer` ทำงานอยู่ ครอบคลุมช่วงพรีเซ็นแน่นอน
- โค้ดที่รันอยู่จริง = build เมื่อ **12 ส.ค. 04:51** จาก working tree ของ branch `fix/ui-mobile-desktop-seo`
  **รวม diff ที่ยังไม่ commit 5 ไฟล์** (ไม่ใช่ `main`) — สำคัญมาก ดูข้อ 3

## 2. รอบการตรวจ (ติดตั้งแล้ว 2026-08-16)

cron ของ user **claudebot** ตรวจทุก 10 นาที (ไม่ต้อง sudo) — รอบที่ปกติจะไม่เขียนอะไรลง log เลย
เขียนเฉพาะรอบที่มี WARN/FAIL พร้อมหัวเวลา:

```
*/10 * * * * bash /home/dup/gatekeeper/deployments/host/healthcheck.sh --quiet >> /home/claudebot/gatekeeper-health.log 2>&1
```

- ดูย้อนหลัง: `tail -50 /home/claudebot/gatekeeper-health.log` (**log ว่าง = ทุกอย่างปกติมาตลอด**)
- ตรวจเองแบบเห็นทุกข้อ: `bash deployments/host/healthcheck.sh`
- ถอนออก: `crontab -r` (ในสิทธิ์ claudebot)

รอบตรวจนี้ยิงผ่าน nginx จริงทุก 10 นาที (challenge → `/api/healthz` → `/login`) เลยทำหน้าที่
**warm-up ไปในตัว** — ไบนารีกับหน้าเพจอยู่ใน page cache ตลอด ไม่มีคำขอแรกที่ช้าเพราะเครื่องเงียบมานาน
(หมายเหตุ: droplet ตัวนี้ **ไม่มีสถานะ sleep/idle** อยู่แล้ว — service รันค้างตลอด uptime 26 วัน
การยิง keep-alive จึงเป็นเรื่อง cache กับการตรวจจับความผิดปกติ ไม่ใช่การกันเครื่องหลับ)

### สิทธิ์ที่ claudebot ทำได้/ไม่ได้ (สำคัญเวลาหวังพึ่งให้ช่วยดูแล)

อัปเดต 2026-08-16 — dup เปิดสิทธิ์ให้แล้วตามข้อ 6 (ทดสอบใช้งานจริงผ่านแล้ว):

| ทำได้ | ทำไม่ได้ (ต้องเป็น dup) |
|---|---|
| ตรวจสุขภาพทุกชั้น, ยิง HTTP probe, อ่าน `systemctl status`, แก้ไฟล์ใน repo | reboot, docker, certbot, `nginx -t`/reload, `deploy.sh`, `stop`/`disable` unit |
| `sudo systemctl restart` เฉพาะ 3 unit (backend@8089, backend@8090, frontend) | sudo อย่างอื่นทั้งหมด (ไม่มี `NOPASSWD: ALL`) |
| อ่าน `journalctl -u gatekeeper-*` + `/var/log/nginx/*` (group systemd-journal, adm) | — |

**เกร็ดที่ยืนยันตอนทดสอบ:** `systemctl restart` ด้วยมือ **ไม่ทำให้ `NRestarts` เพิ่ม** (ตัวนับนี้นับเฉพาะ
รอบที่ systemd ปลุกคืนเองจาก `Restart=on-failure`) — เพราะงั้น WARN "เคย restart มาแล้ว N ครั้ง"
ใน healthcheck จึงหมายถึง **service ล้มเองจริงๆ** เสมอ ไม่ใช่ผลจากการ deploy หรือ restart ด้วยมือ

สิ่งที่ระบบทำให้อยู่แล้วโดยไม่ต้องตั้งอะไรเพิ่ม:

| กลไก | ครอบคลุมอะไร |
|---|---|
| `Restart=on-failure` + `RestartSec=5` ในทุก unit | process ตายเอง → systemd ปลุกคืนใน 5 วิ |
| backend 2 instance หลัง nginx | ตัวเดียวตาย API ยังไม่ล่ม (frontend มีตัวเดียว = จุดเปราะ) |
| `certbot.timer` | ต่ออายุ TLS อัตโนมัติ |
| `fail2ban` + ufw | brute-force / พอร์ตที่ไม่ได้เปิด |
| crash-monitor ใน backend `:8089` | เฝ้า container ของ tenant ที่ crash-loop (แจ้งเตือน in-app; **เมลอาจส่งไม่ออกเพราะโฮสต์บล็อกพอร์ต SMTP**) |

## 3. ข้อห้ามช่วง freeze (นับจากนี้ถึงพรีเซ็นเสร็จ)

1. **อย่ารัน `deploy.sh` ถ้าไม่จำเป็นจริงๆ** — `next build` บนเครื่อง RAM 2G กินหนักมาก
   ถ้า OOM ขึ้นมาระหว่างนั้น service โดนฆ่าคาที่ และ build ที่รันอยู่ตอนนี้ก็ถูกทับไปแล้ว
   ถ้าจำเป็นต้อง deploy จริง ให้ทำ **อย่างน้อย 1 วันก่อน** แล้วรัน healthcheck ซ้ำ ไม่ใช่เช้าวันพรีเซ็น
2. **อย่า `git checkout` สลับ branch** — ของที่รันอยู่คือ build จาก `fix/ui-mobile-desktop-seo` + diff ที่ยังไม่ commit
   ตัว `dist/` กับ `.next/` ที่ build ไว้แล้วไม่หายไปตาม branch ก็จริง แต่ถ้าเผลอ build ใหม่บน `main`
   หน้าตาที่ซ้อมไว้จะเปลี่ยน (UI มือถือ/เดสก์ท็อป 16 จุดที่แก้ไปอยู่ใน branch นี้เท่านั้น)
3. อย่ารัน `pnpm install` / `pnpm build` เดี่ยวๆ (ทั้งเรื่อง ACL และ `NEXT_PUBLIC_*` หายทำเว็บพัง)
4. อย่าลบไฟล์ใน `data/` (audit.log, master.key, git-deployed) — ยังไม่มี backup อัตโนมัติ

## 4. ทำก่อนวันพรีเซ็น 1 วัน (T-1)

```bash
bash deployments/host/healthcheck.sh      # ต้องไม่มี FAIL
sudo reboot                               # เคลียร์ /var/run/reboot-required ที่ค้างมาตั้งแต่ 6 ส.ค.
# หลังเครื่องขึ้น (รอ ~1 นาที) — ทุก unit enable ไว้แล้ว ขึ้นเองทั้งหมด
bash deployments/host/healthcheck.sh
```

reboot ตอนนี้ดีกว่าปล่อยไว้: kernel ใหม่ยังไม่ได้ใช้ และเคย reboot-test ผ่านมาแล้วตอน migrate ออกจาก docker
สิ่งที่ควรทำต่อจากนั้นคือเปิด browser ไล่ flow ที่จะพรีเซ็นจริงหนึ่งรอบ (login → deploy แอปตัวอย่าง → เปิด `/live/<id>`)

## 5. เจอปัญหาแล้วทำอะไร

| อาการ | คำสั่งแรกที่ควรรัน |
|---|---|
| เว็บขึ้น 502 | `bash deployments/host/healthcheck.sh` แล้วดูว่า unit ไหนตาย → `sudo systemctl restart <unit>` |
| หน้าเว็บค้าง/ช้า แต่ API ปกติ | `sudo systemctl restart gatekeeper-frontend` (วูบ ~3 วิ ไม่ต้อง build ใหม่) |
| API พังทั้งคู่ | `sudo systemctl restart gatekeeper-backend@8089 gatekeeper-backend@8090` แล้วดู `journalctl -u gatekeeper-backend@8089 -n 100` |
| disk ใกล้เต็ม (>90%) | ไล่ที่ docker ก่อน: `sudo docker system df` แล้ว `sudo docker image prune -a` (image ของ tenant ที่ไม่ได้ใช้คือตัวกินหลัก) |
| RAM หมด / OOM | `sudo systemctl restart gatekeeper-frontend` คืน RAM ได้มากสุด; ถ้าเกิดตอน build = build ค้างครึ่งทาง ต้อง `deploy.sh` ใหม่ตอนว่าง |
| cert หมดอายุ (ไม่น่าเกิด) | `sudo certbot renew --nginx` แล้ว `sudo nginx -t && sudo systemctl reload nginx` |
| เปลี่ยน nginx config | `sudo nginx -t` ผ่านก่อนเสมอ แล้ว reload — ยืนยันว่า reload จริงด้วย `ps -eo pid,lstart,cmd \| grep '[n]ginx: worker'` (เวลาต้องเปลี่ยน) |

หลังแก้ทุกครั้ง: รัน `healthcheck.sh` ซ้ำให้ขึ้น "ปกติทั้งหมด" ก่อนเดินจากเครื่อง

## 6. ความเสี่ยงที่รู้อยู่แล้วแต่ยังไม่แก้ (ยอมรับไว้ช่วงนี้)

- **ไม่มี backup อัตโนมัติของ Postgres และ `data/`** — ถ้าอยากอุ่นใจ สั่ง dump มือก่อนพรีเซ็นหนึ่งครั้งพอ
- `data/audit.log` ยังไม่มี rotation (ตอนนี้ 196K โตช้ามาก ไม่ทันเป็นปัญหาในช่วงนี้)
- unattended-upgrades เปิดอยู่แต่ **ไม่ได้ตั้ง auto-reboot** → ไม่มี reboot เซอร์ไพรส์กลางดึก แต่แพตช์ที่ต้อง reboot จะค้างสะสม
- frontend มี instance เดียว — ถ้าตายคือเว็บดับจนกว่า systemd จะปลุกคืน (5 วิ) หรือถ้าตายซ้ำๆ ต้องเข้าไปดูเอง
- **ไม่มีใครกู้บริการอัตโนมัติเกินกว่าที่ systemd ทำ** — cron ตรวจเจอแล้วเขียน log แต่ restart เองไม่ได้

### เปิดสิทธิ์ให้ claudebot ดูแลได้เอง (dup รันเอง 2 คำสั่ง)

**ขั้นที่ 1 — สิทธิ์อ่าน log (แนะนำ ความเสี่ยงต่ำสุด ได้ประโยชน์มากสุด)**

```bash
sudo usermod -aG systemd-journal,adm claudebot
```

ได้ `journalctl -u gatekeeper-*` (journal เก็บลงดิสก์จริง ย้อนข้าม boot ได้) + อ่าน `/var/log/nginx/*`
เป็นสิทธิ์ **อ่านอย่างเดียว** ไม่ได้เพิ่มอำนาจสั่งการอะไรเลย ทุกวันนี้เวลาอะไรพังต้องเดาจาก HTTP probe
อย่างเดียวเพราะอ่าน log ไม่ได้ · มีผลกับ process ใหม่เท่านั้น (cron ได้ทันที, session ที่เปิดค้างต้องเปิดใหม่)

**ขั้นที่ 2 — สิทธิ์ restart เฉพาะ 3 unit (จะเปิดหรือไม่ก็ได้)**

```bash
sudo visudo -f /etc/sudoers.d/claudebot-gatekeeper
```

เนื้อไฟล์ (visudo จะตรวจ syntax ให้ก่อนบันทึก — อย่าแก้ด้วย editor ธรรมดา เสี่ยง sudo พังทั้งเครื่อง):

```
claudebot ALL=(root) NOPASSWD: /usr/bin/systemctl restart gatekeeper-backend@8089
claudebot ALL=(root) NOPASSWD: /usr/bin/systemctl restart gatekeeper-backend@8090
claudebot ALL=(root) NOPASSWD: /usr/bin/systemctl restart gatekeeper-frontend
```

แล้ว `sudo chmod 0440 /etc/sudoers.d/claudebot-gatekeeper`

ระบุ argument ครบทุกตัว = อนุญาตเฉพาะคำสั่งนั้นเป๊ะๆ — `stop`, `disable`, `mask`, unit อื่น,
reboot, docker, certbot, `deploy.sh` **ยังทำไม่ได้ทั้งหมด** และไม่มี `NOPASSWD: ALL`

ข้อแลกเปลี่ยน: ได้คนกด restart ให้ตอนตี 3 · แลกกับผิวสัมผัสที่เพิ่มให้ account ที่ไม่ใช่คน
ถ้าไม่เปิดก็ไม่ถือว่าพลาดอะไรมาก เพราะ `Restart=on-failure` ครอบเคสที่พบบ่อยสุด (process ตายเอง) อยู่แล้ว
เคสที่ต้องมีคนกดจริงคือ "process ยังอยู่แต่ค้างไม่ตอบ" ซึ่งพบยากกว่ามาก

**ข้อตกลงการใช้สิทธิ์นี้:** cron ทุก 10 นาที **จะไม่ restart อะไรเองอัตโนมัติ** (กันไว้ไม่ให้ไป restart
กลางตอนพรีเซ็น และกันไม่ให้ restart ซ้ำๆ กลบอาการจริง) — restart เกิดได้เฉพาะตอนรอบตรวจ 4 ชม.
ที่มีการอ่าน log ประกอบแล้วสรุปว่าควรกด และต้องรายงานทุกครั้งว่ากดอะไรไปเพราะอะไร
