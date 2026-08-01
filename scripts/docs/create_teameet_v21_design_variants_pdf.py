from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from textwrap import wrap

from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
FLOW = ROOT / ".omo/ultraresearch/20260627-152929-teameet-mobile-tournament-identity/mockups/flow-deck-v21-design-variants-ko"
OUT = ROOT / "output/pdf/teameet-v21-design-variants-ko-current.pdf"

PAGE_W = 1800
PAGE_H = 1320
BG = colors.HexColor("#f7f8fa")
TEXT = colors.HexColor("#191f28")
MUTED = colors.HexColor("#6b7684")
BLUE = colors.HexColor("#3182f6")
LINE = colors.HexColor("#e5e8eb")
GREEN_BG = colors.HexColor("#e9f8ef")
GREEN = colors.HexColor("#138a4f")


@dataclass(frozen=True)
class Variant:
    label: str
    path: str
    verdict: str
    good: str
    watch: str


@dataclass(frozen=True)
class Page:
    number: int
    title: str
    purpose: str
    variants: list[Variant]


PAGES = [
    Page(
        1,
        "메인 홈",
        "같은 홈 콘텐츠를 네 가지 디자인 방향으로 비교합니다. 상태/플로우 차이가 아니라 디자인안 차이입니다.",
        [
            Variant("1A 토스 클린 기준안", "pages/01-main-home-a-toss-clean-v21.png", "확정 후보", "텍스트 우선, row + divider 중심으로 가장 구현 친화적입니다.", "시각적 차별감은 가장 약할 수 있습니다."),
            Variant("1B 포토 액센트안", "pages/01-main-home-b-photo-accent-v21.png", "확정 후보", "스포츠 플랫폼의 실재감이 가장 강합니다.", "사진 카드가 마케팅 hero처럼 커지지 않게 유지해야 합니다."),
            Variant("1C 컴팩트 유틸리티안", "pages/01-main-home-c-compact-utility-v22.png", "확정 후보", "같은 홈 콘텐츠를 더 조밀한 리스트 리듬으로 보여줍니다.", "컴팩트함이 과밀로 보이지 않게 여백을 유지해야 합니다."),
            Variant("1D 라운드 커뮤니티안", "pages/01-main-home-d-rounded-community-v23.png", "확정 후보", "같은 홈 콘텐츠를 더 부드러운 라운드 섹션으로 보여줍니다.", "틴트와 섹션 surface가 과해지지 않게 유지해야 합니다."),
        ],
    ),
    Page(
        2,
        "매치 찾기",
        "같은 매치 탐색 콘텐츠를 네 가지 디자인 방향으로 비교합니다. 상태/필터 결과 차이가 아니라 디자인안 차이입니다.",
        [
            Variant("2A 토스 클린 기준안", "pages/02-match-find-a-toss-clean-v24.png", "감시 승인", "검색, 필터, 결과 리스트가 가장 안정적인 기본 구조입니다.", "우측 칩 잘림과 PDF 스케일을 확인합니다."),
            Variant("2B 포토 액센트안", "pages/02-match-find-b-photo-accent-v25.png", "감시 승인", "작은 사진 썸네일로 스포츠 실재감을 보강합니다.", "사진 품질과 상태 pill token을 확인합니다."),
            Variant("2C 컴팩트 유틸리티안", "pages/02-match-find-c-compact-utility-v25.png", "감시 승인", "결과 수, 거리, 더 많은 row로 빠른 탐색성이 가장 강합니다.", "추가 row/control이 기능 차이처럼 보이지 않게 설명합니다."),
            Variant("2D 라운드 소프트 행 기반안", "pages/02-match-find-d-rounded-community-v29.png", "감시 승인", "부드러운 라운드 행 구조로 친근한 탐색감을 더합니다.", "행 구조가 개별 카드 과잉처럼 보이지 않는지 확인합니다."),
        ],
    ),
    Page(
        3,
        "매치 상세",
        "하나의 매치 참가 판단 화면을 네 가지 디자인 방향으로 비교합니다.",
        [
            Variant("3A 토스 클린 기준안", "pages/03-match-detail-a-toss-clean-v21.png", "자가검증 통과", "장소/시간/참가 현황과 참가 CTA가 가장 직접적으로 읽힙니다.", "상세 정보가 평면적으로 보이지 않게 섹션 리듬을 유지합니다."),
            Variant("3B 포토 액센트안", "pages/03-match-detail-b-photo-accent-v21.png", "자가검증 통과", "현장 사진으로 매치의 실제감을 보강합니다.", "사진이 참가 판단 정보를 압도하지 않게 제한합니다."),
            Variant("3C 컴팩트 유틸리티안", "pages/03-match-detail-c-compact-utility-v21.png", "자가검증 통과", "핵심 조건을 빠르게 비교하는 밀도 높은 상세입니다.", "주의사항 보조문구가 길어지지 않게 관리합니다."),
            Variant("3D 라운드 커뮤니티안", "pages/03-match-detail-d-rounded-community-v21.png", "자가검증 통과", "부드러운 참여 분위기와 신뢰 신호를 더합니다.", "커뮤니티 장식이 참가 CTA를 밀지 않게 합니다."),
        ],
    ),
    Page(
        4,
        "팀 허브",
        "내 팀 준비와 팀 활동 화면을 네 가지 디자인 방향으로 비교합니다.",
        [
            Variant("4A 토스 클린 기준안", "pages/04-team-hub-a-toss-clean-v21.png", "자가검증 통과", "다음 일정, 멤버 준비, 공지가 명확합니다.", "팀 화면도 홈처럼 장식 과잉이 되지 않게 유지합니다."),
            Variant("4B 포토 액센트안", "pages/04-team-hub-b-photo-accent-v21.png", "자가검증 통과", "팀 활동의 현장감과 소속감을 보강합니다.", "사진 header가 팀 관리 정보를 가리지 않게 합니다."),
            Variant("4C 컴팩트 유틸리티안", "pages/04-team-hub-c-compact-utility-v22.png", "자가검증 통과", "팀 준비 상태를 빠르게 훑는 유틸리티성이 좋습니다.", "추가 CTA가 늘어나 상태 차이처럼 보이지 않게 합니다."),
            Variant("4D 라운드 커뮤니티안", "pages/04-team-hub-d-rounded-community-v23.png", "감시 승인", "팀원/공지 신뢰 신호를 부드럽게 보여줍니다.", "rounded surface가 card-stack처럼 보이지 않게 관리합니다."),
        ],
    ),
    Page(
        5,
        "팀 찾기",
        "여러 종목 팀 탐색 화면을 네 가지 디자인 방향으로 비교합니다.",
        [
            Variant("5A 토스 클린 기준안", "pages/05-team-find-a-toss-clean-v21.png", "승인", "검색, 필터, 팀 리스트가 가장 안정적입니다.", "C와의 차이가 약해 보이지 않게 비교 설명이 필요합니다."),
            Variant("5B 포토 액센트안", "pages/05-team-find-b-photo-accent-v21.png", "승인", "팀 사진 썸네일로 실제감을 더합니다.", "사진 품질이 낮으면 리스트 품질도 흔들립니다."),
            Variant("5C 컴팩트 유틸리티안", "pages/05-team-find-c-compact-utility-v22.png", "감시 승인", "필터 액션과 조밀한 리스트로 도구적 탐색을 강화합니다.", "A와의 차이가 충분한지 PDF에서 확인합니다."),
            Variant("5D 라운드 커뮤니티안", "pages/05-team-find-d-rounded-community-v21.png", "승인", "멤버/신뢰 신호로 커뮤니티감을 더합니다.", "아바타가 핵심 팀 정보보다 앞서지 않게 합니다."),
        ],
    ),
    Page(
        6,
        "활동/기록",
        "개인 활동과 리텐션 화면을 네 가지 디자인 방향으로 비교합니다.",
        [
            Variant("6A 토스 클린 기준안", "pages/06-activity-record-a-toss-clean-v21.png", "승인", "최근 경기, 기록, 리뷰, 다음 행동이 차분하게 읽힙니다.", "기록 화면 특성상 숫자 위계가 과하지 않게 관리합니다."),
            Variant("6B 포토 액센트안", "pages/06-activity-record-b-photo-accent-v21.png", "승인", "최근 경기 맥락에 제한적 사진을 더합니다.", "활동 화면이 사진 feed처럼 보이지 않게 합니다."),
            Variant("6C 컴팩트 유틸리티안", "pages/06-activity-record-c-compact-utility-v22.png", "감시 승인", "기간 컨트롤, stats strip, 활동 ledger로 반복 확인성이 강합니다.", "PDF 축소 시 작은 보조 텍스트 가독성을 확인합니다."),
            Variant("6D 라운드 커뮤니티안", "pages/06-activity-record-d-rounded-community-v21.png", "승인", "리뷰와 매너 신호를 더 부드럽게 보여줍니다.", "review surface가 nested card처럼 커지지 않게 합니다."),
        ],
    ),
    Page(
        7,
        "대회 리스트",
        "대회 상태별 탐색 화면을 네 가지 디자인 방향으로 비교합니다.",
        [
            Variant("7A 토스 클린 기준안", "pages/07-a-toss-clean-v21.png", "자가검증 통과", "모집/진행/종료 상태가 가장 담백하게 보입니다.", "대회가 앱 전체에서 너무 중심처럼 보이지 않게 합니다."),
            Variant("7B 포토 액센트안", "pages/07-b-photo-accent-v21.png", "자가검증 통과", "장소/현장 사진으로 참가 욕구를 보강합니다.", "사진 카드가 홍보 페이지처럼 커지지 않게 합니다."),
            Variant("7C 컴팩트 유틸리티안", "pages/07-c-compact-utility-v22.png", "감시 승인", "상태와 CTA를 빠르게 훑는 리스트성이 좋습니다.", "하단 여백과 chrome 차이는 PDF에서 확인합니다."),
            Variant("7D 라운드 커뮤니티안", "pages/07-d-round-community-v21.png", "자가검증 통과", "팀 참여 신호를 부드럽게 더합니다.", "트로피/컵 강조로 흐르지 않게 합니다."),
        ],
    ),
    Page(
        8,
        "대회 모집 상세",
        "모집 중 대회 소개와 신청 화면을 네 가지 디자인 방향으로 비교합니다.",
        [
            Variant("8A 토스 클린 기준안", "pages/08-a-toss-clean-v21.png", "자가검증 통과", "일정, 장소, 참가비, 신청 CTA가 가장 명확합니다.", "정보가 긴 상세에서 섹션 간 호흡을 유지합니다."),
            Variant("8B 포토 액센트안", "pages/08-b-photo-accent-v21.png", "자가검증 통과", "상단 사진으로 대회 실재감을 보강합니다.", "마케팅 hero 과잉이 되지 않게 합니다."),
            Variant("8C 컴팩트 유틸리티안", "pages/08-c-compact-utility-v21.png", "자가검증 통과", "조건 확인과 신청 판단이 빠릅니다.", "fact table 느낌이 차갑지 않게 합니다."),
            Variant("8D 라운드 커뮤니티안", "pages/08-d-round-community-v21.png", "자가검증 통과", "참가팀/혜택 신뢰 신호를 부드럽게 보여줍니다.", "rounded section이 과중첩되지 않게 합니다."),
        ],
    ),
    Page(
        9,
        "대회 진행 허브",
        "진행 중 대회의 현재 상황 화면을 네 가지 디자인 방향으로 비교합니다.",
        [
            Variant("9A 토스 클린 기준안", "pages/09-tournament-live-hub-a-toss-clean-v21.png", "자가검증 통과", "현재 경기와 다음 행동 진입이 가장 명확합니다.", "대회 상세 정보가 현재 경기보다 커지지 않게 합니다."),
            Variant("9B 포토 액센트안", "pages/09-tournament-live-hub-b-photo-accent-v21.png", "자가검증 통과", "상단 사진으로 진행 중 현장감을 더합니다.", "사진이 스코어 허브보다 강하지 않게 합니다."),
            Variant("9C 컴팩트 유틸리티안", "pages/09-tournament-live-hub-c-compact-utility-v21.png", "자가검증 통과", "현재 경기, 다음 경기, 진입 메뉴를 빠르게 훑습니다.", "탭/리스트 밀도가 복잡해지지 않게 합니다."),
            Variant("9D 라운드 커뮤니티안", "pages/09-tournament-live-hub-d-rounded-community-v21.png", "자가검증 통과", "참가팀 신뢰 신호와 진행 현황을 부드럽게 묶습니다.", "커뮤니티 신호가 스코어를 밀지 않게 합니다."),
        ],
    ),
    Page(
        10,
        "경기 상세 실시간",
        "한 경기의 스코어와 이벤트 화면을 네 가지 디자인 방향으로 비교합니다.",
        [
            Variant("10A 토스 클린 기준안", "pages/10-live-match-detail-a-toss-clean-v21.png", "자가검증 통과", "스코어, 타임라인, 선수 기록이 가장 안정적입니다.", "관리자 입력 UI처럼 보이지 않게 읽기 화면을 유지합니다."),
            Variant("10B 포토 액센트안", "pages/10-live-match-detail-b-photo-accent-v21.png", "자가검증 통과", "영상/하이라이트 감각을 보강합니다.", "미디어가 이벤트 기록을 압도하지 않게 합니다."),
            Variant("10C 컴팩트 유틸리티안", "pages/10-live-match-detail-c-compact-utility-v21.png", "자가검증 통과", "이벤트와 기록을 빠르게 확인하는 구조입니다.", "테이블형 밀도가 너무 작아지지 않게 합니다."),
            Variant("10D 라운드 커뮤니티안", "pages/10-live-match-detail-d-rounded-community-v22.png", "자가검증 통과", "이벤트/리뷰 진입을 부드럽게 보여줍니다.", "타임라인이 카드 안 카드처럼 보이지 않게 합니다."),
        ],
    ),
    Page(
        11,
        "순위/브래킷",
        "리그 순위와 결선 결과 화면을 네 가지 디자인 방향으로 비교합니다.",
        [
            Variant("11A 토스 클린 기준안", "pages/11-ranking-bracket-a-toss-clean-v21.png", "자가검증 통과", "순위표와 결선 흐름이 가장 정돈되어 보입니다.", "브래킷 정보가 장식처럼 보이지 않게 합니다."),
            Variant("11B 포토 액센트안", "pages/11-ranking-bracket-b-photo-accent-v21.png", "자가검증 통과", "결과 화면에도 현장감을 조금 더합니다.", "사진 strip이 순위표를 밀지 않게 합니다."),
            Variant("11C 컴팩트 유틸리티안", "pages/11-ranking-bracket-c-compact-utility-v21.png", "자가검증 통과", "순위/결과를 빠르게 스캔하기 좋습니다.", "정보량이 많아 한글 가독성을 계속 확인합니다."),
            Variant("11D 라운드 커뮤니티안", "pages/11-ranking-bracket-d-rounded-community-v21.png", "자가검증 통과", "라운드 결과 노드를 부드럽게 보여줍니다.", "rounded node가 중첩 카드처럼 보이지 않게 합니다."),
        ],
    ),
    Page(
        12,
        "대회 종료/리텐션",
        "종료 후 결과 확인과 재방문 유도 화면을 네 가지 디자인 방향으로 비교합니다.",
        [
            Variant("12A 토스 클린 기준안", "pages/12-completed-retention-a-toss-clean-v21.png", "자가검증 통과", "우승, MVP, 리뷰, 다음 대회가 담백하게 이어집니다.", "수상 정보가 축하 포스터처럼 과장되지 않게 합니다."),
            Variant("12B 포토 액센트안", "pages/12-completed-retention-b-photo-accent-v21.png", "감시 통과", "하이라이트 사진으로 종료 후 재방문 이유를 만듭니다.", "사진 strip 때문에 상단 밀도가 높아지지 않게 합니다."),
            Variant("12C 컴팩트 유틸리티안", "pages/12-completed-retention-c-compact-utility-v21.png", "자가검증 통과", "결과와 다음 행동을 빠르게 확인합니다.", "결과 요약이 숫자 나열처럼 보이지 않게 합니다."),
            Variant("12D 라운드 커뮤니티안", "pages/12-completed-retention-d-rounded-community-v21.png", "감시 통과", "리뷰와 다음 대회 유도를 부드럽게 묶습니다.", "수상 아이콘이 과장되지 않게 합니다."),
        ],
    ),
]

