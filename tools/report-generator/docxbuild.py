# -*- coding: utf-8 -*-
"""
ตัวประกอบไฟล์ .docx (OOXML) แบบเขียนเอง — รองรับ heading, ย่อหน้า, bullet/number list,
ตารางมีเส้น, hyperlink จริง, code block, page break, TOC field, footer เลขหน้า
ฟอนต์: TH SarabunPSK (ตามมาตรฐานเอกสารวิชาการไทย)
"""
import zipfile, os, html


def esc(s):
    return html.escape(str(s), quote=False).replace('"', "&quot;")


# ---------- run helpers ----------
class Run:
    def __init__(self, text, bold=False, italic=False, mono=False, size=None,
                 color=None, url=None, underline=False, sub=False, sup=False):
        self.text = text
        self.bold = bold
        self.italic = italic
        self.mono = mono
        self.size = size
        self.color = color
        self.url = url
        self.underline = underline
        self.sub = sub
        self.sup = sup


def T(t, **kw):
    return Run(t, **kw)


def B(t, **kw):
    return Run(t, bold=True, **kw)


def I(t, **kw):
    return Run(t, italic=True, **kw)


def C(t, **kw):
    return Run(t, mono=True, **kw)


def L(t, url, **kw):
    return Run(t, url=url, **kw)


def norm(runs):
    if isinstance(runs, str):
        return [Run(runs)]
    if isinstance(runs, Run):
        return [runs]
    out = []
    for r in runs:
        out.append(Run(r) if isinstance(r, str) else r)
    return out


BODY_SZ = 32       # 16pt
MONO_SZ = 26       # 13pt
THAI_FONT = "TH SarabunPSK"
MONO_FONT = "Consolas"

# ความกว้างที่ใช้ได้จริงบนหน้า A4: 11906 - ขอบซ้าย 1701 - ขอบขวา 1134 = 9071 twips
# เผื่อไว้เล็กน้อยกัน rounding ของ Word ทำให้เส้นขอบขวาล้นออกไป
USABLE_WIDTH = 9020

# จัดชิดซ้ายเป็นค่าปริยาย ไม่ใช้ justify: ข้อความไทยไม่มีช่องว่างระหว่างคำ
# การกระจายบรรทัดจึงไปยืดเฉพาะช่องว่างรอบคำภาษาอังกฤษจนดูเหมือนคำหลุดหายไป
BODY_ALIGN = "left"


