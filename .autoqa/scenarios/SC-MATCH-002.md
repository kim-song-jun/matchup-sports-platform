# SC-MATCH-002 — Match discovery filters and detail shell

| key | value |
|---|---|
| Scope | core |
| Personas | team-owner |
| Source | apps/web/src/app/(main)/matches/matches-client.tsx |
| Landing route | - |
| Write path | no |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/matches |
| STEP-02 | type | selector=[data-testid='match-search-input']<br />value=풋살 |
| STEP-03 | click | selector=[data-testid='match-filter-toggle'] |
| STEP-04 | click | selector=[data-testid='match-quick-free'] |
| STEP-05 | screenshot | - |
| STEP-06 | click | selector=a[href^='/matches/'] |
| STEP-07 | wait_url | pattern=/matches/[^/]+$ |
| STEP-08 | assert_dom | - |
| STEP-09 | assert_no_console_errors | - |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