def set_font(c: canvas.Canvas, size: int, color=TEXT) -> None:
    c.setFont("Korean", size)
    c.setFillColor(color)


def draw_wrapped(c: canvas.Canvas, text: str, x: float, y: float, width: int, size: int, leading: int, color=MUTED, lines: int = 3) -> float:
    set_font(c, size, color)
    for line in wrap(text, width=width)[:lines]:
        c.drawString(x, y, line)
        y -= leading
    return y


def badge(c: canvas.Canvas, label: str, x: float, y: float) -> None:
    set_font(c, 11, GREEN)
    w = c.stringWidth(label, "Korean", 11) + 22
    c.setFillColor(GREEN_BG)
    c.roundRect(x, y - 20, w, 24, 12, fill=1, stroke=0)
    set_font(c, 11, GREEN)
    c.drawString(x + 11, y - 12, label)


def draw_image(c: canvas.Canvas, path: Path, x: float, y: float, w: float, h: float) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Missing mockup image: {path}")
    c.setFillColor(colors.white)
    c.setStrokeColor(LINE)
    c.roundRect(x - 1, y - 1, w + 2, h + 2, 18, fill=1, stroke=1)
    c.drawImage(ImageReader(str(path)), x, y, w, h, preserveAspectRatio=True, anchor="c", mask="auto")