class Doc:
    def __init__(self):
        self.body = []          # list of xml strings
        self.rels = []          # (rid, target) for hyperlinks
        self._rid = 100

    # ---------- internal ----------
    def _hyper_rid(self, url):
        self._rid += 1
        rid = "rHl%d" % self._rid
        self.rels.append((rid, url))
        return rid

    def _run_xml(self, r, default_sz=BODY_SZ, force_color=None, force_bold=None):
        sz = r.size or (MONO_SZ if r.mono else default_sz)
        font = MONO_FONT if r.mono else THAI_FONT
        bold = r.bold if force_bold is None else force_bold
        props = ['<w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>' % (font, font, font)]
        if bold:
            props.append("<w:b/><w:bCs/>")
        if r.italic:
            props.append("<w:i/><w:iCs/>")
        color = force_color or r.color or ("1F4E79" if r.url else None)
        if r.mono and not color:
            color = "8B2500"
        if color:
            props.append('<w:color w:val="%s"/>' % color)
        # ลำดับ element ต้องตรงตาม CT_RPr: rFonts, b, i, color, sz, u, shd, vertAlign
        props.append('<w:sz w:val="%d"/><w:szCs w:val="%d"/>' % (sz, sz))
        if r.url or r.underline:
            props.append('<w:u w:val="single"/>')
        if r.mono:
            props.append('<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>')
        if r.sub:
            props.append('<w:vertAlign w:val="subscript"/>')
        if r.sup:
            props.append('<w:vertAlign w:val="superscript"/>')
        rpr = "<w:rPr>%s</w:rPr>" % "".join(props)

        # แตกบรรทัดใหม่ใน text เป็น <w:br/>
        parts = str(r.text).split("\n")
        chunks = []
        for i, p in enumerate(parts):
            if i:
                chunks.append("<w:br/>")
            if p:
                chunks.append('<w:t xml:space="preserve">%s</w:t>' % esc(p))
        run = "<w:r>%s%s</w:r>" % (rpr, "".join(chunks))
        if r.url:
            rid = self._hyper_rid(r.url)
            return '<w:hyperlink r:id="%s">%s</w:hyperlink>' % (rid, run)
        return run

    def _para(self, runs, style=None, align=None, indent=None, spacing_before=0,
              spacing_after=120, numid=None, ilvl=0, keep_next=False, first_line=None,
              shade=None, border=False, line=None, default_sz=BODY_SZ, force_color=None,
              force_bold=None, hanging=None):
        # ลำดับ element ต้องตรงตาม CT_PPr:
        # pStyle, keepNext, keepLines, numPr, pBdr, shd, spacing, ind, jc
        ppr = []
        if style:
            ppr.append('<w:pStyle w:val="%s"/>' % style)
        if keep_next:
            ppr.append("<w:keepNext/><w:keepLines/>")
        if numid is not None:
            ppr.append('<w:numPr><w:ilvl w:val="%d"/><w:numId w:val="%d"/></w:numPr>' % (ilvl, numid))
        if border:
            ppr.append('<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="BFBFBF"/>'
                       '<w:left w:val="single" w:sz="4" w:space="4" w:color="BFBFBF"/>'
                       '<w:bottom w:val="single" w:sz="4" w:space="4" w:color="BFBFBF"/>'
                       '<w:right w:val="single" w:sz="4" w:space="4" w:color="BFBFBF"/></w:pBdr>')
        if shade:
            ppr.append('<w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % shade)
        sp = 'w:before="%d" w:after="%d"' % (spacing_before, spacing_after)
        if line:
            sp += ' w:line="%d" w:lineRule="auto"' % line
        ppr.append("<w:spacing %s/>" % sp)
        ind = []
        if indent:
            ind.append('w:left="%d"' % indent)
        if first_line is not None:
            ind.append('w:firstLine="%d"' % first_line)
        if hanging is not None:
            ind.append('w:hanging="%d"' % hanging)
        if ind:
            ppr.append("<w:ind %s/>" % " ".join(ind))
        if align:
            ppr.append('<w:jc w:val="%s"/>' % align)
        body = "".join(self._run_xml(r, default_sz, force_color, force_bold) for r in norm(runs))
        return "<w:p><w:pPr>%s</w:pPr>%s</w:p>" % ("".join(ppr), body)

    # ---------- public API ----------
    def title(self, text, size=44, after=200, color="1F3864"):
        self.body.append(self._para([Run(text, bold=True, size=size, color=color)],
                                    align="center", spacing_after=after))

    def h1(self, text, page_break=True):
        if page_break:
            self.pagebreak()
        self.body.append(self._para([Run(text, bold=True, size=40, color="1F3864")],
                                    style="Heading1", align="center",
                                    spacing_before=200, spacing_after=240, keep_next=True))

    def h2(self, text):
        self.body.append(self._para([Run(text, bold=True, size=36, color="2E5496")],
                                    style="Heading2", spacing_before=240, spacing_after=120,
                                    keep_next=True))

    def h3(self, text):
        self.body.append(self._para([Run(text, bold=True, size=33, color="2E5496")],
                                    style="Heading3", spacing_before=180, spacing_after=100,
                                    keep_next=True))

    def h4(self, text):
        self.body.append(self._para([Run(text, bold=True, size=32, color="404040")],
                                    style="Heading4", spacing_before=140, spacing_after=80,
                                    keep_next=True))

    def p(self, runs, indent_first=True, align=BODY_ALIGN, after=140, **kw):
        self.body.append(self._para(runs, align=align, spacing_after=after,
                                    first_line=567 if indent_first else None, **kw))

    def plain(self, runs, **kw):
        self.body.append(self._para(runs, **kw))

    def bullet(self, runs, level=0):
        self.body.append(self._para(runs, numid=2, ilvl=level, spacing_after=60,
                                    align=BODY_ALIGN, indent=None))

    def num(self, runs, level=0, numid=3):
        self.body.append(self._para(runs, numid=numid, ilvl=level, spacing_after=60,
                                    align=BODY_ALIGN))

    def code(self, text, caption=None):
        lines = text.rstrip("\n").split("\n")
        for i, ln in enumerate(lines):
            self.body.append(self._para([Run(ln or " ", mono=True, color="1A1A1A")],
                                        shade="F5F5F5",
                                        border=(i == 0 or i == len(lines) - 1),
                                        spacing_after=0, indent=284))
        if caption:
            self.caption(caption)
        else:
            self.body.append(self._para([Run(" ", size=12)], spacing_after=0))

    def ref(self, runs):
        """รายการบรรณานุกรมแบบ hanging indent (APA 7)"""
        self.body.append(self._para(runs, align=BODY_ALIGN, indent=567, hanging=567,
                                    spacing_after=120))

    def caption(self, text, align="center"):
        self.body.append(self._para([Run(text, size=30, italic=True, color="595959")],
                                    align=align, spacing_before=60, spacing_after=180))

    def note(self, runs):
        self.body.append(self._para(runs, indent=284, spacing_after=140, align=BODY_ALIGN,
                                    default_sz=30))

    def pagebreak(self):
        self.body.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')

    def spacer(self, n=1):
        for _ in range(n):
            self.body.append('<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>')

    def toc(self):
        self.body.append(
            '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>'
            '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>'
            '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>'
            '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
            '<w:r><w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/><w:sz w:val="32"/>'
            '<w:szCs w:val="32"/></w:rPr>'
            '<w:t xml:space="preserve">[คลิกขวาที่นี่ → Update Field เพื่อสร้างสารบัญพร้อมเลขหน้า]</w:t></w:r>'
            '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' % (THAI_FONT, THAI_FONT, THAI_FONT))

    def table(self, rows, widths=None, header=True, caption=None, font_sz=30,
              header_fill="D9E2F3", align_center_cols=None, zebra=True):
        """rows: list of list of (str | Run | [Run]) — แถวแรกเป็น header ถ้า header=True"""
        ncol = max(len(r) for r in rows)
        if widths is None:
            widths = [USABLE_WIDTH // ncol] * ncol
        # ปรับสัดส่วนคอลัมน์ให้ผลรวมพอดีพื้นที่หน้ากระดาษเสมอ (คงอัตราส่วนเดิมที่ตั้งไว้
        # คอลัมน์ที่ข้อความยาวกว่าจึงยังได้พื้นที่มากกว่าตามเดิม) — กันตารางล้นขอบขวา
        scale = USABLE_WIDTH / float(sum(widths))
        widths = [max(500, int(w * scale)) for w in widths]
        # ปัดเศษที่ตกหล่นไปใส่คอลัมน์ที่กว้างที่สุด ให้ผลรวมตรงเป๊ะ
        widths[widths.index(max(widths))] += USABLE_WIDTH - sum(widths)
        total = sum(widths)
        align_center_cols = align_center_cols or []

        grid = "".join('<w:gridCol w:w="%d"/>' % w for w in widths)
        xml = [
            '<w:tbl><w:tblPr><w:tblStyle w:val="GkTable"/>'
            '<w:tblW w:w="%d" w:type="dxa"/>' % total,
            '<w:tblBorders>'
            '<w:top w:val="single" w:sz="6" w:space="0" w:color="8EA9DB"/>'
            '<w:left w:val="single" w:sz="6" w:space="0" w:color="8EA9DB"/>'
            '<w:bottom w:val="single" w:sz="6" w:space="0" w:color="8EA9DB"/>'
            '<w:right w:val="single" w:sz="6" w:space="0" w:color="8EA9DB"/>'
            '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="B4C6E7"/>'
            '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="B4C6E7"/>'
            '</w:tblBorders>'
            # fixed = ให้ Word ใช้ความกว้างคอลัมน์ที่กำหนดไว้จริง ไม่คำนวณใหม่เองจนล้นหน้า
            '<w:tblLayout w:type="fixed"/>'
            '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>'
            '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>'
            '</w:tblPr><w:tblGrid>%s</w:tblGrid>' % grid
        ]
        for ri, row in enumerate(rows):
            is_head = header and ri == 0
            # CT_TrPr: cantSplit ต้องมาก่อน tblHeader
            trpr = '<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' if is_head else '<w:trPr><w:cantSplit/></w:trPr>'
            cells = []
            for ci in range(ncol):
                cell = row[ci] if ci < len(row) else ""
                fill = header_fill if is_head else ("F7F9FC" if (zebra and ri % 2 == 0) else None)
                # CT_TcPr: tcW, tcBorders, shd, tcMar, vAlign
                tcpr = ['<w:tcW w:w="%d" w:type="dxa"/>' % widths[ci]]
                if fill:
                    tcpr.append('<w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % fill)
                tcpr.append('<w:vAlign w:val="center"/>')
                al = "center" if (is_head or ci in align_center_cols) else "left"
                para = self._para(cell, align=al, spacing_after=20, spacing_before=20,
                                  default_sz=font_sz, force_bold=True if is_head else None)
                cells.append("<w:tc><w:tcPr>%s</w:tcPr>%s</w:tc>" % ("".join(tcpr), para))
            xml.append("<w:tr>%s%s</w:tr>" % (trpr, "".join(cells)))
        xml.append("</w:tbl>")
        self.body.append("".join(xml))
        if caption:
            self.caption(caption)
        else:
            self.body.append('<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>')

    # ---------- save ----------
    def save(self, path, title="เอกสาร", creator="กลุ่มที่ 76"):
        sect = (
            '<w:sectPr>'
            '<w:footerReference w:type="default" r:id="rIdFooter"/>'
            '<w:pgSz w:w="11906" w:h="16838"/>'
            '<w:pgMar w:top="1418" w:right="1134" w:bottom="1418" w:left="1701" '
            'w:header="709" w:footer="709" w:gutter="0"/>'
            '<w:docGrid w:linePitch="360"/>'
            '</w:sectPr>'
        )
        document = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<w:body>%s%s</w:body></w:document>' % ("".join(self.body), sect)
        )

        rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
                '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
                '<Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
                '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>',
                '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>']
        for rid, target in self.rels:
            rels.append('<Relationship Id="%s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="%s" TargetMode="External"/>'
                        % (rid, esc(target)))
        rels.append("</Relationships>")

        z = zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED)
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", ROOT_RELS)
        z.writestr("word/document.xml", document)
        z.writestr("word/_rels/document.xml.rels", "".join(rels))
        z.writestr("word/styles.xml", STYLES)
        z.writestr("word/numbering.xml", NUMBERING)
        z.writestr("word/footer1.xml", FOOTER)
        z.writestr("word/settings.xml", SETTINGS)
        z.writestr("docProps/core.xml", CORE % (esc(title), esc(creator), esc(creator)))
        z.writestr("docProps/app.xml", APP)
        z.close()


CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>'''

ROOT_RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>'''

SETTINGS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:updateFields w:val="true"/>
<w:defaultTabStop w:val="720"/>
<w:themeFontLang w:val="en-US" w:bidi="th-TH"/>
</w:settings>'''


def _heading_style(sid, name, outline, sz, color):
    return ('<w:style w:type="paragraph" w:styleId="%s"><w:name w:val="%s"/>'
            '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>'
            '<w:pPr><w:keepNext/><w:outlineLvl w:val="%d"/></w:pPr>'
            '<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/><w:b/><w:bCs/>'
            '<w:color w:val="%s"/><w:sz w:val="%d"/><w:szCs w:val="%d"/></w:rPr></w:style>'
            % (sid, name, outline, THAI_FONT, THAI_FONT, THAI_FONT, color, sz, sz))


STYLES = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
          '<w:docDefaults><w:rPrDefault><w:rPr>'
          '<w:rFonts w:ascii="%s" w:hAnsi="%s" w:eastAsia="%s" w:cs="%s"/>'
          '<w:sz w:val="32"/><w:szCs w:val="32"/><w:lang w:bidi="th-TH"/>'
          '</w:rPr></w:rPrDefault>'
          '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>'
          '</w:docDefaults>'
          '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
          % (THAI_FONT, THAI_FONT, THAI_FONT, THAI_FONT)
          + _heading_style("Heading1", "heading 1", 0, 40, "1F3864")
          + _heading_style("Heading2", "heading 2", 1, 36, "2E5496")
          + _heading_style("Heading3", "heading 3", 2, 33, "2E5496")
          + _heading_style("Heading4", "heading 4", 3, 32, "404040")
          + '<w:style w:type="table" w:styleId="GkTable"><w:name w:val="Gatekeeper Table"/>'
            '<w:tblPr></w:tblPr></w:style>'
          + '</w:styles>')

NUMBERING = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="1">
 <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/>
  <w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
  <w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl>
 <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#9702;"/>
  <w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr>
  <w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:hint="default"/></w:rPr></w:lvl>
 <w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#9642;"/>
  <w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2160" w:hanging="360"/></w:pPr>
  <w:rPr><w:rFonts w:ascii="Wingdings" w:hAnsi="Wingdings" w:hint="default"/></w:rPr></w:lvl>
</w:abstractNum>
<w:abstractNum w:abstractNumId="2">
 <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1)"/>
  <w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
 <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/>
  <w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
</w:abstractNum>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
<w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num>
</w:numbering>'''

FOOTER = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
          '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120"/></w:pPr>'
          '<w:r><w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/><w:sz w:val="28"/>'
          '<w:szCs w:val="28"/><w:color w:val="808080"/></w:rPr>'
          '<w:fldChar w:fldCharType="begin"/></w:r>'
          '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>'
          '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
          '<w:r><w:t>1</w:t></w:r>'
          '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>'
          % (THAI_FONT, THAI_FONT, THAI_FONT))

CORE = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>%s</dc:title><dc:creator>%s</dc:creator><cp:lastModifiedBy>%s</cp:lastModifiedBy>
</cp:coreProperties>'''

APP = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>Gatekeeper DocGen</Application></Properties>'''
