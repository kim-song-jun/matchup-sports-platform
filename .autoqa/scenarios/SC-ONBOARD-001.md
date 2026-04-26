# SC-ONBOARD-001 — Onboarding step shell and skip redirect

| key | value |
|---|---|
| Scope | core |
| Personas | sinaro |
| Source | apps/web/src/app/(main)/onboarding/page.tsx |
| Landing route | - |
| Write path | no |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/onboarding |
| STEP-02 | screenshot | - |
| STEP-03 | click | selector=button[aria-label='온보딩 건너뛰기'] |
| STEP-04 | wait_url | pattern=/home(?:\?|$) |
| STEP-05 | assert_no_console_errors | - |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
