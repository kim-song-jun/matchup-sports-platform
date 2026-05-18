# V1 Home, Search, Notices, Master API

## Implemented Endpoints

| Method | Path | Auth | Query | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/health` | public | none | runtime health |
| `GET` | `/api/v1/master/sports` | public | none | sports and levels |
| `GET` | `/api/v1/master/regions` | public | none | region tree/list |
| `GET` | `/api/v1/home` | optional user | `sportId?`, `regionId?` | home aggregate |
| `GET` | `/api/v1/home/recommendations` | optional user | `sportId?`, `regionId?`, `limit?` max 20 | recommendation list |
| `GET` | `/api/v1/notices` | public | service-defined list filters | published notice list |
| `GET` | `/api/v1/notices/:noticeId` | public/user by notice visibility | path id | notice detail |

## Contract Notes

- Home can personalize when optional v1 auth headers are present.
- Notice reads do not create read-state rows and must not be treated like notifications.
- Only published notices are user-facing. Draft/archived notices stay hidden.
- Master data is read-only in v1 user APIs.

## Pending From Frozen Contract

- `GET /api/v1/search` is frozen as unified search, but no controller exists yet. Current search route scaffolds in `apps/v1_web` must either call domain lists directly or stay mocked until the v1 search API is implemented.

## Primary Tables

- `v1_sports`
- `v1_sport_levels`
- `v1_regions`
- `v1_notices`
- `v1_matches`
- `v1_teams`
- `v1_team_matches`
- `v1_notifications`
