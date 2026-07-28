#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from textwrap import wrap

from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
DECK_ROOT = ROOT / ".omo/ultraresearch/20260627-152929-teameet-mobile-tournament-identity/mockups/flow-deck-v19-multisport-match-discovery"
PAGES_DIR = DECK_ROOT / "pages"
OUT_DIR = ROOT / "output/pdf"
OUT_PATH = OUT_DIR / "teameet-v19-iphone-mockup-deck-current.pdf"

PAGE_W = 1440
PAGE_H = 900
MARGIN_X = 56
TOP_Y = 835
BLUE = colors.HexColor("#3182f6")
TEXT = colors.HexColor("#191f28")
MUTED = colors.HexColor("#6b7684")
SUBTLE = colors.HexColor("#e5e8eb")
PAGE_BG = colors.HexColor("#f7f8fa")
SOFT_BLUE = colors.HexColor("#eaf3ff")
SOFT_GREEN = colors.HexColor("#e9f8ef")
SOFT_AMBER = colors.HexColor("#fff4df")
SOFT_GRAY = colors.HexColor("#f1f3f5")


def register_fonts() -> None:
    font_path = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"
    pdfmetrics.registerFont(TTFont("Korean", font_path))


@dataclass(frozen=True)
class Slot:
    key: str
    role: str
    status: str
    image: str | None
    strength: str
    watch: str


@dataclass(frozen=True)
class Screen:
    no: str
    title: str
    purpose: str
    slots: tuple[Slot, Slot, Slot, Slot]


def accepted(role: str, image: str, strength: str, watch: str, key: str) -> Slot:
    return Slot(key=key, role=role, status="확정", image=image, strength=strength, watch=watch)


def review(role: str, image: str, strength: str, watch: str, key: str) -> Slot:
    return Slot(key=key, role=role, status="검증 대기", image=image, strength=strength, watch=watch)


def pending(role: str, strength: str, watch: str, key: str) -> Slot:
    return Slot(key=key, role=role, status="생성 대기", image=None, strength=strength, watch=watch)


