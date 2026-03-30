# V2 Design Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 기능 구조는 최대한 유지한 채, MatchUp v2를 전문적이고 독자적인 디자인 언어로 재구성한다.

**Architecture:** 데이터/도메인 로직은 건드리지 않고, `globals.css`, 앱 셸, 공용 UI 표면, 대표 페이지군부터 순차적으로 리디자인한다. glass morphism은 전체 배경 효과가 아니라 네비게이션, 필터, 요약 패널, 히어로 카드 같은 상위 레이어에 제한적으로 적용하고, 결제/폼/일정 정보는 고체형 surface로 유지한다.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4, next-intl, Zustand, existing Playwright/Vitest/Jest setup

---

## Working Assumptions

- 브랜드 표기는 `MatchUp`으로 통일한다.
- 기능 제거는 하지 않되, 노출 우선순위는 재정렬한다.
- glass morphism은 “스포츠 플랫폼용 tempered glass”로 제한한다.
- 현재 worktree가 dirty 상태이므로 실제 브랜치 생성은 clean checkpoint 이후 진행한다.

## Recommended Branch Strategy

### Safe Option A: Separate Worktree

현재 uncommitted 변경을 건드리지 않으려면 새 worktree에서 v2를 진행한다.

Run:

```bash
git worktree add ../sports-platform-v2 -b feat/v2-design-foundation main
```

이 옵션은 현재 dirty tree를 보존하지만, 현재 미커밋 변경은 새 worktree에 포함되지 않는다.

### Safe Option B: Current Tree Baseline Capture

현재 변경을 v2의 출발점으로 삼아야 하면 먼저 사용자 기준 checkpoint가 필요하다.

Run:

```bash
git status --short
git add -A
git commit -m "chore: checkpoint current ui baseline"
git switch -c feat/v2-design-foundation
```

이 옵션은 현재 상태를 그대로 가져가지만, 기존 실험 변경도 함께 포함된다.

### Branch Breakdown After Foundation

1. `feat/v2-design-foundation`
2. `feat/v2-marketing-surfaces`
3. `feat/v2-core-app-surfaces`
4. `feat/v2-secondary-pages`
5. `feat/v2-admin-polish`
6. `test/v2-visual-qa`

## Design Direction

- 핵심 인상: precise, athletic, premium, trustworthy
- 기본 재질: solid slate surface + selective frosted overlays
- 핵심 컬러: cobalt blue, ice white, graphite, cool gray
- 보조 컬러: 스포츠 종목별 accent는 유지하되 정보 hierarchy를 깨지 않는 범위만 사용
- 금지: neon glow, crypto-style gradients, 과한 blur, 저대비 투명 카드 남발

## Files Likely Touched

- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/components/layout/sidebar.tsx`
- Modify: `apps/web/src/components/layout/bottom-nav.tsx`
- Modify: `apps/web/src/components/layout/footer.tsx`
- Modify: `apps/web/src/components/landing/landing-nav.tsx`
- Modify: `apps/web/src/components/landing/landing-footer.tsx`
- Modify: `apps/web/src/lib/constants.ts`
- Create: `apps/web/src/components/ui/glass-panel.tsx`
- Create: `apps/web/src/components/ui/section-shell.tsx`
- Create: `apps/web/src/components/ui/filter-chip.tsx`
- Create: `apps/web/src/components/ui/page-hero.tsx`

## Phase 1 Anchor Screens

이 5개를 먼저 바꾸고 나머지는 패턴 전파로 해결한다.

- `apps/web/src/app/landing/page.tsx`
- `apps/web/src/app/(main)/home/page.tsx`
- `apps/web/src/app/(main)/matches/page.tsx`
- `apps/web/src/app/(main)/team-matches/page.tsx`
- `apps/web/src/app/(main)/profile/page.tsx`

## Task 1: Freeze The V2 Visual Contract

**Files:**
- Modify: `docs/PROJECT_OVERVIEW.md`
- Create: `docs/plans/2026-03-30-v2-design-redesign.md`

**Steps:**
1. 브랜드명을 `MatchUp` 기준으로 확정한다.
2. glass morphism 사용 범위를 문장으로 제한한다.
3. 핵심 화면 5개를 anchor screen으로 선언한다.
4. “기능 유지, 표면 재설계” 원칙을 문서화한다.

**Done when:**
- 디자이너나 개발자가 문서만 읽고도 v2 범위를 오해하지 않는다.

## Task 2: Build The Foundation Layer

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/lib/constants.ts`
- Create: `apps/web/src/components/ui/glass-panel.tsx`
- Create: `apps/web/src/components/ui/section-shell.tsx`

**Steps:**
1. metadata와 공용 브랜드 표기를 `MatchUp`으로 통일한다.
2. 글로벌 색상 토큰을 `graphite / slate / cobalt / ice` 축으로 재정리한다.
3. reusable glass panel primitive를 만든다.
4. solid surface와 glass surface의 용도를 분리한다.
5. 다크모드는 utility override 추가가 아니라 token 우선 구조로 옮긴다.

**Test:**
- Run: `pnpm --filter web test`
- Run: `pnpm --filter web dev`

## Task 3: Redesign The App Shell

