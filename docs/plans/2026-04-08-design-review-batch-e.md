# 2026-04-08 Design Review — Batch E

## Scope

- `/mercenary`
- `/mercenary/new`
- `/mercenary/[id]/edit`
- `/my/mercenary`
- `/lessons`
- `/lessons/new`
- `/lessons/[id]`
- `/lessons/[id]/edit`
- `/my/lessons`
- `/my/lesson-tickets`
- `/marketplace`
- `/marketplace/new`
- `/marketplace/[id]`
- `/marketplace/[id]/edit`
- `/my/listings`
- `/venues`
- `/venues/[id]`

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
| UX | 2 | 2 | 1 |
| UI | 1 | 2 | 1 |

## Consolidated Findings

### 1. Four domains no longer feel like one product family

- Severity: `High`
- Source: `design-main`, `ui-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/lessons/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/mercenary/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/marketplace/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/venues/page.tsx)
- Summary:
  - `lessons`는 블루 중심의 몰입형 카드 시스템인데, `mercenary`는 평평한 관리형 카드, `marketplace`는 회색 리스트형 커머스 템플릿, `venues`는 건조한 디렉토리 톤으로 갈린다.
  - 사용자 입장에서는 한 앱 안의 여러 기능이라기보다 다른 서비스 4개처럼 느껴진다.

### 2. Edit flows in mercenary and marketplace are not reliably bound to the real entity

- Severity: `High`
- Source: `ux-manager`
- Affected pages:
  - [edit/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/mercenary/[id]/edit/page.tsx)
  - [edit/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/marketplace/[id]/edit/page.tsx)
- Summary:
  - `mercenary/[id]/edit`는 특정 dev seed가 아니면 empty state로 빠지고, `marketplace/[id]/edit`는 route entity 대신 고정된 seed로 되돌아가는 경향이 있다.
  - 운영자 입장에서 “내가 지금 이 항목을 수정 중”이라는 신뢰가 깨진다.

### 3. Marketplace image upload is a strong false affordance

- Severity: `High`
- Source: `ux-manager`
- Affected page:
  - [new/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/marketplace/new/page.tsx)
- Summary:
  - 파일 input은 보이지만 상태 반영, 미리보기 갱신, submit payload 연결이 없다.
  - 장터에서 이미지 신뢰도는 구매 판단의 핵심인데, 실제로는 동작하지 않는 업로드 UI를 보여준다.

### 4. Trust signals are inconsistent and often not clearly labeled

- Severity: `Medium`
- Source: `ux-manager`, `ui-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/lessons/[id]/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/marketplace/[id]/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/venues/[id]/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/mercenary/page.tsx)
- Summary:
  - 평점, 매너 점수, 수강생 수, 리뷰가 어떤 것은 실데이터처럼 보이고 어떤 것은 샘플/고정값인데, 화면에서 그 경계가 드러나지 않는다.
  - 이 묶음은 거래/예약/참가 판단이 많아서 `verified / sample / estimated` 구분이 특히 중요하다.

### 5. Filter and card systems are not reused across browse surfaces

- Severity: `Medium`
- Source: `ui-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/mercenary/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/marketplace/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/venues/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/lessons/page.tsx)
- Summary:
  - 카드 밀도, 이미지 비중, 메타 위치, 칩 크기, 모바일 터치 감각이 도메인마다 다르다.
  - 특히 `venues`의 city chips와 `mercenary`의 기본 칩은 동일한 탐색 surface라고 보기 어렵다.

### 6. Browse, manage, and create IA are not named or framed consistently

- Severity: `Medium`
- Source: `ux-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/mercenary/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/my/mercenary/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/venues/[id]/page.tsx)
- Summary:
  - `내 모집/신청`처럼 포괄적으로 보이는 라벨이 실제로는 내 모집글만 다루거나, 탐색 화면 안에서 곧바로 생성 CTA로 점프하는 식의 목적 전환이 잦다.
  - 사용자는 각 화면이 조회인지, 운영인지, 생성인지 매번 다시 해석해야 한다.

## Stable Pages

### `/lessons`

- 이번 배치에서 가장 제품답고 일관된 카드/상세/CTA 흐름
- 배치 E 전반의 기준 화면으로 삼기 적합

### `/my/lesson-tickets`

- 상태 표현, 밀도, 가독성, dark mode 대응이 안정적
- 이후 badge grammar 정리 시 기준 샘플로 활용 가능

## Page Signals

| Domain | Signal |
|--------|--------|
| `lessons` | 가장 안정적이고 브랜드 톤과 잘 맞음 |
| `mercenary` | 관리툴 느낌이 강하고 카드/칩이 낡아 보임 |
| `marketplace` | create/edit가 별도 시스템처럼 튀고 이미지 업로드 false affordance 존재 |
| `venues` | 유틸리티 디렉토리 느낌이 강하고 에너지감이 약함 |

## Recommended Actions

1. `lessons`와 `my/lesson-tickets`를 기준 화면으로 삼아 `mercenary`, `marketplace`, `venues`의 카드/칩/CTA 언어를 재정렬한다.
2. `mercenary/[id]/edit`, `marketplace/[id]/edit`는 현재 route entity를 실제로 hydrate하는 편집 화면으로 먼저 바로잡는다.
3. `marketplace/new`의 이미지 업로드는 실제 동작까지 연결하거나, 그 전까지는 UI를 축소/비활성화해 false affordance를 제거한다.
4. 평점, 리뷰, 수강생 수, 매너 점수에는 `verified`, `sample`, `estimated` 상태를 명시적으로 붙인다.
5. browse / manage / create 패턴을 도메인마다 같은 정보 구조와 라벨로 맞추고, 모바일 메타는 두 줄 이내로 재구성한다.
6. `venues`와 `mercenary`의 모바일 필터는 더 큰 버튼형 패턴과 공통 터치 규격으로 통일한다.

## Next Batch

추천 다음 순서:

- `Batch F`: 결제 / 리뷰 / 개인 기록

이유:

- 신뢰, 상태, 거래 결과를 보여주는 화면들이라 앞선 배치의 `trust signal` 기준을 마지막으로 재검증하기 좋다.
- 이후 관리자 배치로 넘어가기 전에 사용자-facing 후반부 surface를 마무리할 수 있다.
