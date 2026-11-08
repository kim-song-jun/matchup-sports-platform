# Domain Contract — Ads (banner and popup campaigns)

Task: `.github/tasks/20261129-ad-campaign-requirements.md` (D01~D16). First release = banner and popup only; push is not part of it.

## Source Of Truth Priority

1. `apps/v1_api/src/ads/ads-public.controller.ts`, `apps/v1_api/src/ads/ads-admin.controller.ts`
2. `apps/v1_api/src/ads/dto/*.ts`
3. `apps/v1_api/src/ads/ads-public.service.ts`, `apps/v1_api/src/ads/ads-admin.service.ts`, `apps/v1_api/src/ads/ad-campaign.ts`
4. `apps/v1_api/prisma/schema.prisma` (`V1AdCampaign`, `V1AdCampaignDailyStat`, `V1ContentAsset.adCampaignId`)

Not related to `V1TournamentCampaign` / `V1TournamentSponsor`.

## Endpoint Matrix

| Method | Path | Auth | Body / Query | Response (`data`) |
|---|---|---|---|---|
| GET | `/api/v1/ads/active` | public | none | `{ banner: PublicAd \| null, popup: PublicAd \| null }` |
| POST | `/api/v1/ads/events` | public, throttled 30/min | `{ events: [{ campaignId, channel, type }] }` (1–20) | `204` no body |
| GET | `/api/v1/admin/ad-campaigns` | **owner only** | `status?`, `q?`, `page?` or `cursor?`, `limit?` (≤50) | `{ items, pageInfo, summary }` |
| GET | `/api/v1/admin/ad-campaigns/:campaignId` | owner only | path id | `{ campaign, stats }` |
| POST | `/api/v1/admin/ad-campaigns` | owner only | `SaveAdCampaign` | `{ campaign }` (draft, `version: 1`) |
| PUT | `/api/v1/admin/ad-campaigns/:campaignId` | owner only | `SaveAdCampaign` + `expectedVersion` | `{ campaign }` |
| POST | `/api/v1/admin/ad-campaigns/:campaignId/publish` | owner only | `{ expectedVersion }` | `{ campaign }` |
| POST | `/api/v1/admin/ad-campaigns/:campaignId/stop` | owner only | none | `{ campaign }` |

Images are uploaded first with `POST /api/v1/admin/content-assets` (see [home-notices-master](./home-notices-master.md)); the returned `/uploads/…` url goes into `imageUrl`. There is no delete endpoint; a campaign is stopped, not removed.

## Model

- One campaign carries a **banner** and/or a **popup** creative. Each channel has its own `imageUrl`, `altText`, `linkUrl`, `startAt`, `endAt`; the popup (a 4:3 image card with text; the server does not check the image ratio) also has `headline` and `description`. A channel is absent when all its fields are empty.
- `status`: `draft` → `published` → `stopped`; `stopped` can be published again. `version` goes up on every save.
- A channel is live when `status = published` and `startAt <= now < endAt`. `phase` (`scheduled` | `live` | `ended`, `null` unless published) is derived, never stored.
- **One live ad per channel**: publishing (or saving a published campaign) is refused with `409 AD_CHANNEL_WINDOW_OVERLAP` when another published campaign's window on the same channel intersects `[startAt, endAt)`. Windows that only touch at an edge are fine. The check runs under an advisory lock, so two simultaneous publishes cannot both win.
- Times are stored as instants. Send ISO 8601 **with an offset** (`2026-11-10T00:00:00+09:00`); a bare date or a timestamp without offset is a 400. Daily statistics are bucketed by **KST calendar date**.

### SaveAdCampaign

```json
{
  "advertiserName": "에버데이",
  "title": "11월 에버데이 협업",
  "banner": {
    "imageUrl": "/uploads/ads/banner.webp",
    "altText": "에버데이 신제품",
    "linkUrl": "/tournaments/123",
    "startAt": "2026-11-12T00:00:00+09:00",
    "endAt": "2026-11-20T00:00:00+09:00"
  },
  "popup": {
    "imageUrl": "/uploads/ads/popup.webp",
    "altText": "에버데이 11월 이벤트 안내",
    "headline": "에버데이 11월 이벤트",
    "description": "신제품을 먼저 만나 보세요",
    "linkUrl": "https://everyday.example.com/event",
    "startAt": "2026-11-12T00:00:00+09:00",
    "endAt": "2026-11-15T00:00:00+09:00"
  }
}
```

