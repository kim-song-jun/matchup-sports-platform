# Common Flows

이 문서는 prototype 전체에서 반복되는 flow를 한곳에 모은다.

## Flow Principles

- 사용자는 항상 `탐색 -> 판단 -> 신청/결제/저장 -> 상태 확인` 흐름을 따라야 한다.
- 화면은 기능별로 달라도 CTA 위치, 상태 표현, 금액/숫자 표현은 같은 문법을 쓴다.
- 실패를 성공처럼 보이지 않는다. 실패, pending, unavailable, permission denied를 별도 상태로 노출한다.
- 결제/환불/신청/운영 조치 같은 확정 flow는 필수 context를 화면에 남긴다.
- `fix12`부터 모든 기능 모듈은 마지막에 case matrix board를 가진다. happy path 화면만 보고 구현하지 말고 해당 matrix의 state, edge case, interaction 항목을 같이 구현 단위로 본다.

## 1. Onboarding Flow

Owning section: `01 · 인증 · 온보딩`
Case board: `auth-case-matrix`

Required screens:
- login
- OAuth callback loading/success/error
- sport selection
- level selection
- region selection
- welcome

Required states:
- provider loading
- provider denied
- network error
- incomplete required selection
- completed welcome

## 2. Discovery Flow

Owning sections:
- `02 · 홈 · 추천`
- `03 · 개인 매치`
- `05 · 레슨 Academy`
- `06 · 장터 Marketplace`
- `07 · 시설 Venues`

Required pattern:
1. hub/main
2. search/filter
3. list/map/timeline/calendar variant
4. detail
5. primary CTA

Rules:
- hub가 무엇인지 첫 화면에서 바로 보여야 한다.
- list는 card decoration보다 정보 우선순위가 먼저다.
- filter chip selection은 시각적으로 명확해야 한다.
- 추천 이유가 있으면 숨기지 말고 설명한다.
- 각 discovery module은 검색 결과 없음, 권한 없음, 마감/품절, stale result, filter race를 case matrix에 포함한다.

## 3. Detail To Action Flow

Owning sections:
- `03 · 개인 매치`
- `04 · 팀 · 팀매칭`
- `05 · 레슨 Academy`
- `06 · 장터 Marketplace`
- `07 · 시설 Venues`
- `08 · 용병 Mercenary`
- `09 · 대회 Tournaments`

Required pattern:
1. entity summary
2. decision facts
3. trust/safety/payment context if needed
4. sticky CTA or bottom sheet
5. success/pending/error state

Rules:
- 상세 화면은 owning module 안에 둔다.
- bottom sheet는 action context를 다시 보여준다.
- sold out/deadline/permission denied 상태는 CTA를 막고 이유를 보여준다.
- detail에서 action이 막히면 disabled CTA만 두지 말고 reason row와 recover CTA를 함께 배치한다.

## 4. Create / Edit Flow

Owning section:
- `19 · 공통 플로우 · 인터랙션`

Applied modules:
- match
- team match
- lesson
- marketplace listing
- mercenary
- venue
- profile/team

Required pattern:
1. FormStepShell
2. progress indicator
3. required field state
4. draft/save state
5. validation error
6. success confirmation

Rules:
- create와 edit는 같은 component grammar를 공유한다.
- 화면에 보이는 입력은 실제 저장 가능한 입력이어야 한다.
- false affordance를 만들지 않는다.
- required field, async validation, draft save, duplicate submit, success confirmation은 모든 create/edit flow의 공통 구현 기준이다.

## 5. Payment / Refund Flow

Owning section:
- `14 · 결제 · 환불 · 분쟁`

Required screens:
- checkout
- payment success
- payment history
- payment detail
- refund request
- dispute/trust center

Required states:
- test payment / real charge unavailable
- pending payment
- failed payment
- partial refund
- refund rejected
- receipt/settlement detail

Rules:
- 금액은 `MoneyRow`와 `NumberDisplay` 문법을 사용한다.
- mock/test mode는 실제 청구처럼 보이면 안 된다.
- 환불/분쟁은 처리 주체와 상태를 보여준다.
- payment success/failure/pending은 toast만으로 표현하지 않고 상세/내역으로 이어지는 persistent confirmation을 둔다.

## 6. Operations Flow

Owning sections:
- `04 · 팀 · 팀매칭`
- `09 · 대회 Tournaments`
- `10 · 장비 대여`
- `18 · 관리자 · 운영`

Required pattern:
1. queue/list
2. entity summary
3. action reason
4. processing/pending
5. result/audit log

Rules:
- 운영 판단이 필요한 action은 local toast만으로 끝내지 않는다.
- 담당자, 사유, 시각, 결과가 남아야 한다.
- partial failure를 별도 상태로 보여준다.

## 7. Case Matrix Flow

Owning sections:
- `01~18` 각 기능 모듈
- `19 · 공통 플로우 · 인터랙션`

Required pattern:
1. module route refs
2. owning shell
3. 핵심 flow
4. required states
5. edge cases
6. interactions
7. development handoff rule

Common boards:
- `state-coverage-atlas`
- `edge-case-gallery`
- `interaction-flow-atlas`
- `handoff-readiness-matrix`

Rules:
- 새 모듈이나 새 페이지를 추가하면 화면 보드와 case matrix 항목을 같은 변경에서 추가한다.
- case matrix의 상태 항목은 원인, 복구 CTA, 다음 상태를 포함해야 한다.
- interaction 항목은 trigger, feedback, final state가 분리되어야 한다.