SCREENS: tuple[Screen, ...] = (
    Screen(
        "07",
        "매치 탐색",
        "여러 종목의 경기와 모임을 가볍게 발견하는 첫 화면",
        (
            accepted("A 일반 참가자", "07-match-discovery-multisport-v19.png", "여러 종목의 일상 매치를 대회 중심이 아닌 탐색 흐름으로 열어줍니다.", "종목과 필터 칩을 늘려 화면을 과밀하게 만들지 않습니다.", "07A"),
            accepted("B 팀장", "07-match-discovery-b-captain-v19.png", "팀 적합성과 참가 판단을 빠르게 볼 수 있습니다.", "탐색 화면에 팀 관리 기능을 끌어오지 않습니다.", "07B"),
            accepted("C 운영자", "07-match-discovery-c-organizer-v19.png", "모집과 운영 상태를 분리해 확인할 수 있습니다.", "운영 신호는 이 매치에 필요한 범위로만 유지합니다.", "07C"),
            accepted("D 관전자", "07-match-discovery-d-spectator-v19.png", "참가자 흐름 없이 공개 경기 팔로우를 시작할 수 있습니다.", "결제나 비공개 팀 상태를 노출하지 않습니다.", "07D"),
        ),
    ),
    Screen(
        "08",
        "매치 상세",
        "참가 전 필요한 장소, 시간, 조건, 공개 정보를 정돈하는 화면",
        (
            accepted("A 일반 참가자", "08-match-detail-join-v19.png", "참가 결정에 필요한 장소, 시간, 조건을 차분하게 보여줍니다.", "주요 참가 버튼은 하나만 유지합니다.", "08A"),
            accepted("B 팀장", "08-match-detail-b-captain-v19.png", "팀 준비 상태와 참여 판단을 함께 제공합니다.", "팀 운영이나 승인 도구로 과하게 확장하지 않습니다.", "08B"),
            accepted("C 운영자", "08-match-detail-c-organizer-v19.png", "신청과 모집 상태를 확인하기 쉽게 정리합니다.", "정산이나 라이브 운영 모듈을 이 화면에 넣지 않습니다.", "08C"),
            accepted("D 관전자", "08-match-detail-d-spectator-v19.png", "공개 정보만 제공해 안전하게 탐색할 수 있습니다.", "알림과 상태 표시가 경기 스토리를 압도하지 않게 합니다.", "08D"),
        ),
    ),
    Screen(
        "09",
        "참가 신청 상태",
        "신청, 승인, 다음 행동을 불안하지 않게 안내하는 진행 상태 화면",
        (
            accepted("A 일반 참가자", "09-join-request-status-v19.png", "참가 신청 진행 상태를 명확하고 차분하게 보여줍니다.", "확정되지 않은 상태를 확정처럼 보이지 않게 합니다.", "09A"),
            accepted("B 팀장", "09-join-request-status-b-captain-v19.png", "팀 준비와 요청 진행 상태를 추적합니다.", "상태나 내비게이션 드리프트와 관리 기능 과밀을 피합니다.", "09B"),
            accepted("C 운영자", "09-join-request-status-c-organizer-v19.png", "운영 승인과 상태 확인을 가볍게 처리합니다.", "이벤트 관련 컨트롤만 유지합니다.", "09C"),
            accepted("D 관전자", "09-join-request-status-d-spectator-v19.png", "비참가 관전자의 공개 상태를 가볍게 보여줍니다.", "신청, 결제, 비공개 상태를 노출하지 않습니다.", "09D"),
        ),
    ),
    Screen(
        "10",
        "결제와 라이브 접근",
        "참가자 결제와 관전자 라이브 접근을 역할별로 분리하는 화면",
        (
            accepted("A 일반 참가자", "10-match-fee-checkout-v19.png", "참가자 결제 상태와 다음 행동을 명확하게 안내합니다.", "실결제처럼 보이는 가짜 확정 표현을 피합니다.", "10A"),
            accepted("B 팀장", "10-match-fee-checkout-b-captain-v19.png", "팀원 비용 상태를 간결하게 보여줍니다.", "정산 대시보드로 확장하지 않습니다.", "10B"),
            accepted("C 운영자", "10-payment-status-c-organizer-v19.png", "결제 준비 상태를 확인하되 사용자 결제와 분리합니다.", "환불과 정산 플로우는 별도 화면으로 둡니다.", "10C"),
            accepted("D 관전자", "10-live-access-d-spectator-v19.png", "관전자 라이브 접근을 참가와 결제 흐름에서 분리합니다.", "공개 정보만 유지하고 참가자 제어를 숨깁니다.", "10D"),
        ),
    ),
    Screen(
        "11",
        "참가 확정 후 준비",
        "결제 이후를 도착, 공유, 시청 준비로 자연스럽게 연결하는 화면",
        (
            accepted("A 일반 참가자", "11-payment-complete-prep-v19.png", "결제 이후를 도착과 준비 행동으로 자연스럽게 연결합니다.", "완료 후 결제 세부정보를 반복하지 않습니다.", "11A"),
            accepted("B 팀장", "11-payment-complete-prep-b-captain-v19.png", "경기 전 팀 준비 상태를 보여줍니다.", "매치룸과 공유 버튼을 중복시키지 않습니다.", "11B"),
            accepted("C 운영자", "11-payment-complete-prep-c-organizer-v19.png", "운영자의 경기 전 준비 확인에 집중합니다.", "운영 대시보드 밀도를 만들지 않습니다.", "11C"),
            accepted("D 관전자", "11-watch-ready-d-spectator-v19.png", "관전자 준비 상태를 결제 혼동 없이 확인시킵니다.", "관전과 참가, 팀 흐름을 분리합니다.", "11D"),
        ),
    ),
    Screen(
        "12",
        "경기 전 매치룸",
        "도착 전 상태, 팀 준비, 운영 체크인, 관전 알림을 역할별로 나누는 화면",
        (
            accepted("A 일반 참가자", "12-match-room-prematch-v19.png", "경기 전 매치룸에서 상태와 다음 행동을 분명히 보여줍니다.", "로고와 브랜드 위험, 라이브 모듈 과잉을 피합니다.", "12A"),
            accepted("B 팀장", "12-match-room-prematch-b-captain-v19.png", "팀 도착과 준비 상태를 조율하게 합니다.", "운영자 권한과 팀장 권한을 섞지 않습니다.", "12B"),
            accepted("C 운영자", "12-match-room-prematch-c-organizer-v19.png", "운영 체크인을 필요한 범위로만 정리합니다.", "넓은 관리자 화면으로 확장하지 않습니다.", "12C"),
            accepted("D 관전자", "12-match-room-prematch-d-spectator-v19.png", "관전자 준비와 알림을 비공개 정보 없이 제공합니다.", "결제, 채팅, 참가자 전용 제어를 넣지 않습니다.", "12D"),
        ),
    ),
    Screen(
        "13",
        "경기 후 리뷰",
        "결과, 후기, 하이라이트, 다음 행동으로 이어지는 리텐션 화면",
        (
            accepted("A 일반 참가자", "13-post-match-review-v19.png", "경기 후 피드백과 재방문 흐름을 연결합니다.", "축구 전용 아이콘과 가짜 신뢰 점수를 피합니다.", "13A"),
            accepted("B 팀장", "13-post-match-review-b-captain-v19.png", "출석과 후기 요청을 정리하되 팀 관리로 번지지 않습니다.", "정확한 블루 토큰과 터치 영역을 유지합니다.", "13B"),
            accepted("C 운영자", "13-post-match-review-c-organizer-v19.png", "출석, 결과, 리뷰 큐, 장소 인계를 마감할 수 있습니다.", "정산이나 관리자 흐름과 섞이지 않게 합니다.", "13C"),
            accepted("D 관전자", "13-post-match-review-d-spectator-v19.png", "결과, 하이라이트, 다음 관전 흐름으로 이어집니다.", "생성 썸네일은 실제 미디어로 교체하고 표현은 간결하게 둡니다.", "13D"),
        ),
    ),
    Screen(
        "14",
        "다음 경기와 함께 뛴 멤버",
        "좋았던 매치를 다음 경기, 멤버 기억, 공개 팔로우로 이어가는 화면",
        (
            accepted("A 일반 참가자", "14-next-match-members-v19.png", "좋았던 매치를 다음 경기와 멤버 기억으로 이어줍니다.", "소셜 피드나 팀 관리 화면으로 확장하지 않습니다.", "14A"),
            review("B 팀장", "14-next-match-members-b-captain-v19.png", "팀장용 다음 경기 제안 후보가 생성되어 있습니다.", "초대, 채팅, 팀 관리로 읽히지 않도록 3중 검증이 필요합니다.", "14B"),
            review("C 운영자", "14-next-match-members-c-organizer-v19.png", "운영자용 후속 경기 수요와 일정 제안 후보가 생성되어 있습니다.", "운영 대시보드나 정산 화면으로 확장하지 않는지 검증합니다.", "14C"),
            review("D 관전자", "14-next-match-members-d-spectator-v19.png", "관전자용 공개 경기 팔로우 후보가 생성되어 있습니다.", "참가, 초대, 비공개 팀 기능을 노출하지 않는지 검증합니다.", "14D"),
        ),
    ),
    Screen(
        "15",
        "도착 체크인",
        "장소 도착과 준비 상태를 가볍게 확인하는 단계",
        (
            accepted("A 일반 참가자", "15-arrival-checkin-v19.png", "도착 확인과 장소 준비를 집중된 경로로 연결합니다.", "장소 프로필이나 지도 과밀을 피합니다.", "15A"),
            pending("B 팀장", "팀장용 팀 도착과 인원 확인 화면 생성 대기", "팀 운영 콘솔로 확장하지 않습니다.", "15B"),
            pending("C 운영자", "운영자용 체크인과 경기 준비 화면 생성 대기", "관리자 화면 밀도를 만들지 않습니다.", "15C"),
            pending("D 관전자", "관전자용 입장과 시청 준비 화면 생성 대기", "참가자 전용 상태를 노출하지 않습니다.", "15D"),
        ),
    ),
    Screen(
        "16",
        "팀 초대와 관계 지속",
        "좋은 매치 관계를 팀 초대나 다음 모임으로 잇는 화면",
        (
            accepted("A 일반 참가자", "16-team-invite-continuity-v19.png", "좋은 매치 관계를 팀 초대와 연속성으로 연결합니다.", "축구 명명과 명단 관리 화면을 피합니다.", "16A"),
            pending("B 팀장", "팀장용 멤버 제안과 팀 연결 화면 생성 대기", "기존 팀 관리 기능과 중복하지 않습니다.", "16B"),
            pending("C 운영자", "운영자용 팀 연결과 재참여 신호 화면 생성 대기", "운영 통계 화면으로 새지 않게 합니다.", "16C"),
            pending("D 관전자", "관전자용 관심 팀 팔로우 화면 생성 대기", "비공개 팀 초대처럼 보이지 않게 합니다.", "16D"),
        ),
    ),
    Screen(
        "17",
        "내 스포츠 프로필",
        "매칭과 초대를 개선하는 종목, 선호, 매너 신호를 정리하는 화면",
        (
            accepted("A 일반 참가자", "17-my-sports-profile-v19.png", "매칭과 초대를 개선하는 선호 신호를 보여줍니다.", "랭킹, 트로피, 신뢰 점수 화면으로 만들지 않습니다.", "17A"),
            pending("B 팀장", "팀장용 팀 선호와 모집 신호 화면 생성 대기", "팀 운영 지표로 과도하게 확장하지 않습니다.", "17B"),
            pending("C 운영자", "운영자용 진행 품질과 매치 선호 화면 생성 대기", "평가나 제재 화면처럼 보이지 않게 합니다.", "17C"),
            pending("D 관전자", "관전자용 관심 종목과 관전 알림 설정 화면 생성 대기", "참가자 기록처럼 오해되지 않게 합니다.", "17D"),
        ),
    ),
    Screen(
        "18",
        "활동 업데이트",
        "매치, 팀, 리뷰, 다음 행동을 차분하게 모으는 리텐션 화면",
        (
            accepted("A 일반 참가자", "18-activity-updates-v19.png", "매치, 팀, 리뷰 알림을 차분한 재방문 화면으로 모읍니다.", "알림마다 카드화하거나 채팅 피드로 만들지 않습니다.", "18A"),
            pending("B 팀장", "팀장용 팀 응답과 다음 경기 알림 화면 생성 대기", "팀 운영 알림을 과밀하게 쌓지 않습니다.", "18B"),
            pending("C 운영자", "운영자용 참가, 결과, 리뷰 대기 알림 화면 생성 대기", "관리자 큐 전체를 가져오지 않습니다.", "18C"),
            pending("D 관전자", "관전자용 경기 시작과 하이라이트 알림 화면 생성 대기", "참가자 상태와 결제 정보를 노출하지 않습니다.", "18D"),
        ),
    ),
)


