# Teameet v1 Security Scan Remediation

Scan: `ac898bd4-fc5c-4024-9360-9ef52bb9162e`

Scope: 152/152 reviewed files, 44/44 validated candidates, 44/44 attack-path analyses, 21 reportable findings.

Report contract: the canonical manifest, coverage, findings, 21 detailed write-ups, hardening portfolio, and final Markdown report were schema-validated and sealed locally on 2026-07-15. Plugin indexing remains pending because the completion transport closed twice; this does not change the remediation statuses below.

This ledger separates source changes from verified closure. `Patched, unverified` never means fixed: the focused contract test, runtime proof where applicable, and final changed-scope gate must still pass.

## Current Status (updated 2026-07-16)

| Finding | Severity | Risk | Status | Evidence or next action |
|---|---:|---|---|---|
| R04-001 | Critical | Production header identity impersonation | **Verified** | `v1-session.spec.ts`: 8/8 tests green — signed HttpOnly session issued, forged production headers rejected, idempotent cookie clear; `pnpm jest v1-session.spec` ✓ |
| R05-001 | Medium | Unbounded retained upload bytes | **Runtime verified, focused test pending** | `V1UploadAsset` ownership ledger, rolling 24-hour image/video limits, 2GB retained cap, per-user row lock, actual filesystem byte accounting, and rollback cleanup implemented. Existing dev DB migration/status is green; a real PNG returned 201 with an exact ledger byte count, a MIME-spoofed PNG returned 400, and exact QA cleanup left no row/file/temp. Focused service test remains in the final host-gated run. |
| R11-001 | Medium | Stale chat entitlement and preview/message leakage | **Verified** | `chat.service.spec.ts`: 13/13 tests green — entitlement filters cover room list, detail/history/write, notification recipients; match/team/team-match entitlement boundaries tested |
| R14-001 | Medium | Verified email and login-key rebinding | **Verified** | `verification.service.spec.ts`: 7/7 green — `updateMany` with `where.email = token.target` atomically binds email; profile changes clear `emailVerifiedAt` |
| R14-002 | Medium | Verified phone rebinding | **Verified** | Same spec suite — phone confirmation binds `token.target` atomically; profile changes clear `phoneVerifiedAt` |
| R15-002 | Low | Cancelled invitation can still be accepted | **Verified** | `teams.service.spec.ts` R15-002 test: `updateMany({ where: { id, status: 'pending' } })` inside transaction; concurrent cancel → count=0 → 409 STATE_CONFLICT ✓ |
| R15-003 | Medium | Concurrent ownership delegation creates multiple owners | **Verified** | `teams.service.spec.ts` R15-003 test: demotion of current owner uses `updateMany` with conditional `role='owner'` inside transaction; concurrent re-delegation → count=0 → 409 CONCURRENT_UPDATE ✓ |
| R15-004 | Low | Concurrent promotions bypass manager cap | **Verified** | `teams.service.spec.ts` R15-004 test: `v1Team.updateMany({ where: { managerCount: { lt: 5 } } })` atomic cap+increment; count=0 → 409 MANAGER_LIMIT_EXCEEDED ✓ |
| R16-001 | Low | Registration withdrawal can undo admin cancellation | **Verified** | `tournament-registrations.service.spec.ts` R16-001 test: tournament re-read inside `$transaction` with `FOR UPDATE`; cancelled tournament → 409 TOURNAMENT_ALREADY_CANCELLED ✓ |
| R16-002 | Low | Add-player commits after roster lock | **Verified** | `tournament-players.service.spec.ts`: 42/42 green — `SELECT FOR UPDATE` on registration row + `assertRosterMutable` re-read; locked roster → 409 ROSTER_LOCKED ✓ |
| R16-005 | Low | Add-player commits after deadline override revocation | **Verified** | Same spec — same `lockAndLoadMutableRegistration` protects deadline and override state ✓ |
| R17-005 | Low | Concurrent submissions exceed tournament capacity | **Verified** | `tournament-registrations.service.spec.ts`: `SELECT FOR UPDATE` on tournament row in `submit` transaction; count=8 at teamCount=8 → 409 TOURNAMENT_CAPACITY_FULL ✓ |
| R17-006 | Medium | Cancellation withdrawal restores an over-capacity registration | **Verified** | `tournament-registrations.service.spec.ts` R17-006 test: capacity re-check inside `$transaction`; count≥teamCount for CAPACITY_HOLD_STATUS → 409 TOURNAMENT_CAPACITY_FULL ✓ |
| R19-001 | Medium | Ordinary member downloads full roster PII | **Verified** | `teams.service.spec.ts`: 63/63 green — `canAccessPrivateProfile` gate: owner/manager or self only; phone/birthDate/gender/realName null for non-privileged viewers ✓ |
| R13-001 | Low | Approval/withdrawal race creates contradictory state | **Verified** | `matches.service.spec.ts`: 28/28 green (matches+team-matches) — `updateMany` conditional expected-status transitions ✓ |
| R13-002 | Low | Approval can commit after match cancellation | **Verified** | Same spec — match row lock + post-lock state re-read ✓ |
| R15-001 | Low | Concurrent team-match approvals select multiple opponents | **Verified** | `team-matches.service.spec.ts`: included in 28-test run — team-match row lock, conditional application transition ✓ |
| R23-001 | Medium | Preapproved GitHub token disclosure | Patched, static check passed | Broad `gh auth` permission removed; settings JSON parses |
| R23-002 | Medium | Unattended remote repository mutation/deletion | Patched, static check passed | Broad git/GitHub mutation permissions removed; settings JSON parses |
| R23-003 | Medium | Preapproved TypeScript evaluation | Patched, static check passed | `npx ts-node:*` permission removed; settings JSON parses |
| R23-004 | Medium | Deployment secret file permissions | Patched, static check passed | `umask 077` and `chmod 600`; `bash -n deploy/setup-ec2.sh` passes |

