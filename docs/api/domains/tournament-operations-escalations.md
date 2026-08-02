# Tournament operations escalation contract

Result review SLA starts at the submitted host revision. A durable reminder is enqueued at +24 hours UTC and a durable platform-operations escalation at +48 hours. Supersession or a terminal review decision closes the prior jobs; no result is automatically approved.

The authoritative decision is D-01 in the [operational decision table](./games.md#frozen-operational-decision-table). The escalation list/ack/resolve method, fields, actors, and errors are frozen in the [REST registry](../global-contract.md#frozen-rest-and-idempotency-contract), and `V1ResultEscalation` is frozen in the [schema ledger](./games.md#frozen-additive-schema-ledger).

## HTTP contract

All routes are authenticated and use the `/api/v1` prefix. Responses use the global `{status,data,timestamp}` envelope.

| Method and route | Input | Result |
|---|---|---|
| `GET /api/v1/tournament-ops/tournaments/:tournamentId/escalations` | optional query `status=PENDING|ACKNOWLEDGED|RESOLVED|CLOSED` | `{items: Escalation[]}` ordered by `dueAt`, then `id` |
| `GET /api/v1/tournament-ops/tournaments/:tournamentId/escalations/:escalationId` | UUID path parameters | one `Escalation` |
| `POST /api/v1/tournament-ops/tournaments/:tournamentId/escalations/:escalationId/ack` | mandatory nonblank `Idempotency-Key` header and `{expectedVersion,reason}` | acknowledged `Escalation` plus `replayed` |
| `POST /api/v1/tournament-ops/tournaments/:tournamentId/escalations/:escalationId/resolve` | mandatory nonblank `Idempotency-Key` header and `{expectedVersion,reason}` | resolved `Escalation` plus `replayed` |

`expectedVersion` is an integer greater than or equal to `0`. `reason` is a string of 1 to 1,000 characters; after trimming, an empty reason is rejected. An escalation view contains `id`, `resultRevisionId`, `gameId`, `tournamentId`, `kind`, `dueAt`, `status`, `ackByUserId`, `resolvedByUserId`, `reason`, `version`, `createdAt`, and `updatedAt`.

The mutation idempotency scope is `(actorUserId, action, "RESULT_ESCALATION", escalationId, Idempotency-Key)`, and the record is retained 30 days. The header is mandatory and must remain nonblank after trimming; omission or a blank value returns `422 IDEMPOTENCY_KEY_REQUIRED`, and the server never derives a replacement key. Its payload hash covers the trimmed `reason`, `expectedVersion`, and target state. The first successful mutation returns HTTP `200` with `replayed:false`; the same key and payload returns the stored HTTP `200` result with `replayed:true`, while the same key with a different payload returns `409 IDEMPOTENCY_PAYLOAD_CONFLICT`.

## Actor and queue scope

Authorization and queue visibility are deliberately separate:

- A current, unrevoked, unexpired tournament assignment with role `SUPPORT_READONLY` or `TOURNAMENT_DIRECTOR` is a reviewer for that tournament. Both roles may list, view, and acknowledge only due `REMINDER` items. Neither role may resolve an item.
- An active platform administrator with role `owner` or `ops` is `platform_ops`. This actor may list, view, acknowledge, and resolve only due `ESCALATION` items in the requested tournament queue.
- Only rows whose `dueAt` is at or before database current time are visible. A different tournament, the wrong queue kind, a future-due row, or an unknown escalation ID is intentionally indistinguishable and returns `404 RESULT_ESCALATION_NOT_FOUND` on detail or mutation.

`SUPPORT_READONLY` and `TOURNAMENT_DIRECTOR` therefore share the implemented reviewer reminder contract. `platform_ops` has global actor authority, but the route still scopes every read and mutation to its `:tournamentId` and to the platform escalation queue kind.

## State, CAS, and audit

Statuses are `PENDING`, `ACKNOWLEDGED`, `RESOLVED`, and `CLOSED`. Acknowledgement permits only `PENDING→ACKNOWLEDGED`. Resolution permits `PENDING|ACKNOWLEDGED→RESOLVED` and is restricted to `platform_ops`. `RESOLVED` and `CLOSED` are terminal for these actions; `CLOSED` is written when the underlying result lifecycle closes the outstanding row.

Both actions lock the row and compare `expectedVersion` before updating it. A successful action increments `version` exactly once, records the acting user and reason, and creates a `V1OperationAudit` entry with actor, action, tournament, request ID, before/after snapshots, and reason in the same transaction. A stale or lost compare-and-swap returns `409 ESCALATION_VERSION_CONFLICT` without a partial update.

## Errors

| HTTP | Code or condition | Meaning |
|---|---|---|
| `422` | validation / `IDEMPOTENCY_KEY_REQUIRED` | malformed UUID, invalid `status`, missing or blank `Idempotency-Key`, non-whitelisted input, non-integer/negative `expectedVersion`, or missing/oversized `reason` |
| `401` | authentication | no valid authenticated user |
| `403` | `ESCALATION_SCOPE_DENIED` | no eligible actor scope, or a reviewer attempts resolve |
| `404` | `RESULT_ESCALATION_NOT_FOUND` | tournament, queue-kind, due-time, or escalation-ID scope does not match |
| `409` | `IDEMPOTENCY_PAYLOAD_CONFLICT` | the idempotency key was reused with a different mutation payload |
| `409` | `ESCALATION_REASON_REQUIRED` | `reason` is empty after trimming |
| `409` | `ESCALATION_VERSION_CONFLICT` | `expectedVersion` is stale or the CAS loses a race |
| `409` | `ESCALATION_STATE_CONFLICT` | acknowledgement targets a status other than `PENDING` |
| `409` | `ESCALATION_TERMINAL` | the row is already `RESOLVED` or `CLOSED` |

<!-- API_CONTRACT_SECTION_BEGIN:Frozen worker lease and retry policy -->
### Frozen worker lease and retry policy
- Claim uses one database transaction with `FOR UPDATE SKIP LOCKED`, changes only `PENDING|RETRY` rows whose `availableAt<=now` and whose lease is absent/expired, writes a random `leaseOwner`, `leaseUntil=database_now()+30s`, increments `attempts`, and commits before handling. A worker heartbeats every 10s and renews to `database_now()+30s` only when the same owner still holds the lease.
- Retry delays are exactly `1s, 5s, 30s, 2m, 10m`; attempt 6 moves the item atomically to `POISONED`, clears the lease, records a bounded error, increments version, emits the degraded-health metric, and requires an audited `platform_ops` requeue. Requeue CAS increments `retryGeneration` and version, resets `attempts=0`, clears lease/lastError, and schedules RETRY at database-now; the unchanged business key prevents a second committed effect.
- Graceful shutdown stops claiming, gives active handlers 20s, then transactionally releases only leases owned by that worker to `RETRY` with the next delay. Crash recovery permits another replica to claim only after `leaseUntil`; late completion by the expired owner fails the owner/version compare-and-swap and cannot commit. V5 starts two replicas and covers claim races, renewal, crash before/after effect transaction, expiry takeover, poison/requeue, and 20s shutdown.

<!-- API_CONTRACT_SECTION_END:Frozen worker lease and retry policy -->
