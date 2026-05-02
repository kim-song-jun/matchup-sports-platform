# Comparison With 2026-04-25 Handoff

## Summary

`handoff-sm-new-direction` is a candidate fork of
`handoff-2026-04-25`.

The visual grammar is mostly kept. The product priority and module grouping are
changed.

## Current Priority Override

Compared with the previous `handoff-sm-new-direction` snapshot, mercenary is no
longer a core module. It is now candidate priority `C07`.

```text
Previous candidate snapshot:
Core included 05 Mercenary.

Current candidate snapshot:
Core excludes Mercenary.
Core adds 05 Team browse / discovery.
Candidate includes C07 Mercenary.
```

The M08 route, board, canonical id, and component evidence remains available;
only its priority group changes.
The new `05 · 팀 둘러보기` section is added directly after the existing team
matching material so the original team matching reference and the new all-team
browse direction can be compared.

## Keep

- Existing source pack as historical reference.
- `00 · Toss DNA` as primitive grammar.
- `00b~00h` as the strongest shell references.
- Light-only consumer prototype.
- Admin desktop dark-sidebar exception.
- `#3182f6` as the primary interaction accent.
- White-first, restrained, Toss-like interface language.
- Tabular numeric treatment for money, stats, and KPIs.
- Bottom navigation contract and alias rules from the prototype-system docs.
- Route ownership, token alignment, component extraction, and production handoff
  documents as inherited evidence.
- Full candidate modules and their existing assets, states, and QA documents.

## Reorder

The functional module priority changes from the current broad `01~19` module
sequence into:

```text
Core:
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

Candidate:
C01 레슨
C02 장터
C03 시설
C04 대회
C05 장비 대여
C06 종목/실력/안전
C07 용병
```

This reorder is applied inside the candidate pack's rendered HTML. The original
`handoff-2026-04-25` pack is unchanged.

## Candidate

The following modules move to candidate priority:

- lessons
- marketplace
- venues
- tournaments
- equipment rental
- sports/skill/safety
- mercenary

These modules remain useful references because they already include:

- list/detail/create flows
- transaction and order states
- booking or scheduling patterns
- desktop variants
- state and edge coverage
- mock visual assets

They should be evaluated for product scope before implementation priority is
assigned.

## Deferred

The following work is deferred beyond Phase 1:

- moving JSX exports or board internals
- changing canonical ids
- changing real app routes
- changing production components
- updating `docs/DESIGN_DOCUMENT_MAP.md`
- promoting this candidate to canonical status
- running browser QA for a modified rendered prototype

## Open Questions

- Should lessons remain a top-level service in the immediate product direction,
  or stay as candidate until the business scope is re-confirmed?
- Should marketplace and equipment rental be treated as one commerce family or
  separate candidate modules?
- Should venues stay browse/review/admin-only, or should venue owner/operator
  flows be designed later with a separate permission model?
- Should tournaments be a near-term vertical or a future structured-play
  extension?
- Which core route family should be migrated first if this candidate direction
  is promoted: personal matches, teams/team matching, or community?
- What QA threshold is required before the candidate pack can be referenced by
  production migration work?

## Non-Changes

This candidate does not change the current canonical rule order:

1. `DESIGN.md`
2. `.impeccable.md`
3. `apps/web/src/app/globals.css`

It also does not modify the original `handoff-2026-04-25` source pack.
