# V1 Reviews API

## Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/reviews` | user | `tab?`, `cursor?`, `limit?` | pending or written review cursor list |
| `GET` | `/api/v1/reviews/received` | user | `cursor?`, `limit?` | received review cursor list |
| `GET` | `/api/v1/reviews/sources/:sourceType/:sourceId` | user participant/manager | path id | review source, target candidates, existing submit state |
| `POST` | `/api/v1/reviews` | user participant/manager | `SubmitReviewDto` | submitted review result |

## DTO Highlights

`ListReviewsQueryDto`:

- `tab?: "pending" | "written"`
- `cursor?: string`
- `limit?: number`, cursor-list limit

`ReviewSourceParamsDto`:

- `sourceType: "match" | "team_match"`
- `sourceId: uuid`

`SubmitReviewDto`:

- `sourceType: "match" | "team_match"`
- `sourceId: uuid`
- `targetType: "user" | "team"`
- `targetUserId?: uuid`
- `targetTeamId?: uuid`
- `reviewerTeamId?: uuid`
- `rating: number`
- `tagCodes?: string[]`
- `comment?: string | null`

## State And Permissions

- Personal match reviews are available only after the source match is completed or has a completed timestamp.
- Personal match reviewers must be eligible participants and cannot review themselves.
- Team match reviews are available to owner/manager users of a participating team after a team match is completed.
- Team review target is the opposing team, not an individual user.
- Duplicate submitted reviews must surface the server conflict state; UI must not treat duplicate submit as a fresh success.
- Received reviews aggregate reviews targeting the current user and reviews targeting teams the current user manages.

Primary tables:

- `v1_post_event_reviews`
- `v1_post_event_review_tags`
- `v1_user_reputation_summaries`
- `v1_team_trust_scores`
- source domain tables for matches, team matches, participants, and team memberships
