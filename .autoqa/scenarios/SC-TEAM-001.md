# SC-TEAM-001 — Team creation shell and my-team management surface

| key | value |
|---|---|
| Scope | core |
| Personas | team-owner |
| Source | apps/web/src/app/(main)/teams/new/page.tsx |
| Landing route | - |
| Write path | no |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/teams/new |
| STEP-02 | assert_dom | - |
| STEP-03 | navigate | target=/my/teams |
| STEP-04 | assert_dom | - |
| STEP-05 | assert_no_console_errors | - |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
