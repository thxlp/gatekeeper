# -*- coding: utf-8 -*-
from docxbuild import *
from links import U


def build(d):
    # ================= ปกใน =================
    d.spacer(3)
    d.plain([Run("รายงานโครงงาน", bold=True, size=36, color="404040")], align="center", spacing_after=60)
    d.plain([Run("รหัสวิชา 1101911  ชื่อวิชา Project in Digital Technology", size=32, color="595959")],
            align="center", spacing_after=40)
    d.plain([Run("ภาคการศึกษาที่ 1 ปีการศึกษา 2569", size=32, color="595959")],
            align="center", spacing_after=400)

    d.plain([Run("Deploy Gatekeeper", bold=True, size=64, color="1F3864")], align="center", spacing_after=100)
    d.plain([Run("การออกแบบและพัฒนาแพลตฟอร์มนำส่งซอฟต์แวร์อัตโนมัติ", bold=True, size=38, color="2E5496")],
            align="center", spacing_after=40)
    d.plain([Run("ที่ฝังกลไกควบคุมการรับเข้า (Admission Control) และการแยกส่วนระดับคอนเทนเนอร์", bold=True, size=38, color="2E5496")],
            align="center", spacing_after=140)
    d.plain([Run("Design and Implementation of an Automated Software Delivery Platform", italic=True, size=32, color="595959")],
            align="center", spacing_after=20)
    d.plain([Run("with Built-in Admission Control and Container-Level Isolation", italic=True, size=32, color="595959")],
            align="center", spacing_after=420)

    d.plain([Run("กลุ่มที่ 76", bold=True, size=34)], align="center", spacing_after=120)

    d.table(
        [["เลขประจำตัว", "ชื่อ-สกุล", "ชื่อเล่น", "บทบาทในโครงงาน"],
         ["B6702366", "นายปภังกร ชุมภูแก้ว", "จิ้น", "Web Developer / System Architect"],
         ["B6701765", "นายเทพรัตน์ โชคนวกุล", "ทิว", "Security Specialist"],
         ["B6701970", "นายรัฐภูมิ ศรีโยธา", "เบลท์", "Backend & API / Infrastructure"]],
        widths=[1500, 3000, 1200, 3650], align_center_cols=[0, 2], font_sz=30)

    d.spacer(1)
    d.plain([Run("เสนอเป็นส่วนหนึ่งของรายวิชา Project in Digital Technology", size=30, color="595959")],
            align="center", spacing_after=20)
    d.plain([Run("สาขาเทคโนโลยีดิจิทัล", size=30, color="595959")], align="center", spacing_after=20)
    d.plain([Run("วันที่จัดทำรายงาน 27 กรกฎาคม 2569", size=30, color="595959")], align="center")

    # ================= บทคัดย่อ =================
    d.h1("บทคัดย่อ")
    d.p([
        "แพลตฟอร์มนำส่งซอฟต์แวร์อัตโนมัติเชิงพาณิชย์อย่าง ",
        L("Railway", U["railway"]), " และ ", L("Vercel", U["vercel"]),
        " ทำให้นักพัฒนานำแอปพลิเคชันขึ้นสู่ระบบจริงได้ภายในไม่กี่นาที. ",
        "แต่ความสะดวกนี้แลกมาด้วยช่องว่างหนึ่งจุด. ",
        "แพลตฟอร์มกลุ่มนี้ไม่มีจุดตรวจกลางที่บังคับให้โค้ดทุกชิ้นผ่านการประเมินความปลอดภัยก่อนขึ้นระบบ. ",
        "ผลคือความลับที่ถูก ", C("hardcode"), " ไว้ในซอร์สโค้ด โค้ดที่มีลักษณะของ ",
        L("webshell", U["webshell"]), " หรือไลบรารีที่มีช่องโหว่ หลุดเข้าสู่ระบบจริงได้โดยตรง. ",
        "ในทางกลับกัน เครื่องมือด้านความปลอดภัยที่มีอยู่ก็เป็นเครื่องมือแยกที่ต้องตั้งค่าเพิ่มเองใน ",
        L("CI/CD pipeline", U["cicd"]), ". ภาระส่วนนี้เป็นสิ่งที่ทีมพัฒนาขนาดเล็กมักละเลย.",
    ])
    d.p([
        "โครงงานนี้จึงออกแบบและพัฒนา ", B("Gatekeeper"), ". ",
        "ระบบนี้เป็นแพลตฟอร์มนำส่งซอฟต์แวร์อัตโนมัติที่นำแนวคิด ",
        L("admission control", U["admission"]), " จากระบบ ", L("Kubernetes", U["k8s"]),
        " มาวางไว้กลางเส้นทางการ deploy. ",
        "ซอร์สโค้ดทุกชิ้นต้องผ่าน pipeline 5 ขั้นตอน ได้แก่ ",
        C("payload verification"), ", ", C("repo cloning"), ", ", C("security scan"), ", ",
        C("app build"), " และ ", C("production deploy"), ". ",
        "ขั้นตอนการสแกนจะประเมินโค้ดด้วยกฎรูปแบบจำนวน 11 กฎ. ",
        "จากนั้น risk engine จะคำนวณคะแนนความเสี่ยงแบบถ่วงน้ำหนักตามระดับความรุนแรง ",
        "แล้วตัดสินผลเป็นหนึ่งในสามสถานะ คือ ", B("ALLOW"), ", ", B("QUARANTINE"), " หรือ ", B("BLOCK"), ". ",
        "ทุกการตัดสินถูกบันทึกลง ", L("audit log", U["sp80092"]),
        " แบบ append-only เพื่อให้ตรวจสอบย้อนหลังได้.",
    ])
    d.p([
        "นอกจากด่านตรวจก่อนขึ้นระบบแล้ว โครงงานยังจำกัดความเสียหายหลังโค้ดเริ่มทำงานจริงด้วย. ",
        "มาตรการแยกส่วนระดับคอนเทนเนอร์ที่บังคับใช้มี 5 อย่าง ได้แก่ การถอด ",
        L("Linux capabilities", U["capabilities"]), " ทั้งหมดแล้วคืนเฉพาะ 6 รายการที่จำเป็น, การบังคับ ",
        C("read-only rootfs"), ", การจำกัดจำนวนโพรเซสด้วย ", C("PidsLimit"),
        ", การแยก network ต่อผู้ใช้หนึ่งราย และการตัดการเชื่อมต่อขาออกของ network ช่วง build ด้วยกฎ ",
        L("iptables", U["iptables"]), ". ",
        "มาตรการสุดท้ายป้องกันไม่ให้คำสั่งใน ", C("Dockerfile"),
        " ของผู้ใช้เข้าถึงบริการภายในหรือ cloud metadata endpoint ได้.",
    ])
    d.p([
        "ผลการดำเนินงานพบว่าระบบทำงานได้ครบทั้ง pipeline บนสภาพแวดล้อมจริงที่โดเมน ",
        C("studiodup.com"), ". ระบบรองรับการ deploy จากการ push เข้าที่เก็บโค้ดของ ",
        L("GitHub", U["gitwebhook"]), ", ", L("GitLab", U["gitlab_hook"]), " และ ",
        L("Bitbucket", U["bitbucket_hook"]), " รวมถึงการอัปโหลดไฟล์ zip ด้วยตนเอง. ",
        "ฟีเจอร์เสริมที่พัฒนาเพิ่มจนครบวงจรการใช้งานจริงมี 7 อย่าง ได้แก่ การย้อนกลับรุ่น, ",
        "การจัดการตัวแปรสภาพแวดล้อมและความลับ, การดูบันทึกการทำงานแบบสด, ",
        "การผูกโดเมนของผู้ใช้พร้อมออกใบรับรอง TLS อัตโนมัติ, การให้บริการฐานข้อมูลแบบ managed, ",
        "การตรวจจับภาวะ crash-loop และการยืนยันตัวตนสองขั้นตอนผ่านอีเมล. ",
        "งานทั้งหมดรวม 95 commit และซอร์สโค้ดราว 14,000 บรรทัด ",
        "แบ่งเป็น backend 7,217 บรรทัดใน 20 โมดูล และ frontend 5,775 บรรทัด.",
    ])
    d.p([
        "โครงงานมีข้อจำกัดที่ต้องระบุอย่างตรงไปตรงมาสามข้อ. ",
        "ข้อแรก การตรวจสอบช่องโหว่ของไลบรารี (", L("Software Composition Analysis", U["sca"]),
        ") ยังเป็นโครงสร้างรองรับที่ตรวจเพียงว่ามีไฟล์ manifest หรือไม่ ",
        "ยังไม่ได้ผูก engine จริงอย่าง ", L("Trivy", U["trivy"]), " หรือ ", L("OSV", U["osv"]), ". ",
        "ข้อที่สอง การจัดการกุญแจเข้ารหัสยังใช้ master key ระดับไฟล์ แทนระบบอย่าง ",
        L("Vault", U["vault"]), " หรือ ", L("KMS", U["kms"]), ". ",
        "ข้อที่สาม ฟีเจอร์ plugin registry ที่ปรากฏในข้อเสนอโครงงานฉบับแรกถูกถอดออกทั้งหมดในภายหลัง ",
        "เพราะเปิดพื้นที่การถูกโจมตีที่ไม่คุ้มกับประโยชน์ที่ได้รับ. ",
        "รายละเอียดของการเปลี่ยนแปลงขอบเขตทั้งหมดอยู่ในหัวข้อ 4.8 และบทที่ 5.",
    ])
    d.spacer(1)
    d.plain([B("คำสำคัญ: "), T("admission control, DevSecOps, container security, secret scanning, "
                               "risk engine, multi-tenancy, Platform as a Service, audit log")],
            align="both")

    # ================= สารบัญ =================
    d.h1("สารบัญ")
    d.note([I("หมายเหตุ: สารบัญด้านล่างเป็นเขตข้อมูลอัตโนมัติของ Microsoft Word — เมื่อเปิดไฟล์ครั้งแรก "
              "ให้คลิกขวาที่สารบัญแล้วเลือก Update Field › Update entire table เพื่อให้ Word "
              "สร้างรายการหัวข้อพร้อมเลขหน้าที่ตรงกับการจัดหน้าจริงของเครื่องคุณ")])
    d.toc()
