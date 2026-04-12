# 2026-04-08 Design Review — Batch C

> Historical planning note. Canonical rules live in `DESIGN.md`, document navigation lives in `docs/DESIGN_DOCUMENT_MAP.md`, and current design remediation execution lives in `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`.

## Scope

- `/matches`
- `/matches/new`
- `/matches/[id]`
- `/matches/[id]/edit`
- `/my/matches`

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
| Theme | 1 | 1 | 1 |
| UX | 2 | 2 | 0 |
| UI | 1 | 2 | 1 |

## Consolidated Findings

### 1. Create flow exposes options that the product does not actually support

- Severity: `High`
- Source: `ux-manager`, `ui-manager`
- Affected page:
  - [new/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/matches/new/page.tsx)
- Summary:
  - `직접 입력` 시설과 이미지 업로드가 실제로는 저장 경로와 연결되지 않거나 제출 직전에 막힌다.
  - 다단계 폼에서 보이는 선택지가 끝까지 유효하지 않으면 생성 플로우의 신뢰가 크게 떨어진다.

### 2. Find-to-create journey is broken at the most important branch

- Severity: `High`
- Source: `ux-manager`
- Affected page:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/matches/page.tsx)
- Summary:
  - `/matches`는 탐색 화면으로는 안정적이지만, 상시 `매치 만들기` CTA가 없다.
  - empty state도 같은 도메인의 다음 행동이 아니라 `/mercenary`로 보내서 개인 매치 흐름이 끊긴다.

### 3. Create and edit screens drift away from the rest of the match surface

- Severity: `High`
- Source: `design-main`, `ui-manager`
- Affected pages:
  - [new/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/matches/new/page.tsx)
  - [edit/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/matches/[id]/edit/page.tsx)
- Summary:
  - 생성/수정만 흑백 토글, 별도 폼 스킨, 독립된 버튼 언어를 써서 목록/상세의 블루 중심 카드 문법과 분리된다.
  - 매치 여정의 핵심 액션 화면이 가장 다른 제품처럼 보이는 상태다.

### 4. Host management actions are visually weaker than they should be

- Severity: `Medium`
- Source: `ux-manager`
- Affected page:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/matches/[id]/page.tsx)
- Summary:
  - 호스트에게 가장 큰 버튼이 비활성 `내가 만든 매치`로 보이고, 실제로 필요한 `수정`이나 관리 행동은 아래로 밀린다.
  - 참가자용 CTA는 명확하지만 호스트용 CTA 위계는 약하다.

### 5. My-matches screen mixes useful structure with unstable trust signals

- Severity: `Medium`
- Source: `ux-manager`, `ui-manager`
- Affected page:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/my/matches/page.tsx)
- Summary:
  - 탭과 요약 카드 구조는 이해하기 쉽지만, URL 탭 동기화, 샘플 데이터 노출, 별도 삭제 오버레이가 함께 있어 신뢰감이 떨어진다.
  - 히스토리/관리 화면이 같은 흐름의 연장선이라기보다 따로 만든 대시보드처럼 느껴진다.

### 6. Cross-page continuity is weaker than individual page quality

- Severity: `Low`
- Source: `design-main`, `ui-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/matches/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/matches/[id]/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/my/matches/page.tsx)
- Summary:
  - 상단 탐색 패턴이 `검색바+칩`, `breadcrumb`, `탭`, `sticky bar`로 제각각이고, 상세의 2열 정보 카드도 모바일에서 밀도가 높다.
  - 각 페이지 단독 완성도는 나쁘지 않지만, 라이프사이클 전체의 시각적 연속성은 약하다.

## Stable Pages

### `/matches`

- 세 리뷰어 모두 카드 기반 탐색 화면 자체는 가장 안정적이라고 평가
- 블루 액센트, 필터 칩, 카드 리스트의 첫 인상은 좋다
- 다음 개선은 시각 리디자인보다 `매치 만들기` CTA와 empty state 목적 정렬

### `/matches/[id]`

- 정보 위계, 액션 카드, 참가자 섹션 분리는 명확
- 다만 다른 매치 화면보다 독립 상세 페이지 톤이 강해서 여정 연속성은 떨어진다

## Page Signals

| Page | Signal |
|------|--------|
| `/matches` | 안정적이지만 create CTA 부재 |
| `/matches/new` | step 구조는 좋지만 false affordance와 스타일 드리프트가 큼 |
| `/matches/[id]` | 정보 위계는 좋지만 호스트 CTA 위계와 flow continuity가 약함 |
| `/matches/[id]/edit` | 가장 폼 중심이고 브랜드 연결감이 약함 |
| `/my/matches` | 구조는 유용하지만 신뢰/상태/모달 일관성이 흔들림 |

## Recommended Actions

1. `직접 입력`, 이미지 업로드처럼 사용자에게 노출한 입력은 실제 저장 경로와 반드시 일치시키고, 미지원이면 UI에서 제거하거나 명확히 비활성화한다.
2. `/matches`에 상시 `매치 만들기` CTA를 추가하고, empty state도 개인 매치 도메인 안에서 닫히게 정리한다.
3. 생성/수정 화면의 `chip`, `toggle`, `input`, `primary button`을 블루 중심 단일 스타일로 통일한다.
4. 상세 페이지의 호스트 영역은 `수정`, `취소`, `캘린더` 같은 실제 관리 행동을 최상단에 배치한다.
5. `/my/matches`의 탭 상태, 샘플 데이터 처리, 삭제 확인 UI를 공용 패턴으로 정리한다.
6. 매치 흐름 전체의 상단 네비게이션과 모바일 정보 블록을 하나의 시스템처럼 보이게 다시 맞춘다.

## Next Batch

추천 다음 순서:

- `Batch D`: 팀 / 팀 매칭 플로우

이유:

- 개인 매치 다음으로 가장 긴 흐름을 가지며, 생성/상세/관리/평가 단계가 모두 존재한다.
- 개인 매치에서 드러난 `flow continuity`, `CTA hierarchy`, `shared control language` 이슈를 팀 도메인에도 같은 기준으로 비교하기 좋다.
