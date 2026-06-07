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
| `GET` | `/api/v1/search/recent` | optional user or `x-v1-search-session-id` | `limit?` max 20 | recent search history |
| `POST` | `/api/v1/search/recent` | optional user or `x-v1-search-session-id` | `{ query: string; filters?: object }` | recorded search item |

## Contract Notes

- Home can personalize when optional v1 auth headers are present.
- Notice reads do not create read-state rows and must not be treated like notifications.
- Only published notices are user-facing. Draft/archived notices stay hidden.
- Master data is read-only in v1 user APIs.
- Recent search history is identity-scoped. Authenticated users are keyed by v1 user id; guests must provide `x-v1-search-session-id`.
- Search history does not imply unified search results. Result pages should still call the relevant domain list APIs such as matches, teams, or team matches.

## Pending From Frozen Contract

- `GET /api/v1/search` is frozen as unified search, but no controller exists yet. Current web and native search result surfaces must either call domain lists directly or stay explicitly unavailable until the unified v1 search API is implemented.

## Primary Tables

- `v1_sports`
- `v1_sport_levels`
- `v1_regions`
- `v1_notices`
- `v1_matches`
- `v1_teams`
- `v1_team_matches`
- `v1_notifications`
- `v1_search_history`
