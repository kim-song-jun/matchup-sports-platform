# SC-ADMIN-001 — Admin dashboard, honest-data pages, and venue create shell

| key | value |
|---|---|
| Scope | core |
| Personas | admin |
| Source | apps/web/src/app/admin/dashboard/page.tsx |
| Landing route | /admin/venues |
| Write path | yes |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/admin/dashboard |
| STEP-02 | screenshot | - |
| STEP-03 | navigate | target=/admin/users |
| STEP-04 | navigate | target=/admin/disputes |
| STEP-05 | navigate | target=/admin/venues/new |
| STEP-06 | type | selector=#admin-venue-new-name<br />value=AUTOQA Venue Core |
| STEP-07 | type | selector=#admin-venue-new-address<br />value=서울시 마포구 테스트로 1 |
| STEP-08 | type | selector=#admin-venue-new-city<br />value=서울 |
| STEP-09 | type | selector=#admin-venue-new-district<br />value=마포구 |
| STEP-10 | type | selector=#admin-venue-new-price<br />value=50000 |
| STEP-11 | click | selector=button.bg-blue-500 |
| STEP-12 | db_checkpoint | db=target_row |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
