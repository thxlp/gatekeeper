# -*- coding: utf-8 -*-
from docxbuild import *
from links import U


def build(d):
    d.h1("ภาคผนวก")
    d.p("ภาคผนวกรวบรวมรายละเอียดเชิงเทคนิคที่ยาวเกินกว่าจะแทรกไว้ในเนื้อหาหลัก "
        "แต่จำเป็นต่อการทำความเข้าใจและการทำซ้ำผลงาน", indent_first=True)

    # ==================== ภาคผนวก ก ====================
    d.h2("ภาคผนวก ก  ชุดกฎการตรวจจับทั้งหมด")
    d.p([
        "กฎทั้งหมดเก็บเป็นไฟล์ JSON สองไฟล์ในไดเรกทอรี ", C("configs/detection-rules/"),
        " ซึ่งถูกโหลดครั้งเดียวเมื่อบริการเริ่มทำงาน การเพิ่มหรือแก้ไขกฎทำได้โดยแก้ไฟล์"
        "แล้วรีสตาร์ตบริการ โดยไม่ต้อง build โค้ดใหม่",
    ])
    d.h3("ก.1  secret-patterns.json")
    d.code("""[
  {
    "id": "AWS-ACCESS-KEY",
    "pattern": "AKIA[0-9A-Z]{16}",
    "flags": "g",
    "severity": "HIGH",
    "description": "พบรูปแบบ AWS Access Key ID ฝังอยู่ในโค้ด"
  },
  {
    "id": "PRIVATE-KEY-BLOCK",
    "pattern": "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",
    "flags": "g",
    "severity": "CRITICAL",
    "description": "พบ Private Key block ฝังอยู่ในไฟล์"
  },
  {
    "id": "SLACK-TOKEN",
    "pattern": "xox[baprs]-[0-9A-Za-z-]{10,}",
    "flags": "g",
    "severity": "HIGH",
    "description": "พบรูปแบบ Slack Token"
  },
  {
    "id": "GENERIC-HARDCODED-SECRET",
    "pattern": "(api[_-]?key|secret|token|password)\\\\s*[:=]\\\\s*[\\"'][A-Za-z0-9+/_=-]{16,}[\\"']",
    "flags": "gi",
    "severity": "MEDIUM",
    "description": "พบค่าที่ดูเหมือน secret/credential ถูก hardcode ไว้ในซอร์สโค้ด"
  }
]""")
    d.h3("ก.2  heuristic-patterns.json")
    d.code("""[
  {
    "id": "PHP-EVAL-BASE64",
    "pattern": "eval\\\\s*\\\\(\\\\s*base64_decode\\\\s*\\\\(",
    "flags": "gi",
    "severity": "CRITICAL",
    "description": "รูปแบบคลาสสิกของ webshell: eval ค่าที่ decode จาก base64"
  },
  {
    "id": "PHP-SYSTEM-FROM-REQUEST",
    "pattern": "(system|exec|passthru|shell_exec|popen)\\\\s*\\\\(\\\\s*\\\\$_(GET|POST|REQUEST|COOKIE)",
    "flags": "gi",
    "severity": "CRITICAL",
    "description": "เรียก system command โดยใช้ค่าจาก user input ของ request ตรงๆ"
  },
  {
    "id": "JS-EVAL-ATOB",
    "pattern": "eval\\\\s*\\\\(\\\\s*atob\\\\s*\\\\(",
    "flags": "gi",
    "severity": "HIGH",
    "description": "JS eval ค่าที่ decode จาก base64 (atob) มักใช้ซ่อน payload"
  },
  {
    "id": "DYNAMIC-FUNC-CREATE",
    "pattern": "create_function\\\\s*\\\\(|new\\\\s+Function\\\\s*\\\\(",
    "flags": "gi",
    "severity": "MEDIUM",
    "description": "สร้างฟังก์ชันแบบ dynamic จาก string ซึ่งมักใช้หลบ static scanner"
  },
  {
    "id": "WIN-ENCODED-PS",
    "pattern": "powershell(\\\\.exe)?\\\\s+(-enc|-e|-EncodedCommand)\\\\b",
    "flags": "gi",
    "severity": "CRITICAL",
    "description": "เรียก PowerShell ด้วย encoded command ซึ่งมักใช้ซ่อน payload"
  },
  {
    "id": "CERTUTIL-DECODE",
    "pattern": "certutil(\\\\.exe)?\\\\s+-decode",
    "flags": "gi",
    "severity": "HIGH",
    "description": "ใช้ certutil decode ไฟล์ ซึ่งเป็นเทคนิคหลบ AV บน Windows ที่พบบ่อย"
  },
  {
    "id": "SUSPICIOUS-CURL-PIPE-SH",
    "pattern": "curl[^\\\\n]{0,80}\\\\|\\\\s*(sh|bash)\\\\b",
    "flags": "gi",
    "severity": "HIGH",
    "description": "ดาวน์โหลดสคริปต์แล้ว pipe เข้า shell ทันทีโดยไม่ผ่านการตรวจสอบ"
  }
]""")

    # ==================== ภาคผนวก ข ====================
    d.h2("ภาคผนวก ข  รายการ API endpoint ทั้งหมด")
    d.p([
        "ระบบมี endpoint รวม 52 รายการภายใต้ prefix ", C("/api"),
        " โดยคอลัมน์ “การพิสูจน์ตัวตน” ระบุว่า ", C("AuthGuard"),
        " หมายถึงต้องมี session cookie หรือ Bearer token ที่ถูกต้อง ",
        "ส่วน ", C("HMAC"), " หมายถึงพิสูจน์ด้วยลายเซ็นของผู้ให้บริการภายนอก และ ", C("สาธารณะ"),
        " หมายถึงเปิดให้เรียกได้โดยไม่ต้องยืนยันตัวตน",
    ])

    def tbl(title, rows, caption):
        d.h3(title)
        d.table([["เมท็อดและเส้นทาง", "หน้าที่", "การพิสูจน์ตัวตน"]] + rows,
                widths=[3300, 4550, 1500], font_sz=26, align_center_cols=[2], caption=caption)

    tbl("ข.1  กลุ่มการยืนยันตัวตน (7 endpoint)",
        [[C("POST /api/auth/session"), "แลก access token จาก Supabase เป็น session cookie", "สาธารณะ"],
         [C("POST /api/auth/session/verify"), "ยืนยันรหัส OTP สำหรับบัญชีที่เปิด 2FA", "สาธารณะ"],
         [C("POST /api/auth/session/resend"), "ขอส่งรหัส OTP ใหม่", "สาธารณะ"],
         [C("POST /api/auth/2fa/otp"), "ขอรหัส OTP สำหรับการเปิดหรือปิด 2FA", "AuthGuard"],
         [C("POST /api/auth/2fa/enable"), "เปิดใช้ 2FA", "AuthGuard"],
         [C("POST /api/auth/2fa/disable"), "ปิดใช้ 2FA", "AuthGuard"],
         [C("POST /api/auth/logout"), "ล้าง session cookie และเพิกถอน key", "AuthGuard"]],
        "ตารางที่ ข.1 endpoint กลุ่มการยืนยันตัวตน")

    tbl("ข.2  กลุ่มการจัดการแอปพลิเคชัน (15 endpoint)",
        [[C("POST /api/apps/register"), "ลงทะเบียนแอปจาก repository (ระบุ URL เอง)", "AuthGuard"],
         [C("POST /api/apps/register-github"), "ลงทะเบียนแอปจาก repository ที่เชื่อมผ่าน OAuth", "AuthGuard"],
         [C("POST /api/apps/manual/deploy"), "อัปโหลดไฟล์ zip แล้วเริ่ม pipeline", "AuthGuard"],
         [C("POST /api/apps/:id/deploy"), "สั่ง deploy ใหม่ด้วยตนเอง", "AuthGuard"],
         [C("POST /api/apps/:id/rollback"), "ย้อนกลับไปยัง release ที่ระบุ", "AuthGuard"],
         [C("GET /api/apps"), "รายการแอปทั้งหมดของบัญชี", "AuthGuard"],
         [C("GET /api/apps/:id"), "รายละเอียดแอปหนึ่งตัวพร้อมสถานะ pipeline", "AuthGuard"],
         [C("PATCH /api/apps/:id"), "แก้ไขการตั้งค่าแอป", "AuthGuard"],
         [C("DELETE /api/apps/:id"), "ลบแอปพร้อมคอนเทนเนอร์ image และ volume", "AuthGuard"],
         [C("GET /api/apps/:id/env"), "รายการตัวแปรสภาพแวดล้อม (ค่าถูกปิดบัง)", "AuthGuard"],
         [C("POST /api/apps/:id/env"), "เพิ่มหรือแก้ไขตัวแปรหนึ่งรายการ", "AuthGuard"],
         [C("PUT /api/apps/:id/env"), "แทนที่ตัวแปรทั้งชุด", "AuthGuard"],
         [C("DELETE /api/apps/:id/env/:key"), "ลบตัวแปรหนึ่งรายการ", "AuthGuard"],
         [C("GET /api/apps/:id/logs"), "ดึง log ย้อนหลัง (สูงสุด 2,000 บรรทัด)", "AuthGuard"],
         [C("GET /api/apps/:id/logs/stream"), "stream log แบบสด", "AuthGuard"]],
        "ตารางที่ ข.2 endpoint กลุ่มการจัดการแอปพลิเคชัน")

    tbl("ข.3  กลุ่มโดเมนและฐานข้อมูล (10 endpoint)",
        [[C("GET /api/apps/:id/domains"), "รายการ custom domain ของแอป", "AuthGuard"],
         [C("POST /api/apps/:id/domains"), "เพิ่ม custom domain (สูงสุด 5 ต่อแอป)", "AuthGuard"],
         [C("POST /api/apps/:id/domains/:domain/verify"), "ตรวจ DNS แล้วออกใบรับรอง TLS", "AuthGuard"],
         [C("DELETE /api/apps/:id/domains/:domain"), "ลบ domain และเพิกถอนใบรับรอง", "AuthGuard"],
         [C("GET /api/databases"), "รายการฐานข้อมูลของบัญชีพร้อมสถานะสด", "AuthGuard"],
         [C("POST /api/databases"), "สร้างฐานข้อมูลใหม่ (PostgreSQL / Redis / MySQL)", "AuthGuard"],
         [C("GET /api/databases/:id/connection"), "ขอ connection string ฉบับเต็ม", "AuthGuard"],
         [C("POST /api/databases/:id/attach"), "ผูกฐานข้อมูลเข้ากับแอป", "AuthGuard"],
         [C("POST /api/databases/:id/detach"), "ถอดฐานข้อมูลออกจากแอป", "AuthGuard"],
         [C("DELETE /api/databases/:id"), "ลบฐานข้อมูลพร้อม volume (ข้อมูลหายถาวร)", "AuthGuard"]],
        "ตารางที่ ข.3 endpoint กลุ่มโดเมนและฐานข้อมูล")

    tbl("ข.4  กลุ่มบัญชี การเชื่อมต่อ และอื่น ๆ (20 endpoint)",
        [[C("GET /api/account/me"), "ข้อมูลบัญชีปัจจุบัน", "AuthGuard"],
         [C("PATCH /api/account/prefs"), "ตั้งค่าการแจ้งเตือน", "AuthGuard"],
         [C("GET /api/github/status"), "สถานะการเชื่อมบัญชี GitHub", "AuthGuard"],
         [C("POST /api/github/connect"), "เชื่อมบัญชี GitHub ผ่าน OAuth", "AuthGuard"],
         [C("DELETE /api/github/connect"), "ยกเลิกการเชื่อมบัญชี", "AuthGuard"],
         [C("GET /api/github/repos"), "รายการ repository ของผู้ใช้", "AuthGuard"],
         [C("GET /api/github/repos/:owner/:repo/branches"), "รายการ branch ของ repository", "AuthGuard"],
         [C("GET /api/usage"), "สถิติการใช้งานและโควตาของบัญชี", "AuthGuard"],
         [C("GET /api/notifications"), "รายการแจ้งเตือน", "AuthGuard"],
         [C("POST /api/notifications/read"), "ทำเครื่องหมายว่าอ่านแล้ว", "AuthGuard"],
         [C("GET /api/challenge"), "หน้ารับ challenge", "สาธารณะ"],
         [C("POST /api/challenge/verify"), "ตรวจ challenge แล้วออก cookie", "สาธารณะ"],
         [C("GET /api/webhooks/github"), "หน้าสรุปสถานะ webhook", "สาธารณะ"],
         [C("POST /api/webhooks/github"), "รับ push event จาก GitHub", "HMAC"],
         [C("POST /api/webhooks/gitlab"), "รับ push event จาก GitLab", "HMAC"],
         [C("POST /api/webhooks/bitbucket"), "รับ push event จาก Bitbucket", "HMAC"],
         [C("ALL /live/:appId"), "proxy เข้าคอนเทนเนอร์ของแอป", "สาธารณะ"],
         [C("ALL /live/:appId/*"), "proxy เส้นทางย่อยของแอป", "สาธารณะ"],
         [C("ALL /__domain"), "proxy ตาม Host header ของ custom domain", "สาธารณะ"],
         [C("ALL /__domain/*"), "proxy เส้นทางย่อยของ custom domain", "สาธารณะ"]],
        "ตารางที่ ข.4 endpoint กลุ่มบัญชี การเชื่อมต่อ และอื่น ๆ")

    # ==================== ภาคผนวก ค ====================
    d.h2("ภาคผนวก ค  โครงสร้างของ repository")
    d.code("""gatekeeper/
├── backend/                       NestJS backend (7,217 บรรทัด / 92 ไฟล์)
│   └── src/
│       ├── account/               บัญชีผู้ใช้และ API key
│       ├── apps/                  การจัดการแอป, ตัวแปร, การแตกไฟล์ zip
│       ├── audit/                 การเขียนและอ่าน audit log
│       ├── auth/                  Supabase, session cookie, 2FA, AuthGuard
│       ├── challenge/             challenge cookie
│       ├── common/                การเข้ารหัส, เส้นทางไฟล์, นิยามชนิดข้อมูล
│       ├── database/              managed database ต่อบัญชี
│       ├── decision/              risk-engine.service.ts
│       ├── deploy/                pipeline, Docker runtime, crash monitor
│       ├── domain/                custom domain และการออกใบรับรอง TLS
│       ├── entitlement/           โควตาและสถิติการใช้งาน
│       ├── github/                OAuth และการเรียก GitHub API
│       ├── health/                endpoint ตรวจสุขภาพบริการ
│       ├── live/                  reverse proxy เข้าคอนเทนเนอร์
│       ├── mail/                  การส่งอีเมลผ่าน SMTP
│       ├── migrations/            สคริปต์ปรับโครงสร้างฐานข้อมูล 7 รายการ
│       ├── notification/          การแจ้งเตือนในระบบ
│       ├── scanner/               scanner.service.ts, dependency-audit.service.ts
│       ├── ticket/                ticket ที่ลงลายเซ็น HMAC
│       └── webhook/               การรับ webhook ทั้งสามผู้ให้บริการ
│
├── frontend/                      Next.js frontend (5,775 บรรทัด / 36 ไฟล์)
│   └── src/
│       ├── app/                   หน้าเว็บตาม App Router
│       ├── components/            ส่วนประกอบ UI (shell, ui, auth)
│       ├── lib/                   ตัวเรียก API, Supabase client, ยูทิลิตี
│       └── types/                 นิยามชนิดข้อมูลฝั่ง frontend
│
├── configs/
│   ├── detection-rules/           secret-patterns.json, heuristic-patterns.json
│   └── git-apps.json              แอปแบบ ops-managed (อ่านอย่างเดียว)
│
├── deployments/
│   ├── docker/                    docker-compose.yml, สคริปต์ firewall และการย้าย network
│   ├── host/                      deploy.sh, nginx conf, สคริปต์ออกและลบใบรับรอง, README
│   └── systemd/                   unit ของ backend, frontend และ firewall
│
├── data/                          ที่จัดเก็บสถานะบน host (audit.log, master.key, staging ฯลฯ)
└── CLAUDE.md                      ข้อบังคับประจำโครงการสำหรับผู้ร่วมพัฒนา""",
           caption="ภาพที่ ค.1 โครงสร้างไดเรกทอรีของ repository")

    # ==================== ภาคผนวก ง ====================
    d.h2("ภาคผนวก ง  ตัวแปรสภาพแวดล้อมและค่าตั้งต้นของระบบ")
    d.table(
        [["ตัวแปร", "ค่าปริยาย", "ความหมาย"],
         [C("GATEKEEPER_MASTER_KEY"), "สร้างเป็นไฟล์ให้อัตโนมัติ",
          "กุญแจหลักสำหรับเข้ารหัสความลับ (hex 64 ตัวอักษร = 32 ไบต์)"],
         [C("GATEKEEPER_TICKET_SECRET"), "ต้องกำหนดเอง", "กุญแจสำหรับลงลายเซ็น ticket"],
         [C("COOKIE_CHALLENGE_SECRET"), "ต้องกำหนดเอง", "กุญแจสำหรับลงลายเซ็น challenge cookie"],
         [C("DATABASE_URL"), "ต้องกำหนดเอง", "การเชื่อมต่อ PostgreSQL"],
         [C("SUPABASE_URL / SUPABASE_ANON_KEY"), "ต้องกำหนดเอง", "การเชื่อมต่อ Supabase Auth"],
         [C("BIND_HOST"), C("127.0.0.1"), "ที่อยู่ที่ backend รับฟัง (ต้องเป็น loopback บน host)"],
         [C("GATEKEEPER_HOST_MODE"), "1", "ปิดการเชื่อมตัวเองเข้า network เมื่อรันบน host"],
         [C("GATEKEEPER_ROOT"), "รากของ repository", "ฐานของเส้นทาง data/ และ configs/"],
         [C("SESSION_IDLE_MINUTES"), "15", "ระยะเวลาที่ไม่มีการใช้งานก่อน session หมดอายุ"],
         [C("USER_QUOTA_MEMORY_MB"), "256", "เพดานผลรวมหน่วยความจำต่อบัญชี"],
         [C("USER_QUOTA_CPU"), "0.5", "เพดานผลรวม CPU ต่อบัญชี"],
         [C("APP_MAX_MEMORY_MB"), "1024", "เพดานหน่วยความจำต่อคอนเทนเนอร์หนึ่งตัว"],
         [C("APP_MAX_CPU"), "2", "เพดาน CPU ต่อคอนเทนเนอร์หนึ่งตัว"],
         [C("APP_PIDS_LIMIT"), "256", "เพดานจำนวนโพรเซสต่อคอนเทนเนอร์"],
         [C("APP_LOG_MAX_SIZE / MAX_FILE"), "10m / 3", "นโยบายหมุนไฟล์ log ของคอนเทนเนอร์"],
         [C("APP_LOG_MAX_TAIL"), "2000", "จำนวนบรรทัด log สูงสุดที่ขอได้ต่อครั้ง"],
         [C("DEPLOY_HEALTHCHECK_TIMEOUT_MS"), "60000", "เวลารอ healthcheck สูงสุดก่อนถือว่า degraded"],
         [C("RELEASE_KEEP"), "5", "จำนวน release ย้อนหลังที่เก็บ image ไว้ให้ย้อนรุ่น"],
         [C("ADDON_VOLUME_RETENTION_DAYS"), "7", "ระยะเวลาที่เก็บ volume ของบริการเสริมที่ถูกถอด"],
         [C("CRASHLOOP_THRESHOLD / WINDOW_MS"), "3 / 300000", "เกณฑ์ตัดสินภาวะ crash-loop"],
         [C("CRASHLOOP_COOLDOWN_MS"), "1800000", "ระยะเวลาที่ไม่แจ้งเตือนซ้ำต่อแอปเดียวกัน"],
         [C("MAX_CUSTOM_DOMAINS_PER_APP"), "5", "จำนวน custom domain สูงสุดต่อแอป"],
         [C("GATEKEEPER_BUILD_SUBNET"), C("172.31.238.0/24"),
          "subnet ของ network ช่วง build ที่กฎ firewall อ้างถึง"],
         [C("SMTP_HOST / PORT / USER / PASS"), "ว่าง",
          "การตั้งค่า SMTP หากเว้นว่างระบบจะข้ามการส่งอีเมลและเปิด 2FA ไม่ได้"]],
        widths=[3000, 1900, 4450], font_sz=26,
        caption="ตารางที่ ง.1 ตัวแปรสภาพแวดล้อมและค่าปริยายของระบบ")

    # ==================== ภาคผนวก จ ====================
    d.h2("ภาคผนวก จ  ประวัติการพัฒนาที่สำคัญ")
    d.p("ตารางต่อไปนี้คัดเฉพาะ commit ที่มีนัยสำคัญเชิงสถาปัตยกรรมหรือความปลอดภัย "
        "จากทั้งหมด 95 commit เรียงจากเก่าไปใหม่", indent_first=True)
    d.table(
        [["วันที่", "รหัส commit", "สาระสำคัญ"],
         ["6 ก.ค. 2569", C("65e59ba"), "เพิ่มการ deploy จาก GitHub repository พร้อมสร้าง webhook อัตโนมัติ"],
         ["6 ก.ค. 2569", C("338a232"), "เก็บ API key เป็น hash และเข้ารหัสความลับของผู้ใช้ด้วย AES-256-GCM"],
         ["7 ก.ค. 2569", C("0c46c28"), "เพิ่ม session idle timeout 15 นาที"],
         ["7 ก.ค. 2569", C("aa16701"), "ย้าย API key จาก localStorage ไปเป็น httpOnly cookie"],
         ["7 ก.ค. 2569", C("770ec9d"), "แยก origin ของแอปผู้ใช้ออกจากแดชบอร์ด"],
         ["10 ก.ค. 2569", C("833eb03"), "ปิดช่องโหว่ SSRF และลบบัญชีทดสอบออกจากระบบจริง"],
         ["10 ก.ค. 2569", C("6babad6"), "ถอดการเชื่อถือ proxy ออกเพราะทำให้ผู้ใช้จริงเข้าระบบไม่ได้"],
         ["10 ก.ค. 2569", C("722e677"), "ปรับ pipeline ให้ยืดหยุ่น รองรับหลาย runtime และบริการเสริม"],
         ["11 ก.ค. 2569", C("1f3ce9c"), "แก้การ deploy จาก zip ที่ล้มเหลวทุกไฟล์ (default import กับ CommonJS)"],
         ["11 ก.ค. 2569", C("1eeeed5"), "ถอดการผูก challenge token กับหมายเลข IP"],
         ["15 ก.ค. 2569", C("894399e"), "ปิด reflected XSS และตั้งรหัสผ่านให้ Redis"],
         ["17 ก.ค. 2569", C("cf69240"), "ปรับการอัปโหลด zip ให้ยืดหยุ่นและวินิจฉัยข้อผิดพลาดได้จริง"],
         ["19 ก.ค. 2569", C("2f78c40"), "แยก network ต่อผู้ใช้ และเพิ่มการ์ดสรุปการใช้ทรัพยากร"],
         ["19 ก.ค. 2569", C("de95c34"), "เพิ่มโควตาทรัพยากรรวมต่อบัญชี"],
         ["19 ก.ค. 2569", C("43bb386"), "ถอด capability ทั้งหมดแล้วคืนเพียง 6 รายการ"],
         ["20 ก.ค. 2569", C("680e5f5"), "จำกัดการเชื่อมต่อขาออกของ network ช่วง build"],
         ["20 ก.ค. 2569", C("13c6839"), "เพิ่มกฎ INPUT ปิดช่องทางที่ build ยิงเข้า host โดยตรง"],
         ["20 ก.ค. 2569", C("b282500"), "เพิ่ม CSP และ security headers, PidsLimit, read-only rootfs"],
         ["21 ก.ค. 2569", C("6f3d67f"), "ย้าย backend, frontend และ nginx ออกจาก Docker ไปรันบน host"],
         ["21 ก.ค. 2569", C("ded3a43"), "ย้ายตัวจัดการแพ็กเกจจาก npm ไป pnpm ผ่าน corepack"],
         ["21 ก.ค. 2569", C("fe96e71"), "ถอนฟีเจอร์ plugin registry ออกจากระบบทั้งหมด"],
         ["21 ก.ค. 2569", C("76bb54c"), "อัปเกรด Next.js เป็น 14.2.35 เพื่อปิดช่องโหว่ที่ประกาศแล้ว"],
         ["21 ก.ค. 2569", C("f0fb459"), "เพิ่มการย้อนรุ่นและนโยบายเก็บ image 5 รุ่นล่าสุด"],
         ["21 ก.ค. 2569", C("9a8a218"), "เพิ่มการแจ้งเตือนในระบบและทางอีเมล"],
         ["21 ก.ค. 2569", C("ccac934"), "เพิ่มการยืนยันตัวตนสองขั้นตอนด้วยรหัส OTP ทางอีเมล"],
         ["25 ก.ค. 2569", C("42e7254"), "เพิ่มการดู log แบบสดและการจัดการตัวแปรสภาพแวดล้อม"],
         ["25 ก.ค. 2569", C("2a6f399"), "เพิ่ม crash-loop detection และ managed database ต่อบัญชี"],
         ["25 ก.ค. 2569", C("fdeea73"), "เพิ่ม custom domain พร้อม auto-TLS และรองรับ GitLab กับ Bitbucket"],
         ["25 ก.ค. 2569", C("67f0c74"), "ปิดบังค่าความลับบนหน้าจอพร้อมปุ่มเปิดดู"]],
        widths=[1500, 1500, 6350], font_sz=26,
        caption="ตารางที่ จ.1 ประวัติการพัฒนาที่สำคัญ")

    # ==================== ภาคผนวก ฉ ====================
    d.h2("ภาคผนวก ฉ  คำสั่งที่ใช้ในการติดตั้งและ deploy ระบบ")
    d.p([
        "การ deploy ตัวระบบเองในรอบปกติใช้สคริปต์เดียว ซึ่งจะ build ทั้งสองฝั่งแล้วรีสตาร์ต",
        "บริการทีละอินสแตนซ์เพื่อไม่ให้บริการขาดตอน",
    ])
    d.code("""# deploy รอบปกติ (build + rolling restart)
bash deployments/host/deploy.sh

# ตรวจสุขภาพของทั้งสองอินสแตนซ์
curl -sf http://127.0.0.1:8089/healthz
curl -sf http://127.0.0.1:8090/healthz

# ตรวจไวยากรณ์ของ nginx ก่อน reload ทุกครั้ง (ข้อบังคับของโครงการ)
sudo nginx -t && sudo systemctl reload nginx

# ติดตั้งกฎ firewall ของ network ช่วง build (รันซ้ำได้ ไม่เกิดกฎซ้อน)
sudo bash deployments/docker/build-egress-firewall.sh""",
           caption="ภาพที่ ฉ.1 คำสั่งหลักในการดูแลระบบ")
    d.note([B("ข้อบังคับของโครงการที่บันทึกไว้ใน CLAUDE.md: "),
            T("(1) ต้องรัน "), C("nginx -t"), T(" ให้ผ่านก่อนสั่ง reload ทุกครั้ง "
              "(2) ทุกบริการบน host ต้อง bind ที่ 127.0.0.1 เท่านั้น ยกเว้น nginx "
              "(3) ห้ามใช้ default import กับโมดูล CommonJS ในฝั่ง backend "
              "(4) ต้องทำงานบน branch แยกเสมอ ไม่ commit เข้า main โดยตรง")])
