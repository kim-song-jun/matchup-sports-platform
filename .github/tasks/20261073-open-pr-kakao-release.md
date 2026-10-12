# Open PR integration and Kakao release — 2026-10-12

## Request and scope

The user authorized reviewing, repairing, and merging the currently open PRs #1837, #1843, and #1848 into dev, testing alpha, creating the dev-to-main promotion PR, and deploying main only after release blockers are cleared. On 2026-10-12 the user explicitly requested a new Kakao app in the logged-in account, migration of existing users, and consent/privacy settings matching actual collection. New-app console setup is authorized; production credential cutover requires demonstrated existing-account continuity. Do not expose credentials, rewrite existing consents, or submit store releases as a side effect.

## Ownership

- #1837: Kakao SDK startup timeout, native consent-scope parity, reproducible iOS dependencies, release documentation and configuration wiring.
- #1843: match MSW sport filter contract, final PR description, review and integration verification.
- #1848: reconcile the latest dev room-detail resync with permanent-error filtering; retain both regression contracts.
- Forbidden: unrelated worktree changes, secret values in tracked files or reports, DB resets, rollback, and unverified main promotion.

## Acceptance criteria / exit proof

- [ ] Open review findings are fixed or disproved with concrete evidence; conflicts are resolved without losing existing behavior.
- [ ] Each exact PR revision passes the applicable CI checks before dev merge.
- [ ] The combined dev revision passes API/Web/Gates and applicable Android/iOS CI; alpha serves that revision.
- [ ] All REST, JavaScript and native credentials identify the same intended app; required native key and app-ID inputs are configured without leaking values.
- [ ] New-app transition preserves existing user IDs, memberships and history, uses verified ownership to link identities, and never infers identity from names or unverified contact data.
- [ ] Console consent items, actual collected fields and public privacy disclosures agree; any review/business-verification blockers are explicit.
- [ ] Console domains, callback URLs, package/bundle identifiers and available signing key hashes match the actual builds.
- [ ] Alpha maps, browser login/session, lists/facets and chat recovery are exercised against deployed code. Native-build proof is distinguished from physical-device KakaoTalk proof.
- [ ] No main promotion while required configuration or authentication validation remains blocked.
- [ ] If gates pass, promote the verified revision, approve the authorized production deployment, verify served SHA/release and affected production flows, and close owned browser/process resources.

## Progress snapshot

- Baseline dev: `7225b1514f8daa885a05fef2f7c0859d0bc9cf14`; main/runtime: `eda4a05de8543f95f0c88376baac7212086c1037` / `1.6.10`.
- #1837 has five unresolved review findings; #1843 has one MSW parity finding; #1848 has no unresolved review thread but conflicts with current dev.
- Existing PR worktrees contain only pre-existing untracked node_modules links; do not stage or remove them. No new branch or worktree is created.
- Kakao app `1604606` was created after the user's explicit new-app request. Name: 팀밋 (Teameet); operator: 아이위(IWI), matching live signup terms; domain: https://teameet.co.kr. No production credentials have been replaced.
- Existing-account transition is not yet safe: verified-email linking exists, but phone-based linking rejects an account that already has an active identity of the same provider. Kakao's official app-management documentation warns that a new app does not automatically carry existing membership across.
- Web Kakao startup/native bridge regression tests: 26/26 passed; web TypeScript passed. Facets MSW tests: 14/14 passed. Native CI and combined deployed verification remain pending.
- Native SDK console/configuration and full successful login remain unverified. Prior green CI does not establish them.

## Validation and cleanup

Use exact pathspec commits. Run the smallest contract tests serially after host preflight; CI owns full rebuilds. Browser QA uses ego against alpha/production, with one reusable task space. Credentials are transferred only to the authorized repository's secret/variable destinations and never logged. No subagents or local web servers are needed.
