# Prototype Module Map

`Teameet Design.html?v=20260425-fix26` 기준 rendered prototype 구조다.

## Reference Sections

| Section | Purpose | Boards |
|---|---:|---:|
| `00 · Toss DNA` | 시그니처 component reference | 5 |
| `00b · 리프레시 — Onboarding 3-step` | 온보딩 reference | 4 |
| `00c · 리프레시 — 용병` | 용병 reference | 2 |
| `00d · 리프레시 — 대회` | 대회 reference | 2 |
| `00e · 리프레시 — 결제 풀 플로우` | 결제 reference | 3 |
| `00f · 리프레시 — 채팅 / 알림` | 커뮤니티 reference | 3 |
| `00g · 리프레시 — 데스크탑 웹` | 데스크탑 reference | 2 |
| `00h · 리프레시 — Admin` | Admin reference | 1 |
| `00i · 글로벌 셸` | navigation, menu, light shell | 2 |
| `00j · 화면 카탈로그` | actual screens, concept contract, Tailwind tokens, responsive QA, docs hub | 6 |
| `00k · 디자인 시스템 Foundation` | typography, button, controls, motion, responsive storyboard, Tailwind implementation contract | 6 |
| `00l · 개발 핸드오프` | token migration, component extraction, page implementation waves, QA acceptance gates | 4 |

## Functional Module Sections

| Section | Owning Module Rule | Boards |
|---|---|---:|
| `01 · 인증 · 온보딩` | 로그인, OAuth callback, onboarding step, welcome, case matrix, state/edge, validation/permission, controls, motion, responsive/copy fit | 12 |
| `02 · 홈 · 추천` | 홈 variant, widget/FAB, 추천 이유, 초대, case matrix, 상태/엣지, 버튼/FAB/필터, motion, responsive/copy fit | 13 |
| `03 · 개인 매치` | 매치 목록/지도/타임라인/상세/참가/생성/내 매치, case matrix, 상태/엣지, 참가시트, 지도 권한, controls, motion, responsive/copy fit | 16 |
| `04 · 팀 · 팀매칭` | 팀 매칭, 팀 프로필, 팀 생성, 가입, 예약, 출석, 스코어, 평가, 팀장 도구, case matrix, 상태/엣지, 역할 권한, 가입 승인, 운영 충돌, controls, motion, responsive/copy fit | 24 |
| `05 · 레슨 Academy` | Academy hub, 레슨 목록, 코치, 상세, 등록, 수강권, 코치 운영, 데스크탑 레슨, case matrix, 아카데미 IA, 상태/엣지, 수강권 lifecycle, 일정 예외, controls, motion, responsive/copy fit | 19 |
| `06 · 장터 Marketplace` | 장터 목록/상세/등록/주문/내 판매글/데스크탑 장터, case matrix, 상태/엣지, 주문 lifecycle, 업로드/가격 예외, 분쟁/안전거래, controls, motion, responsive/copy fit | 16 |
| `07 · 시설 Venues` | 시설 목록/지도/예약/상세/시설 운영/데스크탑 시설, case matrix, 상태/엣지, 슬롯 충돌, 지도/위치 권한, 휴관/가격 예외, controls, motion, responsive/copy fit | 16 |
| `08 · 용병 Mercenary` | 용병 목록/상세/등록, case matrix, 상태/엣지, 포지션 충원/대기, 보상 변경/동의, 호스트 신뢰/안전, controls, motion, responsive/copy fit | 11 |
| `09 · 대회 Tournaments` | 대회 목록/상세/대진표/운영 도구, case matrix, 대진 충돌, 결과 이의제기, 상금 계좌, controls, motion, responsive/copy fit | 12 |
| `10 · 장비 대여` | 장비 대여 목록/상세/픽업·반납 운영, case matrix, 픽업/반납, 보증금/파손, 재고 충돌, controls, motion, responsive/copy fit | 11 |
| `11 · 종목 · 실력 · 안전` | 종목별 UX, 실력 인증, 안전 체크, case matrix, 인증 거절, 장비/안전, 공개 범위, controls, motion, responsive/copy fit | 21 |
| `12 · 커뮤니티 · 채팅 · 알림` | 채팅, 알림, 피드, 매치 내 채팅, case matrix, 메시지 실패, 차단 사용자, 알림 race, controls, motion, responsive/copy fit | 13 |
| `13 · 마이 · 프로필 · 평판` | 마이 홈, 내 활동, 프로필, 리뷰, 뱃지, 확장 coverage, case matrix, 업로드 실패, 공개/신뢰, badge/review 상태, controls, motion, responsive/copy fit | 15 |
| `14 · 결제 · 환불 · 분쟁` | 체크아웃, 결제 성공/내역/상세, 환불, 분쟁, trust center, case matrix, 보류/실패, 환불 edge, 영수증/정산, controls, motion, responsive/copy fit | 15 |
| `15 · 설정 · 약관 · 상태` | 계정/알림/약관, 404, empty/loading/error, case matrix, OS 권한, 탈퇴 확인, 약관 버전, controls, motion, responsive/copy fit | 14 |
| `16 · 공개 · 마케팅` | 모바일 랜딩, 가격, FAQ, 가이드, 공개 프로필, case matrix, 비로그인 한계, 비공개 프로필, 가격/FAQ edge, controls, motion, responsive/copy fit | 13 |
| `17 · 데스크탑 웹` | 데스크탑 랜딩, 로그인 후 홈, 매치 탐색, case matrix, keyboard focus, side panel, table overflow, controls, motion, responsive/copy fit | 12 |
| `18 · 관리자 · 운영` | Admin dashboard, 관리 테이블, 신고, 정산, 통계, 운영, detail shell, case matrix, bulk partial failure, concurrent processing, audit recovery, controls, motion, responsive/copy fit, dark sidebar | 21 |
| `19 · 공통 플로우 · 인터랙션` | page readiness audit, 등록/수정 공통 shell, micro interaction demo, state/edge/interaction/readiness atlas | 7 |

## Placement Rules

- 상세 화면은 generic detail section에 두지 않는다.
- 생성/수정 화면은 owning module에 둔다.
- `my/*` 성격이 강해도 특정 도메인의 상태 확인이면 해당 도메인에 우선 둔다.
  - 예: `my-tickets`는 레슨 module.
  - 예: `my-listings`는 장터 module.
- 운영자/owner/future service 보드도 가장 가까운 owning module에 둔다.
- planning-only board는 rendered prototype에 두지 않는다.
- 각 기능 모듈은 마지막에 `... · 케이스 매트릭스` 보드를 둔다.
- case matrix board는 route, 핵심 flow, state, edge case, interaction, owning shell을 포함해야 한다.
