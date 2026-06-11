#!/usr/bin/env python3
"""Build the Teameet admin-console user manual PDF from QA screenshots."""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Image,
    PageBreak, Table, TableStyle, KeepTogether, NextPageTemplate,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image as PILImage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAT = os.path.join(ROOT, "docs/visual-qa/admin-platform-v1")
ROLES = os.path.join(ROOT, "docs/visual-qa/admin-roles-v1")
OUT_DIR = os.path.join(ROOT, "docs/manual")
OUT = os.path.join(OUT_DIR, "teameet-admin-console-manual.pdf")
os.makedirs(OUT_DIR, exist_ok=True)

# ---- Korean font ----
KR, KRB = "KR", "KR"
for path, idx in [("/System/Library/Fonts/AppleSDGothicNeo.ttc", 0)]:
    try:
        pdfmetrics.registerFont(TTFont("KR", path, subfontIndex=idx))
        pdfmetrics.registerFont(TTFont("KRB", path, subfontIndex=3))
        KR, KRB = "KR", "KRB"
        break
    except Exception:
        pass
else:
    pdfmetrics.registerFont(TTFont("KR", "/System/Library/Fonts/Supplemental/AppleGothic.ttf"))
    KRB = "KR"

BLUE = colors.HexColor("#3182f6")
GREY900 = colors.HexColor("#191f28")
GREY600 = colors.HexColor("#4e5968")
GREY400 = colors.HexColor("#8b95a1")
GREY100 = colors.HexColor("#e5e8eb")
GREY50 = colors.HexColor("#f2f4f6")

styles = getSampleStyleSheet()
def S(name, **kw):
    kw.setdefault("fontName", KR)
    return ParagraphStyle(name, parent=styles["Normal"], **kw)

st_cover_title = S("ct", fontName=KRB, fontSize=30, leading=38, textColor=GREY900, alignment=TA_CENTER)
st_cover_sub = S("cs", fontSize=14, leading=22, textColor=GREY600, alignment=TA_CENTER)
st_cover_meta = S("cm", fontSize=10.5, leading=16, textColor=GREY400, alignment=TA_CENTER)
st_h1 = S("h1", fontName=KRB, fontSize=19, leading=26, textColor=GREY900, spaceBefore=4, spaceAfter=6)
st_eyebrow = S("eb", fontName=KRB, fontSize=10, leading=14, textColor=BLUE, spaceAfter=2)
st_body = S("bd", fontSize=10.8, leading=17.5, textColor=GREY600, spaceAfter=5)
st_cap = S("cap", fontSize=8.6, leading=12, textColor=GREY400, alignment=TA_CENTER, spaceBefore=3, spaceAfter=10)
st_li = S("li", fontSize=10.8, leading=17, textColor=GREY600, leftIndent=12, spaceAfter=2)
st_cell = S("cl", fontSize=9.6, leading=14, textColor=GREY600)
st_cellh = S("clh", fontName=KRB, fontSize=9.8, leading=14, textColor=colors.white)
st_cellb = S("clb", fontName=KRB, fontSize=9.6, leading=14, textColor=GREY900)

CONTENT_W = A4[0] - 36 * mm  # frame width

def img(path, max_w=CONTENT_W, caption=None, border=True):
    if not os.path.exists(path):
        return [Paragraph(f"(이미지 없음: {os.path.basename(path)})", st_cap)]
    w, h = PILImage.open(path).size
    iw = max_w
    ih = iw * h / w
    im = Image(path, width=iw, height=ih)
    im.hAlign = "CENTER"
    flow = [im]
    if caption:
        flow.append(Paragraph(caption, st_cap))
    else:
        flow.append(Spacer(1, 8))
    return flow

def bullets(items):
    return [Paragraph(f"•&nbsp;&nbsp;{t}", st_li) for t in items]

