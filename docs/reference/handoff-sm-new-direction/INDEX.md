# Handoff SM New Direction Index

## Purpose

This folder is a candidate reference pack forked from
`docs/reference/handoff-2026-04-25/`.

It preserves the existing handoff bundle, prototype system documents, QA records,
mock assets, and design-system evidence while reframing the service priority for
the next planning direction.

## Status

```text
Decision status: candidate
Canonical status: not canonical
Implementation status: reference only
Fork source: docs/reference/handoff-2026-04-25/
```

## Current Priority Override

This candidate snapshot now treats mercenary as a candidate module, not a core
module.

```text
Core:
auth, home, personal matches, teams/team matching, team browse/discovery,
community/chat/notifications, my/profile/reputation,
payments/refunds/disputes, settings/legal/status, public/marketing,
desktop, admin, common flows.

Candidate:
lessons, marketplace, venues, tournaments, equipment rental,
sports/skill/safety, mercenary.
```

Previous comparison point: mercenary was previously listed in the core set and
rendered as `05`. The current snapshot moves it to `C07` while preserving M08
ids and boards for comparison and QA stability.

Current `05` is now a team browse/discovery comparison section. It fills the
gap between team matching and team profile by giving users a full-team browse,
comparison, and selection surface.

Until this candidate is explicitly promoted, the active design rules remain:

1. `DESIGN.md`
2. `.impeccable.md`
3. `apps/web/src/app/globals.css`

This pack must not redefine canonical visual rules by itself.

## What Was Forked

The source pack was copied as-is from `handoff-2026-04-25` so that the original
reference remains untouched.

The copied baseline includes:

- `sports-platform/project/Teameet Design.html`
- `sports-platform/project/lib/*.jsx`
- local mock assets under `sports-platform/project/assets/`
- prototype-system docs through the current `fix32` state
- analysis, parity, system candidate, and section matrix documents

## Reading Order

1. `INDEX.md`
2. `DIRECTION.md`
3. `0502-design-freeze-brief.md`
4. `SM 문서화.md`
5. `COMPARISON_WITH_2026_04_25.md`
6. `prototype-system/README.md`
7. `prototype-system/COMPONENT_CATALOG.md`
8. `prototype-system/MODULE_MAP.md`
9. `prototype-system/COMMON_FLOWS.md`
10. `prototype-system/INTERACTIONS_AND_STATES.md`
11. `prototype-system/PRODUCTION_HANDOFF_FIX26.md`
12. `sports-platform/README.md`
13. `sports-platform/chats/chat1.md`
14. `sports-platform/project/Teameet Design.html`

## Candidate Direction Summary

The new direction keeps the design grammar from the 2026-04-25 handoff:

- Toss-like white-first surfaces
- restrained `#3182f6` interaction accent
- mobile-first flow with desktop-specific workspace layouts
- light-only consumer prototype, with Admin desktop sidebar as the dark-panel exception
- shared state, flow, QA, and canonical id practices

The service priority is reorganized into:

- Core modules: auth, home, personal matches, teams/team matching, team browse,
  community/chat/notifications, my/profile/reputation,
  payments/refunds/disputes, settings/legal/status, public/marketing, desktop,
  admin, and common flows.
- Candidate modules: lessons, marketplace, venues, tournaments, and equipment
  rental, sports/skill/safety, and mercenary.

Candidate modules are preserved for evaluation. They are not deleted.

## SM 디자인 고정 정리본

`0502-design-freeze-brief.md`는 SM 디자인 수정 메모를 구조화한 작업용
정리본이다. `SM 문서화.md`를 원문으로 그대로 보존하고, 같은 요구사항을
쉘, 라우트, 상태, 목록/상세 variant, 애매한 항목 기준으로 재배열한다.

후보 프로토타입이나 실제 제품 디자인을 수정할 때 이 문서를 우선 읽는다.
원문과 충돌하는 세부사항이 있으면 원문을 삭제하지 말고, 정리본에 명시적인
애매한 항목 로그를 추가한다.

## Phase 1 Scope

Phase 1 is intentionally limited to reference-pack structure and documentation.

Completed goals for this candidate pack:

- copy the existing handoff into a separate candidate folder
- add direction documents
- classify modules into core and candidate groups
- create an initial component catalog

Phase 1 does not substantially modify:

- `sports-platform/project/Teameet Design.html`
- `sports-platform/project/lib/*.jsx`

## Phase 2 Placeholder

Phase 2 reorganizes the rendered prototype section order inside the candidate
pack only.

Applied section order:

```text
00~00n Reference / DNA
01 인증/온보딩
02 홈/추천
02 홈/Toss canonical 비교
03 개인 매치
04 팀/팀매칭
05 팀 둘러보기/탐색
06 커뮤니티/채팅/알림
07 마이/프로필/평판
08 결제/환불/분쟁
09 설정/약관/상태
10 공개/마케팅
11 데스크탑 웹
12 관리자/운영
13 공통 플로우/인터랙션

Candidate:
C01 레슨
C02 장터
C03 시설
C04 대회
C05 장비 대여
C06 종목/실력/안전
C07 용병
```

The rendered section order now places each core functional module next to its
matching viewport-grid section, followed by candidate modules and their matching
viewport-grid sections.

Existing section ids, artboard ids, canonical ids, and major component export
names were preserved so QA scripts and prototype mount points remain stable.

Phase 2a update:

- Numbered core redesigns are added as same-number comparison sections directly
  below the original section.
- `02 · 홈 · Toss canonical` now follows the original `02 · 홈 · 추천` section.
  It copies the existing `홈 · Toss canonical` board as the mobile-first
  baseline and adds matching UI/flow rule boards for the next M02 grid pass.
- `05 · 팀 둘러보기` now follows `04 · 팀 · 팀매칭` and its M04 viewport grid.
  It adds a team browse screen plus flow/rule boards modeled after the `02`
  comparison section, while preserving the original team matching section.

Phase 2b SM design freeze update:

- `0502-design-freeze-brief.md` is now reflected in same-number comparison
  sections for `01`, `02`, `03`, `04`, `05`, `06`, `07`, `08`, `10`, and
  `12`.
- These sections are mobile-first and preserve the existing original boards.
- Each SM comparison section includes copied baseline evidence plus a mobile
  screen/state pass and a rule grid for the later m-grid rewrite.
- SM revision and later SM mobile screens use the dedicated `SMBottomNav`
  contract: `홈 / 매치 / 팀매치 / 팀 / 마이`.
- Desktop-specific redesign is intentionally deferred until the mobile and grid
  contracts are confirmed.

## Operating Rules

- Keep `handoff-2026-04-25` as the original reference.
- Treat this folder as a candidate fork.
- Do not update `docs/DESIGN_DOCUMENT_MAP.md` until this pack is promoted.
- Do not change `DESIGN.md`, `.impeccable.md`, or `globals.css` for this Phase 1
  candidate setup.
- Do not delete candidate modules.
- Keep existing QA and prototype-system documents available as inherited
  evidence.
