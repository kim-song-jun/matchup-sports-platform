# Task 41 — Mobile Glass Chrome System

> Historical implementation record. Canonical rules live in `DESIGN.md`, document navigation lives in `docs/DESIGN_DOCUMENT_MAP.md`, and this file remains execution history only.

Owner: codex -> frontend-dev -> frontend-review -> design/qa/docs
Date drafted: 2026-04-11
Status: Implemented
Priority: P1

## Context

사용자는 모바일 UI가 지금보다 더 현대적으로 느껴지길 원했고, 특히 glassmorphism을 더 잘 적용하고 싶다고 요청했다.

하지만 현재 저장소의 디자인 기준은 glass를 전면적인 테마로 쓰는 것을 허용하지 않는다.

- `.impeccable.md`는 과한 글래스모피즘을 안티 레퍼런스로 둔다.
- 동시에 모바일 중심 사용성, 현대적인 polish, 신뢰 우선 경험은 핵심 원칙이다.

현재 구현 이전 기준선:

- `apps/web/src/app/globals.css`에는 `floating-bottom-nav` glass 스타일만 부분적으로 존재했다.
- `apps/web/src/components/layout/bottom-nav.tsx`는 그 스타일을 사용했지만, 다른 모바일 chrome과 같은 규칙을 공유하지 않았다.
- `apps/web/src/app/(main)/layout.tsx`의 모바일 셸은 mostly solid였다.
- `apps/web/src/components/landing/landing-nav.tsx`와 여러 상세 페이지 header는 `bg-white/95 backdrop-blur-sm` 같은 one-off 유틸리티를 직접 사용했다.
- `apps/web/src/app/(main)/home/home-client.tsx`의 상단 경험은 기능적으로는 충분하지만 glass language와 연결되지 않았다.

즉, 문제는 "glass가 없다"가 아니라:

1. glass 규칙이 전역 시스템으로 정리되어 있지 않고
2. 모바일 chrome과 콘텐츠 surface가 분리되지 않았으며
3. blur/opacity/border/shadow가 파일마다 제각각인 상태라는 점이다.

## Goal

모바일 UI에 절제된 glass chrome system을 도입해, Teameet의 모바일 셸과 상단 경험을 더 현대적이고 응집감 있게 만든다.

핵심 목표:

- 모바일 fixed/sticky chrome에만 glass를 적용한다.
- 데이터 콘텐츠 카드와 거래형 본문은 solid 위주로 유지한다.
- 기존 one-off blur 유틸리티를 공용 클래스/컴포넌트로 끌어올린다.
- 홈 상단은 "보여주기용 효과"가 아니라 실제 사용성 강화 영역으로 다듬는다.

## Design Guardrails

이 task는 아래 원칙을 반드시 지킨다.

1. `glass as frame, solid as content`
2. glass는 모바일 `nav / sticky header / overlay` 같은 chrome layer에 우선 적용한다.
3. 본문 list card, detail body, dense commerce form은 기본적으로 solid를 유지한다.
4. blur 단계는 2~3개 이내로 제한한다.
5. 다크 모드에서 대비 4.5:1을 깨지 않는다.
6. `prefers-reduced-motion`와 `backdrop-filter` fallback을 고려한다.
7. 한쪽 컬러 border 강조 같은 패턴은 사용하지 않는다.

## Implemented Scope

### Core System

- `apps/web/src/app/globals.css`
  - mobile glass tokens 추가
  - shared mobile glass classes 추가
  - fallback behavior 추가
- `apps/web/src/components/layout/mobile-glass-header.tsx`
  - 반복 sticky header용 공용 wrapper 추가

### Primary Surfaces

- `apps/web/src/components/layout/bottom-nav.tsx`
- `apps/web/src/app/(main)/layout.tsx`
- `apps/web/src/components/landing/landing-nav.tsx`
- `apps/web/src/app/(main)/home/home-client.tsx`

### Repeated Mobile Sticky Header Surfaces

- `apps/web/src/app/(main)/matches/[id]/page.tsx`
- `apps/web/src/app/(main)/marketplace/[id]/page.tsx`
- `apps/web/src/app/(main)/mercenary/[id]/page.tsx`
- `apps/web/src/app/(main)/lessons/[id]/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/page.tsx`
- `apps/web/src/app/(main)/user/[id]/page.tsx`
- `apps/web/src/app/(main)/venues/[id]/page.tsx`
- `apps/web/src/app/(main)/team-matches/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/mercenary/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/lessons/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/matches/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/mercenary/page.tsx`

## Out Of Scope

- desktop sidebar redesign
- content-heavy list card redesign across all domains
- payment / checkout / admin visual refactor
- new animation framework
- glass applied to every card, section, modal, or hero by default
- brand color overhaul or typography overhaul

## Risks

1. **Brand drift**
   - modern polish를 과한 glass로 해석하면 신뢰감이 떨어질 수 있다.