**Files:**
- Modify: `apps/web/src/components/layout/sidebar.tsx`
- Modify: `apps/web/src/components/layout/bottom-nav.tsx`
- Modify: `apps/web/src/components/layout/footer.tsx`
- Modify: `apps/web/src/app/(main)/layout.tsx`

**Steps:**
1. 좌측 사이드바를 frosted shell + solid navigation contrast 구조로 바꾼다.
2. 모바일 하단탭은 배경 blur를 쓰되 라벨 대비를 강화한다.
3. 공용 헤더/푸터 spacing과 page frame rhythm을 맞춘다.
4. unread badge, CTA, active state의 visual language를 통일한다.

**Test:**
- Run: `pnpm --filter web test`

## Task 4: Refresh The Marketing Surfaces

**Files:**
- Modify: `apps/web/src/app/landing/page.tsx`
- Modify: `apps/web/src/app/about/page.tsx`
- Modify: `apps/web/src/app/guide/page.tsx`
- Modify: `apps/web/src/app/pricing/page.tsx`
- Modify: `apps/web/src/app/faq/page.tsx`
- Modify: `apps/web/src/components/landing/landing-nav.tsx`
- Modify: `apps/web/src/components/landing/landing-footer.tsx`

**Steps:**
1. “AI + 신뢰 + 경기 운영” 세 축만 전면에 둔다.
2. 종목 나열과 기능 나열보다 실제 문제 해결 흐름을 강조한다.
3. hero, stats, feature cards에 제한적 glass effect를 쓴다.
4. 법적 링크와 CTA 흐름을 실제 앱 경험과 연결한다.

**Test:**
- Run: `pnpm --filter web dev`
- Check: `/landing`, `/about`, `/guide`, `/pricing`, `/faq`

## Task 5: Redesign The Core App Pages

**Files:**
- Modify: `apps/web/src/app/(main)/home/page.tsx`
- Modify: `apps/web/src/app/(main)/matches/page.tsx`
- Modify: `apps/web/src/app/(main)/team-matches/page.tsx`
- Modify: `apps/web/src/app/(main)/profile/page.tsx`
- Modify: `apps/web/src/app/(main)/notifications/page.tsx`

**Steps:**
1. 카드와 리스트는 solid surface 위주로 유지한다.
2. 필터바, summary panel, hero band에만 glass overlay를 적용한다.
3. 일정, 인원, 참가비, 평가 정보는 더 높은 대비로 재배치한다.
4. 모바일 one-thumb 동선 기준으로 CTA 위치를 재정렬한다.

**Test:**
- Run: `pnpm --filter web test`
- Check: `/home`, `/matches`, `/team-matches`, `/profile`, `/notifications`

## Task 6: Roll Patterns Across Secondary Pages

**Files:**
- Modify: `apps/web/src/app/(main)/lessons/**`
- Modify: `apps/web/src/app/(main)/marketplace/**`
- Modify: `apps/web/src/app/(main)/teams/**`
- Modify: `apps/web/src/app/(main)/venues/**`
- Modify: `apps/web/src/app/(main)/payments/**`

**Steps:**
1. anchor screen에서 만든 header/card/filter/form 패턴을 이식한다.
2. 페이지별 예외 스타일을 줄인다.
3. CTA, badge, tab, empty state를 공용 컴포넌트로 통합한다.

**Test:**
- Run: `pnpm --filter web test`

## Task 7: Admin Is Polish, Not Re-Invention

**Files:**
- Modify: `apps/web/src/app/admin/**`
- Modify: `apps/web/src/components/admin/admin-toolbar.tsx`

**Steps:**
1. admin은 소비자 앱보다 더 solid하고 dense하게 유지한다.
2. glass effect는 top summary or filter bar 정도로 제한한다.
3. mock 성격의 화면도 production-grade 표면처럼 보이게 정리한다.

**Test:**
- Run: `pnpm --filter web test`

## Task 8: V2 QA Gate

**Files:**
- Modify: `e2e/**`
- Modify: `docs/DESIGN_CONSISTENCY_REPORT.md`

**Steps:**
1. 대표 화면의 screenshot baseline을 다시 만든다.
2. 모바일 375px, 태블릿 768px, 데스크탑 1440px에서 레이아웃을 확인한다.
3. blur/opacity가 가독성과 성능을 해치지 않는지 확인한다.
4. title hierarchy, tap target, color contrast를 다시 점검한다.

**Test:**
- Run: `pnpm --filter web test`
- Run: `pnpm --filter api test`

## First Two Weeks

### Week 1

1. v2 visual contract 확정
2. foundation tokens 정리
3. app shell 리디자인
4. landing + home 적용

### Week 2

1. matches + team-matches + profile 적용
2. secondary page 패턴 전파 시작
3. visual QA baseline 업데이트

## Non-Goals For V2

- 결제/OAuth/GPS 실연동 해결
- 기능 삭제 또는 정보 구조 대수술
- admin 운영 플로우 재설계
- 새로운 비즈니스 기능 추가

## Success Criteria

- 첫 화면에서 브랜드와 전문성이 명확히 느껴진다.
- glass morphism이 “장식”이 아니라 hierarchy 도구로 작동한다.
- core 5 screens가 같은 제품군으로 보인다.
- 기능은 유지되지만, 제품 메시지는 더 좁고 강해진다.
- secondary pages가 foundation component만으로 재구성 가능해진다.
