# SC-MATCH-001 — Create a match and verify list-detail persistence

| key | value |
|---|---|
| Scope | core |
| Personas | sinaro |
| Source | apps/web/src/app/(main)/matches/new/page.tsx |
| Landing route | /matches/${scenario.variables.new_match_id} |
| Write path | yes |

## Steps

| step | action | details |
|---|---|---|
| STEP-01 | navigate | target=/matches/new |
| STEP-02 | click | selector=[data-testid='match-sport-futsal'] |
| STEP-03 | click | selector=[data-testid='match-create-next-sport'] |
| STEP-04 | type | selector=#match-title<br />value=AUTOQA Match Core |
| STEP-05 | type | selector=#match-description<br />value=Autoqa generated match scenario. |
| STEP-06 | type | selector=#match-maxPlayers<br />value=10 |
| STEP-07 | type | selector=#match-fee<br />value=0 |
| STEP-08 | click | selector=[data-testid='match-create-next-info'] |
| STEP-09 | click | selector=[data-testid^='match-venue-'] |
| STEP-10 | type | selector=#match-date<br />value=2099-12-31 |
| STEP-11 | type | selector=#match-startTime<br />value=18:00 |
| STEP-12 | type | selector=#match-endTime<br />value=20:00 |
| STEP-13 | click | selector=[data-testid='match-create-next-schedule'] |
| STEP-14 | click | selector=[data-testid='match-create-submit'] |
| STEP-15 | wait_url | pattern=/matches\?created=true |
| STEP-16 | db_checkpoint | db=target_row |

## Notes

- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.
