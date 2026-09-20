# -*- coding: utf-8 -*-
"""
สร้างไฟล์ .docx ของสคริปต์นำเสนอฝั่งหน้าเว็บ (front end) จากเนื้อหาใน
PRESENTATION-SCRIPT-FRONTEND.md — เอกสารนี้ใช้อ่านตอนพูด/อัดวิดีโอ ไม่ใช่ส่วนหนึ่งของรูปเล่ม
จึงแยกจาก build.py ของรายงาน 5 บท

รัน:  python3 gen_frontend_script.py [ชื่อไฟล์ออก.docx]
"""
import sys
from docxbuild import Doc, T, B, I, C

# ---------------------------------------------------------------------------
# เนื้อสคริปต์ — โครงเดียวกับไฟล์ .md ทุกตัวอักษร
#   (หัวข้อ, จอที่ต้องโชว์, [ประโยคที่พูด, คำแปลไทย, เลข ⏱ ถ้าตัดได้])
# ---------------------------------------------------------------------------
SECTIONS = [
    {
        "head": "1 · Opening — [00:00 – 00:40]",
        "screen": "หน้า Projects (/) ที่มีแอปอยู่จริงสัก 3–4 ตัว",
        "lines": [
            ("Hello. My name is Thepparat. // Today I will talk about the front end of my project, Gatekeeper.",
             "สวัสดีครับ ผมชื่อเทพรัตน์ วันนี้จะพูดถึงส่วนหน้าเว็บของโปรเจกต์ Gatekeeper", None),
            ("Gatekeeper is a deployment platform with a mandatory security gate. // My part is the web dashboard — "
             "the part the user actually sees and touches.",
             "Gatekeeper คือแพลตฟอร์ม deploy ที่มีด่านตรวจบังคับ ส่วนที่ผมจะพูดคือหน้าเว็บ — ส่วนที่ผู้ใช้เห็นและกดจริง", None),
            ("It is built with Next.js, React, and TypeScript.",
             "สร้างด้วย Next.js + React + TypeScript", None),
            ("I will show three things. // How a user deploys. // How the dashboard shows the security decision. // "
             "And how the front end handles secrets safely.",
             "จะโชว์ 3 เรื่อง: ผู้ใช้ deploy ยังไง, หน้าเว็บแสดงผลการตัดสินของด่านตรวจยังไง, "
             "และหน้าเว็บจัดการความลับยังไงให้ปลอดภัย", None),
        ],
    },
    {
        "head": "2 · Design goal — [00:40 – 01:22]",
        "screen": "ค้างที่หน้า Projects ให้เห็นแถบเมนูซ้าย แล้วกดสลับ ไทย↔อังกฤษ และ สว่าง↔มืด ให้ดู 1 ครั้ง",
        "lines": [
            ("My users are students and small developers. // Many of them have never used a deployment platform before.",
             "ผู้ใช้ของผมคือนักศึกษาและนักพัฒนารายเล็ก หลายคนไม่เคยใช้แพลตฟอร์ม deploy มาก่อนเลย", None),
            ("So the design rule is simple. // One screen, one job. // No configuration files, and no terminal.",
             "กฎการออกแบบจึงง่ายมาก: หนึ่งหน้าจอทำงานเดียว ไม่ต้องเขียนไฟล์ config และไม่ต้องใช้ terminal", None),
            ("The dashboard has four places only. // Projects, Deploy, Databases, and the Audit log. // "
             "They stay in a fixed sidebar, so the user is never lost.",
             "หน้าเว็บมีแค่ 4 ที่: Projects, Deploy, Databases, Audit log · อยู่ในแถบซ้ายที่กางค้างตลอด ผู้ใช้ไม่หลง", None),
            ("Everything is in Thai and English, and in a light or a dark theme. // "
             "The user chooses, and the browser remembers.",
             "ทุกข้อความมีทั้งไทยและอังกฤษ และมีธีมสว่าง/มืด ผู้ใช้เลือกเอง เบราว์เซอร์จำค่าไว้ให้", None),
        ],
    },
    {
        "head": "3 · Two ways to deploy — [01:22 – 02:30]",
        "screen": "หน้า Deploy (/deploy) — โชว์แท็บ GitHub ก่อน แล้วสลับไปแท็บ Manual upload แล้วลากโฟลเดอร์ลงจริง",
        "lines": [
            ("There are two ways to deploy, on one page.",
             "มี 2 ทางในการ deploy อยู่ในหน้าเดียวกัน", None),
            ("The first way is GitHub. // The user connects the account once, picks a repository from a list, "
             "and picks a branch. // The webhook is created for them, so the next git push deploys by itself.",
             "ทางแรกคือ GitHub: ต่อบัญชีครั้งเดียว เลือก repo จากรายการ เลือก branch · ระบบสร้าง webhook ให้เอง "
             "push ครั้งต่อไป deploy เองเลย", None),
            ("The second way needs no Git at all. // The user drags a project folder onto the page. // "
             "The browser compresses it into a zip file and uploads it.",
             "ทางที่สองไม่ต้องมี Git เลย: ลากโฟลเดอร์โปรเจกต์มาวางบนหน้าเว็บ เบราว์เซอร์บีบเป็นไฟล์ zip ให้แล้วอัปโหลดต่อ", None),
            ("This matters for beginners. // Many of my users can write code, but have never made a zip file, "
             "and have never used Git.",
             "จุดนี้สำคัญกับมือใหม่: หลายคนเขียนโค้ดเป็น แต่ไม่เคยทำไฟล์ zip และไม่เคยใช้ Git", None),
            ("Next to the form, there is a small preview that says what will happen: clone, scan, build, "
             "and the live URL. // The user knows the code will be scanned before they press the button.",
             "ข้างฟอร์มมีกล่องเล่าล่วงหน้าว่าจะเกิดอะไรต่อ (clone → สแกน → build → ได้ URL) "
             "ผู้ใช้รู้ตั้งแต่ก่อนกดว่าโค้ดจะถูกสแกน", 1),
        ],
    },
    {
        "head": "4 · Watching the gate decide — [02:30 – 03:32]",
        "screen": "หน้าโปรเจกต์ (/apps/<id>) ตอน deploy กำลังวิ่ง ให้เห็น 5 ขั้นขยับจริง — "
                  "ถ้าอัดวิดีโอ ให้เตรียมโค้ดที่โดน BLOCK ไว้อีกอันเพื่อโชว์ findings",
        "lines": [
            ("After the user presses Deploy, the page moves to the project screen. // "
             "The five pipeline stages are drawn as a list.",
             "กด Deploy แล้วเว็บพาไปหน้าโปรเจกต์ ซึ่งวาด 5 ขั้นของไปป์ไลน์เป็นรายการให้เห็น", None),
            ("Each stage has its own state. // Waiting, running, passed, or failed. // "
             "The page asks the server for the status every one and a half seconds, so the list moves while the deploy runs.",
             "แต่ละขั้นมีสถานะของตัวเอง: รอ / กำลังทำ / ผ่าน / ล้มเหลว · หน้าเว็บถามสถานะจากเซิร์ฟเวอร์ทุก 1.5 วินาที "
             "รายการจึงขยับสดๆ ระหว่าง deploy", None),
            ("The important stage is stage three, the security gate.",
             "ขั้นที่สำคัญคือขั้นที่ 3 — ด่านตรวจความปลอดภัย", None),
            ("If the code is blocked, I do not show only the word failed. // I show every finding: the severity, "
             "the rule that matched, and the file name.",
             "ถ้าโค้ดถูกบล็อก ผมไม่ได้แสดงแค่คำว่า “ล้มเหลว” แต่แสดงทุก finding: ระดับความรุนแรง, กฎที่จับได้, และชื่อไฟล์", None),
            ("I think this is the most important screen in the whole project. // The gate can say no — "
             "but the user must understand why, and be able to fix it.",
             "ผมคิดว่านี่คือหน้าจอที่สำคัญที่สุดของโปรเจกต์ · ด่านตรวจปฏิเสธได้ แต่ผู้ใช้ต้องเข้าใจว่าทำไม และแก้ต่อได้", None),
        ],
    },
    {
        "head": "5 · Living with an app — [03:32 – 04:25]",
        "screen": "ไล่แท็บบนหน้าโปรเจกต์ให้เห็นทีละอัน (โดยเฉพาะ Logs ที่วิ่งสด) แล้วแวะหน้า Databases และ Audit log สั้นๆ",
        "lines": [
            ("After the deploy, one project screen has five tabs.",
             "หลัง deploy เสร็จ หน้าโปรเจกต์หนึ่งหน้ามี 5 แท็บ", None),
            ("Overview shows the release history, and a rollback button.",
             "Overview: ประวัติเวอร์ชัน และปุ่มย้อนกลับเวอร์ชันเดิม", None),
            ("Logs streams the container output live.",
             "Logs: สตรีม log ของคอนเทนเนอร์แบบสด", None),
            ("Variables is for environment variables and secrets.",
             "Variables: จัดการตัวแปรและความลับ", None),
            ("Deploy is for the webhook and the auto-deploy switch. // And Domains is for a custom domain, "
             "where we check DNS and get the certificate automatically.",
             "Deploy: webhook กับสวิตช์ auto-deploy · Domains: ผูกโดเมนของผู้ใช้เอง ระบบเช็ก DNS แล้วออกใบรับรองให้อัตโนมัติ", None),
            ("There is also a Databases page. // The user creates PostgreSQL, Redis, or MySQL with one button, "
             "and attaches it to an app. // There is a small console to browse tables and run queries.",
             "มีหน้า Databases ด้วย: กดปุ่มเดียวได้ PostgreSQL / Redis / MySQL แล้วผูกเข้ากับแอป · "
             "มีคอนโซลเล็กๆ ไว้เปิดดูตารางและรันคำสั่ง", 2),
            ("And the Audit log page shows every decision the platform made, with filters and search.",
             "และหน้า Audit log แสดงทุกการตัดสินของระบบ พร้อมตัวกรองและช่องค้นหา", 3),
        ],
    },
    {
        "head": "6 · Security in the browser — [04:25 – 05:22]",
        "screen": "แท็บ Variables — โชว์ค่าที่ถูก mask · ถ้ามีเวลา เปิด DevTools โชว์ว่า document.cookie ไม่มี API key",
        "lines": [
            ("Now the security part of the front end. // Three rules.",
             "ทีนี้เรื่องความปลอดภัยฝั่งหน้าเว็บ มี 3 กฎ", None),
            ("First, the browser never holds the API key. // The key lives in an httpOnly cookie, "
             "so JavaScript cannot read it. // If the session expires, any page sends the user back to sign in with the reason.",
             "หนึ่ง เบราว์เซอร์ไม่เคยถือ API key เลย · key อยู่ใน httpOnly cookie จาวาสคริปต์อ่านไม่ได้ · "
             "ถ้า session หมดอายุ ทุกหน้าจะพากลับไปหน้า login พร้อมบอกเหตุผล", None),
            ("Second, secret values are never shown again after saving. // The dashboard shows a mask. // "
             "The user can replace a value, but cannot read it back.",
             "สอง ค่าความลับไม่ถูกแสดงซ้ำอีกเลยหลังบันทึก · หน้าเว็บแสดงเป็นค่าปิดบัง · "
             "ผู้ใช้เขียนทับค่าใหม่ได้ แต่อ่านค่าเดิมกลับไม่ได้", None),
            ("Third, and most important: checks in the browser are only for convenience. // "
             "The file size limit and the form validation help the user, but they are not security. // "
             "Every real decision is made again on the server.",
             "สาม และสำคัญที่สุด: การตรวจในเบราว์เซอร์มีไว้เพื่อความสะดวกเท่านั้น · "
             "การจำกัดขนาดไฟล์และการตรวจฟอร์มช่วยผู้ใช้ แต่ไม่ใช่ความปลอดภัย · "
             "ทุกการตัดสินจริงถูกทำซ้ำที่ฝั่งเซิร์ฟเวอร์", None),
        ],
    },
    {
        "head": "7 · Limitations + closing — [05:22 – 05:57]",
        "screen": "กลับมาหน้า Projects (จอเปิด = จอปิด)",
        "lines": [
            ("I should be honest about two limits. // The stage list uses polling, not push, so it can be one second behind. // "
             "And the interface has no automated tests yet — I test it by hand in the browser.",
             "ขอพูดตรงๆ 2 ข้อจำกัด: รายการ stage ใช้การถามซ้ำ (polling) ไม่ใช่ push จึงช้ากว่าจริงได้ราวหนึ่งวินาที · "
             "และหน้าเว็บยังไม่มีเทสอัตโนมัติ ผมทดสอบด้วยมือในเบราว์เซอร์", None),
            ("To summarize. // The gate makes the decision, and the interface makes it understandable. // "
             "A beginner can deploy in three clicks, and still see exactly why the platform said no.",
             "สรุป: ด่านตรวจเป็นคนตัดสิน ส่วนหน้าเว็บทำให้การตัดสินนั้น “เข้าใจได้” · "
             "มือใหม่กด 3 ครั้งก็ deploy ได้ และยังเห็นชัดว่าทำไมระบบถึงปฏิเสธ", None),
            ("Thank you.",
             "ขอบคุณครับ (นำเสนอสดเปลี่ยนเป็น “Thank you. I am happy to take questions.”)", None),
        ],
    },
]

