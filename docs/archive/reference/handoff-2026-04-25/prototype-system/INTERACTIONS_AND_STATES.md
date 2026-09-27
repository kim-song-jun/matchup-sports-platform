# Interactions And States

이 문서는 prototype 전반에서 반복되는 interaction과 state 기준이다.

## Required Interactions

| Interaction | Rule | Owning Examples |
|---|---|---|
| Tap scale | 버튼/칩은 0.97~0.98 scale로 짧게 반응 | `SBtn`, `Chip`, `HapticChip` |
| Filter chip selection | active color는 primary blue, inactive는 neutral grey | match/lesson/market filters |
| Pull-to-refresh hint | 모바일 리스트 상단에서만 사용 | match, notification |
| Skeleton shimmer | loading 상태는 실제 content shape에 맞춘다 | list/detail/payment |
| Toast | action result만 짧게 알린다 | save, payment, operation |
| Bottom sheet | 확정 전 context 재확인 | match join, payment |
| Sticky CTA | detail/action screen 하단 고정 | match, lesson, booking |
| Push transition | card/detail 진입 감각 유지 | list -> detail |
| Grouped notification | today/yesterday/week/previous 기준 | notifications |
| Form progress | step flow에서 현재 위치 표시 | create/edit |
| Success confirmation | 결제/예약/저장 완료 후 다음 행동 제공 | payment, booking |

`fix12`에서는 `interaction-flow-atlas` 보드에서 각 interaction을 `trigger -> feedback -> final state` 구조로 시각화한다.

## Required States

| State | Rule |
|---|---|
| Empty | 단순히 "없음"이 아니라 다음 행동을 제안한다. |
| Loading | skeleton은 최종 레이아웃과 같은 shape를 가진다. |
| Error | 원인, 복구 CTA, 재시도 가능 여부를 보여준다. |
| Success | 다음 행동과 영수증/내역/상세 진입을 제공한다. |
| Disabled | 왜 비활성인지 설명이 필요하다. |
| Pending | 처리 주체와 예상 다음 상태를 보여준다. |
| Deadline | 남은 시간과 CTA 가능 여부를 분리한다. |
| Sold out | 모집 완료, 대기 신청 가능 여부를 구분한다. |
| Permission denied | 권한이 없는 이유와 필요한 조건을 보여준다. |

`fix12`에서는 `state-coverage-atlas` 보드에서 위 상태 패밀리를 한 화면에 모아 보여준다.

## State Placement

- `15 · 설정 · 약관 · 상태`: generic empty/loading/error/404.
- `14 · 결제 · 환불 · 분쟁`: payment-specific pending/failure/refund states.
- `18 · 관리자 · 운영`: operation-specific pending/partial failure/audit states.
- domain detail screens: sold out, deadline, disabled CTA.
- 각 기능 모듈의 `...-case-matrix` 보드: 해당 모듈 route와 연결된 state, edge, interaction contract.

## Edge Case Clusters

`edge-case-gallery`는 반복 edge case를 네 묶음으로 관리한다.

| Cluster | Examples |
|---|---|
| 데이터 경합 | 정원/재고 race, stale filter query, 중복 submit, 서버 확정 지연 |
| 권한/역할 | 본인 글 구매 차단, 주장 권한 변경, 관리자 role 제한, 비공개 프로필 |
| 거래/결제 | 테스트 결제 명시, 부분 환불, 보증금 차감, 정산 보류 |
| 복구/안전 | 오프라인 전송, 재시도, 차단/신고, 장비 안전 미충족 |

## Handoff Contract

- 모든 모듈은 `flow`, `state`, `edge`, `interaction`, `owning shell`을 함께 가져야 한다.
- toast는 short feedback이고, persistent 상태 UI를 대체하지 않는다.
- disabled CTA는 항상 이유와 복구 가능 action을 보여준다.
- pending은 처리 주체와 예상 다음 상태를 보여준다.
- error는 재시도 가능 여부와 사용자가 잃지 않는 context를 명시한다.

## QA Checklist

- interactive element target is at least 44px where practical.
- active/inactive state is not communicated by color alone.
- primary blue is reserved for action and selected state.
- destructive state uses red with text label.
- pending/warning state uses orange with explicit label.
- success state uses green with explicit label.
- toast does not replace persistent error state.
