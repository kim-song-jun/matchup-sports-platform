from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from create_teameet_v21_design_variants_pdf import FLOW as V21_FLOW
from create_teameet_v21_design_variants_pdf import PAGES as V21_PAGES


ROOT = Path(__file__).resolve().parents[2]
FLOW = ROOT / ".omo/ultraresearch/20260627-152929-teameet-mobile-tournament-identity/mockups/service-wide-v22-ko"
PAGES_DIR = FLOW / "pages"
OUT_DIR = ROOT / "output/pdf"
OUT_PDF = OUT_DIR / "teameet-v22-mobile-flow-deck-ko.pdf"
OUT_MD = OUT_DIR / "teameet-v22-mobile-flow-deck-ko.md"

PAGE_W = 900
PAGE_H = 2650
MARGIN_X = 60
TOP_H = 145
FOOT_H = 56
BG = colors.HexColor("#f7f8fa")
TEXT = colors.HexColor("#191f28")
MUTED = colors.HexColor("#6b7684")
BLUE = colors.HexColor("#3182f6")
LINE = colors.HexColor("#e5e8eb")
SURFACE = colors.white


@dataclass(frozen=True)
class Group:
    key: str
    title: str
    note: str


GROUPS = [
    Group("b1-00", "루트/세션 진입 게이트", "세션 확인, 로그인/홈 리다이렉트, 둘러보기"),
    Group("b1-01", "랜딩/서비스 진입", "첫 방문자가 Teameet의 멀티 스포츠 방향을 이해하고 시작하는 화면"),
    Group("b1-02", "로그인/이메일 로그인", "카카오, 이메일, 게스트 흐름과 돌아갈 경로 상태"),
    Group("b1-03", "회원가입 흐름", "약관, 소셜 가입, 가입 완료"),
    Group("b1-04", "인증 복구", "실패, 재시도, 다른 계정, 고객지원"),
    Group("b1-05", "관심 종목 온보딩", "여러 스포츠를 선택하는 첫 설정"),
    Group("b1-06", "레벨/지역 설정", "실력, 활동 지역, 위치 권한"),
    Group("b1-07", "온보딩 확인/재개", "설정 요약, 완료, 이어하기"),
    Group("b2-01", "매치 생성 시작", "일반 매치 생성의 종목/기본 조건"),
    Group("b2-02", "매치 장소/시간 입력", "장소, 날짜, 시간, 입력 검증"),
    Group("b2-03", "매치 생성 확인", "제출 전 요약, 수정, 대기/오류 상태"),
    Group("b2-04", "매치 생성 완료", "상세 보기, 공유, 홈 복귀"),
    Group("b2-05", "신청자 관리", "승인, 보류, 거절 사유"),
    Group("b2-06", "매치 편집", "저장, 변경 영향, 삭제 확인"),
    Group("b3-00", "팀매치 목록", "팀 기반 매치 탐색, 필터, 생성 진입"),
    Group("b3-01", "팀매치 팀 선택", "내 팀 선택과 팀 만들기 진입"),
    Group("b3-02", "팀매치 종목 선택", "팀 종목과 복수 종목 적합성"),
    Group("b3-03", "팀매치 장소/시간", "장소, 일정, 비용"),
    Group("b3-04", "팀매치 조건/소개", "실력, 인원, 소개"),
    Group("b3-05", "팀매치 확인/완료", "제출, 완료, 상세 진입"),
    Group("b3-06", "팀매치 상세/편집", "신청, 수정, 취소"),
    Group("b4-01", "팀 공개 상세", "가입 신청, 멤버, 팀매치"),
    Group("b4-02", "팀 만들기", "이름, 종목, 지역, 소개"),
    Group("b4-03", "팀 멤버", "멤버 목록과 역할"),
    Group("b4-04", "팀 편집", "사진, 소개, 공개 정보 수정"),
    Group("b4-05", "내 팀 관리 허브", "일정, 초대, 멤버 관리"),
    Group("b4-06", "초대/멤버 관리", "초대 수락/거절, 역할 변경"),
    Group("b5-01", "마이 홈", "프로필, 내 활동, 설정 진입"),
    Group("b5-02", "프로필 편집", "이미지, 지역, 종목 수정"),
    Group("b5-03", "내 매치 목록", "내가 만든/참여한 매치"),
    Group("b5-04", "후기 허브", "작성할 후기와 받은 후기"),
    Group("b5-05", "후기 작성", "별점, 매너 평가, 제출"),
    Group("b5-06", "설정 허브", "위치, 알림, 종목, 법적, 탈퇴"),
    Group("b5-07", "설정 상세", "토글, 권한 상태, 저장"),
    Group("b5-08", "법적/탈퇴", "약관, 탈퇴 확인, 차단 상태"),
    Group("b5-09", "약관 상세", "서비스 약관, 개인정보, 위치 기반 서비스"),
    Group("b6-01", "통합 검색", "최근 검색, 결과, 빈 상태"),
    Group("b6-02", "공지 목록/상세", "공지 row, 상세, 관련 링크"),
    Group("b6-03", "알림 센터", "필터, 읽음, 상세 이동"),
    Group("b6-04", "채팅 목록", "채팅방 선택과 빈 상태"),
    Group("b6-05", "채팅방", "메시지, 실패, 재시도"),
    Group("b7-02", "대회 상세 확장", "상태별 대회 상세, 신청, 공지, 장소/일정"),
    Group("b7-03", "대회 참가 신청", "팀 선택, 참가비, 규칙 확인"),
    Group("b7-04", "내 신청 상태", "승인, 입금, 로스터, 공지 준비 상태"),
    Group("b7-05", "대회 로스터 입력", "선수 추가, 수정, 입력 검증"),
    Group("b8-01", "대회 경기 목록", "현재/다음 경기와 경기 보기"),
    Group("b8-02", "경기 상세 실시간", "스코어, 이벤트, 선수 기록, 영상 슬롯"),
    Group("b8-03", "대회 순위표", "조별/전체, 승점, 득실"),
    Group("b8-04", "대회 브래킷", "라운드 전환과 결과"),
    Group("b8-05", "대회 종료/리텐션", "결과, 리뷰, 다음 대회"),
    Group("b8-06", "대회 영상/리뷰", "영상, 하이라이트, 매너 평가"),
    Group("b9-01", "관리자 홈", "핵심 지표, 주의 필요, 감사 기록"),
    Group("b9-02", "회원/관리자 관리", "검색, 필터, 상태 변경"),
    Group("b9-03", "관리자 매치 운영", "매치/팀매치 상태 관리"),
    Group("b9-04", "관리자 팀 운영", "팀 공개, 신고, 사유 기록"),
    Group("b9-05", "대회 운영 목록", "필터, 생성, 상세 이동"),
    Group("b9-06", "관리자 대회 생성", "유형, 단계, 날짜, 참가비"),
    Group("b9-07", "관리자 대회 상세", "신청 승인, 공지, 협찬, 진행 설정"),
    Group("b9-08", "관리자 경기 이벤트 입력", "시작/종료, 득점, 카드, 교체, 감사 기록"),
    Group("b9-09", "관리자 감사 로그", "운영 액션 검색, 사유, 변경 전후 기록"),
]

