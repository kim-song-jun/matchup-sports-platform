# Game migration and cutover contract

<!-- API_CONTRACT_SECTION_BEGIN:Literal migration/cutover phases -->
### Literal migration/cutover phases
Only `platform_ops` may mutate flags through a compare-and-swap transaction carrying expected version(s), idempotency key, reason, and the named gate-bundle path/hash; each changed flag writes `V1OperationAudit` plus outbox. Single-key changes use PATCH; any read/write authority rollback uses the tuple-transition endpoint with exact expected values/versions. `GAME_READ=compare` returns the legacy response while synchronously recording a legacy/new comparator result; it never falls back on an error. `GAME_READ=new` returns only the new projection. Permitted transitions are `GAME_READ legacy→compare→new`, `GAME_WRITE legacy→new`, `PUBLIC_LIVE off→on`, and `DIRECTOR_OFFICIALIZE off→on`; boolean rollback is `on→off` with a new audit/version. Phase C transition order is frozen: validate compare gate → CAS `GAME_WRITE legacy→new` while locking `V1GameCutoverEpoch` → CAS `GAME_READ compare→new` → public/director gates. Every new-authority business write and every read/write rollback tuple-CAS locks the singleton cutover row and flag rows in lexical order `FOR UPDATE`; the first successful new write sets `firstNewWriteAt/resourceId` in the same transaction, while rollback requires the latch still null. Therefore write-versus-rollback races serialize with exactly one legal winner. `GAME_READ new→compare|legacy` and `GAME_WRITE new→legacy` are forbidden once the latch is set; a pre-latch rollback atomically restores both authorities to the approved prior values and increments each changed flag version exactly once. `PUBLIC_LIVE` requires V24 privacy/visibility plus V26 PUBLIC-01 receipts; `DIRECTOR_OFFICIALIZE` requires V7 auth plus V22 API and V23 UI audit receipts. Local toggle tests use isolated DBs; V27/F4 require the final tuple/version below after cleanup.

The flag gate is an immutable phase-specific attempt-bound bundle, not an ad hoc list. During V27, after the current attempt's prerequisite V receipts exist, `run-v1-release-candidate.mjs` canonicalizes `/private/tmp/teameet-ulw-evidence/teameet-team-tournament-operations-v1/flag-gate-<attemptId>-<phase>-<transition>.json` with exactly `{schemaVersion:1,phase,attemptId,baselineSHA,candidateSHA,planSHA,transition,key?,tupleKeys?,from:{value,version}?,to:{value,version}?,fromTuple?,toTuple?,prerequisites:[{gateId,phase,commandId,path,sha256,verdict}],priorPhaseReceipt?:{path,sha256},deploymentManifest?:{path,sha256},publicProof?:{path,sha256},createdAt}`. A single-key bundle requires `key/from/to` and forbids tuple fields; a tuple rollback bundle requires lexically ordered `tupleKeys/fromTuple/toTuple` and forbids single-key fields. The producer and flag service descriptor-verify every prerequisite and recursively require its internal gate/phase/command/attempt/baseline/candidate/plan/lifecycle identities to match the bundle; separately typed prior/deployment/public receipts are verified against their own exact schemas, signatures, candidate/deployment/phase identities, and path hashes rather than being forced into the V-receipt schema. Stale, mixed-attempt, cross-gate, wrong-command, wrong-phase, or cross-deployment receipts fail before CAS. Local Phase B compare uses exactly V10. Local Phase C GAME_WRITE and GAME_READ each use V10+V25; PUBLIC_LIVE uses V24+V26:PUBLIC-01; DIRECTOR_OFFICIALIZE uses V7+V22+V23. R2 never reuses local receipts: its GAME_WRITE/READ bundles require `{path,sha256}` for the signed R1 terminal receipt plus the R2 run's own comparator V receipt, while public-live additionally requires typed `{path,sha256}` deploymentManifest and publicProof. `prerequisites` is lexically ordered by gateId/commandId. The producer writes canonical JSON with `O_CREAT|O_EXCL`/fsync/0444 and returns path+SHA-256; Flag PATCH/tuple-transition consumes that hash in the CAS/audit. No transition occurs before its semantically valid bundle exists.