PUT replaces all editable fields: an omitted or `null` channel removes that channel and releases its image. Every channel field may be `null` while the campaign is a draft. `advertiserName` (≤60) is shown to users; `title` (≤120) is an internal memo and never leaves the admin API.

- `imageUrl`: only a `/uploads/…` url that `POST /admin/content-assets` returned to the same admin. External urls are a 400 (`VALIDATION_ERROR`); an unknown url is `400 CONTENT_ASSET_NOT_FOUND`; one attached elsewhere or uploaded by someone else is `400 CONTENT_ASSET_UNAVAILABLE`.
- `linkUrl`: an in-app path (`/…`) or a public HTTPS url. Rejected: `http:`, `javascript:`/`data:`/app schemes, `//host`, backslashes, userinfo, localhost/private/link-local/carrier-grade-NAT (100.64.0.0/10) hosts, IPv6 literals, single-label and `.local`/`.internal` hosts (a trailing dot does not get around these), control characters, > 500 chars. An in-app path may not enter `/admin`, `/api`, `/uploads` or `/tournament-ops` (any depth, any letter case, also after percent-decoding and `.`/`..` resolution; a path that cannot be decoded is refused). Whether the target page exists is not checked. The notice popup's own link rule is unchanged.
- `altText` (≤120, trimmed): the screen-reader description of the image. Optional on a draft, **required to publish** for every channel that has a creative. A blank value counts as empty. The public API sends it as `altText` and never serves a channel without one.
- `headline` (popup only, ≤40, trimmed): the title line of the popup card. Optional on a draft, **required to publish** a popup; the public API never serves a popup without one. `description` (popup only, ≤80, trimmed, optional): the supporting line; blank counts as empty and is sent as `null`. Sending either on `banner` is a 400 (`VALIDATION_ERROR`). The advertiser name for the line above the headline is `advertiserName`, which the public response already carries.

### Publish rules

A campaign can be published when it has at least one channel and every channel has image, `altText`, link, `startAt` and `endAt` (a popup also needs `headline`), and `endAt` is in the future. Otherwise `400` with the first problem as `code` and all of them in `details`:

| code | meaning | `details[]` |
|---|---|---|
| `AD_CHANNEL_REQUIRED` | no channel configured | `{ code }` |
| `AD_CHANNEL_INCOMPLETE` | channel misses fields | `{ code, channel, missing: ["imageUrl"\|"altText"\|"headline"\|"linkUrl"\|"startAt"\|"endAt"] }` |
| `AD_WINDOW_ENDED` | `endAt` already passed | `{ code, channel }` |

