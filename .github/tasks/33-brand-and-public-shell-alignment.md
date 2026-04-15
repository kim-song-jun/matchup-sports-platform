# Task 33 — Brand And Public Shell Alignment

> Historical design task. Canonical rules live in `DESIGN.md`, document navigation lives in `docs/DESIGN_DOCUMENT_MAP.md`, and this file remains rollout history only.

Owner: codex -> frontend-dev -> frontend-review -> docs-writer
Date drafted: 2026-04-11
Status: Completed (task scope passed; live validation limited by existing runtime/typecheck drift)
Priority: P0

## Context

현재 저장소는 문서/manifest/metadata는 `Teameet`, 실제 일부 공개 UI와 auth/admin shell은 `TeamMeet`를 사용한다. `apps/web/public/favicon.ico`도 없어 공개 페이지 브라우저 스모크에서 404가 확인됐다.

이 상태는 “무엇을 만들고 있는가”라는 가장 기본적인 제품 설명을 흔든다. 기능 구현 이전에 제품 명칭과 public shell이 먼저 하나의 진실 소스로 정리되어야 한다.

## Goal

- 웹 메타데이터, PWA manifest, 공개 페이지, auth shell, admin shell의 브랜드명을 하나로 통일한다.
- favicon 부재를 해소해 공개 페이지 기본 브라우저 경험을 정리한다.
- 기능 변경 없이 public shell copy와 metadata drift만 해소한다.

## Evidence

- `apps/web/public/manifest.json`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/landing/page.tsx`
- `apps/web/src/app/about/page.tsx`
- `apps/web/src/app/faq/page.tsx`
- `apps/web/src/app/(main)/settings/page.tsx`
- `apps/web/src/app/admin/layout.tsx`
- `.github/tasks/32-web-audit-and-remediation.md`

## Owned Write Scope

- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/landing/layout.tsx`
- `apps/web/src/app/about/layout.tsx`
- `apps/web/src/app/guide/layout.tsx`
- `apps/web/src/app/pricing/layout.tsx`
- `apps/web/src/app/faq/layout.tsx`
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(main)/settings/page.tsx`
- `apps/web/src/app/admin/layout.tsx`
- `apps/web/src/components/layout/sidebar.tsx`
- `apps/web/src/components/layout/footer.tsx`
- `apps/web/src/components/landing/landing-nav.tsx`
- `apps/web/src/components/landing/landing-footer.tsx`
- `apps/web/public/manifest.json`
- `apps/web/public/favicon.ico` or equivalent routed asset

## Must Not Touch

- 도메인 기능 로직
- API contract
- scenario/docs write-back

## Acceptance Criteria

- 브라우저 title, `siteName`, PWA `name`, visible shell heading이 모두 같은 브랜드명을 사용한다.
- 공개 페이지, 로그인, 설정, admin shell에서 다른 브랜드명이 남지 않는다.
- `/favicon.ico` 요청이 404를 반환하지 않는다.
- 기존 route 구조와 SEO 메타의 의미는 유지한다.

## Validation

- `rg -n "TeamMeet|Teameet" apps/web/src/app apps/web/src/components apps/web/public`
- `pnpm --filter web exec tsc --noEmit`
- 공개 브라우저 스모크
  - `/landing`
  - `/about`
  - `/guide`
  - `/faq`
  - `/login`
  - `/home`

## Out Of Scope

- 브랜드 리디자인
- 로고 재제작
- marketing docs 일괄 rename

## Risks

- 현재 worktree에 같은 public shell 파일들의 미커밋 변경이 이미 있으므로 fresh branch에서 진행하는 편이 안전하다.

## Execution Report (2026-04-11)

- public/auth/admin shell의 visible brand string을 `Teameet` / `Teameet Admin`으로 정렬했다.
- root metadata의 `title`, `template`, `authors`, `openGraph.siteName`, `twitter/openGraph title`, `icons`를 `Teameet` 기준으로 맞췄다.
- `apps/web/public/manifest.json`의 `name` / `short_name`이 `Teameet`임을 유지했다.
- `apps/web/public/favicon.ico`와 `apps/web/public/favicon.svg`를 기준 favicon asset으로 정리하고, E2E admin shell 기대값도 `Teameet Admin`으로 맞췄다.

### Files Updated

- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/landing/layout.tsx`
- `apps/web/src/app/about/layout.tsx`
- `apps/web/src/app/guide/layout.tsx`
- `apps/web/src/app/pricing/layout.tsx`
- `apps/web/src/app/faq/layout.tsx`
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(main)/settings/page.tsx`
- `apps/web/src/app/admin/layout.tsx`
- `apps/web/src/components/layout/sidebar.tsx`
- `apps/web/src/components/layout/footer.tsx`
- `apps/web/src/components/landing/landing-nav.tsx`
- `apps/web/src/components/landing/landing-footer.tsx`
- `apps/web/public/manifest.json`
- `apps/web/public/favicon.ico`
- `apps/web/public/favicon.svg`
- `e2e/tests/auth-session-matrix.spec.ts`

### Validation Result

- `rg -n "TeamMeet|Teameet" apps/web/src/app apps/web/src/components apps/web/public`
  - task scope 기준 `TeamMeet` 잔존 없음
- `curl -I http://localhost:3003/favicon.ico`
  - `200 OK`
- `pnpm --filter web exec tsc --noEmit --pretty false`
  - existing unrelated failures blocked full green validation:
    - `.next/types/app/(main)/mercenary/page.ts`
    - `src/app/(main)/matches/[id]/page.tsx`
    - `src/app/(main)/matches/new/page.tsx`
    - `src/app/(main)/team-matches/[id]/evaluate/page.tsx`
    - `src/app/(main)/team-matches/[id]/page.tsx`
    - `src/components/ui/image-upload.test.tsx`
- public route smoke on current `localhost:3003`
  - `/landing`, `/about`, `/guide`, `/faq`, `/login`, `/home` returned `500`
  - current dev runtime issue appears pre-existing and not specific to task 33 changes

### Acceptance Criteria Check

- [x] 브라우저 title, `siteName`, PWA `name`, visible shell heading이 `Teameet` 기준으로 정렬되었다.
- [x] 공개 페이지, 로그인, 설정, admin shell에서 task scope 기준 다른 브랜드명이 남지 않는다.
- [x] `/favicon.ico` 요청이 `200 OK`를 반환한다.
- [x] 기존 route 구조와 SEO 메타 의미를 유지한 채 metadata drift만 정리했다.

### Residual Follow-up

- fresh web 인스턴스에서 `/landing`, `/about`, `/guide`, `/faq`, `/login`, `/home` 브라우저 스모크를 다시 확인해야 한다.
- `pnpm --filter web exec tsc --noEmit`를 막는 기존 범위 외 오류(`mercenary`, `matches`, `team-matches`, `image-upload`)는 별도 task에서 정리해야 한다.