PRONOUNCE = [
    ["คำ", "อ่าน", "ระวัง"],
    ["dashboard", "แดช-บอร์ด", "เน้นพยางค์แรก"],
    ["deployment", "ดิ-พลอย-เมิ่นท์", "เน้นพยางค์กลาง"],
    ["repository", "ริ-พอ-สิ-ทอ-รี่", "พูดช้าๆ 5 พยางค์"],
    ["environment", "เอน-ไว-เริน-เมิ่นท์", "อย่าลืมเสียง “ไว”"],
    ["certificate", "เซอร์-ทิ-ฟิ-เขิท", "ตัวสุดท้ายเบา ไม่ใช่ “เกท”"],
    ["convenience", "เคิน-วี-เนียนซ์", ""],
    ["validation", "แวล-ลิ-เด-ชั่น", ""],
    ["severity", "ซิ-เวีย-ริ-ตี้", ""],
    ["understandable", "อัน-เดอร์-สแตน-เดอะ-เบิ้ล", "5 พยางค์ อย่ารีบ"],
]

TIPS = [
    "อัดจอกับอัดเสียงแยกกัน — อัดวิดีโอหน้าจอเงียบๆ ให้ครบก่อน แล้วค่อยพากย์ทับ "
    "ผิดตรงไหนพากย์ใหม่เฉพาะท่อนนั้น",
    "ต้องมีของจริงให้โชว์ 2 อย่าง: (ก) deploy ที่ผ่าน เพื่อโชว์ stage วิ่งครบ "
    "(ข) โค้ดที่โดน BLOCK เพื่อโชว์ findings — เตรียมไฟล์ทดสอบไว้ล่วงหน้า อย่าไปหวังว่าจะเกิดสดตอนอัด",
    "หัวข้อ 4 คือหัวใจของการนำเสนอฝั่ง front end ถ้าเวลาไม่พอให้ตัดหัวข้อ 5 (ตัดได้ 2 และ 3) ก่อน "
    "ห้ามตัดหัวข้อ 4",
    "พูดช้ากว่าที่คิดว่าช้า และหยุดจริงตรงเครื่องหมาย //",
    "อย่าเคลมว่า “หน้าเว็บกันได้” — ท่อนที่ 3 ของหัวข้อ 6 (การตรวจฝั่งเบราว์เซอร์ไม่ใช่ความปลอดภัย) "
    "เป็นท่อนที่ได้คะแนน ห้ามตัด",
]

