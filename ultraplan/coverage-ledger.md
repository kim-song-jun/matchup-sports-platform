# Coverage Ledger

기존 artifact 재사용 여부와 재촬영 범위를 기록한다.

| Batch | Current status | Reusable runs | Gaps | Next action |
|---|---|---|---|---|
| batch-1-public-auth | `usable` | `task50-batch1-all9-r3` | QC 재판정만 남음 | baseline으로 고정 |
| batch-2-main-discovery | `usable` | `task50-batch2-all9-r5` | family-level QC와 post-fix rerun 필요 | baseline으로 고정 후 review |
| batch-3-detail-pages | `partial` | `task50-batch3-all9-r4`, `task50-batch3-membersfix-all9-r1`, `task50-batch3-venuefix-all9-r1` | main run에 blocked `7` 남음 | selective rerun priority 1 |
| batch-4-create-edit-forms | `partial` | `v2-batch4-rerun`, `task50-batch4-all9-r4`, `task50-batch4-mobile-r6`, `task50-batch4-desktop-r6`, `task50-batch4-tablet-r6` | 9 viewport 불완전, blocked 다수 | recapture priority 1 |
| batch-5-account-utility | `partial` | `v2-batch5-full`, `v2-batch5-tablet` | ext band 미완료, blocked 잔존 | selective recapture priority 2 |
| batch-6-admin | `partial` | `v2-batch6-r2` | full route set/extra band 미완료 | selective recapture priority 3 |
| batch-7-interactions | `partial` | `v2-batch7-interactions`, `v2-interactions-discovery`, `v2-minor-fix-1`, `v2-minor-fix-2` | account/detail/admin interaction gap | targeted sweep priority 2 |
| batch-8-rerun | `on-demand` | N/A | blocker cleanup 전용 | lane별 필요 시 실행 |

## Batch Evidence Notes

### Reuse

- `batch-1-public-auth`
  - `task50-batch1-all9-r3`
  - `6 routes`, `9 viewport`, `138 captured`, `0 blocked`, `60 expected-na`
- `batch-2-main-discovery`
  - `task50-batch2-all9-r5`
  - `10 routes`, `9 viewport`, `261 captured`, `0 blocked`, `81 expected-na`

### Partial

- `batch-3-detail-pages`
  - `task50-batch3-all9-r4`
  - `14 routes`, `9 viewport`, `177 captured`, `7 blocked`, `68 expected-na`
  - patch fix evidence:
    - `task50-batch3-membersfix-all9-r1`
    - `task50-batch3-venuefix-all9-r1`
- `batch-4-create-edit-forms`
  - strongest reusable run: `v2-batch4-rerun`
  - `14 routes`, `mobile-md + desktop-md`, `70 captured`, `1 blocked`, `13 expected-na`
  - supporting band runs:
    - `task50-batch4-mobile-r6`
    - `task50-batch4-tablet-r6`
    - `task50-batch4-desktop-r6`
- `batch-5-account-utility`
  - `v2-batch5-full`
  - `21 routes`, `mobile-md + desktop-md`, `60 captured`, `1 blocked`, `27 expected-na`
  - tablet support:
    - `v2-batch5-tablet`
    - `66 captured`, `21 blocked`, `45 expected-na`
- `batch-6-admin`
  - `v2-batch6-r2`
  - `15 resolved admin routes`, `mobile-md + desktop-md`, `46 captured`, `0 blocked`, `16 expected-na`
- `batch-7-interactions`
  - `v2-batch7-interactions`
  - `31 routes`, `mobile-md + desktop-md`, `165 captured`, `2 blocked`, `45 expected-na`
  - targeted support:
    - `v2-interactions-discovery`
    - `v2-minor-fix-1`
    - `v2-minor-fix-2`

### Discard / Reference Only

- manifest-only or non-screenshot runs
  - `task50-all-manifest`
  - `task50-full-manifest*`
  - `visual-full`
  - `infra-dev-audit-check`
- smoke/reference-only runs
  - `task50-smoke*`
  - `visual-smoke`

## Component Catalog

### Reuse

- catalog results file
  - `output/playwright/component-catalog/catalog-results.json`
- successful captures
  - `BottomNav/mobile-md`
  - `BottomNav/desktop-md`
  - `MatchCard/desktop-md`
  - `TeamCard/desktop-md`
  - `MarketplaceCard/desktop-md`
  - `ProfileSummary/desktop-md`
  - `Badge/desktop-md`

### Gaps

- current helper scope: `12` entries x `2` viewport
- actual successful coverage: `6` component families
- missing priority targets
  - `EmptyState`
  - `MobileGlassHeader`
  - `ButtonPrimary`
  - `InputText`
  - `LessonCard`
  - `FilterBar`

## Asset Inventory

### Reuse

- `output/playwright/asset-inventory/inventory.json`
  - inventory-only baseline으로 재사용 가능

### Gaps

- representative render evidence: `0 captured`
- failed target groups:
  - `sport-icons`
  - `badge-icons`
  - `match-thumbnails`
  - `profile-avatars`
- asset layer는 inventory는 존재하지만, rendered evidence는 아직 Stage 0 baseline으로 쓸 수 없다.

## Notes

- `usable`: 그대로 QC와 report에 써도 되는 artifact
- `partial`: 일부 viewport/state만 usable
- `discard`: baseline으로 쓰기 어려운 artifact
