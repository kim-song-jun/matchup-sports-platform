from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from textwrap import wrap

from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
FLOW = ROOT / ".omo/ultraresearch/20260627-152929-teameet-mobile-tournament-identity/mockups/flow-deck-v20-one-by-one-ko"
OUT = ROOT / "output/pdf/teameet-v20-one-by-one-ko-current.pdf"

PAGE_W = 1800
PAGE_H = 1320
BG = colors.HexColor("#f7f8fa")
SURFACE = colors.white
TEXT = colors.HexColor("#191f28")
MUTED = colors.HexColor("#6b7684")
BLUE = colors.HexColor("#3182f6")
LINE = colors.HexColor("#e5e8eb")
GREEN_BG = colors.HexColor("#e9f8ef")
GREEN = colors.HexColor("#138a4f")


@dataclass(frozen=True)
class ImageSlot:
    label: str
    path: str
    good: str
    watch: str


@dataclass(frozen=True)
class DeckPage:
    number: int
    title: str
    purpose: str
    status: str
    images: list[ImageSlot]
    decision: str
    watches: list[str] = field(default_factory=list)


PAGES = [
    DeckPage(
        1,
        "메인 홈",
        "같은 사용자가 탐색, 참가 준비, 오늘 경기, 경기 후 재방문 상태를 오가는 홈입니다.",
        "확정 후보 4개 상태",
        [
            ImageSlot(
                "1A 탐색 홈",
                "pages/01-main-home-a-participant-v20.png",
                "개인 참가 준비, 추천 매치, 동네 경기로 탐색 흐름을 정리했습니다.",
                "풋살 이미지 비중은 전체 덱에서 계속 감시합니다.",
            ),
            ImageSlot(
                "1B 참가 준비 홈",
                "pages/01-main-home-b-prep-v21.png",
                "참가 확정 상태와 준비 행동을 단일 컬럼 홈 리듬으로 정리했습니다.",
                "숫자 정합성, 좁은 폭 2열 카드, 하단 탭 계약을 확인합니다.",
            ),
            ImageSlot(
                "1C 오늘 경기 홈",
                "pages/01-main-home-c-today-v23.png",
                "경기 당일 체크인, 이동, 내 도착 상태를 일반 사용자 홈으로 정리했습니다.",
                "배지는 한글화하고 CTA 강도는 구현에서 조절합니다.",
            ),
            ImageSlot(
                "1D 경기 후 홈",
                "pages/01-main-home-d-return-v20.png",
                "경기 후 결과, 내 기록, 리뷰, 다음 추천을 홈 상태로 정리했습니다.",
                "결과 카드가 팀 상세처럼 무거워지지 않게 유지합니다.",
            ),
        ],
        "1번은 역할별 화면이 아니라 같은 사용자의 상태형 홈으로 확정합니다.",
        ["아이폰 목업 없이 원본 화면만 사용", "대회보다 매치, 팀, 기록의 순환을 앞세움"],
    ),
    DeckPage(
        2,
        "매치 찾기",
        "오늘 또는 이번 주 참여 가능한 매치, 팀전, 용병, 대회를 하나의 기회 리스트로 비교합니다.",
        "확정 후보",
        [
            ImageSlot(
                "2 매치 찾기",
                "pages/02-match-discovery-a-v20.png",
                "검색, 종목 칩, 추천 매치, 리스트가 대회 목록이 아닌 참여 기회 탐색으로 읽힙니다.",
                "팀전과 용병이 필터뿐 아니라 카드 타입으로도 충분히 드러나야 합니다.",
            )
        ],
        "대회 탐색이 아니라 지금 뛸 수 있는 기회 찾기로 방향을 재정렬했습니다.",
        ["첫 카드 높이와 리스트 노출량", "하단 탭의 대회 연상 아이콘"],
    ),
    DeckPage(
        3,
        "매치 상세",
        "시간, 장소, 수준, 인원, 신뢰 신호, 비용을 보고 참여 여부를 판단합니다.",
        "확정 후보",
        [
            ImageSlot(
                "3 매치 상세",
                "pages/03-match-detail-a-v20.png",
                "참여 판단에 필요한 정보와 하단 CTA가 명확합니다.",
                "종목 배지를 제목 근처에 두고 신뢰 신호는 실제 데이터에 묶어야 합니다.",
            )
        ],
        "참여 전 의사결정 화면으로 통과했습니다.",
        ["CTA 파란 면적", "신뢰 신호 영역의 카드 안 카드 인상"],
    ),
    DeckPage(
        4,
        "참여 요청",
        "참여 요청 직후 승인 대기와 결제 전 상태를 사용자가 오해 없이 이해하게 합니다.",
        "확정 후보",
        [
            ImageSlot(
                "4 참여 요청",
                "pages/04-join-request-status-a-v20.png",
                "요청 접수, 호스트 승인, 결제 진행의 단계가 간결합니다.",
                "결제 전 대기 상태에서 CTA가 과한 유도처럼 보이지 않아야 합니다.",
            )
        ],
        "신청 후 상태 안내 화면으로 통과했습니다.",
        ["단계 보조 텍스트 대비", "터치 타깃 44px", "토큰 기반 블루 배경"],
    ),
    DeckPage(
        5,
        "팀 찾기",
        "여러 스포츠에서 팀원, 용병, 파트너를 찾는 팀/용병 매칭 화면입니다.",
        "확정 후보",
        [
            ImageSlot(
                "5 팀 찾기",
                "pages/05-team-mercenary-match-a-v20.png",
                "대회가 아니라 팀, 용병, 파트너 연결 화면으로 읽힙니다.",
                "영문 팀명은 최종본에서 한글 팀명 또는 고유명 예외로 명확히 처리합니다.",
            )
        ],
        "멀티스포츠 팀 매칭 허브로 통과했습니다.",
        ["필터 2줄 이상 확장 금지", "filled blue CTA 남발 금지"],
    ),
    DeckPage(
        6,
        "팀 준비",
        "특정 예정 매치 전 팀 응답, 준비 체크, 공지를 정리합니다.",
        "확정 후보",
        [
            ImageSlot(
                "6 팀 준비",
                "pages/06-team-prep-a-v20.png",
                "팀 응답과 준비 체크가 경기 전 행동으로 잘 읽힙니다.",
                "영문 팀명과 row 밀도, 진행률 정렬을 구현 단계에서 조정합니다.",
            )
        ],
        "경기 전 준비 허브로 통과했습니다.",
        ["팀원 row vertical padding", "진행률과 응답 텍스트 정렬"],
    ),
    DeckPage(
        7,
        "매치방",
        "확정된 경기의 장소, 명단, 공지, 정산, 짧은 대화를 모아보는 하위 화면입니다.",
        "확정 후보",
        [
            ImageSlot(
                "7 매치방",
                "pages/07-match-room-chat-a-v21.png",
                "공지와 채팅, 장소/명단 바로가기가 매치 실행 허브로 잘 작동합니다.",
                "상단 요약과 바로가기 타일이 채팅 가시성을 밀어내지 않게 조절합니다.",
            )
        ],
        "텍스트 오탈자 버전은 폐기하고 v21을 승격했습니다.",
        ["회색 말풍선 대비", "바로가기 타일 border 강도", "정산 진입 시 금액 맥락"],
    ),
    DeckPage(
        8,
        "도착 체크인",
        "경기 당일 장소 확인, 길찾기, 도착 현황, 체크인을 처리합니다.",
        "확정 후보",
        [
            ImageSlot(
                "8 도착 체크인",
                "pages/08-arrival-checkin-a-v20.png",
                "시간, 장소, 도착 현황, 준비사항, 체크인 CTA가 명확합니다.",
                "지도 프리뷰는 카드 안 카드처럼 보이지 않게 borderless media surface로 처리합니다.",
            )
        ],
        "매치 당일 도착 플로우로 통과했습니다.",
        ["지도 높이 여유", "secondary CTA 강도", "상태 대비"],
    ),
    DeckPage(
        9,
        "실시간 경기",
        "진행 중인 경기의 스코어, 타임라인, 선수 기록 진입을 보여줍니다.",
        "확정 후보",
        [
            ImageSlot(
                "9 실시간 경기",
                "pages/09-live-match-status-a-v20.png",
                "스코어와 이벤트 타임라인이 과밀하지 않고 하위 화면으로 잘 읽힙니다.",
                "경기 후 행동 문구는 라이브 화면에서는 선수 기록 진입 중심으로 낮춥니다.",
            )
        ],
        "대회 중계가 아닌 특정 경기 상태 화면으로 통과했습니다.",
        ["후속 CTA 문구", "팀 로고 비중"],
    ),
    DeckPage(
        10,
        "경기 후 기록",
        "경기 종료 후 매너 평가, 리뷰, 개인 기록 확인으로 재방문 이유를 만듭니다.",
        "확정 후보",
        [
            ImageSlot(
                "10 경기 후 기록",
                "pages/10-review-record-a-v20.png",
                "매너 평가, 상대 리뷰, 내 기록 확인이 종료 후 리텐션 구조로 읽힙니다.",
                "점수와 방패 비중이 커지면 대회 결과 화면처럼 흐를 수 있어 절제합니다.",
            )
        ],
        "대회 우승 결과가 아니라 경기 후 리텐션 화면으로 통과했습니다.",
        ["별점 크기", "영문 로고 엄격 기준", "축하 요소 추가 금지"],
    ),
    DeckPage(
        11,
        "내 스포츠",
        "여러 종목 활동, 매너 신뢰도, 최근 기록이 누적되는 개인 스포츠 ID입니다.",
        "확정 후보",
        [
            ImageSlot(
                "11 내 스포츠",
                "pages/11-sports-profile-a-v20.png",
                "풋살, 농구, 배드민턴, 러닝이 자연스럽게 드러나고 개인 스포츠 ID로 읽힙니다.",
                "득점/도움은 축구식 지표라 최종본에서는 범용 활동 지표로 조정합니다.",
            )
        ],
        "멀티스포츠 개인 프로필로 통과했습니다.",
        ["sportCardAccent 토큰", "하단 비활성 아이콘 톤", "SNS 피드로 확장 금지"],
    ),
    DeckPage(
        12,
        "활동",
        "매치, 팀, 리뷰, 기록, 추천의 다음 액션을 모아 재방문 동기를 만듭니다.",
        "확정 후보",
        [
            ImageSlot(
                "12 활동",
                "pages/12-activity-next-actions-a-v20.png",
                "알림 폭탄이 아니라 지금 처리할 일을 보여주는 활동 허브로 읽힙니다.",
                "하단 매치 아이콘이 트로피처럼 보이면 대회 연상이 생기므로 교체합니다.",
            )
        ],
        "활동 알림함이 아니라 다음 액션 허브로 통과했습니다.",
        ["매치 아이콘 교체", "action 버튼 대비", "리스트 항목 5-6개 밀도 유지"],
    ),
]


