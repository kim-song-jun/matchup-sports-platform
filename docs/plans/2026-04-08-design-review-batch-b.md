# 2026-04-08 Design Review — Batch B

> Historical planning note. Canonical rules live in `DESIGN.md`, document navigation lives in `docs/DESIGN_DOCUMENT_MAP.md`, and current design remediation execution lives in `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`.

## Scope

- `MainLayout`
- `/home`
- `/notifications`
- `/profile`
- `/settings`
- `/settings/account`
- `/settings/notifications`
- `/settings/privacy`
- `/settings/terms`

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
| Theme | 1 | 2 | 0 |
| UX | 2 | 2 | 1 |
| UI | 0 | 2 | 2 |

## Consolidated Findings

### 1. Account information architecture is split across too many entry points

- Severity: `High`
- Source: `ux-manager`
- Affected pages:
  - [settings/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/settings/page.tsx)
  - [profile/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/profile/page.tsx)
  - [settings/account/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/settings/account/page.tsx)
  - [settings/privacy/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/settings/privacy/page.tsx)
- Summary:
  - `프로필`, `계정`, `개인정보`, `보안`이 서로 다른 화면과 문구에 분산돼 있어 실제 편집 진입점이 예측되지 않는다.
  - 설정 허브는 `/profile`과 `/settings/account`를 모두 편집入口처럼 취급하고, 정책 문서도 다시 `개인정보 관리`를 기준으로 설명해 모델이 더 흐려진다.

### 2. Main shell changes product grammar too aggressively across breakpoints

- Severity: `High`
- Source: `design-main`
- Affected page:
  - [layout.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/layout.tsx)
- Summary:
  - 데스크톱은 `sidebar + wide canvas`, 모바일은 `centered white panel + shadow + footer + bottom nav`로 체감 문법이 크게 다르다.
  - 기능적으로는 맞지만, 같은 제품을 다른 앱처럼 느끼게 만드는 수준의 shell 차이가 있다.

### 3. Home has no single dominant purpose

- Severity: `High`
- Source: `ux-manager`, `design-main`, `ui-manager`
- Affected page:
  - [home/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/home/page.tsx)
- Summary:
  - 개인화 헤더, 일정, 로그인 유도, 배너, 종목 필터, 추천 매치, 팀, 강좌, 장터, 팀 매칭이 모두 같은 흐름에 있어 첫 행동 우선순위가 무너진다.
  - 정보 구조 문제와 함께 accent 색도 넓게 퍼져 있어 “지금 무엇을 해야 하는가”보다 “여러 블록이 나열된 대시보드”로 읽힌다.

### 4. Profile is overloaded and behaves more like an account hub than a profile

- Severity: `Medium`
- Source: `ux-manager`, `design-main`, `ui-manager`
- Affected page:
  - [profile/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/profile/page.tsx)
- Summary:
  - 프로필 카드, 통계, 편집 모달, 채팅/알림 바로가기, 긴 메뉴 리스트, 용병 모집, 설정, 로그아웃이 한 페이지에 직렬로 쌓여 있다.
  - 모바일에서는 프로필보다 계정 허브나 기능 목록처럼 읽혀, 핵심 정보와 보조 행동의 위계가 약하다.

### 5. Notifications are usable but not prioritized for high-signal events

- Severity: `Medium`
- Source: `ux-manager`
- Affected page:
  - [notifications/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/notifications/page.tsx)
- Summary:
  - 읽음 처리와 링크 연결은 명확하지만, 현재는 단일 chronological list라 매치/채팅/결제/팀 이벤트가 같은 무게로 섞여 보인다.
  - 이 서비스에서는 우선순위가 높은 알림을 더 빨리 분류해 처리할 수 있어야 한다.

### 6. Settings support pages are structurally stable but weak for scanning

- Severity: `Low`
- Source: `ux-manager`, `ui-manager`
- Affected pages:
  - [settings/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/settings/page.tsx)
  - [settings/privacy/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/settings/privacy/page.tsx)
  - [settings/terms/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/settings/terms/page.tsx)
- Summary:
  - `settings` 허브는 전반적으로 안정적이지만 `TeamMeet v1.0.0` 메타 정보가 중복 노출된다.
  - `privacy`와 `terms`는 문서 카드형 레이아웃은 괜찮지만, 목차나 앵커가 없어 모바일에서 훑어보기 어렵다.

## Stable Pages

### `/notifications`

- 세 리뷰어 모두 큰 붕괴 없이 안정적이라는 판단
- empty state, unread 처리, card density, touch target은 무난
- 다음 개선은 시각 리디자인보다 중요도 정렬과 필터 구조

### `/settings/account`

- 입력/저장/연결 계정/탈퇴 흐름 구분이 비교적 명확
- 정보 밀도는 약간 높지만, 구조 자체는 가장 실무적으로 정돈된 편

### `/settings/notifications`

- 스위치 인터랙션과 터치 타겟은 충분히 안정적
- 기능 우선순위를 드러내는 그룹 구분만 보강하면 된다

## Scenario Notes

- `Main navigation clarity`: 부분 통과. 네비게이션 컴포넌트는 존재하지만 계정 영역의 진입점 모델이 분리돼 있다.
- `Home information priority`: 실패. 홈이 행동 유도보다 서비스 전시 역할을 더 강하게 띤다.
- `Profile/settings discoverability`: 실패. 편집과 설정의 경계가 명확하지 않다.
- `Notifications usefulness`: 부분 통과. 처리 가능성은 좋지만 우선순위 장치가 약하다.
- `Mobile-first readability`: 부분 통과. 터치 타겟은 맞지만 긴 세로 흐름과 높은 정보 밀도가 누적된다.

## Recommended Actions

1. 계정 모델을 하나로 재정의하고 `프로필`, `계정`, `개인정보`, `보안`의 역할을 문구와 진입 경로에서 일치시킨다.
2. 메인 shell의 모바일/데스크톱 시각 문법 차이를 줄여 같은 제품처럼 느껴지게 정리한다.
3. `/home`의 primary action을 하나로 고정하고, 보조 탐색 블록은 접거나 뒤로 미룬다.
4. `/profile`은 활동, 소통, 거래, 설정처럼 그룹을 나눠 정보 덩어리를 재배치한다.
5. `/notifications`에는 unread/중요 이벤트/부가 알림 기준의 우선순위 장치를 추가한다.
6. `privacy`와 `terms`에는 목차 또는 섹션 점프를 넣고, `settings`의 중복 메타 정보는 제거한다.

## Next Batch

추천 다음 순서:

- `Batch C`: 개인 매치 플로우

이유:

- 실제 핵심 기능의 생성, 탐색, 상세, 수정 흐름이 한 덩어리로 연결되는 구간이다.
- 이전 QA/E2E 문서와 바로 연결돼 디자인 이슈를 기능 흐름 관점에서도 검증하기 좋다.