Saving an already published campaign re-checks completeness and overlap (not `endAt` in the future, so an ended campaign's memo can still be edited).

### Errors

| status | code | when |
|---|---|---|
| 400 | `VALIDATION_ERROR` | DTO violation (`details[].field`) |
| 400 | `AD_INVALID_WINDOW` | `endAt <= startAt`; `details: { channel }` |
| 403 | `PERMISSION_DENIED` | caller is not an active **owner** (ops and support are refused, reads included) |
| 404 | `AD_CAMPAIGN_NOT_FOUND` | unknown id |
| 409 | `AD_CAMPAIGN_VERSION_CONFLICT` | `expectedVersion` differs from the stored one; `details: { currentVersion }` |
| 409 | `AD_CAMPAIGN_INVALID_STATE` | publish of a published campaign; stop of a draft/stopped one |
| 409 | `AD_CHANNEL_WINDOW_OVERLAP` | `details: { channel, conflictingCampaignId, conflictingTitle }` |

## Responses

### Public ad

```json
{
  "banner": {
    "campaignId": "0d7c…",
    "advertiserName": "에버데이",
    "imageUrl": "/uploads/ads/banner.webp",
    "altText": "에버데이 신제품",
    "linkUrl": "/tournaments/123"
  },
  "popup": {
    "campaignId": "0d7c…",
    "advertiserName": "에버데이",
    "imageUrl": "/uploads/ads/popup.webp",
    "altText": "에버데이 11월 이벤트 안내",
    "headline": "에버데이 11월 이벤트",
    "description": "신제품을 먼저 만나 보세요",
    "linkUrl": "https://everyday.example.com/event"
  }
}
```

The banner never carries `headline`/`description`; the popup's `description` is `null` when not set. `Cache-Control: public, max-age=30` — a stopped ad can keep being served for up to 30 seconds. No memo, author, version or window fields are returned. Cookies are not needed.

### Admin campaign

```json
{
  "id": "0d7c…", "advertiserName": "에버데이", "title": "11월 협업",
  "status": "published", "version": 3,
  "banner": { "imageUrl": "…", "altText": "에버데이 신제품", "linkUrl": "…", "startAt": "2026-11-11T15:00:00.000Z", "endAt": "2026-11-19T15:00:00.000Z", "phase": "live" },
  "popup": { "imageUrl": "…", "altText": "…", "headline": "에버데이 11월 이벤트", "description": null, "linkUrl": "…", "startAt": "…", "endAt": "…", "phase": "scheduled" },
  "publishedAt": "…", "stoppedAt": null, "createdAt": "…", "updatedAt": "…",
  "createdBy": { "adminUserId": "…", "name": "대표" }
}
```

List items add `stats: { banner: { impressions, clicks }, popup: { impressions, clicks } }`. `summary` is `{ total, byStatus: { draft, published, stopped } }` scoped to `q`. Detail adds:

```json
"stats": {
  "banner": { "impressions": 150, "clicks": 5 },
  "popup": { "impressions": 20, "clicks": 2 },
  "daily": [{ "date": "2026-11-10", "channel": "banner", "impressions": 50, "clicks": 1 }],
  "updatedAt": "2026-11-10T12:00:00.000Z"
}
```

`daily` is newest KST day first; `updatedAt` is when a counter last changed (`null` before the first event). CTR is `clicks / impressions` and is computed by the client (impressions 0 → not computable).

## Events

`POST /ads/events` body: `{ "events": [{ "campaignId": "<uuid>", "channel": "banner" | "popup", "type": "impression" | "click" }] }`, 1–20 entries, one entry per occurrence.

- Counted only for a **published** campaign whose channel was configured and is inside `[startAt, endAt + 10 min)`; everything else is dropped silently (still `204`). Previews and test traffic must not be sent.
- Stored as per-day counters `(campaignId, channel, KST date)`; no user id, IP or user agent is stored. Counts are client-reported and not suitable as an auditable billing basis: anyone can submit events for a published campaign, and the rate limit reduces forgery without preventing it. A signed token would not help, because `GET /ads/active` is public and the token would be handed to the forger too; single-use tokens would need the per-event storage that S17 rules out.
- A database failure returns 5xx (recorded in the error log) instead of `204`.

## Behaviour to know (not defects)

- **Image swap on a live ad:** `/ads/active` is cached for up to 30 seconds, so after an image is replaced on a published campaign a cached response can still carry the old `/uploads/…` path for that long. The web hides the ad when its image fails to load.
- **Event limits:** `POST /ads/events` is limited to 30 requests per minute per IP, so devices behind one network address can lose events when they all report at once. The client does not resend a batch after a network error, so such a batch is lost.
- **Error responses are not cacheable:** only a successful `GET /ads/active` carries `Cache-Control: public, max-age=30`.
- **Event write order:** a batch updates its counter rows in `(campaignId, channel, KST date)` order, so concurrent batches that touch the same rows cannot deadlock.

## Decision history

| ID | Decision |
|---|---|
| S17 | No retransmission and no event id. A lost batch stays lost; a repeated batch is counted again. |
| S18 | Totals are kept per campaign, channel and KST date, with no creative version. Replacing an image keeps adding to the same counters. |
| S19 | The server does not check image ratio or size beyond the upload limits; the web checks the ratio before uploading. |
| S20 | In-app links block only the reserved paths listed above. The server does not check that the target exists. |

## Audit

Every owner mutation writes `V1AdminActionLog` (`ad_campaign.create|update|publish|stop`, `targetType: ad_campaign`) with before/after snapshots; create/publish/stop also write `V1StatusChangeLog`.