QA = [
    ("Why Next.js and not plain React?",
     "For the App Router and file-based routing, and because the dashboard is a small number of pages with a lot of "
     "shared state. I also get server-side rendering of the first paint for free, which keeps the first screen fast."),
    ("If the browser validates the form, why validate again on the server?",
     "Because anything in the browser can be edited or bypassed by the user. Client-side checks exist so the user gets "
     "an answer instantly, not because they protect anything. The server repeats every check, and the security gate "
     "itself runs entirely on the server."),
    ("Why polling every 1.5 seconds instead of WebSockets?",
     "Polling was enough for a stage list that changes a few times per deploy, and it survives a dropped connection "
     "with no reconnect logic. Live logs do stream. Moving stage updates to a stream is future work."),
    ("How do you handle a user who has never used Git?",
     "They never touch Git. They drag their project folder onto the deploy page, the browser zips it, and it walks "
     "exactly the same five stages as the GitHub path — including the security gate."),
    ("Is the interface accessible?",
     "Partly. Modals trap focus, close on Escape, and return focus when they close; form labels are tied to their "
     "inputs. But I have not run a full accessibility audit, so I would not claim it is compliant with a standard."),
]

SAY_SZ = 34      # 17pt — บรรทัดที่พูด ต้องเด่นที่สุดในหน้า อ่านจากจอ/กระดาษระยะไกลได้
GLOSS_SZ = 30    # 15pt — คำแปลไทย เป็นตัวช่วย ไม่ใช่ตัวหลัก
ACCENT = "2E5496"
GLOSS_COLOR = "595959"
CUT_COLOR = "8A6212"