# ---------- document ----------
doc = BaseDocTemplate(
    OUT, pagesize=A4,
    leftMargin=18 * mm, rightMargin=18 * mm, topMargin=20 * mm, bottomMargin=18 * mm,
    title="Teameet 운영자 콘솔 사용설명서", author="Teameet",
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")

def footer(canvas, d):
    canvas.saveState()
    canvas.setFont(KR, 8)
    canvas.setFillColor(GREY400)
    canvas.drawString(d.leftMargin, 10 * mm, "Teameet 운영자 콘솔 사용설명서")
    canvas.drawRightString(A4[0] - d.rightMargin, 10 * mm, "%d" % d.page)
    canvas.setStrokeColor(GREY100)
    canvas.line(d.leftMargin, 13 * mm, A4[0] - d.rightMargin, 13 * mm)
    canvas.restoreState()

def cover(canvas, d):
    canvas.saveState()
    canvas.setFillColor(BLUE)
    canvas.rect(0, A4[1] - 8 * mm, A4[0], 8 * mm, fill=1, stroke=0)
    canvas.restoreState()

doc.addPageTemplates([
    PageTemplate(id="cover", frames=[frame], onPage=cover),
    PageTemplate(id="main", frames=[frame], onPage=footer),
])

story = []
# ---- Cover ----
story.append(Spacer(1, 60 * mm))
story.append(Paragraph("Teameet 운영자 콘솔", st_cover_title))
story.append(Paragraph("사용설명서", st_cover_title))
story.append(Spacer(1, 10))
story.append(Paragraph("플랫폼 운영자(Admin)를 위한 백오피스 운영 가이드", st_cover_sub))
story.append(Spacer(1, 40))
story.append(Paragraph("v1 · 2026-06 · 데스크탑 / 모바일", st_cover_meta))
story.append(Paragraph("최고운영자 · 운영 · 지원 권한 체계 포함", st_cover_meta))
story.append(NextPageTemplate("main"))
story.append(PageBreak())

def section(eyebrow, title, body=None, items=None, images=None, keep_first=True):
    blk = [Paragraph(eyebrow, st_eyebrow), Paragraph(title, st_h1)]
    if body:
        for p in body:
            blk.append(Paragraph(p, st_body))
    if items:
        blk += bullets(items)
    blk.append(Spacer(1, 4))
    story.append(KeepTogether(blk) if keep_first else blk[0])
    if not keep_first:
        for x in blk[1:]:
            story.append(x)
    if images:
        for path, cap in images:
            for f in img(path, caption=cap):
                story.append(f)
    story.append(Spacer(1, 6))

# 1. 소개 & 접속
section(
    "01  시작하기", "운영자 콘솔 소개와 접속",
    body=[
        "Teameet 운영자 콘솔(<b>/admin</b>)은 플랫폼 전반의 회원·매치·팀·팀매치를 운영자가 직접 점검하고 조치하는 백오피스입니다. 일반 사용자 화면과 분리된 전용 영역으로, 운영자 권한이 있는 계정만 접근할 수 있습니다.",
        "운영자 계정으로 로그인한 뒤 주소창에 <b>/admin</b>을 입력하면 콘솔에 진입합니다. 권한이 없는 계정은 자동으로 접근이 차단됩니다.",
    ],
    items=[
        "<b>최고운영자(owner)</b> — 모든 기능 + 운영자 권한 관리",
        "<b>운영(ops)</b> — 회원·매치·팀 상태 변경(모더레이션) 가능, 운영자 권한 관리 불가",
        "<b>지원(support)</b> — 모든 목록·로그 열람 가능(읽기 전용), 상태 변경 불가",
    ],
)

# 2. 개요
section(
    "02  대시보드", "운영 개요",
    body=[
        "콘솔 진입 시 가장 먼저 보이는 화면입니다. 좌측 사이드바로 모든 섹션을 이동합니다. 상단에는 플랫폼 핵심 지표(활성 회원·매치·팀·팀매치)가, 그 아래 <b>주의 필요</b> 영역에는 정지·차단 회원, 탈퇴 대기, 취소 매치 등 조치가 필요한 항목이 모입니다. 각 카드를 누르면 해당 조건으로 필터된 목록으로 이동합니다.",
        "<b>최근 운영 활동</b>에는 운영자들이 수행한 최근 조치가 시간순으로 표시됩니다.",
    ],
    images=[(os.path.join(PLAT, "admin-overview-fixed-1280.png"), "운영 개요 — KPI · 주의 필요 · 최근 운영 활동")],
)

# 3. 회원 관리
section(
    "03  회원", "회원 관리와 모더레이션",
    body=[
        "플랫폼 전체 회원을 검색·상태 필터로 조회합니다. 각 행의 <b>상태 변경</b> 버튼을 누르면 사유 입력 모달이 열리고, 정지·차단·복구 등의 조치를 사유와 함께 적용합니다. 사유는 필수이며, 모든 변경은 감사 로그에 자동 기록됩니다.",
    ],
    images=[
        (os.path.join(PLAT, "admin-after-users-ok-1280.png"), "회원 목록 — 검색 · 상태 필터 · 상태 변경"),
        (os.path.join(PLAT, "admin-reason-modal-1280.png"), "상태 변경 모달 — 상태 선택 + 필수 사유"),
        (os.path.join(PLAT, "admin-moderation-result-1280.png"), "조치 직후 목록·지표에 즉시 반영"),
    ],
)

# 4. 매치/팀/팀매치
section(
    "04  콘텐츠", "매치 · 팀 · 팀매치 관리",
    body=[
        "매치·팀·팀매치도 회원과 동일한 패턴으로 관리합니다. 검색과 상태 필터로 대상을 찾고, 행에서 상태를 변경(사유 입력)하면 즉시 반영되며 감사 로그에 남습니다. 데스크탑에서는 표, 모바일에서는 카드로 자동 전환됩니다.",
    ],
    images=[(os.path.join(PLAT, "admin-after-matches-1280.png"), "매치 관리 — 종목 · 호스트 · 일시 · 인원 · 상태")],
)

# 5. 감사 로그
section(
    "05  감사", "감사 로그",
    body=[
        "운영자가 수행한 모든 조치의 이력을 추적합니다. <b>관리자 액션</b>과 <b>상태 변경</b> 두 가지 관점으로 나뉘며, 대상 유형(회원·매치·팀·팀매치)으로 필터링할 수 있습니다. 각 항목에는 시각·관리자·액션·대상·사유가 기록되어, 누가 언제 무엇을 왜 변경했는지 확인할 수 있습니다.",
    ],
    images=[(os.path.join(PLAT, "admin-audit-fixed-1280.png"), "감사 로그 — 관리자 액션 / 상태 변경 탭 + 대상 필터")],
)

# 6. 관리자 관리
section(
    "06  권한", "운영자 권한 관리 (최고운영자 전용)",
    body=[
        "최고운영자만 접근할 수 있는 화면으로, 일반 사용자에게 <b>운영(ops)</b> 또는 <b>지원(support)</b> 권한을 부여하고 관리합니다. <b>운영자 추가</b>에서 회원을 검색해 선택하고 역할과 사유를 입력하면 권한이 부여됩니다. 기존 운영자는 역할 변경·회수·재부여가 가능합니다.",
        "안전장치: 본인 권한은 스스로 변경할 수 없으며, 마지막 남은 최고운영자는 강등·회수할 수 없어 권한 공백이 발생하지 않습니다.",
    ],
    images=[
        (os.path.join(ROLES, "admin-admins-owner-1280.png"), "관리자 관리 — 역할 · 상태 · 부여일 + 역할변경/회수"),
        (os.path.join(ROLES, "admin-grant-modal-1280.png"), "운영자 추가 — 회원 검색 → 역할 → 사유"),
        (os.path.join(ROLES, "admin-grant-result-1280.png"), "부여 직후 운영자 목록에 즉시 반영"),
    ],
)

# 7. 역할별 권한
role_header = [Paragraph("기능", st_cellh), Paragraph("최고운영자", st_cellh), Paragraph("운영", st_cellh), Paragraph("지원", st_cellh)]
role_rows = [
    ["개요 · 목록 · 감사 로그 열람", "O", "O", "O"],
    ["회원·매치·팀 상태 변경(모더레이션)", "O", "O", "—"],
    ["운영자 권한 부여 · 회수", "O", "—", "—"],
]
tbl_data = [role_header]
for r in role_rows:
    tbl_data.append([Paragraph(r[0], st_cell)] + [Paragraph(c, st_cellb if c == "O" else st_cell) for c in r[1:]])
tbl = Table(tbl_data, colWidths=[CONTENT_W - 3 * 26 * mm, 26 * mm, 26 * mm, 26 * mm])
tbl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), BLUE),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GREY50]),
    ("GRID", (0, 0), (-1, -1), 0.5, GREY100),
    ("ALIGN", (1, 0), (-1, -1), "CENTER"),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ("LEFTPADDING", (0, 0), (-1, -1), 9),
]))
section(
    "07  역할", "역할별 권한 요약",
    body=["권한 등급에 따라 노출되는 메뉴와 가능한 조치가 달라집니다. 지원(support)은 읽기 전용으로 상태 변경 버튼이 보이지 않으며, 운영(ops)은 모더레이션은 가능하지만 운영자 권한 관리 메뉴에 접근할 수 없습니다."],
)
story.append(tbl)
story.append(Spacer(1, 10))
story.append(KeepTogether(img(os.path.join(ROLES, "admin-support-users-readonly-1280.png"),
                              caption="지원(support) — 상태 변경 열 자체가 없는 읽기 전용 화면")))
