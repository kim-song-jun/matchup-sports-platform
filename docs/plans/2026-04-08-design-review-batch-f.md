# 2026-04-08 Design Review — Batch F

> Historical planning note. Canonical rules live in `DESIGN.md`, document navigation lives in `docs/DESIGN_DOCUMENT_MAP.md`, and current design remediation execution lives in `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`.

## Scope

- `/payments`
- `/payments/checkout`
- `/payments/[id]`
- `/payments/[id]/refund`
- `/reviews`
- `/my/reviews-received`
- `/badges`

기준:

- `.impeccable.md`
- `.claude/agents/prompts.md` Design Team section
- `docs/plans/2026-04-08-design-page-inventory.md`

리뷰 주체:

- `design-main`
- `ux-manager`
- `ui-manager`

## Review Summary

| Reviewer | High | Medium | Low |
|----------|-----:|-------:|----:|
| Theme | 2 | 2 | 1 |
| UX | 3 | 3 | 1 |
| UI | 2 | 4 | 2 |

## Consolidated Findings

### 1. Transaction-facing trust signals are mixed with sample data

- Severity: `High`
- Source: `design-main`, `ux-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/payments/[id]/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/payments/[id]/refund/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/my/reviews-received/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/badges/page.tsx)
- Summary:
  - 결제 상세, 환불, 받은 평가, 뱃지처럼 사용자의 판단에 직접 영향을 주는 화면이 mock/sample 경로를 실제 데이터처럼 렌더링한다.
  - 특히 `payments/[id]`, `payments/[id]/refund`는 route id보다 샘플 데이터에 더 강하게 묶여 있어 거래 신뢰를 깨뜨린다.

### 2. Payment list and checkout entry lose the real transaction meaning

- Severity: `High`
- Source: `design-main`, `ux-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/payments/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/payments/checkout/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/marketplace/[id]/page.tsx)
- Summary:
  - 결제 목록은 API 데이터를 `match` 타입으로 강제 매핑해 강좌/장터 결제의 의미를 흐린다.
  - `marketplace/[id] -> /payments/checkout` 진입은 필수 파라미터 없이 이동해 거래 여정이 중간에서 끊긴다.

### 3. Transaction failures are visually converted into success states

- Severity: `High`
- Source: `ux-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/payments/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/payments/checkout/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/reviews/page.tsx)
- Summary:
  - API 실패 또는 미연결 상태를 에러/재시도가 아니라 mock fallback이나 테스트 성공 토스트로 덮어버린다.
  - 결제와 평가는 “실패인지, 보류인지, 테스트 모드인지”가 명확해야 하는데 현재는 성공처럼 보이는 경우가 있다.

### 4. Refund confirmation bypasses the shared modal and toast system

- Severity: `High`
- Source: `ui-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/payments/[id]/refund/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/payments/checkout/page.tsx)
- Summary:
  - 환불 확인 모달은 공통 `Modal` 규약 없이 수동 overlay로 구현되어 있고, 결제/환불 완료 알림도 `Toast` 시스템 대신 페이지별 박스로 갈라져 있다.
  - 이 배치는 거래 완료/취소처럼 민감한 상호작용을 다루므로 공통 semantics와 키보드/포커스 규칙이 특히 중요하다.

### 5. Payment journey uses fragmented visual grammar

- Severity: `Medium`
- Source: `design-main`, `ui-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/payments/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/payments/checkout/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/payments/[id]/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/payments/[id]/refund/page.tsx)
- Summary:
  - checkout은 블루 중심의 주문 카드 언어인데, 목록/상세/환불은 상태 배지와 타임라인 문법으로 갈라진다.
  - 상태 칩, CTA 하단 오프셋, 선택 컨트롤 방식이 페이지마다 달라 거래 여정이 하나의 제품처럼 연결되지 않는다.

### 6. Review and badge surfaces are structurally stable but under-labeled

- Severity: `Medium`
- Source: `design-main`, `ui-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/reviews/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/my/reviews-received/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/badges/page.tsx)
- Summary:
  - 리뷰/받은 평가 페이지는 카드 밀도와 읽기 흐름이 비교적 안정적이지만, 데이터 출처와 상태 문맥이 부족하다.
  - 뱃지는 `획득/미획득` 이분법만으로는 부족하고, 진행 중/조건 임박 같은 중간 상태 언어가 필요하다.

## Stable Pages

### `/reviews`

- 로그인, 로딩, 빈 상태, 제출 액션이 가장 단순하고 읽기 쉽다.
- 실데이터 실패/보류 배너만 보강되면 Batch F의 기준 페이지가 될 수 있다.

### `/my/reviews-received`

- 통계 카드와 리스트 계층은 안정적이고 다크모드/여백도 비교적 잘 맞는다.
- 다만 현재는 sample/real 경계 표기가 없어 신뢰 화면으로는 미완성이다.

## Page Signals

| Domain | Signal |
|--------|--------|
| `payments` | 거래 신뢰와 상태 semantics가 가장 흔들림 |
| `checkout/refund` | 실제 액션보다 시뮬레이션 UI가 앞서 보임 |
| `reviews` | 구조는 안정적이지만 실패/출처 라벨이 부족 |
| `badges` | 카드 품질은 무난하지만 상태 문맥이 빈약 |

## Recommended Actions

1. `payments/[id]`, `payments/[id]/refund`, `my/reviews-received`, `badges`에 sample/estimated/verified 상태를 명시하고, route entity 또는 실데이터 조회 실패 시 별도 empty/error 경로로 분기한다.
2. `payments/page.tsx`의 결제 타입 매핑을 실제 API 스키마 기준으로 바로잡고, `marketplace -> checkout` 진입은 주문 컨텍스트를 서버 바인딩 기준으로 다시 연결한다.
3. 거래형 화면에서 API 실패를 성공처럼 시뮬레이션하는 fallback을 제거하고, 실패 사유/재시도/보류 상태를 명시한다.
4. `payments/[id]/refund`는 공통 `Modal`과 `Toast` 시스템으로 재구성하고, 결제/환불 완료 메시지 문법을 통일한다.
5. payment journey 전반의 상태 칩, 하단 CTA, 선택 컨트롤을 하나의 grammar로 정렬한다.
6. 뱃지에는 `획득`, `진행중`, `미달성` 같은 다단계 상태 언어를 추가하고, review 계열에는 데이터 기준일 또는 동기화 상태를 표시한다.

## Next Batch

추천 다음 순서:

- `Batch G`: 관리자 영역

이유:

- 사용자-facing 화면 리뷰를 마무리했고, 이제 admin shell과 운영 화면의 정보 구조/신뢰 문법을 별도 제품면으로 검증할 차례다.
- Batch F에서 드러난 `trust signal`, `transaction semantics`, `shared interaction system` 기준이 관리자 영역에서도 그대로 유효한지 확인해야 한다.
