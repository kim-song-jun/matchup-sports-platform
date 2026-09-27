# Task 149 — Promotion consumed-Changeset history

## Problem

The dev-to-main gate used only the final tree diff. A Changeset added after the
production base and deleted by the release commit exists in neither endpoint,
so the gate incorrectly reported that a valid release had no consumed
Changesets.

## Acceptance criteria

- [x] Promotion checks retain deleted Changeset paths from commit history.
- [x] Ordinary PR and dev-push change detection remains tree-diff based.
- [x] Duplicate paths are normalized before policy evaluation.
- [x] A contract test prevents removal of the history receipt.
