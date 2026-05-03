# Prototype Module Map — SM New Direction

`handoff-sm-new-direction` candidate pack의 rendered prototype 구조다.

이 문서는 `handoff-2026-04-25`에서 fork된 기존 module map을 유지하되,
candidate Phase 2에서 적용한 새 섹션 순서를 함께 기록한다.

## Candidate Phase 2 Section Order

### Current Phase 2b Override

Mercenary is now candidate priority, not core priority.

```text
Core sequence excludes 05 Mercenary.
Core sequence adds 05 Team browse / discovery.
Candidate sequence adds C07 Mercenary followed by M08 Mercenary viewport grid.
```

Previous comparison point: the older Phase 2 order placed `05 Mercenary` and
`M08 Mercenary viewport grid` between teams/team matching and community. The
current rendered direction moves both after `C06 Sports / skill / safety` while
preserving existing section ids, artboard ids, canonical ids, and exports.
The current `05` slot is now a new team browse comparison section placed after
`04 Teams / team matching` and the M04 viewport grid.

Phase 2는 보드 내부 구현, artboard id, canonical id, JSX export 이름을 바꾸지
않고 top-level `DCSection` 순서와 candidate 섹션 타이틀만 재정렬했다.

```text
00~00n Reference / DNA
01 인증/온보딩
M01 인증/온보딩 viewport grid
02 홈/추천
02 홈/Toss canonical 비교
M02 홈/추천 viewport grid
03 개인 매치
M03 개인 매치 viewport grid
04 팀/팀매칭
M04 팀/팀매칭 viewport grid
05 팀 둘러보기/탐색
06 커뮤니티/채팅/알림
M12 커뮤니티/채팅/알림 viewport grid
07 마이/프로필/평판
M13 마이/프로필/평판 viewport grid
08 결제/환불/분쟁
M14 결제/환불/분쟁 viewport grid
09 설정/약관/상태
M15 설정/약관/상태 viewport grid
10 공개/마케팅
M16 공개/마케팅 viewport grid
11 데스크탑 웹
M17 데스크탑 웹 viewport grid
12 관리자/운영
M18 관리자/운영 viewport grid
13 공통 플로우/인터랙션
M19 공통 플로우/인터랙션 viewport grid
C01 레슨
M05 레슨 viewport grid
C02 장터
M06 장터 viewport grid
C03 시설
M07 시설 viewport grid
C04 대회
M09 대회 viewport grid
C05 장비 대여
M10 장비 대여 viewport grid
C06 종목/실력/안전
M11 종목/실력/안전 viewport grid
C07 용병
M08 용병 viewport grid
```

