# Task 138 — My tournament staff fixture status

## Context

`/my/tournament-staff/[tournamentId]` lists assigned fixtures without a quickly scannable game state.

## Goal

Show the existing tournament-operations status badge on every assigned fixture row.

## Acceptance Criteria

- [x] `scheduled → 예정`, `in_progress → 진행 중`, `completed → 종료`, `cancelled → 취소됨`.
- [x] State uses color, icon, and text rather than color alone.
- [x] Unknown server values surface as `상태 확인 필요`.
- [x] Existing filtering and operation-console links remain unchanged.
- [x] Focused frontend tests pass.

## Scope

- Owned: My Page assigned-fixture row, shared tournament operations badge adapter, focused test, changeset.
- Out of scope: backend, permissions, fixture mutations, unrelated tournament screens.

## Security Notes

No new data, route, permission, or mutation surface is introduced.

## Progress Snapshot

- 2026-08-14: Public fixture statuses are explicitly adapted to the shared operations state vocabulary.
