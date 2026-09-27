# Design QA Report - Fix11

## Scope

- Prototype URL: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix11`
- Prototype file: `sports-platform/project/Teameet Design.html`
- QA artifact: `output/playwright/teameet-design-fix11-full-qa.json`
- Screenshot: `output/playwright/teameet-design-fix11-token-qa-headless.png`

## Summary

`fix11` passes the current prototype QA gate.

| Check | Result |
|---|---:|
| rendered sections | `28` |
| rendered artboards | `163` |
| duplicate artboard ids | `0` |
| visible legacy/레거시 hits | `0` |
| rendered meta helper sections | `0` |
| bad artboard boxes | `0` |
| broken images | `0` |
| console errors | `0` |
| failed network requests | `0` |
| console warnings | expected Babel standalone warning only |

## Token Sanity

Runtime CSS variables resolved correctly:

- `--blue500`: `#3182f6`
- `--grey900`: `#191f28`
- `--grey100`: `#f2f4f6`
- `--bg`: `#ffffff`
- `--border`: `#e5e8eb`
- `--orange50`: `#fff3e0`
- `--static-white`: `#ffffff`
- `--blue-alpha-10`: `rgba(49,130,246,.10)`

## Module Checks

Passed:

- `lessons` contains `lesson-academy-main`, `lesson-detail-v2`, `lesson-new`, `lesson-pass-list`, `lesson-pass-buy`, `coach-workspace`, desktop lesson boards.
- `marketplace` contains listing detail, listing create, order status, my listings, desktop marketplace.
- `venues` contains venue detail, booking, owner console, desktop venue boards.
- `teams-team-matches` contains attendance, score, evaluate, team captain tools.
- `community` contains chat list, chat room, notifications, feed, chat embed.
- `common-flows-motion` contains edit flow parity and micro interaction demo.

## Remaining Design Risk

This QA confirms structure and runtime integrity, not final visual selection.

Remaining work:

- visually review all 163 artboards for polish-level spacing and hierarchy.
- select canonical variants where multiple home/match/list variants remain.
- normalize remaining scrim/overlay colors if a variant becomes canonical.
- migrate selected patterns into production `apps/web`.

