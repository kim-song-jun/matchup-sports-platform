# Run Ledger

실행한 runner와 visual audit run-id를 추적한다.

| Date | Lane | Runtime RUN | Visual RUN | Scope | Bases | Result | Notes |
|---|---|---|---|---|---|---|---|
| 2026-04-11 | legacy | N/A | `task50-batch1-all9-r3` | `batch-1-public-auth` | shared-era | usable | `138 captured`, `0 blocked`, `9 viewport` |
| 2026-04-11 | legacy | N/A | `task50-batch2-all9-r5` | `batch-2-main-discovery` | shared-era | usable | `261 captured`, `0 blocked`, `9 viewport` |
| 2026-04-11 | legacy | N/A | `task50-batch3-all9-r4` | `batch-3-detail-pages` | shared-era | partial | `177 captured`, `7 blocked` |
| 2026-04-11 | legacy | N/A | `task50-batch3-membersfix-all9-r1` | `/teams/[id]/members` fix patch | shared-era | usable | targeted completion patch |
| 2026-04-11 | legacy | N/A | `task50-batch3-venuefix-all9-r1` | `/venues/[id]` fix patch | shared-era | usable | targeted completion patch |
| 2026-04-12 | legacy | N/A | `v2-batch4-rerun` | `batch-4-create-edit-forms` | shared-era | partial | `mobile-md + desktop-md`, `70 captured`, `1 blocked` |
| 2026-04-12 | legacy | N/A | `v2-batch5-full` | `batch-5-account-utility` | shared-era | partial | `mobile-md + desktop-md`, `60 captured`, `1 blocked` |
| 2026-04-12 | legacy | N/A | `v2-batch5-tablet` | `batch-5-account-utility` tablet | shared-era | partial | `66 captured`, `21 blocked` |
| 2026-04-12 | legacy | N/A | `v2-batch6-r2` | `batch-6-admin` | shared-era | partial | `mobile-md + desktop-md`, `46 captured`, `0 blocked` |
| 2026-04-12 | legacy | N/A | `v2-batch7-interactions` | `batch-7-interactions` | shared-era | partial | `165 captured`, `2 blocked` |
| 2026-04-12 | legacy | N/A | `v2-minor-fix-1` | `/teams/[id]/edit` post-fix | shared-era | usable | modified-page validation evidence |
| 2026-04-12 | legacy | N/A | `v2-minor-fix-2` | `/profile` post-fix | shared-era | usable | modified-page validation evidence |
| 2026-04-12 | A | `ultra-a-mobile` | `va-b2-mobile-20260412` | `batch-2-main-discovery` | isolated | planned | next lane start |
| 2026-04-12 | B | `ultra-b-mobile` | `va-b3-mobile-20260412` | `batch-3-detail-pages` | isolated | planned | next lane start |
| 2026-04-12 | B | `ultra-b-mobile` | `va-b4-mobile-20260412` | `batch-4-create-edit-forms` | isolated | planned | next lane start |
| 2026-04-12 | C | `ultra-c-mobile` | `va-b5-mobile-20260412` | `batch-5-account-utility` | isolated | planned | next lane start |

## Result Labels

- `planned`
- `running`
- `captured`
- `partial`
- `blocked`
- `rerun-needed`
- `closed`
