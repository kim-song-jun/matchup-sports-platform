# 2026-04-08 Design Review — Batch A

> Historical planning note. Canonical rules live in `DESIGN.md`, document navigation lives in `docs/DESIGN_DOCUMENT_MAP.md`, and current design remediation execution lives in `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`.

## Scope

- `/landing`
- `/about`
- `/guide`
- `/pricing`
- `/faq`
- `/login`

기준:

- `.impeccable.md`
- `.claude/agents/prompts.md` Design Team section
- `docs/plans/2026-04-08-design-page-inventory.md`

리뷰 주체:

- `design-main`
- `ux-manager`
- `ui-manager`

## Review Summary

| Reviewer | 🔴 | 🟡 | 🟢 | 💡 |
|----------|----|----|----|----|
| Theme | 0 | 4 | 2 | 4 |
| UX | 1 | 3 | 2 | 5 |
| UI | 0 | 2 | 4 | 4 |

## Consolidated Findings

### 1. First-match activation path is not explicit enough

- Severity: `High`
- Source: `ux-manager`
- Affected pages:
  - [landing/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/landing/page.tsx)
  - [about/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/about/page.tsx)
  - [guide/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/guide/page.tsx)
  - [pricing/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/pricing/page.tsx)
  - [faq/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/faq/page.tsx)
- Summary:
  - 공개 페이지 전반이 “왜 TeamMeet을 써야 하는가”는 잘 설명하지만, “지금 첫 매치를 하려면 무엇을 누르고 어디로 가야 하는가”는 한 번에 읽히지 않는다.
  - CTA가 대부분 `/login`으로 수렴하지만, 로그인 이후 최단 경로가 시각적으로 이어지지 않는다.

### 2. Login page mixes too many intents at similar visual weight

- Severity: `Medium`
- Source: `ux-manager`, `design-main`, `ui-manager`
- Affected page:
  - [login/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/(auth)/login/page.tsx)
- Summary:
  - 이메일 로그인/회원가입, 로그인 없이 둘러보기, 개발용 dev-login 패널이 모두 한 페이지에서 존재감을 가진다.
  - 운영용 보조 흐름이 실제 사용자 주행동보다 덜 낮은 우선순위를 갖고 있어 첫 화면 집중도가 분산된다.
  - `홈으로`, `로그인 없이 둘러보기`가 모두 `/home`으로 향해 public/auth 경계도 모호하다.

### 3. Brand accent discipline is unstable in Batch A

- Severity: `Medium`
- Source: `design-main`, `ui-manager`
- Affected pages:
  - [about/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/about/page.tsx)
  - [landing/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/landing/page.tsx)
  - [pricing/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/pricing/page.tsx)
- Summary:
  - Batch A의 기본 언어는 `blue-first`인데, `about`는 emerald/amber/purple/red가 넓게 섞여 브랜드 톤을 흔든다.
  - `landing`은 스포츠 카드의 멀티컬러가 히어로 이후 시선을 과도하게 분산시킨다.
  - `pricing`은 team plan만 violet 축을 강하게 써서 같은 제품 안의 다른 시각 시스템처럼 느껴진다.

### 4. Pricing information architecture is not conceptually clean

- Severity: `Medium`
- Source: `ux-manager`
- Affected page:
  - [pricing/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/pricing/page.tsx)
- Summary:
  - 구독 플랜, 경기 참가비, 플랫폼 수수료가 한 페이지에서 함께 설명되지만, “무엇을 언제 왜 내는가”의 mental model이 한 문장으로 정리되지 않는다.
  - 투명성을 강조하지만 읽는 입장에서는 비용 체계가 분리돼 보인다.

### 5. FAQ mobile readability can degrade

- Severity: `Low`
- Source: `ui-manager`
- Affected page:
  - [faq/page.tsx](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/apps/web/src/app/faq/page.tsx)
- Summary:
  - 질문 헤더에 `truncate`가 들어가 있어 좁은 화면에서 잘린 질문이 먼저 보인다.
  - 카테고리 탭 + 긴 제목 조합에서 탐색성이 조금 떨어진다.

## Stable Pages

### `/guide`

- 세 리뷰어 공통으로 구조가 가장 안정적이라는 판단
- 단계형 흐름, 설명 구조, 시각 밀도 모두 무난
- 다만 first-match 핵심 경로보다 팀/용병/장터가 같은 무게로 보이는 IA는 개선 여지 있음

### `/faq`

- 카테고리 구조와 FAQ 패턴 자체는 안정적
- 모바일 질문 줄바꿈/잘림만 보완하면 품질이 더 올라갈 수 있음

### `/landing`

- Hero, CTA, feature 위계는 전반적으로 안정적
- 다만 중간 스포츠 카드 팔레트가 브랜드 집중도를 약화시킴

## Page Scores

| Page | Theme | UX | UI | Combined |
|------|------:|---:|---:|---------:|
| `/landing` | 4 | 3 | 4 | 3.7 |
| `/about` | 2 | 3 | 3 | 2.7 |
| `/guide` | 4 | 3 | 4 | 3.7 |
| `/pricing` | 3 | 2 | 3 | 2.7 |
| `/faq` | 4 | 3 | 3 | 3.3 |
| `/login` | 3 | 2 | 3 | 2.7 |

## Recommended Actions

1. 공개 페이지 공통 CTA를 “첫 매치 시작” 중심으로 다시 묶는다.
2. 로그인 페이지에서 `dev-login`과 “로그인 없이 둘러보기”의 시각 우선순위를 더 낮춘다.
3. `about`와 `pricing`의 accent palette를 블루 중심으로 재정렬한다.
4. `landing`의 스포츠 카드 멀티컬러 채도와 개수를 줄여 브랜드 블루 주도권을 회복한다.
5. `pricing`에 비용 체계 요약 블록을 추가해 구독/참가비/수수료를 한 번에 설명한다.
6. `faq` 질문 헤더는 `truncate` 대신 2줄 래핑 또는 더 넓은 아코디언 헤더로 바꾼다.

## Next Batch

추천 다음 순서:

- `Batch B`: 앱 shell + 홈 + 프로필 + 설정

이유:

- 공개/브랜드 쪽보다 실제 DAU가 더 많이 닿는 화면이다.
- 메인 네비게이션, 정보 밀도, 모바일 사용성이 본격적으로 평가되는 구간이다.
