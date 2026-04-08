# 2026-04-08 Design Review — Batch D

## Scope

- `/teams`
- `/teams/new`
- `/teams/[id]`
- `/teams/[id]/edit`
- `/teams/[id]/members`
- `/my/teams`
- `/team-matches`
- `/team-matches/new`
- `/team-matches/[id]`
- `/team-matches/[id]/edit`
- `/team-matches/[id]/arrival`
- `/team-matches/[id]/score`
- `/team-matches/[id]/evaluate`
- `/my/team-matches`

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
| UX | 2 | 3 | 1 |
| UI | 1 | 2 | 1 |

## Consolidated Findings

### 1. Team-match scope is silently narrowed to only two sports

- Severity: `High`
- Source: `ux-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/team-matches/page.tsx)
  - [new/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/team-matches/new/page.tsx)
  - [edit/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/team-matches/[id]/edit/page.tsx)
- Summary:
  - 팀매칭 목록, 생성, 수정이 모두 `soccer`/`futsal`만 전제하고 있어 서비스 전체 종목 범위와 어긋난다.
  - 사용자 입장에서는 “내 종목은 지원 안 하나?”라는 혼선을 만들고, 조용한 기능 누락처럼 보인다.

### 2. Team detail renders mock trust signals as if they were real

- Severity: `High`
- Source: `ux-manager`
- Affected page:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/teams/[id]/page.tsx)
- Summary:
  - `mockTrustScore`, `mockBadges`, `mockRecentMatches`, `hasMercenaryPost = true`가 검증된 신뢰 정보처럼 렌더링된다.
  - 팀 상세는 사용자 판단의 중심 화면이라, 샘플/추정 데이터를 실제 신뢰 신호처럼 보이게 하면 위험하다.

### 3. Teams and team-matches do not share one creation/edit language

- Severity: `High`
- Source: `design-main`, `ui-manager`, `ux-manager`
- Affected pages:
  - [new/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/teams/new/page.tsx)
  - [edit/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/teams/[id]/edit/page.tsx)
  - [new/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/team-matches/new/page.tsx)
  - [edit/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/team-matches/[id]/edit/page.tsx)
- Summary:
  - 팀 생성/수정과 팀매칭 생성/수정이 서로 다른 폼 스킨, 칩, 버튼, 간격 시스템을 써서 같은 제품 여정처럼 보이지 않는다.
  - 특히 `teams/new`가 가장 이질적이고, 모바일에서는 단계형 흐름과 단일 페이지 폼의 대비가 더 크게 느껴진다.

### 4. Destructive modal patterns are fragmented and semantically inconsistent

- Severity: `High`
- Source: `ui-manager`
- Affected pages:
  - [edit/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/teams/[id]/edit/page.tsx)
  - [edit/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/team-matches/[id]/edit/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/my/teams/page.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/team-matches/[id]/page.tsx)
- Summary:
  - 어떤 화면은 공용 `Modal`을 쓰고, 어떤 화면은 raw overlay를 직접 만든다.
  - destructive flow가 제품 전반의 공통 규칙을 따르지 않아, 일관성과 접근성 모두 흔들린다.

### 5. Team detail is visually rich but too dense and too noisy

- Severity: `Medium`
- Source: `design-main`, `ui-manager`
- Affected page:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/teams/[id]/page.tsx)
- Summary:
  - 신뢰도, 최근 경기, 활동 정보, SNS, 영상, 갤러리, 배지까지 한 화면에 몰려 있다.
  - 색과 카드 스타일도 많이 섞여 팀 여정 안에서 가장 홍보 페이지나 대시보드에 가까운 톤이 된다.

### 6. Discovery and history IA are weaker than the management detail views

- Severity: `Medium`
- Source: `ux-manager`
- Affected pages:
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/teams/page.tsx)
  - [team-list.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/teams/team-list.tsx)
  - [page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/my/team-matches/page.tsx)
- Summary:
  - `/teams`는 탐색 화면처럼 보이지만 지역/종목/상태 필터가 약하고, 핵심 의사결정 정보가 카드 하단으로 밀린다.
  - `/my/team-matches`는 탭 구조는 괜찮지만 URL 상태 복원과 hosted/applied 맥락 구분이 충분히 명확하지 않다.

### 7. Match-day subflows read as separate tools rather than one follow-up journey

- Severity: `Low`
- Source: `design-main`, `ui-manager`, `ux-manager`
- Affected pages:
  - [arrival/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/team-matches/[id]/arrival/page.tsx)
  - [score/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/team-matches/[id]/score/page.tsx)
  - [evaluate/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(main)/team-matches/[id]/evaluate/page.tsx)
- Summary:
  - `arrival`, `score`, `evaluate`는 기능적으로 연결돼 있지만, 각각의 색/레이아웃/강조 방식이 달라 독립 툴처럼 느껴진다.
  - 게다가 `arrival`와 `score`는 mock 중심이라 운영 화면보다 데모 화면 인상이 강하다.

## Stable Pages

### `/teams/[id]/members`

- 세 리뷰어가 가장 안정적인 팀 도메인 화면으로 평가
- 리스트, 메뉴, 역할 변경, 공용 `Modal` 사용이 비교적 일관적

### `/my/teams`

- 관리 허브로서 카드 구조와 액션 구성이 명확
- 다만 delete modal만 공통 언어에서 이탈

### `/team-matches/[id]`

- 상세, 액션, 신청 현황의 연결이 자연스러운 편
- team/team-match family 안에서 가장 제품성 높은 상세 화면

## Page Signals

| Page Group | Signal |
|------------|--------|
| `teams/new`, `teams/[id]/edit`, `team-matches/new`, `team-matches/[id]/edit` | 공통 폼 시스템 부재 |
| `teams/[id]` | 신뢰/홍보/활동 정보가 과밀하고 mock 구분이 없음 |
| `team-matches` | 종목 범위 축소와 상태 칩 일관성 부족 |
| `my/team-matches` | 구조는 좋지만 상태 복원성과 맥락 설명이 약함 |
| `arrival` / `score` / `evaluate` | 후속 단계 템플릿 부재 |

## Recommended Actions

1. 팀/팀매칭 전 영역에서 서비스 전체 종목 지원 범위를 다시 맞추고, 하위 플로우가 일부 종목만 조용히 노출하는 상태를 없앤다.
2. 팀 상세의 신뢰 신호는 `verified`, `estimated`, `sample`을 시각적으로 분리하고, mock 데이터는 실제 정보처럼 보이지 않게 처리한다.
3. `StatusChip`, `ChoicePill`, `FieldShell`, `PrimaryCTA`를 공통 컴포넌트로 만들어 teams와 team-matches의 create/edit/list에 우선 적용한다.
4. destructive confirm은 공용 `Modal` 하나로 통일하고, close/focus/ESC 동작과 시각 언어를 같은 규칙으로 맞춘다.
5. `/teams`에는 탐색 필터를 강화하고, `/my/team-matches`는 URL 상태와 탭 맥락을 더 분명하게 유지한다.
6. `arrival`-`score`-`evaluate`를 하나의 후속 여정 템플릿으로 묶어 헤더, 카드, 상태 색, 진행감을 통일한다.

## Next Batch

추천 다음 순서:

- `Batch E`: 용병 / 강좌 / 장터 / 시설

이유:

- 거래형, 탐색형, 생성형, 상세형 UI가 가장 많이 섞이는 묶음이라 디자인 시스템의 일관성 테스트에 적합하다.
- 앞선 배치에서 드러난 `trust signal`, `form system`, `state chip`, `destructive modal` 이슈가 다시 반복되는지 확인하기 좋다.
