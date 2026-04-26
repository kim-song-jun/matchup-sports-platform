# 2026-04-25 Design Handoff Index

## 목적

- 원본 압축: `/Users/kimsungjun/Downloads/Sports-platform-handoff.tar.gz`
- canonical 반입 경로: `docs/reference/handoff-2026-04-25/sports-platform/`
- 분석 기준일: `2026-04-25`

이 폴더는 Claude Design handoff bundle을 저장소 안에서 다시 읽고, TeamMeet 실제 앱/디자인 시스템에 어떻게 흡수할지 판단하기 위한 reference pack이다.

이 폴더의 문서는 **디자인 규칙 SSOT가 아니다**. 규칙의 최종 source of truth는 여전히 `DESIGN.md`다.

## 반입 검증

- archive file count: `31`
- imported file count: `31`
- primary bundle entry: `sports-platform/project/Teameet Design.html`
- supporting intent source: `sports-platform/chats/chat1.md`

즉, 현재 저장소 안의 handoff reference는 압축본과 동일한 파일 수로 반입되었다.

## 읽는 순서

1. `sports-platform/README.md`
2. `sports-platform/chats/chat1.md`
3. `sports-platform/project/Teameet Design.html`
4. `sports-platform/project/lib/tokens.jsx`
5. `sports-platform/project/lib/signatures.jsx`
6. `sports-platform/project/lib/screens-refresh1.jsx`
7. `sports-platform/project/lib/screens-refresh2.jsx`
8. `sports-platform/project/lib/screens-refresh3.jsx`
9. `ANALYSIS.md`
10. `SYSTEM_CANDIDATE.md`
11. `SECTION_UNIFICATION_MATRIX.md`
12. `prototype-system/README.md`

## 핵심 구조

- `sports-platform/project/Teameet Design.html`
  - 31개 rendered `DCSection`
  - 321개 rendered `DCArtboard`
  - `00~00l` reference sections
  - `01~19` functional module sections
  - light-only prototype
  - Admin desktop sidebar dark panel exception
- `sports-platform/project/lib/tokens.jsx`
  - blue/grey 중심 token, radius, shadow, base atoms
- `sports-platform/project/lib/signatures.jsx`
  - `NumberDisplay`, `MoneyRow`, `KPIStat`, `SectionTitle`, `EmptyState`, `ListItem`, `Skeleton`, `Toast`, `StackedAvatars`, `WeatherStrip`, `PullHint`, `HapticChip`, `StatBar`
- `sports-platform/project/lib/screens-refresh1.jsx`
  - `00b~00d` 계열 핵심 리프레시 보드
- `sports-platform/project/lib/screens-refresh2.jsx`
  - `00e~00f` 결제/채팅/알림 리프레시 보드
- `sports-platform/project/lib/screens-refresh3.jsx`
  - `00g~00h` 데스크탑/Admin 리프레시 보드
- `sports-platform/project/lib/screens-system-foundation.jsx`
  - `00k` 타이포, 버튼, 컨트롤, 모션, 반응형 storyboard, Tailwind 구현 계약
- `sports-platform/project/lib/screens-dev-handoff.jsx`
  - `00l` token migration, component extraction, page implementation wave, QA acceptance gate
- `sports-platform/project/tailwind.teameet.css`
  - production으로 옮길 수 있는 Tailwind `@layer components` 기반 `tm-*` class contract

## 이 reference pack을 쓰는 법

### 그대로 믿어도 되는 것

- `00 · Toss DNA`
- `00b · Onboarding 3-step`
- `00c · 용병`
- `00d · 대회`
- `00e · 결제 풀 플로우`
- `00f · 채팅 / 알림`
- `00g · 데스크탑 웹`
- `00h · Admin`

이 구간은 "새 디자인 시스템의 기준 팩"으로 써도 된다.

### coverage 확인용으로 읽을 것

- `01~24` 섹션 전체

이 구간은 이미 폭넓은 화면 inventory를 제공하지만, 시각 품질은 section마다 편차가 있다. 즉 "최종 구현 원본"이라기보다, coverage map + refactor 대상 surface로 봐야 한다.

### 그대로 구현 대상으로 쓰면 안 되는 것

- editorial / story feed / historical dark dashboard 같이 현재 `DESIGN.md` 기본값과 어긋나는 home variant
- purple/gradient가 primary처럼 읽히는 강조
- utility surface를 hero 카드처럼 다루는 보드
- 현재 backend truth가 없는 social proof / trust / refund narrative

## 관련 문서

- canonical rules: `DESIGN.md`
- compatibility memo: `.impeccable.md`
- design navigation hub: `docs/DESIGN_DOCUMENT_MAP.md`
- this handoff analysis: `docs/reference/handoff-2026-04-25/ANALYSIS.md`
- next-system proposal: `docs/reference/handoff-2026-04-25/SYSTEM_CANDIDATE.md`
- section mapping: `docs/reference/handoff-2026-04-25/SECTION_UNIFICATION_MATRIX.md`
- prototype system hub: `docs/reference/handoff-2026-04-25/prototype-system/README.md`
- module map: `docs/reference/handoff-2026-04-25/prototype-system/MODULE_MAP.md`
- common flows: `docs/reference/handoff-2026-04-25/prototype-system/COMMON_FLOWS.md`
- interactions and states: `docs/reference/handoff-2026-04-25/prototype-system/INTERACTIONS_AND_STATES.md`
- case coverage matrix: `docs/reference/handoff-2026-04-25/prototype-system/CASE_COVERAGE_MATRIX.md`
- page readiness audit: `docs/reference/handoff-2026-04-25/prototype-system/PAGE_READINESS_AUDIT_FIX21.md`
- color system audit: `docs/reference/handoff-2026-04-25/prototype-system/COLOR_SYSTEM.md`
- design system foundation: `docs/reference/handoff-2026-04-25/prototype-system/DESIGN_SYSTEM_FOUNDATION_FIX24.md`
- Tailwind token system: `docs/reference/handoff-2026-04-25/prototype-system/TAILWIND_TOKEN_SYSTEM_FIX24.md`
- production handoff: `docs/reference/handoff-2026-04-25/prototype-system/PRODUCTION_HANDOFF_FIX26.md`
- latest design QA report: `docs/reference/handoff-2026-04-25/prototype-system/DESIGN_QA_FIX26.md`
- execution contract: `.github/tasks/79-teameet-design-handoff-unification.md`