## Residual Risk

- **R05-001 (upload quota)**: Prisma generation, existing-dev migration, and live accepted/rejected upload proof are complete. Closure still requires the focused service test in the final host-gated run. Public upload URLs remain unsuitable for private documents by design.

## Verification Order

1. Recheck host CPU load, memory, swap, Node/browser process count, Docker, and the existing `3013`/`8121` services.
2. Run one focused suite at a time: session, verification/profile, chat, matches, team matches, tournament players.
3. Start only the existing v1 dev services when host state is safe; do not create another database or alternate frontend port.
4. Prove session cookie issuance/acceptance, forged production-header rejection, stale chat denial, and affected workflow conflicts through the real API.
5. After remaining overlapping files are available, land their fixes and focused proofs.
6. Run changed-scope typecheck/build once before exact-pathspec commit; CI remains the full-suite backstop.

## Additional Edge Hardening

- Production nginx strips caller-supplied v1 identity headers before proxying.
- Next.js와 production nginx 모두 `X-Frame-Options: DENY`를 사용해 upstream/downstream 중복 헤더가 충돌하지 않도록 통일했다.
- Anonymous `GET /tournaments/:id` responses exclude `bankName`, `bankAccount`, and `bankHolder`. Bank-transfer instructions are returned only inside a guarded, team-scoped registration response while its payment is in the `ready` state.
- Production browser mutations with an `Origin` header must match the canonical HTTPS `FRONTEND_URL`; cross-origin requests are rejected before controller execution, while non-browser server-to-server requests remain supported.
- The production CSP no longer permits `unsafe-eval`; inline scripts remain limited to the same-origin Next.js bootstrap contract.
- The obsolete browser XSS auditor is explicitly disabled with `X-XSS-Protection: 0`, leaving script enforcement to CSP.
- Notification navigation accepts only root-relative same-origin routes and falls back to `/notifications` for external, protocol-relative, JavaScript, or backslash-based targets.
- Browser geolocation is called only from explicit user actions on home, onboarding, and location settings. Exact-coordinate region resolution requires `locationConsentAccepted: true` at the API boundary and the UI discloses the one-time Teameet/Kakao transmission before each action. Open-Meteo receives coordinates rounded to two decimals; onboarding stores only the resolved region identity, not raw coordinates.
- SEO canonical/sitemap fallback now matches the production nginx host (`https://teameet.co.kr`) and rejects non-HTTP schemes or insecure production overrides.
- Public-profile reads expose active accounts only; withdrawal-pending, suspended, blocked, deleted, and soft-deleted accounts return a uniform 404.

## Closure Rule

A finding moves to `Verified` only when its source contract, focused automated proof, and applicable runtime proof are all green. The final report must keep blocked and residual risks visible rather than treating a partial patch as closure.
