#!/usr/bin/env python3
"""Shared reportlab engine for Teameet user manuals (admin console + desktop web).

Provides a ManualBuilder that renders:
  - a branded cover page
  - an auto-paginated table of contents
  - flow-by-flow feature sections (eyebrow + heading + intro + numbered steps + screenshots)
  - callout boxes (tip / caution) and role/permission tables

Korean text is rendered with Apple SD Gothic Neo. Only the content differs between
manuals; this module is the single source of layout truth.
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Image,
    PageBreak, Table, TableStyle, KeepTogether, NextPageTemplate, Flowable,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image as PILImage

# ---- Korean font registration ----
KR, KRB = "KR", "KR"
try:
    pdfmetrics.registerFont(TTFont("KR", "/System/Library/Fonts/AppleSDGothicNeo.ttc", subfontIndex=0))
    pdfmetrics.registerFont(TTFont("KRB", "/System/Library/Fonts/AppleSDGothicNeo.ttc", subfontIndex=3))
    KR, KRB = "KR", "KRB"
except Exception:
    pdfmetrics.registerFont(TTFont("KR", "/System/Library/Fonts/Supplemental/AppleGothic.ttf"))
    KRB = "KR"

# ---- palette (Toss-style single blue accent + grey ramp) ----
BLUE = colors.HexColor("#3182f6")
BLUE_SOFT = colors.HexColor("#e8f1fe")
GREY900 = colors.HexColor("#191f28")
GREY700 = colors.HexColor("#333d4b")
GREY600 = colors.HexColor("#4e5968")
GREY400 = colors.HexColor("#8b95a1")
GREY200 = colors.HexColor("#d1d6db")
GREY100 = colors.HexColor("#e5e8eb")
GREY50 = colors.HexColor("#f2f4f6")
AMBER = colors.HexColor("#c2700b")
AMBER_SOFT = colors.HexColor("#fdf4e7")

_styles = getSampleStyleSheet()


def S(name, **kw):
    kw.setdefault("fontName", KR)
    return ParagraphStyle(name, parent=_styles["Normal"], **kw)


st_cover_kicker = S("ck", fontName=KRB, fontSize=11, leading=16, textColor=BLUE, alignment=TA_CENTER)
st_cover_title = S("ct", fontName=KRB, fontSize=31, leading=39, textColor=GREY900, alignment=TA_CENTER)
st_cover_sub = S("cs", fontSize=13.5, leading=21, textColor=GREY600, alignment=TA_CENTER)
st_cover_meta = S("cm", fontSize=10.5, leading=16, textColor=GREY400, alignment=TA_CENTER)

st_toc_title = S("tt", fontName=KRB, fontSize=20, leading=27, textColor=GREY900, spaceAfter=12)

st_h1 = S("h1", fontName=KRB, fontSize=18, leading=24, textColor=GREY900, spaceBefore=2, spaceAfter=5)
st_eyebrow = S("eb", fontName=KRB, fontSize=9.5, leading=13, textColor=BLUE, spaceAfter=2)
st_body = S("bd", fontSize=10.6, leading=17, textColor=GREY600, spaceAfter=5)
st_step = S("sp", fontSize=10.4, leading=16.5, textColor=GREY700, leftIndent=20, firstLineIndent=-20, spaceAfter=3)
st_li = S("li", fontSize=10.4, leading=16.5, textColor=GREY600, leftIndent=13, firstLineIndent=-9, spaceAfter=2)
st_cap = S("cap", fontSize=8.6, leading=12, textColor=GREY400, alignment=TA_CENTER, spaceBefore=4, spaceAfter=12)
st_callout = S("co", fontSize=9.9, leading=15.5, textColor=GREY700)
st_callout_amber = S("coa", fontSize=9.9, leading=15.5, textColor=colors.HexColor("#8a4f08"))

st_cell = S("cl", fontSize=9.4, leading=13.5, textColor=GREY600)
st_cellh = S("clh", fontName=KRB, fontSize=9.6, leading=13.5, textColor=colors.white)
st_cell_ok = S("clok", fontName=KRB, fontSize=9.6, leading=13.5, textColor=BLUE, alignment=TA_CENTER)
st_cell_no = S("clno", fontSize=9.6, leading=13.5, textColor=GREY400, alignment=TA_CENTER)

PAGE_W, PAGE_H = A4
L_MARGIN = R_MARGIN = 18 * mm
CONTENT_W = PAGE_W - L_MARGIN - R_MARGIN


class HR(Flowable):
    """A thin horizontal rule."""
    def __init__(self, width, color=GREY100, thickness=0.6, space=6):
        super().__init__()
        self.width = width
        self.color = color
        self.thickness = thickness
        self.height = space

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.height / 2, self.width, self.height / 2)


_st_h1_keep = S("h1k", fontName=KRB, fontSize=18, leading=24, textColor=GREY900,
                spaceBefore=2, spaceAfter=5)
_st_h1_keep.keepWithNext = True
_st_eyebrow_keep = S("ebk", fontName=KRB, fontSize=9.5, leading=13, textColor=BLUE, spaceAfter=2)
_st_eyebrow_keep.keepWithNext = True


class TocHeading(Paragraph):
    """A heading paragraph that bookmarks itself and carries TOC metadata.

    The actual TOCEntry notification is emitted by _ManualDoc.afterFlowable so it
    reaches the document's TableOfContents reliably (Flowable has no notify()).
    """
    def __init__(self, text, key, level=0):
        super().__init__(text, _st_h1_keep)
        self._toc_key = key
        self._toc_level = level
        self.keepWithNext = True

    def draw(self):
        super().draw()
        self.canv.bookmarkPage(self._toc_key)
        self.canv.addOutlineEntry(self.getPlainText(), self._toc_key, level=self._toc_level)


class _ManualDoc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, TocHeading):
            self.notify("TOCEntry", (flowable._toc_level, flowable.getPlainText(),
                                     self.page, flowable._toc_key))


class ManualBuilder:
    def __init__(self, out_path, screenshot_dir, doc_title, running_title):
        self.out_path = out_path
        self.shot_dir = screenshot_dir
        self.doc_title = doc_title
        self.running_title = running_title
        self.story = []
        self._toc_seq = 0
        os.makedirs(os.path.dirname(out_path), exist_ok=True)

    # ---------- low-level helpers ----------
    def _shot(self, name):
        return os.path.join(self.shot_dir, name)

    def image(self, name, caption=None, max_w=CONTENT_W, max_h=None):
        path = self._shot(name)
        if not os.path.exists(path):
            return [Paragraph(f"(이미지 없음: {name})", st_cap)]
        w, h = PILImage.open(path).size
        iw = max_w
        ih = iw * h / w
        # cap very tall full-page screenshots so a single shot doesn't overflow a page
        cap_h = max_h if max_h else (PAGE_H - 70 * mm)
        if ih > cap_h:
            ih = cap_h
            iw = ih * w / h
        im = Image(path, width=iw, height=ih)
        im.hAlign = "CENTER"
        flow = [im]
        flow.append(Paragraph(caption, st_cap) if caption else Spacer(1, 10))
        return flow

    def _single_image_obj(self, name, w):
        path = self._shot(name)
        pw, ph = PILImage.open(path).size
        im = Image(path, width=w, height=w * ph / pw)
        im.hAlign = "CENTER"
        return im

    # ---------- page architecture ----------
    def _footer(self, canvas, d):
        canvas.saveState()
        canvas.setFont(KR, 8)
        canvas.setFillColor(GREY400)
        canvas.drawString(d.leftMargin, 10 * mm, self.running_title)
        canvas.drawRightString(PAGE_W - d.rightMargin, 10 * mm, "%d" % d.page)
        canvas.setStrokeColor(GREY100)
        canvas.line(d.leftMargin, 13 * mm, PAGE_W - d.rightMargin, 13 * mm)
        canvas.restoreState()

    def _cover(self, canvas, d):
        canvas.saveState()
        canvas.setFillColor(BLUE)
        canvas.rect(0, PAGE_H - 8 * mm, PAGE_W, 8 * mm, fill=1, stroke=0)
        canvas.rect(0, 0, PAGE_W, 4 * mm, fill=1, stroke=0)
        canvas.restoreState()

    # ---------- content builders ----------
    def cover(self, kicker, title_lines, subtitle, meta_lines):
        self.story.append(Spacer(1, 56 * mm))
        self.story.append(Paragraph(kicker, st_cover_kicker))
        self.story.append(Spacer(1, 10))
        for ln in title_lines:
            self.story.append(Paragraph(ln, st_cover_title))
        self.story.append(Spacer(1, 12))
        self.story.append(Paragraph(subtitle, st_cover_sub))
        self.story.append(Spacer(1, 42))
        for ln in meta_lines:
            self.story.append(Paragraph(ln, st_cover_meta))
        self.story.append(NextPageTemplate("main"))
        self.story.append(PageBreak())

    def toc(self):
        self.story.append(Paragraph("목차", st_toc_title))
        toc = TableOfContents()
        toc.levelStyles = [
            S("toc0", fontName=KRB, fontSize=11, leading=21, textColor=GREY900),
            S("toc1", fontSize=10, leading=17, textColor=GREY600, leftIndent=14),
        ]
        toc.dotsMinLevel = 0
        self.story.append(toc)
        self.story.append(PageBreak())

    def heading(self, eyebrow, title, level=0):
        self._toc_seq += 1
        key = f"sec{self._toc_seq}"
        eb = Paragraph(eyebrow, _st_eyebrow_keep)
        hr = HR(CONTENT_W)
        hr.keepWithNext = True
        # keepWithNext (not KeepTogether) so afterFlowable sees the TocHeading directly
        self.story.append(eb)
        self.story.append(TocHeading(title, key, level))
        self.story.append(hr)
        self.story.append(Spacer(1, 5))

    def body(self, *paras):
        for p in paras:
            self.story.append(Paragraph(p, st_body))

    def steps(self, items, title="진행 순서"):
        if title:
            self.story.append(Paragraph(f"<b>{title}</b>", S("spt", fontName=KRB, fontSize=10.6, leading=16, textColor=GREY900, spaceBefore=3, spaceAfter=4)))
        for i, it in enumerate(items, 1):
            self.story.append(Paragraph(f"<b>{i}.</b>&nbsp;&nbsp;{it}", st_step))
        self.story.append(Spacer(1, 4))

    def bullets(self, items):
        for t in items:
            self.story.append(Paragraph(f"•&nbsp;&nbsp;{t}", st_li))
        self.story.append(Spacer(1, 3))

    def callout(self, label, text, kind="tip"):
        amber = kind == "caution"
        bg = AMBER_SOFT if amber else BLUE_SOFT
        bar = AMBER if amber else BLUE
        style = st_callout_amber if amber else st_callout
        head = S("coh", fontName=KRB, fontSize=9.6, leading=14, textColor=(AMBER if amber else BLUE))
        inner = [Paragraph(label, head), Spacer(1, 2), Paragraph(text, style)]
        t = Table([[inner]], colWidths=[CONTENT_W])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg),
            ("LINEBEFORE", (0, 0), (0, -1), 2.4, bar),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ]))
        self.story.append(Spacer(1, 2))
        self.story.append(t)
        self.story.append(Spacer(1, 8))

    def shots(self, items):
        """items: list of (filename, caption)."""
        for name, cap in items:
            for f in self.image(name, caption=cap):
                self.story.append(f)

    def shot_pair(self, left, right):
        """Two mobile/narrow screenshots side by side. left/right: (filename, caption)."""
        w = CONTENT_W / 2 - 4
        li = self._single_image_obj(left[0], w - 6)
        ri = self._single_image_obj(right[0], w - 6)
        t = Table(
            [[li, ri], [Paragraph(left[1], st_cap), Paragraph(right[1], st_cap)]],
            colWidths=[CONTENT_W / 2, CONTENT_W / 2],
        )
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (0, 0), (-1, -1), "CENTER")]))
        self.story.append(t)
        self.story.append(Spacer(1, 6))

    def role_table(self, header, rows, col_ratio=(0.46, 0.18, 0.18, 0.18)):
        cols = [CONTENT_W * r for r in col_ratio]
        data = [[Paragraph(h, st_cellh) for h in header]]
        for r in rows:
            row = [Paragraph(r[0], st_cell)]
            for c in r[1:]:
                if c == "O":
                    row.append(Paragraph("●", st_cell_ok))
                elif c in ("—", "-", "X"):
                    row.append(Paragraph("—", st_cell_no))
                else:
                    row.append(Paragraph(c, st_cell))
            data.append(row)
        t = Table(data, colWidths=cols)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BLUE),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GREY50]),
            ("GRID", (0, 0), (-1, -1), 0.5, GREY100),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ]))
        self.story.append(t)
        self.story.append(Spacer(1, 10))

    def spacer(self, h=8):
        self.story.append(Spacer(1, h))

    def page_break(self):
        self.story.append(PageBreak())

    # ---------- build ----------
    def build(self):
        doc = _ManualDoc(
            self.out_path, pagesize=A4,
            leftMargin=L_MARGIN, rightMargin=R_MARGIN, topMargin=20 * mm, bottomMargin=18 * mm,
            title=self.doc_title, author="Teameet",
        )
        frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
        doc.addPageTemplates([
            PageTemplate(id="cover", frames=[frame], onPage=self._cover),
            PageTemplate(id="main", frames=[frame], onPage=self._footer),
        ])
        doc.multiBuild(self.story)
        return self.out_path
