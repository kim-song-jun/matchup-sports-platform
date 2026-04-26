# SC-{AREA}-{NNN} — {short description}

| key | value |
|---|---|
| URL | /path -> /landing |
| Personas | guest |
| Scope | core |
| Task refs | docs/scenarios/*.md; .github/tasks/*.md |
| Source | apps/web/src/app/... |
| Landing route | /optional/post-write/path |

## Steps

| # | action | target / selector | expect | shot |
|---|---|---|---|---|
| STEP-01 | navigate | /path | route resolves | STEP-01 |

## Verification matrix

| case | persona | viewport | theme | state | action | expect |
|---|---|---|---|---|---|---|
| C01 | guest | desktop.lg | light | idle | navigate | shell renders |
| C02 | guest | mobile.lg | dark | error | retry | fallback stays coherent |

## DB truth

| key | value |
|---|---|
| write flow | no / yes |
| db step | STEP-xx |
| db_verify_level | not_required / count / target_row / relational |
| tables | users, matches |
| target query | summary only, keep SQL in oracle |

## Feature gap candidates

- Missing selector / dynamic id dependency
- Runtime blocker / seed dependency
