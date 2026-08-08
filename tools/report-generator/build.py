# -*- coding: utf-8 -*-
import sys
from docxbuild import Doc
import gen_front, gen_ch1, gen_ch2, gen_ch3, gen_ch4, gen_ch5, gen_refs, gen_appendix

d = Doc()
for m in (gen_front, gen_ch1, gen_ch2, gen_ch3, gen_ch4, gen_ch5, gen_refs, gen_appendix):
    m.build(d)

out = sys.argv[1] if len(sys.argv) > 1 else "Gatekeeper.docx"
d.save(out,
       title="Deploy Gatekeeper — รายงานโครงงาน กลุ่มที่ 76",
       creator="กลุ่มที่ 76 — ปภังกร ชุมภูแก้ว, เทพรัตน์ โชคนวกุล, รัฐภูมิ ศรีโยธา")
print("wrote %s | paragraphs/tables: %d | hyperlinks: %d" % (out, len(d.body), len(d.rels)))