def validate_assets() -> None:
    missing = [
        str(FLOW / variant.path)
        for page in PAGES
        for variant in page.variants
        if not (FLOW / variant.path).exists()
    ]
    if missing:
        joined = "\n".join(missing)
        raise FileNotFoundError(f"Missing {len(missing)} mockup image(s):\n{joined}")


def render_page(c: canvas.Canvas, page: Page) -> None:
    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    set_font(c, 13, BLUE)
    c.drawString(52, PAGE_H - 54, f"{page.number}번 화면")
    set_font(c, 34, TEXT)
    c.drawString(52, PAGE_H - 98, page.title)
    draw_wrapped(c, page.purpose, 52, PAGE_H - 130, 82, 14, 20, MUTED, 2)
    set_font(c, 12, MUTED)
    c.drawRightString(PAGE_W - 52, PAGE_H - 62, f"Teameet v21 디자인 변형 덱 · {page.number}/12")

    col_w = (PAGE_W - 104 - 30 * 3) / 4
    img_w = 310
    img_h = 670
    top = PAGE_H - 185
    for idx, item in enumerate(page.variants):
        x = 52 + idx * (col_w + 30)
        draw_image(c, FLOW / item.path, x + (col_w - img_w) / 2, top - img_h, img_w, img_h)
        y = top - img_h - 34
        badge(c, item.verdict, x, y + 4)
        set_font(c, 18, TEXT)
        c.drawString(x, y - 40, item.label)
        set_font(c, 13, TEXT)
        c.drawString(x, y - 78, "장점")
        y = draw_wrapped(c, item.good, x, y - 100, 29, 12, 17, MUTED, 3)
        set_font(c, 13, TEXT)
        c.drawString(x, y - 12, "주의점")
        draw_wrapped(c, item.watch, x, y - 34, 29, 12, 17, MUTED, 3)
        if idx < 3:
            c.setStrokeColor(LINE)
            c.line(x + col_w + 15, top + 12, x + col_w + 15, 88)


def main() -> None:
    pdfmetrics.registerFont(TTFont("Korean", "/System/Library/Fonts/Supplemental/AppleGothic.ttf"))
    validate_assets()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=(PAGE_W, PAGE_H))
    for page in PAGES:
        render_page(c, page)
        c.showPage()
    c.save()
    print(OUT)


if __name__ == "__main__":
    main()
