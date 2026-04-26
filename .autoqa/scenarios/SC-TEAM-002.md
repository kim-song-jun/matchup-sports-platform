# SC-TEAM-002 — Member self-leave flow and members surface sync

| key | value |
|---|---|
| Scope | core |
| Personas | team-member |
| Source | apps/web/src/app/(main)/teams/[id]/members/page.tsx |
| Landing route | - |
| Write path | yes |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/my/teams |
| STEP-02 | click | selector=[data-testid^='my-team-members-'] |
| STEP-03 | wait_url | pattern=/teams/[^/]+/members(?:\?.*)?$ |
| STEP-04 | assert_dom | - |
| STEP-05 | click | selector=[data-testid='team-member-leave-self'] |
| STEP-06 | click | selector=button.bg-red-500 |
| STEP-07 | wait_url | pattern=/my/teams(?:\?.*)?$ |
| STEP-08 | db_checkpoint | db=target_row |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
