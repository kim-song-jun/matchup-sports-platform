# Task 112: V1 Desktop Chat Workspace

## Status

- Target: frontend
- Mode: CODE in progress
- Scope: `apps/v1_web` chat routes only

## Problem

- Desktop `/chat` renders as a single centered list instead of the design contract's persistent room-list and thread workspace.
- Opening `/chat/:id` replaces the list, so users cannot keep context or select another room from the same desktop screen.
- Mobile swipe handlers are attached to desktop room links even though desktop swipe actions are hidden.

## Requirements

- Keep the current mobile list and room layouts unchanged below 1024px.
- At 1024px and wider, render a fixed two-column chat workspace inside the existing desktop app shell.
- Keep the room list visible on both `/chat` and `/chat/:id`.
- Highlight the selected room and expose `aria-current="page"` on its link.
- Let room links navigate reliably on desktop without entering the mobile swipe gesture path.
- Let an opened mobile swipe row close again by dragging right, including from the revealed action area.
- Keep pin/unpin available as an explicit trailing action on desktop.
- On `/chat`, show an honest empty-selection prompt in the thread pane.

## Acceptance Criteria

- Given a desktop user opens `/chat`, when the page renders, then the room list is on the left and a room-selection prompt is on the right.
- Given a desktop user selects a room, when navigation completes, then the same list remains visible, the selected row is highlighted, and the room thread renders on the right.
- Given a desktop user selects another room, when navigation completes, then the right pane changes to that room without losing the list workspace.
- Given a mobile user opens `/chat` or `/chat/:id`, then the existing single-pane mobile flow and swipe actions remain available.

- Given a mobile user reveals a room action, when they drag the row or revealed action area right, then the row closes.
- Given a desktop user views a room row, then they can pin or unpin it without using a swipe gesture.

## Validation

- `pnpm --filter v1_web test`
- `pnpm --filter v1_web lint`
- Browser QA at desktop, tablet, and mobile viewports with console/network inspection.

## Progress Snapshot

- Task created from the reported desktop chat list/selection regression.
- Added a shared chat-list view model so the room route can keep the real room list mounted beside the thread.
- Added the desktop master-detail workspace, selected-row state, and empty-selection prompt.
- Disabled the mobile swipe gesture path at desktop widths.
- Removed fake fallback chat rooms from loading/error states so only API-backed room IDs can be selected.
- Matched the mobile swipe track to the single 72px action and allowed right-dragging from the revealed action.
- Added an always-visible desktop pin/unpin action with an accessible label and selected state.
- Locked each desktop room row to a flexible, truncating content region plus a non-shrinking 56px pin action.
- Forced desktop rows to clear any inline mobile swipe transform after a viewport transition.
- Full v1 Web typecheck, 113 unit tests, pattern check, and `NODE_ENV=production` build pass.
- Browser screenshot QA remains pending because the current Playwright Chromium executable is unavailable.
