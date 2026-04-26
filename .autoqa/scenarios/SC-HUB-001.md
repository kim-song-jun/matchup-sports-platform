# SC-HUB-001 — Venue-team hub shell and tournament create flow

| key | value |
|---|---|
| Scope | core |
| Personas | team-owner |
| Source | apps/web/src/app/(main)/tournaments/new/page.tsx |
| Landing route | /tournaments/${scenario.variables.new_tournament_id} |
| Write path | yes |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/venues |
| STEP-02 | screenshot | - |
| STEP-03 | navigate | target=/tournaments |
| STEP-04 | navigate | target=/tournaments/new |
| STEP-05 | type | selector=#tournament-title<br />value=AUTOQA Tournament Core |
| STEP-06 | type | selector=#tournament-date<br />value=2099-12-31 |
| STEP-07 | type | selector=#tournament-fee<br />value=0 |
| STEP-08 | type | selector=#tournament-description<br />value=Autoqa tournament scenario. |
| STEP-09 | click | selector=button.bg-blue-500 |
| STEP-10 | db_checkpoint | db=target_row |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
