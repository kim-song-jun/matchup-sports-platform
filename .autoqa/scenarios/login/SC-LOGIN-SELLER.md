# SC-LOGIN-SELLER — Seller dev-login storageState bootstrap

| key | value |
|---|---|
| URL | /login -> /home |
| Personas | __bootstrap__ |
| Scope | minimal |
| Task refs | docs/scenarios/08-marketplace-and-lessons.md; .github/tasks/61c-scenarios-lesson-market-mercenary-venue.md |
| Source | `apps/web/src/app/(auth)/login/page.tsx` |
| Landing route | /home |

## Steps

| # | action | target / selector | expect | shot |
|---|---|---|---|---|
| STEP-01 | navigate | /login | login shell renders | STEP-01 |
| STEP-02 | type | `[data-testid='dev-login-input'] = ${AUTOQA_SELLER_LABEL}` | persona label populated | STEP-02 |
| STEP-03 | click | `[data-testid='dev-login-submit']` | form submits | STEP-03 |
| STEP-04 | wait_url | `/home(?:\\?|$)` | authenticated redirect succeeds | STEP-04 |
| STEP-05 | export_storage_state | `.autoqa/cookies/seller.json` | storage state saved | STEP-05 |

## Verification matrix

| case | persona | viewport | theme | state | action | expect |
|---|---|---|---|---|---|---|
| C01 | __bootstrap__ | desktop.lg | light | dev-login-visible | bootstrap seller | storageState capture succeeds for `${AUTOQA_SELLER_LABEL}` |
| C02 | __bootstrap__ | desktop.lg | light | backend-cold | retry once | seller redirect completes after API health settles |

## DB truth

| key | value |
|---|---|
| write flow | no |
| db step | - |
| db_verify_level | not_required |
| tables | - |
| target query | - |

## Feature gap candidates

- Seller login is only the bootstrap prerequisite for marketplace write surfaces.
- If this scenario alone fails, check the seller seed nickname before changing auth logic.