The `M05~M10` canonical id prefixes are intentionally preserved even though
their rendered position is now candidate-priority. This keeps existing QA and
canonical-id tooling stable.

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
| `02 · 홈 · Toss canonical` | 원본 `02 · 홈 · 추천`을 보존한 비교 섹션. 기존 `홈 · Toss canonical` 보드를 그대로 복사해 기준안으로 두고, 해당 디자인에 맞는 UI 규약/동작 상태 보드를 함께 둔다. 다음 M02 grid 재작성 기준으로 사용한다. | 7 |
| `03 · 개인 매치` | 매치 목록/지도/타임라인/상세/참가/생성/내 매치, case matrix, 상태/엣지, 참가시트, 지도 권한, controls, motion, responsive/copy fit | 16 |
| `04 · 팀 · 팀매칭` | 팀 매칭, 팀 프로필, 팀 생성, 가입, 예약, 출석, 스코어, 평가, 팀장 도구, case matrix, 상태/엣지, 역할 권한, 가입 승인, 운영 충돌, controls, motion, responsive/copy fit | 24 |
| `05 · 팀 둘러보기` | 전체 팀 조회, 팀 비교, 선택/가입 CTA, 추천/신뢰 신호, 02번형 flow/rule comparison board | 3 |
| `06 · 커뮤니티 · 채팅 · 알림` | 채팅, 알림, 피드, 매치 내 채팅, case matrix, 메시지 실패, 차단 사용자, 알림 race, controls, motion, responsive/copy fit | 13 |
| `07 · 마이 · 프로필 · 평판` | 마이 홈, 내 활동, 프로필, 리뷰, 뱃지, 확장 coverage, case matrix, 업로드 실패, 공개/신뢰, badge/review 상태, controls, motion, responsive/copy fit | 15 |
| `08 · 결제 · 환불 · 분쟁` | 체크아웃, 결제 성공/내역/상세, 환불, 분쟁, trust center, case matrix, 보류/실패, 환불 edge, 영수증/정산, controls, motion, responsive/copy fit | 15 |
| `09 · 설정 · 약관 · 상태` | 계정/알림/약관, 404, empty/loading/error, case matrix, OS 권한, 탈퇴 확인, 약관 버전, controls, motion, responsive/copy fit | 14 |
| `10 · 공개 · 마케팅` | 모바일 랜딩, 가격, FAQ, 가이드, 공개 프로필, case matrix, 비로그인 한계, 비공개 프로필, 가격/FAQ edge, controls, motion, responsive/copy fit | 13 |
| `11 · 데스크탑 웹` | 데스크탑 랜딩, 로그인 후 홈, 매치 탐색, case matrix, keyboard focus, side panel, table overflow, controls, motion, responsive/copy fit | 12 |
| `12 · 관리자 · 운영` | Admin dashboard, 관리 테이블, 신고, 정산, 통계, 운영, detail shell, case matrix, bulk partial failure, concurrent processing, audit recovery, controls, motion, responsive/copy fit, dark sidebar | 21 |
| `13 · 공통 플로우 · 인터랙션` | page readiness audit, 등록/수정 공통 shell, micro interaction demo, state/edge/interaction/readiness atlas | 7 |
| `C01 · 레슨 Academy` | Academy hub, 레슨 목록, 코치, 상세, 등록, 수강권, 코치 운영, 데스크탑 레슨, case matrix, 아카데미 IA, 상태/엣지, 수강권 lifecycle, 일정 예외, controls, motion, responsive/copy fit | 19 |
| `C02 · 장터 Marketplace` | 장터 목록/상세/등록/주문/내 판매글/데스크탑 장터, case matrix, 상태/엣지, 주문 lifecycle, 업로드/가격 예외, 분쟁/안전거래, controls, motion, responsive/copy fit | 16 |
| `C03 · 시설 Venues` | 시설 목록/지도/예약/상세/시설 운영/데스크탑 시설, case matrix, 상태/엣지, 슬롯 충돌, 지도/위치 권한, 휴관/가격 예외, controls, motion, responsive/copy fit | 16 |
| `C04 · 대회 Tournaments` | 대회 목록/상세/대진표/운영 도구, case matrix, 대진 충돌, 결과 이의제기, 상금 계좌, controls, motion, responsive/copy fit | 12 |
| `C05 · 장비 대여` | 장비 대여 목록/상세/픽업·반납 운영, case matrix, 픽업/반납, 보증금/파손, 재고 충돌, controls, motion, responsive/copy fit | 11 |
| `C06 · 종목 · 실력 · 안전` | 종목별 UX, 실력 인증, 안전 체크, case matrix, 인증 거절, 장비/안전, 공개 범위, controls, motion, responsive/copy fit | 21 |
| `C07 · 용병 Mercenary` | 용병 목록/상세/등록, case matrix, 상태/엣지, 포지션 충원/대기, 보상 변경/동의, 호스트 신뢰/안전, controls, motion, responsive/copy fit | 11 |

## Candidate Revision Notes

