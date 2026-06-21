# 반응형 audit findings (Workflow wf_dd11b02c-c79)

> 데스크톱/태블릿/와이드(768~2560) 반응형 CSS 구조 전수 분석(8 page-group sonnet + opus 종합).
> 34 raw → opus 적대검증으로 16 실이슈 확정(density 선호 14건 false-positive 제거).
> 본문 표준 컬럼 = `.tm-scroll-area` max-width 1120px. 데스크톱 nav 정렬은 `bb266c8d`로 수정 완료.

## systemic 패턴 (opus)
1. **태블릿 768-1023 카드 그리드 미전환** — 그리드 전환이 전부 @media(min-width:1024px)에만. 768 프레임(600px)은 모바일 단일컬럼 유지(6개 그룹 공통).
2. **max-width 캡 + margin:auto 누락 left-pin** — my/review 3곳.
3. **인라인 style이 데스크톱 @media 무력화** — tournament-apply:1055, home weather:116.
4. **unscoped 전역 셀렉터 타 도메인 침범** — .tm-floating-fab{display:none}가 team-matches FAB까지 숨김.
5. **와이드(1920+) 우측 1fr 무제한** — admin DataTable/BracketTab.

## prioritized 16 (수정 진행 중 — 단일 에이전트)
**HIGH**: #1 team-matches 데스크톱 생성버튼 소실(team-matches-page.tsx:19-37) · #2 토너먼트 신청폼 600px 갇힘(tournament-apply-client.tsx:1055 인라인) · #3 my/review 3곳 left-pin(my.css:206-225,367-371).
**MEDIUM**: #4 태블릿 그리드 미전환(systemic) · #5 홈 carousel override 부재 · #6 admin table 1320px 과폭 · #7 매치상세 패널 360px 고정 · #8 랜딩 히어로 380px · #9 채팅 태블릿 규칙 부재 · #10 토너먼트 steps 간격 · #11 admin bracket 우측 1fr.
**LOW**: #12 auth 태블릿 프레임 · #13 홈 weather dead CSS · #14 search sticky top · #15 footer 정렬 · #16 admin KPI 그리드 단계.

## 라이브 스팟체크(eval 측정, 와이드 썸네일은 오판 유발)
- app: 1120 중앙 컬럼(토스류 유효). nav 정렬 744=744 확정.
- admin: main maxW none(2560서 2320), KPI 그리드 1320 → #6 과폭.
- 태블릿 768: 모바일 단일컬럼(#4).

## 검증 방침
visualVerifyNeeded=true 항목은 수정 후 eval 측정(width/left/grid-cols) + 스크린샷(좁은 뷰포트). 와이드는 eval 측정 우선.