story.append(KeepTogether(img(os.path.join(ROLES, "admin-ops-admins-denied-1280.png"),
                              caption="운영(ops) — 운영자 관리 페이지 접근 차단")))

# 8. 모바일
story.append(PageBreak())
section(
    "08  모바일", "모바일 환경 지원",
    body=[
        "운영자 콘솔은 모바일에서도 동일하게 동작합니다. 좁은 화면에서는 좌측 고정 사이드바 대신 상단 햄버거 메뉴를 누르면 오프캔버스 드로어로 모든 섹션에 접근할 수 있습니다. 데이터 표는 카드 형태로 자동 전환되어 가독성을 유지합니다.",
    ],
)
def single_img(path, w):
    iw = w
    pw, ph = PILImage.open(path).size
    im = Image(path, width=iw, height=iw * ph / pw)
    im.hAlign = "CENTER"
    return im
mw = 66 * mm
m1 = single_img(os.path.join(PLAT, "admin-mobile-drawer-390.png"), mw)
m2 = single_img(os.path.join(PLAT, "admin-mobile-teams-cards-390.png"), mw)
mob = Table(
    [[m1, m2], [Paragraph("드로어 네비게이션", st_cap), Paragraph("표 → 카드 자동 전환", st_cap)]],
    colWidths=[CONTENT_W / 2, CONTENT_W / 2],
)
mob.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (0, 0), (-1, -1), "CENTER")]))
story.append(mob)

doc.build(story)
print("WROTE", OUT)
print("PAGES_OK")