| Phase | Flags/read-write authority | Required gate | Failure action |
|---|---|---|---|
| A Expand | start/end tuple `(GAME_WRITE=legacy@v0,GAME_READ=legacy@v0,PUBLIC_LIVE=off@v0,DIRECTOR_OFFICIALIZE=off@v0)`; additive schema dark | V4/V5 green and backfill dry-run counts/hash recorded | disable worker; tuple remains A |
| B Local shadow proof | start A; end `(legacy@v0,compare@v1,off@v0,off@v0)`; legacy response authority, comparison only | deterministic full-fixture comparator runs include every eligible seeded record, mismatch injection blocks V10/V25, recovery zero; transition receipt hash supplied to flag CAS | stop local gate, quarantine mismatch, repair/rebuild; CAS `compare@v1→legacy@v2` only before new write |
| C Pre-cleanup candidate | start B; end `(new@v1,new@v2,on@v1,off@v0)` in the isolated candidate DB; compatibility readers remain and legacy writes reject | `GAME_WRITE` receipt requires V10/V25 zero mismatch; `GAME_READ` requires same; `PUBLIC_LIVE` requires V24+V26; V27/F4 prove exact final tuple/versions | forward-fix on a new isolated attempt and restart affected V commands plus F1–F4; do not remove compatibility |
| R1 Authorized alpha shadow (separate rollout) | require values `(legacy,legacy,off,off)` at arbitrary current versions `(w,r,p,d)` read into the signed deployment manifest; transition/end `(legacy@w,compare@r+1,off@p,off@d)` and remain there for all 7 runs | explicit authorization plus signed deployment manifest and 7 scheduled 24h-separated signed full-population zero-mismatch receipts | CAS read back to `legacy@r+2`, disable worker, open fix/reverification cycle; a later authorized retry starts from that actual version, never assumes v0 |
| R2 Authorized alpha new-write (separate rollout) | start at the signed R1 terminal tuple `(legacy@w,compare@r+1,off@p,off@d)`; transition/end `(new@w+1,new@r+2,on@p+1,off@d)`; compatibility comparator remains | valid R1 chain; write/read CAS use the exact R1 terminal values/versions; public-live CAS binds the signed deployment manifest plus deployed R1 public-proof receipt; 7 further signed zero-mismatch runs | after first new-only write, forward-fix or maintenance error; no legacy rollback; public-live may CAS `on@p+1→off@p+2`, and any later re-enable uses the then-current version |
| R3 Post-alpha cleanup (separate rollout) | start/end at the exact signed R2 terminal values and versions, whatever their monotonic numbers; remove compatibility readers only in a new code-only commit and use phase-aware `R3-V1..R3-V27`/`R3-F1..R3-F4` registry | bind signed R1/R2 chain, pre-cleanup candidate SHA, cleanup parent/SHA, actual terminal flag tuple/versions, removal-manifest hash, and phase-registry hash | revert only cleanup commit or forward-fix, then rerun all cleanup-mode gates; flag tuple is unchanged |
- Local eligible population is every valid fixture in the deterministic migration dataset. Deployed eligible population is every non-deleted TeamMatch/TournamentFixture with a legacy result or new Game adapter at each signed watermark. Equivalence compares source ID, lifecycle, sides, regulation/penalty scores, ordered reconstructable goals, official timestamp, visibility, and completeness/provenance flags. Any difference is critical except non-reconstructable participant/event fields carrying the explicit `incomplete` marker.
- After an explicitly authorized push of the exact candidate, each rollout or retry first generates a fresh UUID `deploymentAttemptId` and executes `node scripts/qa/run-v1-alpha-cutover.mjs --phase deploy-bind --deployment-attempt "$deploymentAttemptId" --candidate-receipt "$V1_CANDIDATE_RECEIPT_PATH" --candidate-receipt-sha "$V1_CANDIDATE_RECEIPT_SHA" --environment alpha --deployment-url https://alpha.teameet.co.kr --output-dir /private/tmp/teameet-ulw-evidence/teameet-team-tournament-operations-v1`. It descriptor-verifies the candidate, proves the deployed build reports that candidate SHA, reads the current flag values/versions, and atomically writes `alpha-deployment-<candidateSHA>-<deploymentAttemptId>.json` plus SHA with exactly `{schemaVersion:1,deploymentAttemptId,environment:"alpha",candidateSHA,candidateReceiptSHA,deployedBuildSHA,deploymentUrl,apiUrl,flagTuple,workflowRunId,deployedAt,actor,signingKeyId,signature}`. `O_CREAT|O_EXCL` prevents overwrite; a retry against the same candidate gets a new attempt/path and binds the then-current monotonic flag versions. The Ed25519 signature covers canonical JSON excluding `signature`; the committed verification key/key ID is in the runbook.
- The separate runbook then runs R1 with `--deployment-manifest "$ALPHA_DEPLOYMENT_MANIFEST_PATH" --deployment-manifest-sha "$ALPHA_DEPLOYMENT_MANIFEST_SHA"`. After the seventh zero-mismatch run it executes `node scripts/qa/run-v1-alpha-cutover.mjs --phase R1-public-proof --deployment-manifest "$ALPHA_DEPLOYMENT_MANIFEST_PATH" --deployment-manifest-sha "$ALPHA_DEPLOYMENT_MANIFEST_SHA" --require-signed R1:7 --journey PUBLIC-01 --privacy-gates V24,V26:PUBLIC-01`; this runs the deployed public/anonymous privacy journey and writes immutable signed `alpha-public-proof-<candidateSHA>-<deploymentAttemptId>-<r1TerminalHash>.json` plus SHA with exactly `{schemaVersion:1,phase:"R1-public-proof",deploymentAttemptId,candidateSHA,deploymentManifestSHA,r1TerminalReceiptSHA,routeSetHash,privacyGateIds,persona:"public",verdict,observedAt,actor,signingKeyId,signature}`. R2 is exact: `node scripts/qa/run-v1-alpha-cutover.mjs --candidate-receipt "$V1_CANDIDATE_RECEIPT_PATH" --candidate-receipt-sha "$V1_CANDIDATE_RECEIPT_SHA" --phase R2 --runs 7 --interval 24h --population full --require-signed R1:7 --deployment-manifest "$ALPHA_DEPLOYMENT_MANIFEST_PATH" --deployment-manifest-sha "$ALPHA_DEPLOYMENT_MANIFEST_SHA" --public-proof "$R1_PUBLIC_PROOF_PATH" --public-proof-sha "$R1_PUBLIC_PROOF_SHA"`. Every R1/R2 receipt contains deploymentAttemptId, candidateSHA, candidateReceiptSHA, deploymentManifestSHA, phase/run, exact before/after flag values/versions, watermark, count/hash, UTC timestamp, previousReceiptHash, actor, signingKeyId, and signature. R2 refuses any invalid/missing/cross-attempt/cross-candidate manifest, proof, or R1 chain.
- Authorized R3 is exact: `node scripts/qa/run-v1-alpha-cutover.mjs --candidate-receipt "$V1_CANDIDATE_RECEIPT_PATH" --candidate-receipt-sha "$V1_CANDIDATE_RECEIPT_SHA" --phase R3-apply --require-signed R1:7,R2:7 --removal-manifest deploy/runbooks/v1-game-operations-compatibility-removal.json --phase-registry deploy/runbooks/v1-game-operations-r3-registry.json`; it verifies the signed chain and writes an apply receipt binding pre-cleanup SHA, flag tuple, removal-manifest hash, and registry hash. It may change only compatibility-reader paths named in the manifest and performs no schema/data contraction. Root pathspec-commits those paths, then `node scripts/qa/run-v1-release-candidate.mjs --phase cleanup --parent-receipt "$R3_APPLY_RECEIPT" --receipt-dir /private/tmp/teameet-ulw-evidence/teameet-team-tournament-operations-v1 --registry R3-V1-R3-V27 --builds v1_api,v1_web`; capture its printed `R3_CLEANUP_RECEIPT_PATH`/`R3_CLEANUP_RECEIPT_SHA`, then run `R3-F1..R3-F4` with that pair. Cleanup V25/V27/F1/F4 require exact absence of every manifest reader and presence/validity of the R1/R2 chain; pre-cleanup V25/V27/F1/F4 continue to require reader presence. If authorized rollback is required, read the cleanup candidate SHA from the descriptor-verified cleanup receipt, run the separate rollback gate, then `git revert` that exact SHA and rerun R3 verification. These commands are specified but never executed by the current plan.


