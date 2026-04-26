# SC-LOGIN-TEAM-MEMBER — Team-member dev-login storageState bootstrap

| key | value |
|---|---|
| URL | /login -> /home |
| Personas | __bootstrap__ |
| Scope | minimal |
| Task refs | docs/scenarios/04-team-and-membership.md; .github/tasks/61b-scenarios-match-team.md |
| Source | `apps/web/src/app/(auth)/login/page.tsx` |
| Landing route | /home |

## Steps

| # | action | target / selector | expect | shot |
|---|---|---|---|---|
| STEP-01 | navigate | /login | login shell renders | STEP-01 |
| STEP-02 | type | `[data-testid='dev-login-input'] = ${AUTOQA_TEAM_MEMBER_LABEL}` | persona label populated | STEP-02 |
| STEP-03 | click | `[data-testid='dev-login-submit']` | form submits | STEP-03 |
| STEP-04 | wait_url | `/home(?:\\?|$)` | authenticated redirect succeeds | STEP-04 |
| STEP-05 | export_storage_state | `.autoqa/cookies/team-member.json` | storage state saved | STEP-05 |

## Verification matrix

| case | persona | viewport | theme | state | action | expect |
|---|---|---|---|---|---|---|
| C01 | __bootstrap__ | desktop.lg | light | dev-login-visible | bootstrap team-member | storageState capture succeeds for `${AUTOQA_TEAM_MEMBER_LABEL}` |
| C02 | __bootstrap__ | desktop.lg | light | seed-rotated | fail-fast | operator updates the env label to the current seeded nickname |

## DB truth

| key | value |
|---|---|
| write flow | no |
| db step | - |
| db_verify_level | not_required |
| tables | - |
| target query | - |

## Feature gap candidates

- Team-member bootstrap must stay aligned with the seeded membership used by leave-team flows.
- A valid storage state does not guarantee the persona still has an active team membership after destructive runs.