VARIANTS = [
    ("a", "A 토스 클린", "추천 기준안"),
    ("b", "B 포커스", "시각 집중안"),
    ("c", "C 컴팩트", "고밀도 운영안"),
    ("d", "D 라운드", "부드러운 커뮤니티안"),
]


def set_font(c: canvas.Canvas, size: int, color=TEXT) -> None:
    c.setFont("Korean", size)
    c.setFillColor(color)


def find_image(group: Group, variant_key: str) -> Path:
    matches = sorted(PAGES_DIR.glob(f"{group.key}-*-{variant_key}-v22.png"))
    if len(matches) != 1:
        raise FileNotFoundError(f"{group.key} {variant_key} image count is {len(matches)}")
    return matches[0]


def collect_pages() -> list[tuple[int, Group, str, str, str, Path]]:
    items: list[tuple[int, Group, str, str, str, Path]] = []
    number = 1
    for page in V21_PAGES:
        group = Group(
            f"v21-{page.number:02d}",
            page.title,
            "v21 검증 완료 기준 화면. 같은 콘텐츠를 네 가지 디자인 방향으로 비교.",
        )
        for variant in page.variants:
            items.append((
                number,
                group,
                variant.label,
                variant.label,
                f"{variant.verdict} · 검증 완료 기준안",
                V21_FLOW / variant.path,
            ))
            number += 1
    for group in GROUPS:
        for variant_key, variant_label, variant_note in VARIANTS:
            items.append((number, group, variant_key, variant_label, variant_note, find_image(group, variant_key)))
            number += 1
    return items


