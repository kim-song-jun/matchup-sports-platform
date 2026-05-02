# Handoff SM New Direction

## Purpose

This document defines the service-priority direction for the
`handoff-sm-new-direction` candidate pack.

It is not a canonical design rule document. Canonical design rules still live in
`DESIGN.md`.

## Direction Status

```text
Decision status: candidate
Canonical status: not canonical
Implementation status: reference only
```

## Current Priority Override

This section supersedes the older module lists below for the current
`handoff-sm-new-direction` candidate snapshot.

```text
Core:
01 Auth / onboarding
02 Home / recommendations
03 Personal matches
04 Teams / team matching
05 Team browse / discovery
06 Community / chat / notifications
07 My / profile / reputation
08 Payments / refunds / disputes
09 Settings / legal / status
10 Public / marketing
11 Desktop web
12 Admin / operations
13 Common flows / interactions

Candidate:
C01 Lessons
C02 Marketplace
C03 Venues
C04 Tournaments
C05 Equipment rental
C06 Sports / skill / safety
C07 Mercenary
```

Comparison note:

- Previous candidate snapshot placed mercenary in core as `05`.
- Current candidate snapshot moves mercenary to candidate priority as `C07`.
- Current `05` is now a team browse/discovery comparison section for viewing,
  comparing, and selecting teams before joining or entering team matching.
- Existing M08 ids, artboard ids, and component exports stay unchanged so QA and
  prototype mount points remain stable.

## Preserve

The candidate keeps the strongest parts of the 2026-04-25 handoff:

- `00 · Toss DNA` primitive grammar
- `00b~00h` shell patterns
- light-only consumer prototype
- Admin desktop dark-sidebar exception
- white-first surfaces
- restrained `#3182f6` interaction accent
- tabular numeric grammar for money, stats, and KPIs
- mobile-first interaction flow
- desktop workspace layout instead of stretched mobile layouts
- shared state, edge, motion, and QA coverage model
- canonical id practices from the `fix29~fix32` prototype system

## Keep Global Shell

The global shell remains aligned with the existing prototype and source
contract:

- bottom navigation canonical tabs:
  - `home`
  - `matches`
  - `teams`
  - `marketplace`
  - `more`
- `more` owns contextual entry points such as lessons, venues, mercenary,
  tournaments, chat, notifications, settings, profile, payments, reviews, and
  badges.
- Desktop consumer surfaces use workspace structure:
  - restrained KPI band
  - filters or rail when useful
  - main results/work area
  - optional sticky side summary
- Admin surfaces use dense operational grammar:
  - KPI row
  - table/detail tools
  - auditability
  - partial-failure visibility

## Core Modules

These modules form the first-priority service direction.

```text
01 인증/온보딩
02 홈/추천
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
```

### Core Rationale

- Authentication, onboarding, home, matches, and teams are the
  highest-frequency participation surfaces.
- Team browse stays in core because team matching needs a preceding discovery
  surface where users can compare teams, inspect trust signals, and choose a
  team before applying or matching.
- Community, chat, notifications, my/profile, and reputation are retention and
  activity surfaces.
- Payments, refunds, and disputes need honest transaction grammar and clear
  failure states.
- Settings, legal, public, desktop, admin, and common flows provide the platform
  shell and operational foundation.

## Candidate Modules

These modules remain inside the candidate pack for evaluation but are lower
priority than the core set.

```text
C01 레슨
C02 장터
C03 시설
C04 대회
C05 장비 대여
C06 종목/실력/안전
C07 용병
```

### Candidate Rationale

Candidate modules are preserved because the existing handoff has useful
coverage, states, assets, and transaction patterns for them.

They are separated so the team can decide whether each belongs in the immediate
product scope, later product scope, or reference-only backlog.

Candidate does not mean deleted.

## Priority Changes From 2026-04-25

- Mercenary moves from the core path to candidate priority.
- Sports/skill/safety moves to candidate priority until the product scope for sport-specific verification and safety checks is re-confirmed.
- Community/chat/notifications remain core because activity and late-connect
  state are platform-wide concerns.
- Payments/refunds/disputes stay core because transaction honesty is mandatory
  even when payment integration is optional or mock-mode.
- Lessons, marketplace, venues, tournaments, and rental move into candidate
  priority until product scope is re-confirmed.

## Design Principles To Keep

- Keep utility surfaces quiet, white-first, and action-first.
- Use blue as interaction accent, not decorative primary color.
- Prefer lists, rows, grouped history, and structured detail over decorative
  card showcases.
- Avoid deep shadows, heavy borders, content-wide blur, and gradient spectacle.
- Use production truth gates for trust, payment, refund, review, and reputation
  claims.
- Preserve state coverage for empty, loading, error, success, disabled, pending,
  deadline, sold out, and permission denied.
- Preserve mobile/tablet/desktop coverage expectations where the prototype
  already provides them.

## Phase 1 Boundary

Phase 1 defines this direction in documents only.

It does not rewrite the rendered prototype or production app.

## Phase 2 Direction

Phase 2 reorders the candidate pack's rendered prototype into the new priority
sequence while keeping canonical ids and exports stable.

Applied scope:

- `sports-platform/project/Teameet Design.html` top-level `DCSection` blocks were
  reordered inside this candidate pack.
- Core modules now appear before candidate modules.
- Matching `m{NN}-grid` viewport sections are placed next to their owning module.
- Candidate modules are labeled `C01~C05` in the rendered section title.
- Existing section ids, artboard ids, `data-canonical-id` aliases, and component
  export names were preserved.

Phase 2a home rule:

- When redesigning a numbered core module, keep the original section in place and
  add a same-number comparison section directly below it.
- For module `02`, `02 · 홈 · 추천` remains as the original reference and
  `02 · 홈 · Toss canonical` copies the existing `홈 · Toss canonical` board as
  the mobile-first baseline.
- The `02 · 홈 · Toss canonical` section documents the UI rules and flow that
  match the existing `HomeToss` design before the M02 grid is rewritten.

Out of scope:

- production app code
- source `handoff-2026-04-25`
- `DESIGN.md`
- `.impeccable.md`
- `apps/web/src/app/globals.css`
- `docs/DESIGN_DOCUMENT_MAP.md`