def set_font(c: canvas.Canvas, size: int, color=TEXT) -> None:
    c.setFont("Korean", size)
    c.setFillColor(color)


def draw_wrapped(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    width: int,
    size: int,
    leading: int,
    color=MUTED,
    lines: int = 4,
) -> float:
    set_font(c, size, color)
    rendered = wrap(text, width=width)[:lines]
    for line in rendered:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_badge(c: canvas.Canvas, label: str, x: float, y: float) -> None:
    set_font(c, 12, GREEN)
    w = c.stringWidth(label, "Korean", 12) + 26
    c.setFillColor(GREEN_BG)
    c.roundRect(x, y - 20, w, 26, 13, fill=1, stroke=0)
    set_font(c, 12, GREEN)
    c.drawString(x + 13, y - 12, label)


def draw_screen(c: canvas.Canvas, image_path: Path, x: float, y: float, w: float, h: float) -> None:
    c.setFillColor(SURFACE)
    c.setStrokeColor(LINE)
    c.roundRect(x - 1, y - 1, w + 2, h + 2, 22, fill=1, stroke=1)
    if image_path.exists():
        c.drawImage(ImageReader(str(image_path)), x, y, w, h, preserveAspectRatio=True, anchor="c", mask="auto")
        return
    set_font(c, 26, MUTED)
    c.drawCentredString(x + w / 2, y + h / 2, "이미지 없음")