def build(d):
    # ---------------- ปก / หัวเอกสาร ----------------
    d.title("สคริปต์นำเสนอ — ส่วนหน้าเว็บ (Front End)", size=44)
    d.plain([B("Gatekeeper", size=36, color=ACCENT), T("  ·  วิชา 1101911", size=36, color=ACCENT)],
            align="center", spacing_after=60)
    d.plain([T("เทพรัตน์ โชคนวกุล — กลุ่มที่ 76", size=32, color=GLOSS_COLOR)],
            align="center", spacing_after=240)

    d.plain([B("เวลา: "), T("ตัวหลัก 680 คำ ≈ 5 นาที 40 วินาที ที่ 120 คำ/นาที · "
                            "บวกจังหวะหยุดแล้วจริงประมาณ 6:00–6:15")], spacing_after=60)
    d.plain([B("ถ้าเวลาไม่พอ: "), T("ตัดย่อหน้าที่ทำเครื่องหมาย [ตัดได้ 1] [ตัดได้ 2] [ตัดได้ 3] ตามลำดับ "
                                     "เหลือ 595 คำ ≈ 5 นาที")], spacing_after=60)
    d.plain([B("หมายเหตุ: "), T("ตัวเลขนี้เป็นการประมาณ ต้องจับเวลาจริงตอนซ้อมทุกครั้ง")],
            spacing_after=200)

    d.h2("วิธีใช้เอกสารนี้")
    d.bullet([B("บรรทัดตัวหนา"), T(" คือสิ่งที่พูด · บรรทัดสีเทาใต้ลงมาคือความหมายภาษาไทย ไม่ต้องพูด")])
    d.bullet([C("//"), T(" คือจังหวะหยุดหายใจ — หยุดจริงๆ ครึ่งวินาที ช่วยให้คนฟังตามทัน และซื้อเวลาคิด")])
    d.bullet([B("[จอที่โชว์]"), T(" คือหน้าจอที่ควรให้เห็นตอนพูดท่อนนั้น (ใช้ตอนอัดวิดีโอแบบบันทึกหน้าจอ)")])
    d.bullet([B("[ตัดได้ n]"), T(" คือย่อหน้าที่ตัดทิ้งได้โดยเนื้อหาหลักไม่พัง ตัดตามลำดับเลข")])

    # ---------------- ตัวสคริปต์ ----------------
    for sec in SECTIONS:
        d.h2(sec["head"])
        d.plain([B("จอที่โชว์: ", color=ACCENT), T(sec["screen"], size=GLOSS_SZ)],
                shade="EDF2F9", indent=113, spacing_before=40, spacing_after=140,
                default_sz=GLOSS_SZ)
        for say, gloss, cut in sec["lines"]:
            runs = []
            if cut:
                runs.append(B("[ตัดได้ %d]  " % cut, size=GLOSS_SZ, color=CUT_COLOR))
            runs.append(B(say, size=SAY_SZ))
            d.plain(runs, spacing_after=40)
            d.plain([T(gloss, size=GLOSS_SZ, color=GLOSS_COLOR)], indent=284, spacing_after=180)

    # ---------------- ภาคผนวกของสคริปต์ ----------------
    d.pagebreak()
    d.h2("เสียงอ่านคำยาก")
    d.table(PRONOUNCE, widths=[2400, 3400, 3200], font_sz=30)
    d.plain([B("เสียงท้ายคำที่ต้องออก "), T("(คนไทยมักลืม แล้วฝรั่งฟังไม่ออก): tab"),
             B("s"), T(", stage"), B("s"), T(", user"), B("s"), T(", secret"), B("s"),
             T(", check"), B("s"), T(" — ออกเสียง “ส” ท้ายคำทุกครั้ง")], spacing_after=200)

    d.h2("เทคนิคตอนอัด/พูดจริง")
    for tip in TIPS:
        d.num(tip)
    d.spacer()

    d.h2("เตรียมตอบคำถามสด")
    for q, a in QA:
        d.plain([B("Q: ", color=ACCENT), B(q)], spacing_before=120, spacing_after=40)
        d.plain([T(a, size=GLOSS_SZ)], indent=284, spacing_after=80)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "Gatekeeper-Frontend-Script.docx"
    doc = Doc()
    build(doc)
    doc.save(out,
             title="สคริปต์นำเสนอส่วนหน้าเว็บ — Gatekeeper",
             creator="เทพรัตน์ โชคนวกุล — กลุ่มที่ 76")
    print("wrote %s | blocks: %d" % (out, len(doc.body)))
