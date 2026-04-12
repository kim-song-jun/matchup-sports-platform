# 2026-04-08 Design Remediation Priority

> Historical planning note. Canonical rules live in `DESIGN.md`, document navigation lives in `docs/DESIGN_DOCUMENT_MAP.md`, and current design remediation execution lives in `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`.

## 목적

2026-04-08 기준 Batch A~G 디자인 리뷰 결과를 구현 우선순위 기준으로 재정렬한다. 이 문서는 개별 배치 문서를 대체하지 않으며, 실제 수정 작업을 `.github/tasks/`로 쪼개기 전 상위 큐로 사용한다.

참조 문서:

- `docs/plans/2026-04-08-design-review-batch-a.md`
- `docs/plans/2026-04-08-design-review-batch-b.md`
- `docs/plans/2026-04-08-design-review-batch-c.md`
- `docs/plans/2026-04-08-design-review-batch-d.md`
- `docs/plans/2026-04-08-design-review-batch-e.md`
- `docs/plans/2026-04-08-design-review-batch-f.md`
- `docs/plans/2026-04-08-design-review-batch-g.md`
- `docs/plans/2026-04-08-next-feature-backlog.md`

## Priority 1. Trust / Real Data / Auditability

이 축은 가장 먼저 처리한다. 사용자 신뢰와 운영 판단을 동시에 깨뜨리는 문제다.

- 사용자-facing trust signal 정리
  - 범위: `payments/*`, `badges`, `my/reviews-received`, `teams/[id]`, `venues/[id]`, 상세/편집 mock fallback 화면 전반
  - 목표: `verified / estimated / sample` 상태를 명시하고, 실데이터 부재 시 empty/error/admin-demo 경로를 분리
- route entity binding 강제
  - 범위: `payments/[id]`, `payments/[id]/refund`, `venues/[id]`, `teams/[id]`, 기타 상세/편집 fallback 화면
  - 목표: 존재하지 않는 route id를 다른 seed/mock 데이터로 채우지 않음
- 운영 액션 감사성 보강
  - 범위: `admin/users/[id]`, `admin/disputes/[id]`, `admin/settlements`, `admin/lesson-tickets`
  - 목표: 처리 주체, 사유, 결과, 실패 항목, 재시도 경로를 UI에 남김

## Priority 2. False Affordance / Dead-end Entry 제거

- 생성/수정 화면의 비동작 입력 제거 또는 실제 연결
  - 범위: match/team/marketplace/lessons/admin lessons/admin tickets
  - 목표: 보이는 입력과 실제 저장 경로를 1:1로 맞춤
- checkout/approval/refund 진입 컨텍스트 정리
  - 범위: `marketplace/[id] -> payments/checkout`, 기타 확정 플로우 진입 CTA
  - 목표: order id, amount, entity id 없이 화면만 이동시키지 않음
- “준비 중” 운영 액션 제거
  - 범위: admin list/detail action buttons
  - 목표: 실제 편집/실행이 안 되면 액션을 숨기거나 disabled + 사유 표시

## Priority 3. Journey-level Continuity

- 개인 매치 여정 통일
  - 범위: `matches`, `matches/new`, `matches/[id]`, `matches/[id]/edit`, `my/matches`
  - 목표: create/list/detail/history가 같은 accent/control language 사용
- 팀/팀매칭 여정 통일
  - 범위: `teams*`, `team-matches*`, `my/teams`, `my/team-matches`
  - 목표: 도메인 범위, 상태 언어, destructive modal, form tone 정렬
- 결제 여정 통일
  - 범위: `payments`, `checkout`, `detail`, `refund`
  - 목표: summary card, state chip, CTA, policy block grammar 공통화
- admin flow continuity
  - 범위: `AdminLayout`, list/detail/action pages
  - 목표: admin shell 이탈 금지, breadcrumb/current location grammar 통일

## Priority 4. Shared Interaction System

- 공용 `Modal` / `Toast` / status chip system 확대
  - 범위: `payments/[id]/refund`, `admin/disputes/[id]`, `admin/teams/[id]`, `admin/venues/[id]`, `admin/lesson-tickets`
  - 목표: inline overlay와 페이지별 성공 박스를 shared component로 수렴
- status chip grammar 통일
  - 범위: matches, payments, disputes, admin lists, badges
  - 목표: 색상만으로 상태를 구분하지 않고 텍스트+아이콘+색으로 공통 표현
- touch target / keyboard 접근성 보강
  - 범위: admin mobile sidebar, row actions, table row links
  - 목표: 44px 기준, keyboard parity, modal semantics 충족

## Priority 5. IA / Navigation Cleanup

- account area 재정렬
  - 범위: `profile`, `settings`, `settings/account`, `settings/privacy`
  - 목표: 계정/프로필/설정 역할 중복 제거
- home purpose sharpening
  - 범위: `home`
  - 목표: 단일 우선 목적과 상위 CTA를 명확히 함
- admin information hierarchy cleanup
  - 범위: `dashboard`, `statistics`, list/detail admin pages
  - 목표: 0값/빈값 구분, 위치 인식, 대량 처리 흐름의 회복성 강화

## Suggested Task Split

1. `trust-signal-and-route-binding-hardening` - 2026-04-08 구현 완료
2. `transactional-flow-context-and-failure-recovery` - 2026-04-08 구현 완료
3. `match-and-team-journey-visual-unification`
4. `shared-modal-toast-status-system-refactor`
5. `admin-ops-auditability-and-shell-continuity` - 2026-04-08 구현 완료
6. `account-home-admin-ia-cleanup`

## 2026-04-08 Update

이번 라운드에서 Priority 1과 Priority 2의 핵심 신뢰/거래/운영 이슈를 묶어서 처리했다.

- 사용자-facing
  - `payments/*`는 owner-bound real data로 정리했고, route fallback mock을 제거했다.
  - `my/reviews-received`, `badges`에는 sample/mixed-data trust signal을 명시했다.
  - `marketplace/[id]`, `lessons/[id]`, `payments/checkout`은 미지원 commerce를 fake success 없이 차단했다.
- 관리자-facing
  - `admin/users/[id]`는 real moderation endpoint + audit log로 전환했다.
  - `admin/disputes*`, `admin/settlements`는 local-only 완료 시뮬레이션 대신 실제 action history 기반으로 전환했다.
  - `admin/team-matches/:id`를 추가해 public shell leakage를 막았다.
- residual
  - lesson/marketplace commerce backend 자체는 아직 미구현이므로, 현재 상태는 “명시적 미지원”이다.
  - Priority 3~6은 visual/system/IA 일관성 관점에서 후속 정리가 남아 있다.

## Recommended Execution Order

1. `frontend-dev`: Priority 1, 2의 구조적 신뢰 문제부터 수정
2. `design`: 수정본 기준 재리뷰
3. `qa-uiux + qa-regular`: 사용자-facing flow와 admin flow를 각각 검증
4. `frontend-dev`: Priority 3, 4 시각 시스템 정리
5. `design`: journeys/admin shell 재리뷰
6. `frontend-dev`: Priority 5 IA cleanup

## Exit Criteria

- sample/mock/fallback이 실제 신뢰 신호처럼 보이지 않는다.
- 거래형/운영형 액션은 실패를 성공처럼 덮지 않는다.
- list -> detail -> action 흐름이 같은 맥락 안에서 이어진다.
- 공통 modal/toast/status grammar가 도메인별로 크게 흔들리지 않는다.
- admin/operator가 화면만 보고도 “실제 상태인지, 시뮬레이션인지, 실패했는지”를 즉시 구분할 수 있다.