def set_font(c: canvas.Canvas, size: int, color=TEXT) -> None:
    c.setFont("Korean", size)
    c.setFillColor(color)


def paragraph(c: canvas.Canvas, text: str, x: float, y: float, width_chars: int, leading: int, size: int, color=TEXT, max_lines: int | None = None) -> float:
    set_font(c, size, color)
    lines = []
    for chunk in text.split("\n"):
        lines.extend(wrap(chunk, width=width_chars) or [""])
    if max_lines is not None:
        lines = lines[:max_lines]
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def chip(c: canvas.Canvas, x: float, y: float, label: str, fill, stroke=None, text_color=TEXT, pad_x=13, h=26) -> float:
    w = c.stringWidth(label, "Korean", 12) + pad_x * 2
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.roundRect(x, y - h + 4, w, h, 13, fill=1, stroke=1)
    set_font(c, 12, text_color)
    c.drawString(x + pad_x, y - 15, label)
    return x + w + 8


def draw_header(c: canvas.Canvas, eyebrow: str, title: str, subtitle: str, page_no: int, total_pages: int) -> None:
    c.setFillColor(PAGE_BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    set_font(c, 13, BLUE)
    c.drawString(MARGIN_X, TOP_Y, eyebrow)
    set_font(c, 34, TEXT)
    c.drawString(MARGIN_X, TOP_Y - 44, title)
    paragraph(c, subtitle, MARGIN_X, TOP_Y - 78, 90, 18, 14, MUTED, max_lines=2)
    set_font(c, 12, MUTED)
    c.drawRightString(PAGE_W - MARGIN_X, 36, f"{page_no}/{total_pages}  현재 스냅샷")


def status_style(status: str):
    if status == "확정":
        return SOFT_GREEN, colors.HexColor("#138a4f")
    if status == "검증 대기":
        return SOFT_AMBER, colors.HexColor("#b26b00")
    return SOFT_GRAY, colors.HexColor("#868e96")


def draw_phone(c: canvas.Canvas, x: float, y_top: float, w: float, slot: Slot | None, image: str | None, status: str | None = None) -> None:
    h = w * 2.16
    r = 34
    c.setFillColor(colors.HexColor("#101418"))
    c.roundRect(x, y_top - h, w, h, r, fill=1, stroke=0)
    inner_pad = 10
    ix = x + inner_pad
    iy = y_top - h + inner_pad
    iw = w - inner_pad * 2
    ih = h - inner_pad * 2
    c.setFillColor(colors.white)
    c.roundRect(ix, iy, iw, ih, 25, fill=1, stroke=0)

    if image:
        image_path = PAGES_DIR / image
        if image_path.exists():
            c.drawImage(ImageReader(str(image_path)), ix, iy, iw, ih, preserveAspectRatio=False, mask="auto")
        else:
            draw_pending_inside(c, ix, iy, iw, ih, "이미지 없음")
    else:
        draw_pending_inside(c, ix, iy, iw, ih, "생성 대기")

    c.setFillColor(colors.HexColor("#101418"))
    c.roundRect(x + w * 0.33, y_top - 19, w * 0.34, 12, 6, fill=1, stroke=0)

    if status in ("검증 대기", "생성 대기"):
        fill, txt = status_style(status)
        c.saveState()
        c.setFillColor(fill)
        c.setStrokeColor(fill)
        c.roundRect(ix + 12, y_top - 44, 88, 24, 12, fill=1, stroke=0)
        set_font(c, 10, txt)
        c.drawCentredString(ix + 56, y_top - 38, status)
        c.restoreState()


def draw_pending_inside(c: canvas.Canvas, x: float, y: float, w: float, h: float, label: str) -> None:
    c.setFillColor(colors.HexColor("#f8f9fa"))
    c.roundRect(x, y, w, h, 24, fill=1, stroke=0)
    c.setStrokeColor(colors.HexColor("#dbe2ea"))
    c.setDash(7, 5)
    c.roundRect(x + 24, y + h * 0.35, w - 48, h * 0.22, 18, fill=0, stroke=1)
    c.setDash()
    set_font(c, 17, MUTED)
    c.drawCentredString(x + w / 2, y + h * 0.46, label)
    set_font(c, 11, colors.HexColor("#9aa5b1"))
    c.drawCentredString(x + w / 2, y + h * 0.42, "역할별 목업 슬롯")


def draw_slot_column(c: canvas.Canvas, x: float, y_top: float, col_w: float, slot: Slot) -> None:
    phone_w = 220
    draw_phone(c, x + (col_w - phone_w) / 2, y_top, phone_w, slot, slot.image, slot.status)
    text_y = y_top - phone_w * 2.16 - 24
    fill, txt = status_style(slot.status)
    nx = chip(c, x + 4, text_y, slot.status, fill, text_color=txt, h=25)
    set_font(c, 15, TEXT)
    c.drawString(nx + 2, text_y - 15, slot.role)
    set_font(c, 11, MUTED)
    c.drawRightString(x + col_w - 2, text_y - 15, slot.key)

    set_font(c, 13, TEXT)
    c.drawString(x + 4, text_y - 48, "장점")
    y = paragraph(c, slot.strength, x + 4, text_y - 70, 27, 15, 11, MUTED, max_lines=2)
    set_font(c, 13, TEXT)
    c.drawString(x + 4, y - 8, "주의점")
    paragraph(c, slot.watch, x + 4, y - 30, 27, 15, 11, MUTED, max_lines=2)


def cover(c: canvas.Canvas, total_pages: int) -> None:
    c.setFillColor(PAGE_BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    set_font(c, 16, BLUE)
    c.drawString(MARGIN_X, TOP_Y, "팀밋 모바일 플로우 덱")
    set_font(c, 54, TEXT)
    c.drawString(MARGIN_X, TOP_Y - 72, "V19 아이폰 목업 보고서")
    paragraph(
        c,
        "대회 중심 화면에서 멀티스포츠 매치 플랫폼으로 확장되는 흐름을 모바일 퍼스트 기준으로 누적한 현재 스냅샷입니다.",
        MARGIN_X,
        TOP_Y - 122,
        56,
        24,
        18,
        MUTED,
        max_lines=3,
    )
    y = TOP_Y - 235
    x = MARGIN_X
    x = chip(c, x, y, "48개 역할 슬롯", SOFT_BLUE, text_color=BLUE, h=34, pad_x=17)
    x = chip(c, x, y, "확정 33", SOFT_GREEN, text_color=colors.HexColor("#138a4f"), h=34, pad_x=17)
    x = chip(c, x, y, "검증 대기 3", SOFT_AMBER, text_color=colors.HexColor("#b26b00"), h=34, pad_x=17)
    chip(c, x, y, "생성 대기 12", SOFT_GRAY, text_color=colors.HexColor("#868e96"), h=34, pad_x=17)

    paragraph(
        c,
        "검증 대기 후보는 문서에 포함하되 확정 목업으로 계산하지 않습니다. 카드 안 카드, 정보 과밀, 역할 누수, 종목 편향은 계속 게이트로 관리합니다.",
        MARGIN_X,
        TOP_Y - 315,
        46,
        22,
        15,
        TEXT,
        max_lines=4,
    )
    set_font(c, 12, MUTED)
    c.drawString(MARGIN_X, 76, f"생성일 {date.today().isoformat()}  |  원본과 리젝 히스토리는 작업 폴더에 함께 보존")

    demo = [
        ("07-match-discovery-multisport-v19.png", "확정"),
        ("13-post-match-review-d-spectator-v19.png", "확정"),
        ("18-activity-updates-v19.png", "확정"),
    ]
    start_x = PAGE_W - 735
    for idx, (img, status) in enumerate(demo):
        draw_phone(c, start_x + idx * 220, TOP_Y - 34 + idx * 16, 180, None, img, status)
    set_font(c, 12, MUTED)
    c.drawRightString(PAGE_W - MARGIN_X, 36, f"1/{total_pages}  현재 스냅샷")


def status_page(c: canvas.Canvas, page_no: int, total_pages: int) -> None:
    draw_header(
        c,
        "진행 상태와 검증 히스토리",
        "현재까지의 산출물 상태",
        "확정 이미지는 공유 보고서에 반영되어 있고, 검증 대기 후보는 3중 리뷰가 끝난 뒤 확정 슬롯으로 승격합니다.",
        page_no,
        total_pages,
    )

    left_x = MARGIN_X
    y = TOP_Y - 145
    rows = [
        ("확정", "33개", "07부터 13까지 4역할 완성, 14부터 18까지 A안 확정"),
        ("검증 대기", "3개", "14B 팀장, 14C 운영자, 14D 관전자 후보 생성 완료"),
        ("생성 대기", "12개", "15부터 18까지 B, C, D 역할 슬롯"),
        ("보존된 리젝 히스토리", "17개+", "색상 과포화, 중복 버튼, 역할 누수, 종목 편향 사례를 보존"),
    ]
    for label, count, desc in rows:
        fill, txt = status_style(label if label != "보존된 리젝 히스토리" else "생성 대기")
        c.setFillColor(colors.white)
        c.setStrokeColor(SUBTLE)
        c.roundRect(left_x, y - 74, 560, 64, 20, fill=1, stroke=1)
        chip(c, left_x + 18, y - 24, label, fill, text_color=txt, h=26)
        set_font(c, 25, TEXT)
        c.drawRightString(left_x + 530, y - 23, count)
        paragraph(c, desc, left_x + 20, y - 54, 56, 15, 12, MUTED, max_lines=1)
        y -= 82

    right_x = 700
    set_font(c, 20, TEXT)
    c.drawString(right_x, TOP_Y - 145, "검증 게이트")
    gates = [
        "정보 과밀: 한 화면의 목적이 하나로 읽히는가",
        "역할 누수: 참가자, 팀장, 운영자, 관전자가 섞이지 않는가",
        "카드 안 카드: 섹션 구분을 중첩 카드로 때우지 않는가",
        "톤앤매너: 토스식 여백, 라운드, 절제된 블루를 유지하는가",
        "멀티스포츠: 특정 종목 전용 플랫폼처럼 보이지 않는가",
    ]
    gy = TOP_Y - 186
    for gate in gates:
        c.setFillColor(SOFT_BLUE)
        c.circle(right_x + 8, gy + 3, 4, fill=1, stroke=0)
        paragraph(c, gate, right_x + 26, gy + 9, 54, 18, 14, TEXT, max_lines=1)
        gy -= 42

    mini_y = 340
    mini = [
        ("14-next-match-members-v19.png", "확정"),
        ("14-next-match-members-b-captain-v19.png", "검증 대기"),
        ("14-next-match-members-c-organizer-v19.png", "검증 대기"),
        ("14-next-match-members-d-spectator-v19.png", "검증 대기"),
    ]
    for idx, (img, status) in enumerate(mini):
        draw_phone(c, right_x + idx * 156, mini_y, 128, None, img, status)


def screen_page(c: canvas.Canvas, screen: Screen, page_no: int, total_pages: int) -> None:
    draw_header(
        c,
        f"화면 {screen.no}",
        screen.title,
        screen.purpose,
        page_no,
        total_pages,
    )
    col_gap = 24
    col_w = (PAGE_W - MARGIN_X * 2 - col_gap * 3) / 4
    y_top = TOP_Y - 125
    for idx, slot in enumerate(screen.slots):
        x = MARGIN_X + idx * (col_w + col_gap)
        draw_slot_column(c, x, y_top, col_w, slot)
        if idx < 3:
            c.setStrokeColor(colors.HexColor("#edf0f3"))
            c.line(x + col_w + col_gap / 2, y_top + 5, x + col_w + col_gap / 2, 104)


def build_pdf() -> None:
    register_fonts()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT_PATH), pagesize=(PAGE_W, PAGE_H))
    total_pages = 2 + len(SCREENS)
    cover(c, total_pages)
    c.showPage()
    status_page(c, 2, total_pages)
    c.showPage()
    for idx, screen in enumerate(SCREENS, start=3):
        screen_page(c, screen, idx, total_pages)
        c.showPage()
    c.save()


if __name__ == "__main__":
    build_pdf()
    print(OUT_PATH)
