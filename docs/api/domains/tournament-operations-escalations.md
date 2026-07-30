# Tournament operations escalation contract

Result review SLA starts at the submitted host revision. A durable reminder is enqueued at +24 hours UTC and a durable platform-operations escalation at +48 hours. Supersession or a terminal review decision closes the prior jobs; no result is automatically approved.

The authoritative decision is D-01 in the [operational decision table](./games.md#frozen-operational-decision-table). The escalation list/ack/resolve method, fields, actors, and errors are frozen in the [REST registry](../global-contract.md#frozen-rest-and-idempotency-contract), and `V1ResultEscalation` is frozen in the [schema ledger](./games.md#frozen-additive-schema-ledger).

<!-- API_CONTRACT_SECTION_BEGIN:Frozen worker lease and retry policy -->
### Frozen worker lease and retry policy
- Claim uses one database transaction with `FOR UPDATE SKIP LOCKED`, changes only `PENDING|RETRY` rows whose `availableAt<=now` and whose lease is absent/expired, writes a random `leaseOwner`, `leaseUntil=database_now()+30s`, increments `attempts`, and commits before handling. A worker heartbeats every 10s and renews to `database_now()+30s` only when the same owner still holds the lease.
- Retry delays are exactly `1s, 5s, 30s, 2m, 10m`; attempt 6 moves the item atomically to `POISONED`, clears the lease, records a bounded error, increments version, emits the degraded-health metric, and requires an audited `platform_ops` requeue. Requeue CAS increments `retryGeneration` and version, resets `attempts=0`, clears lease/lastError, and schedules RETRY at database-now; the unchanged business key prevents a second committed effect.
- Graceful shutdown stops claiming, gives active handlers 20s, then transactionally releases only leases owned by that worker to `RETRY` with the next delay. Crash recovery permits another replica to claim only after `leaseUntil`; late completion by the expired owner fails the owner/version compare-and-swap and cannot commit. V5 starts two replicas and covers claim races, renewal, crash before/after effect transaction, expiry takeover, poison/requeue, and 20s shutdown.

<!-- API_CONTRACT_SECTION_END:Frozen worker lease and retry policy -->
