# 2026-04-08 Design Review — Batch G

## Scope

- `AdminLayout`
- `/admin/dashboard`
- `/admin/matches`
- `/admin/matches/[id]`
- `/admin/users`
- `/admin/users/[id]`
- `/admin/lessons`
- `/admin/lessons/[id]`
- `/admin/lesson-tickets`
- `/admin/teams`
- `/admin/teams/[id]`
- `/admin/team-matches`
- `/admin/mercenary`
- `/admin/venues`
- `/admin/venues/[id]`
- `/admin/venues/new`
- `/admin/payments`
- `/admin/settlements`
- `/admin/reviews`
- `/admin/disputes`
- `/admin/disputes/[id]`
- `/admin/statistics`

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
| Theme | 4 | 3 | 3 |
| UX | 4 | 3 | 1 |
| UI | 3 | 4 | 0 |

## Consolidated Findings

### 1. Admin surfaces still mix real operations with mock or fallback data

- Severity: `High`
- Source: `design-main`, `ux-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/disputes/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/disputes/[id]/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/venues/[id]/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/teams/[id]/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/reviews/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/statistics/page.tsx)
- Summary:
  - 운영자가 실제 엔티티와 실시간 상태를 보고 판단해야 하는 화면인데, mock 데이터나 ID fallback이 화면을 채운다.
  - 관리자 영역은 사용자-facing보다 더 엄격한 사실성이 필요한데, 현재는 “운영 콘솔”과 “시연용 surface”가 혼재되어 있다.

### 2. Escalation and sanction actions lack auditability

- Severity: `High`
- Source: `design-main`, `ux-manager`, `ui-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/users/[id]/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/disputes/[id]/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/settlements/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/lesson-tickets/page.tsx)
- Summary:
  - 경고, 정지, 분쟁 해결, 정산 처리 같은 운영 액션이 실제 트랜잭션/부분 실패/처리 이력 없이 로컬 상태나 toast에 머문다.
  - 운영 액션은 “누가, 왜, 언제, 무엇을 바꿨는지”가 남아야 하는데 현재 흐름은 그 감각이 거의 없다.

### 3. Some admin flows leak out of the admin context

- Severity: `High`
- Source: `design-main`, `ux-manager`
- Affected page:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/team-matches/page.tsx)
- Summary:
  - `admin/team-matches` 상세 진입이 `/team-matches/[id]` 공개 영역으로 빠져 admin shell과 운영 맥락이 끊긴다.
  - 관리 작업이 필요한 흐름에서 권한 표면이 분리되면 복귀 동선과 컨텍스트 유지가 모두 약해진다.

### 4. Admin actions still expose false or dead-end affordances

- Severity: `High`
- Source: `ui-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/lessons/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/users/[id]/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/lesson-tickets/page.tsx)
- Summary:
  - 운영자가 클릭하는 수정/제재/일괄 처리 액션이 실제 편집이나 결과 확인으로 이어지지 않고 “준비 중” 또는 mock 처리로 끝나는 경우가 있다.
  - 관리자 화면에서는 이런 affordance mismatch가 곧 실수 위험으로 연결된다.

### 5. Status grammar is not consistent across admin lists and details

- Severity: `Medium`
- Source: `design-main`, `ui-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/matches/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/matches/[id]/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/disputes/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/payments/page.tsx)
- Summary:
  - 어떤 화면은 칩, 어떤 화면은 텍스트 컬러, 어떤 화면은 badge 없이 숫자만으로 상태를 드러낸다.
  - 운영자는 빠른 판독이 중요하므로 `full / completed / pending / resolved` 같은 상태는 공통 칩 grammar로 묶어야 한다.

### 6. Admin page hierarchy and breadcrumbs are uneven

- Severity: `Medium`
- Source: `ux-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/matches/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/users/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/matches/[id]/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/team-matches/page.tsx)
- Summary:
  - 어떤 페이지는 breadcrumb가 있고 어떤 페이지는 없다.
  - 목록/상세/관리라는 역할이 페이지마다 다르게 보이면서 현재 위치와 복귀 경로가 고르지 않다.

### 7. Input and interaction density still have a few admin-specific quality gaps

- Severity: `Medium`
- Source: `ux-manager`, `ui-manager`
- Affected pages:
  - [layout.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/layout.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/venues/new/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/lesson-tickets/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/admin/dashboard/page.tsx)
- Summary:
  - 모바일 sidebar close button은 44px 기준보다 작고, 시설 등록은 기본 유효성 검증이 얕으며, lesson ticket row action은 터치 타깃이 부족하다.
  - 대시보드는 `0`을 `-`로 렌더링해 운영자가 “값 없음”으로 오해할 수 있다.

## Stable Pages

### `AdminLayout`

- 관리자 shell의 기본 골격, 사이드바, 모바일 오버레이, 다크모드 톤은 안정적이다.
- 이후 admin 전체를 정리할 때 기준 shell로 쓰기 적합하다.

### `/admin/matches`

- 리스트 탐색과 상세 진입은 비교적 명확하고, toolbar 재사용도 자연스럽다.
- 상태 칩 grammar만 보강하면 admin list 기준면으로 삼을 수 있다.

### `/admin/venues`

- 운영형 테이블과 검색/다운로드 흐름이 비교적 차분하게 정리되어 있다.
- 상세/수정 페이지의 mock fallback만 걷어내면 더 신뢰 가능한 surface가 된다.

### `/admin/statistics`

- 정보 밀도와 카드/차트 배치는 기본적으로 읽기 쉽다.
- 실데이터 보장과 0값 표기만 바로잡으면 운영 대시보드 계열 기준 샘플이 될 수 있다.

## Page Signals

| Domain | Signal |
|--------|--------|
| `admin shell` | 구조와 톤은 안정적 |
| `admin detail actions` | 신뢰/감사성 부족이 가장 큰 문제 |
| `bulk operations` | 결과 복구와 부분 실패 표현이 약함 |
| `status-heavy lists` | 상태 grammar 통일 필요 |

## Recommended Actions

1. `users/[id]`, `disputes/[id]`, `lesson-tickets`, `settlements`부터 실제 처리 결과, 실패 사유, 처리 주체, 타임스탬프가 남는 운영 액션 모델로 재설계한다.
2. `disputes`, `teams/[id]`, `venues/[id]`, `payments`, `settlements`, `mercenary`, `statistics`의 mock/sample surface를 분리하고, 실데이터 부재 시 명시적 empty/error/admin-demo 상태를 노출한다.
3. `admin/team-matches` 상세 진입을 admin 맥락 안으로 되돌리고, 관리자 list/detail/action 플로우가 public surface로 이탈하지 않게 막는다.
4. `matches`, `payments`, `disputes`, `reviews`의 상태 표현을 공통 칩 grammar로 맞추고 색상 의존도를 낮춘다.
5. `lesson-tickets`와 detail page들의 inline modal/inline action 패턴을 공용 시스템으로 수렴시키고, 터치 타깃과 키보드 접근성도 같이 정리한다.
6. 목록/상세/설정형 admin 페이지에 breadcrumb와 현재 위치 grammar를 공통화한다.

## Final Note

- Batch A부터 G까지의 순차 디자인 리뷰가 모두 완료됐다.
- 가장 반복된 핵심 축은 `false affordance`, `sample vs real trust signal`, `route/context continuity`, `shared interaction system`, `operational auditability`였다.