def draw_header(c: canvas.Canvas, page: DeckPage) -> None:
    set_font(c, 13, BLUE)
    c.drawString(56, PAGE_H - 54, f"{page.number}번 화면")
    set_font(c, 34, TEXT)
    c.drawString(56, PAGE_H - 98, page.title)
    draw_wrapped(c, page.purpose, 56, PAGE_H - 130, 76, 14, 20, MUTED, 2)
    set_font(c, 12, MUTED)
    c.drawRightString(PAGE_W - 56, PAGE_H - 62, f"Teameet 모바일 플로우 덱 · {page.number}/12")


def draw_note_panel(c: canvas.Canvas, page: DeckPage, x: float, y: float, w: float, h: float) -> None:
    c.setFillColor(SURFACE)
    c.setStrokeColor(LINE)
    c.roundRect(x, y, w, h, 24, fill=1, stroke=1)
    draw_badge(c, page.status, x + 30, y + h - 34)
    set_font(c, 22, TEXT)
    c.drawString(x + 30, y + h - 78, "판정")
    yy = draw_wrapped(c, page.decision, x + 30, y + h - 110, 44, 14, 21, MUTED, 4)
    set_font(c, 22, TEXT)
    c.drawString(x + 30, yy - 20, "감시 항목")
    yy -= 54
    for watch in page.watches[:5]:
        set_font(c, 14, MUTED)
        c.drawString(x + 32, yy, f"- {watch}")
        yy -= 24