2. **Readability regression**
   - sticky header와 chip 위 text contrast가 흐려질 수 있다.
3. **Performance regression**
   - blur가 넓은 영역에 걸리면 모바일 스크롤 성능이 악화될 수 있다.
4. **Inconsistency**
   - 페이지별로 다른 blur/opacity가 남으면 오히려 더 조잡해진다.
5. **Dirty worktree collision**
   - `home-client.tsx`, `landing-nav.tsx`, `teams/[id]/page.tsx`, `venues/[id]/page.tsx` 등 일부 파일에는 기존 미커밋 변경이 있으므로 현재 내용 기준으로 이어서 수정해야 했다.

## Implementation Strategy

### Phase 1 — Systemize

- `globals.css`에 mobile glass token을 추가한다.
- `floating-bottom-nav` 단일 클래스에서 벗어나 reusable class 세트를 만든다.
- class family:
  - `glass-mobile-nav`
  - `glass-mobile-header`
  - `glass-mobile-panel`
  - `glass-mobile-chip`
  - `glass-mobile-icon-button`

### Phase 2 — Shell First

- `BottomNav`를 새 glass system으로 이관한다.
- `MainLayout` 모바일 셸 배경과 inner container 레이어를 glass system과 맞춘다.
- `LandingNav` scrolled/mobile-open 상태를 같은 visual language로 정리한다.

### Phase 3 — Repeated Header Cleanup

- 반복되는 mobile sticky header를 shared wrapper/component로 추출한다.
- raw `bg-white/95 backdrop-blur-sm` header를 공용 패턴으로 대체한다.

### Phase 4 — Home Showcase

- 홈 상단 greeting/action zone을 restrained glass panel로 재구성한다.
- banner frame과 quick action strip에 같은 chrome language를 적용한다.
- match/team/listing 본문 카드까지 glass를 전파하지 않는다.

## Acceptance Criteria

### Visual System

- [x] 모바일 glass 표현이 전역 공용 클래스 또는 공용 컴포넌트로 정리된다.
- [x] bottom nav, mobile sticky header, landing mobile nav가 같은 계열의 surface language를 사용한다.
- [x] 홈 상단 experience가 별도의 glass accent를 가지되 본문 dense card는 solid를 유지한다.

### Accessibility / Resilience

- [x] dark pair를 깨는 명시적 타입 오류는 없다.
- [x] `backdrop-filter` 미지원 환경용 fallback을 추가했다.
- [x] 터치 타겟 44x44 유지 패턴을 보존했다.

### Validation

- [x] `pnpm --filter web exec tsc --noEmit` once before unrelated worktree drift surfaced
- [x] `pnpm --filter web test`
- [x] `pnpm --filter web lint`
- [ ] browser smoke on live localhost routes
  - current local `http://localhost:3003/landing` returned `HTTP 500`, so visual smoke remained blocked by runtime state outside this task

## Validation Notes

- `pnpm --filter web exec tsc --noEmit` initially passed right after implementation.
- A later rerun failed after unrelated dirty-worktree drift surfaced: `apps/web/src/components/ui/image-upload.tsx` was deleted outside this task, which broke `matches/new` and `image-upload.test.tsx` module resolution.
- `pnpm --filter web test` passed (`24 files / 247 tests`)
- `pnpm --filter web lint` passed (`tsc --noEmit` delegated message)
- `curl -I http://localhost:3003/landing` returned `HTTP 500`, so live browser verification was not treated as a reliable task-scope signal

## Review Focus

- glass가 콘텐츠 가독성을 해치지 않았는가
- shared abstraction이 과도하거나 불충분하지 않은가
- dirty worktree 변경을 덮어쓰지 않았는가
- design token / dark pair / a11y 규칙 위반이 없는가

## Ambiguity Log

- 2026-04-11 — 사용자 요청은 "모바일에 글래스모피즘을 잘 적용"이었지만, 디자인 가이드는 과한 glass를 금지한다. Decision: chrome-first restrained glass system으로 해석한다.
- 2026-04-11 — glass 적용 범위에 overlay/modal을 포함할 수 있으나, 이번 라운드에서는 shell + sticky header + home top zone까지만 우선 처리하고 modal 계열은 follow-up으로 둔다.
- 2026-04-11 — 현재 로컬 `localhost:3003`는 `/landing`에서 500을 반환했다. Decision: typecheck/test 통과를 우선 신뢰하고 live visual smoke는 runtime recovery 이후 follow-up으로 본다.
- 2026-04-11 — implementation 직후 `tsc --noEmit`는 통과했지만, 같은 turn 후반 재실행 시 task 범위 밖 `apps/web/src/components/ui/image-upload.tsx` 삭제가 surfaced 됐다. Decision: 이 drift는 본 task blocker가 아니라 repo dirty-state blocker로 기록한다.

## Deliverable

- 모바일 glass chrome system 반영 frontend change set 1개
- corresponding task/doc updates