def draw_page(
    c: canvas.Canvas,
    number: int,
    total: int,
    group: Group,
    variant_label: str,
    variant_note: str,
    image_path: Path,
) -> None:
    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    set_font(c, 14, BLUE)
    c.drawString(MARGIN_X, PAGE_H - 42, f"{number:03d} · {group.key.upper()}")
    set_font(c, 27, TEXT)
    c.drawString(MARGIN_X, PAGE_H - 84, group.title)
    set_font(c, 13, MUTED)
    c.drawString(MARGIN_X, PAGE_H - 116, f"{variant_label} · {variant_note}")
    c.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 42, f"{number}/{total}")

    c.setStrokeColor(LINE)
    c.line(MARGIN_X, PAGE_H - TOP_H, PAGE_W - MARGIN_X, PAGE_H - TOP_H)

    with Image.open(image_path) as img:
        img_w, img_h = img.size

    max_w = PAGE_W - MARGIN_X * 2
    max_h = PAGE_H - TOP_H - FOOT_H - 22
    scale = min(max_w / img_w, max_h / img_h)
    draw_w = img_w * scale
    draw_h = img_h * scale
    x = (PAGE_W - draw_w) / 2
    y = PAGE_H - TOP_H - 16 - draw_h

    c.setFillColor(SURFACE)
    c.setStrokeColor(LINE)
    c.roundRect(x - 1, y - 1, draw_w + 2, draw_h + 2, 16, fill=1, stroke=1)
    c.drawImage(ImageReader(str(image_path)), x, y, draw_w, draw_h, preserveAspectRatio=True, anchor="c")

    set_font(c, 11, MUTED)
    footer_note = group.note if len(group.note) <= 58 else f"{group.note[:55]}..."
    c.drawString(MARGIN_X, 32, footer_note)
    c.drawRightString(PAGE_W - MARGIN_X, 32, "Teameet v22 모바일 플로우 덱")


def write_markdown(items: list[tuple[int, Group, str, str, str, Path]]) -> None:
    lines = [
        "# Teameet v22 모바일 플로우 덱",
        "",
        f"- PDF: `{OUT_PDF}`",
        f"- 총 PDF 페이지: {len(items)}",
        "- 구성: 검증 완료 v21 기준 화면과 승인된 v22 원본 모바일 긴 화면 PNG를 PDF 1페이지에 1개씩 배치",
        "- 순서: v21 검증 완료 기준 화면 12개 화면 48쪽 다음에 B1-00부터 B9-09까지 v22 승인 화면 240쪽",
        "- B7-01 대회 목록은 v21 검증 완료 기준 화면으로 보존하고 v22 재생성 대상에서는 제외",
        "",
        "| PDF page | Group | Variant | 화면 | Source |",
        "| ---: | --- | --- | --- | --- |",
    ]
    for number, group, _variant_key, variant_label, variant_note, image_path in items:
        source = image_path.relative_to(ROOT)
        lines.append(f"| {number} | {group.key.upper()} | {variant_label} / {variant_note} | {group.title} | `{source}` |")
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    pdfmetrics.registerFont(TTFont("Korean", "/System/Library/Fonts/Supplemental/AppleGothic.ttf"))
    items = collect_pages()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT_PDF), pagesize=(PAGE_W, PAGE_H))
    total = len(items)
    for number, group, _variant_key, variant_label, variant_note, image_path in items:
        draw_page(c, number, total, group, variant_label, variant_note, image_path)
        c.showPage()
    c.save()
    write_markdown(items)
    print(OUT_PDF)
    print(OUT_MD)


if __name__ == "__main__":
    main()
