# SC-MY-001 — My pages portfolio and dispute message write path

| key | value |
|---|---|
| Scope | core |
| Personas | sinaro |
| Source | apps/web/src/app/(main)/my/disputes/[id]/page.tsx |
| Landing route | - |
| Write path | yes |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/my/matches |
| STEP-02 | navigate | target=/my/teams |
| STEP-03 | navigate | target=/my/lessons |
| STEP-04 | navigate | target=/my/disputes |
| STEP-05 | click | selector=a[href^='/my/disputes/'] |
| STEP-06 | wait_url | pattern=/my/disputes/[^/]+$ |
| STEP-07 | type | selector=#dispute-reply-input<br />value=AUTOQA dispute reply |
| STEP-08 | click | selector=button[aria-label='메시지 보내기'] |
| STEP-09 | db_checkpoint | db=target_row |
| STEP-10 | assert_no_console_errors | - |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