| Section | Owning Module Rule | Boards |
|---|---|---:|
| `03 · 개인 매치 수정안 — 카드뉴스 + 콤팩트 피드` | 원본 `03 · 개인 매치` 바로 아래에 둔 비교용 revision. 기존 보드는 `*-revised-ref`로 복제해 원본과 비교 가능하게 유지하고, 새 결정 보드 `m-list-cardnews-compact`는 카드뉴스 추천과 콤팩트 피드를 한 화면에서 병행 사용한다. | 16 |
| `03 · 개인 매치 수정안 2 — 카드/콤팩트 선택형` | 이전 수정안의 동시 노출을 보완한 최신 revision. 첫 화면은 카드형 또는 콤팩트형 중 하나만 렌더하고 세그먼트로 전환한다. 지도/타임라인/스와이프 보드는 제외하고 카드 리스트, 콤팩트 피드, 상세/참가/생성/상태 계열만 유지한다. | 13 |
| `02 · 홈 · SM 수정안` | SM revision brief 기준 mobile-first 비교 섹션. 기존 홈 보드를 복사한 reference와 인사/활동/매너/featured/shortcut/weather/recommendation/stat/notice 상태, 비로그인, 네트워크 이슈, mobile grid rule을 함께 둔다. | 6 |
| `03 · 개인 매치 · SM 수정안` | SM revision brief 기준 검색바, 카드/콤팩트 토글, 종목별 count selector, 요약 counter, 카드/콤팩트 목록, 상세/sticky CTA/참가 sheet 상태를 mobile-first로 고정한다. | 6 |
| `03 · 개인 매치 · SM 수정안 3` | 0502 문서와 기존 SM 수정안을 대조해 새로 추가한 mobile-first 비교 섹션. 기존 원본/수정안은 보존하고 카드형/콤팩트형 단일 선택, 검색 진입/입력중, 검색 결과, 조회 없음, 네트워크 오류, 상세, 참가 요약 bottom sheet, 승인 요청 toast/popup feedback, 승인중/승인완료 disabled CTA, 내 매치 관리 CTA, mobile grid rule을 분리한다. | 15 |
| `03 · 개인 매치 · SM 수정안 4` | SM3를 복사한 최신 비교 섹션. 매치 관련 화면의 app 상단바를 제거하고 본문 검색/필터를 최상단에 배치한다. 검색 실행 아이콘을 추가하며, `ㅁ|ㅁ` 카드형 검색 결과와 `ㅁ` 콤팩트 검색 결과를 모두 분리한다. | 18 |
| `04 · 팀 · 팀매칭 · SM 수정안` | SM revision brief 기준 팀매치 카드/콤팩트 목록, 팀 정보 vs 상세, 채팅/신청, 결제하고 신청하기, 내 매치 관리 상태를 mobile-first로 고정한다. | 6 |
| `05 · 팀 둘러보기 · SM 수정안` | SM 원문에서 확정된 상하단바 유지와 05 팀 전체조회 shell을 기준으로, body 미정 상태를 명시하고 팀 비교/신뢰/선택 CTA 초안을 둔다. | 3 |
| `06 · 커뮤니티 · 채팅 · 알림 · SM 수정안` | SM revision brief 기준 채팅 floating entry, 채팅 목록 filter/pinned/recent order, 채팅방 context link/composer, 알림 unread/read/모두읽음/date grouping을 mobile-first로 고정한다. | 5 |
| `01 · 인증 · 로그인 · SM 수정안` | SM 원문의 login target과 홈 비로그인 fallback을 연결한 mobile-first 비교 섹션. 기존 인증/onboarding 보드는 보존한다. | 3 |
| `07 · 마이 · 프로필 · 리뷰 · SM 수정안` | SM 원문의 user profile/review target을 마이 core 아래에 추가하고, 검색 유지, 평판/리뷰 신호, 리뷰 작성 companion flow를 고정한다. | 3 |
| `08 · 결제 · 환불 · SM 수정안` | SM 원문의 payment target을 결제 core 아래에 추가하고, mock/test 결제 정직성, 상태 지속성, 환불 처리 주체/사유를 고정한다. | 4 |
| `10 · 공개 · 랜딩 · SM 수정안` | SM 원문의 landing page target을 공개 core 아래에 추가하고, 첫 화면 CTA/next-step summary와 core flow 연결성을 고정한다. | 3 |
| `12 · 관리자 · 운영 · SM 수정안` | SM 원문의 admin target을 관리자 core 아래에 추가하고, 운영 큐, 담당자/사유/audit, partial failure, mobile admin density를 고정한다. | 3 |

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