<!-- API_CONTRACT_SECTION_END:Literal migration/cutover phases -->

## Simplified admin fast path

`PATCH /tournament-ops/operation-flags/:key/simplified-toggle` is an owner-requested admin on/off
for all four operation flags (`GAME_READ`, `GAME_WRITE`, `PUBLIC_LIVE`, `DIRECTOR_OFFICIALIZE`). It
skips exactly one thing from the literal contract above: the immutable gate-bundle evidence
(`verifyGateBundle`'s R1/R2 signed-receipt ceremony). Everything else is identical to
`PATCH /tournament-ops/operation-flags/:key` — the same `platform_ops` admin level
(`getMutationAdmin`; `support` and non-admin callers are rejected), the same CAS on
`expectedVersion`, the same single-step transition validity (`assertSingleTransition`; reversing a
`GAME_READ`/`GAME_WRITE` step still requires the fully gated tuple-transition path), the same
**frozen cutover order** (`assertFrozenForwardOrder`: `GAME_READ legacy→compare`, then
`GAME_WRITE legacy→new` requires `GAME_READ=compare`, then `GAME_READ compare→new` requires
`GAME_WRITE=new`, then `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE off→on` require both `GAME_WRITE=new`
and `GAME_READ=new` — this path does not relax that data-consistency invariant, only the
paperwork), a mandatory `reason`, a required `Idempotency-Key`, and a `V1OperationAudit`/outbox
write (marked `gateMode: "simplified"` in the `after` payload to distinguish it from the gated
path in the same audit trail). `GAME_WRITE legacy→new` still latches
`v1_game_cutover_epochs.first_new_write_at` on the first new-authority write, making that step
practically irreversible through this path too — rolling it back still requires
`tupleTransition`.

Whether this path is reachable at all is a DB-backed switch, not an environment variable: the
singleton row in `v1_game_operation_gate_settings` (`simplified_gate_enabled`, CAS'd by
`version`), defaulting to `false` on a freshly provisioned environment (including production).
`platform_ops` admins flip it via `PATCH /tournament-ops/operation-flags/simplified-gate` (same CAS
+ mandatory `reason` + `V1OperationAudit` shape as everything else in this contract) and read its
state via `GET /tournament-ops/operation-flags/simplified-gate/status`. It is reachable from any
environment, including production — the control is the CAS + audit trail on the switch itself, not
which environment the process runs in.

Because the frozen order is preserved, this path cannot promote `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE`
to `on` while `GAME_WRITE`/`GAME_READ` remain at their Phase A `legacy` values (alpha's state as of
this writing) even with the switch enabled; it only becomes usable for that promotion once
`GAME_WRITE`/`GAME_READ` have advanced to `new` — either through this same simplified path (in the
frozen order) or the fully gated path above. Boolean rollback (`on`→`off`) has no such precondition
and is always available.

## Migrated deferred-boundary contract

The following pre-normalization deferred-boundary contract is retained here so superseding the duplicate tree loses no contract content.

V1 must be honest about features that are intentionally outside the current API and DB scope. The UI may show disabled or read-only entry points only when the copy is explicit.

## No V1 Success API

These areas must not expose a fake successful flow in v1:

- payment checkout, payment confirmation, refund, settlement, dispute;
- marketplace and lessons commerce;
- support ticket success flow;
- venue owner/operator self-service;
- tournament operations beyond future planning;
- DM;
- chat file attachment;
- upload/file management as a v1 core API;
- admin task queue and broad operations workflow.

## UI Contract

If visible, deferred surfaces must say that the function is not active in v1. They must not:

- call a non-existent payment/support endpoint;
- show a fake transaction id;
- show settlement/refund success;
- imply real billing or real refund;
- silently route to old app APIs;
- persist mock admin outcomes as if they were operational actions.

## Cutover Constraint

Cutover review happens only after:

- `docs/api/v1/**` is published;
- v1 frontend contract hooks and MSW exist;
- core routes are bound to real v1 API data;
- integration/state-machine tests cover stateful domains;
- `make dev-v1` live smoke has evidence;
- Playwright scenarios are automated from `docs/scenarios/12-v1-sm-new-e2e-scenarios.md`.
