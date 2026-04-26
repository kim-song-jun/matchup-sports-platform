# SC-CALLBACK-001 — OAuth callback error fallback routes stay recoverable

| key | value |
|---|---|
| Scope | core |
| Personas | guest |
| Source | apps/web/src/app/(auth)/callback/kakao/page.tsx |
| Landing route | - |
| Write path | no |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/callback/kakao?error=access_denied |
| STEP-02 | assert_dom | - |
| STEP-03 | navigate | target=/callback/naver?error=access_denied |
| STEP-04 | assert_dom | - |
| STEP-05 | assert_no_console_errors | - |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