def render_home_page(c: canvas.Canvas, page: DeckPage) -> None:
    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    draw_header(c, page)

    col_w = (PAGE_W - 112 - 30 * 3) / 4
    img_w = 310
    img_h = 670
    top = PAGE_H - 190
    for idx, item in enumerate(page.images):
        x = 56 + idx * (col_w + 30)
        image_path = FLOW / item.path
        draw_screen(c, image_path, x + (col_w - img_w) / 2, top - img_h, img_w, img_h)
        yy = top - img_h - 34
        draw_badge(c, "확정 후보", x, yy + 4)
        set_font(c, 18, TEXT)
        c.drawString(x, yy - 40, item.label)
        set_font(c, 13, TEXT)
        c.drawString(x, yy - 78, "장점")
        yy = draw_wrapped(c, item.good, x, yy - 100, 28, 12, 17, MUTED, 3)
        set_font(c, 13, TEXT)
        c.drawString(x, yy - 12, "주의점")
        draw_wrapped(c, item.watch, x, yy - 34, 28, 12, 17, MUTED, 3)
        if idx < 3:
            c.setStrokeColor(LINE)
            c.line(x + col_w + 15, top + 12, x + col_w + 15, 88)


def render_single_page(c: canvas.Canvas, page: DeckPage) -> None:
    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    draw_header(c, page)
    item = page.images[0]
    draw_screen(c, FLOW / item.path, 690, 92, 430, 930)

    left_x = 56
    set_font(c, 20, TEXT)
    c.drawString(left_x, PAGE_H - 220, item.label)
    draw_badge(c, page.status, left_x, PAGE_H - 260)

    y = PAGE_H - 320
    set_font(c, 18, TEXT)
    c.drawString(left_x, y, "좋은 점")
    y = draw_wrapped(c, item.good, left_x, y - 32, 58, 15, 23, MUTED, 4)
    set_font(c, 18, TEXT)
    c.drawString(left_x, y - 22, "주의점")
    y = draw_wrapped(c, item.watch, left_x, y - 54, 58, 15, 23, MUTED, 4)

    draw_note_panel(c, page, 1180, 300, 560, 470)

    c.setStrokeColor(LINE)
    c.line(left_x, 166, 610, 166)
    set_font(c, 13, MUTED)
    draw_wrapped(c, "이미지는 기기 목업 없이 생성 원본 화면만 배치했습니다. 실제 구현에서는 토큰, 접근성 대비, 터치 타깃, 하단 탭 아이콘 계약을 별도 검증합니다.", left_x, 130, 68, 13, 19, MUTED, 3)


def main() -> None:
    pdfmetrics.registerFont(TTFont("Korean", "/System/Library/Fonts/Supplemental/AppleGothic.ttf"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=(PAGE_W, PAGE_H))
    for page in PAGES:
        if page.number == 1:
            render_home_page(c, page)
        else:
            render_single_page(c, page)
        c.showPage()
    c.save()
    print(OUT)


if __name__ == "__main__":
    main()
