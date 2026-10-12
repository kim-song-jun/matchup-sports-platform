# Open PR integration and Kakao release — 2026-10-12

## Request and scope

The user authorized reviewing, repairing, and merging the currently open PRs #1837, #1843, and #1848 into dev, testing alpha, creating the dev-to-main promotion PR, and deploying main only after release blockers are cleared. On 2026-10-12 the user explicitly requested a new Kakao app in the logged-in account, migration of existing users, and consent/privacy settings matching actual collection. New-app console setup is authorized; production credential cutover requires demonstrated existing-account continuity. Do not expose credentials, rewrite existing consents, or submit store releases as a side effect.

## Ownership

- #1837: Kakao SDK startup timeout, native consent-scope parity, reproducible iOS dependencies, release documentation and configuration wiring.
- #1843: match MSW sport filter contract, final PR description, review and integration verification.
- #1848: reconcile the latest dev room-detail resync with permanent-error filtering; retain both regression contracts.
- Forbidden: unrelated worktree changes, secret values in tracked files or reports, DB resets, rollback, and unverified main promotion.

## Acceptance criteria / exit proof

- [ ] Email signup keeps direct verification; Kakao-supplied contacts bypass duplicate OTP. Existing verified contact matches attach Kakao to the original user ID; conflicting members never merge.
- [ ] A real HTTP/DB integration test proves account/profile preservation and social profile completion with phone verification enforced and no SMS challenge.

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

### 2026-10-12 follow-up

- Contact implementation at `e314d0625` passed API and Web CI, including the real `auth-kakao-contact-link.integration-spec.ts` DB suite (overall integration: 160 suites, 1161 passed, 3 skipped). Android and iOS also passed. The conservative SQL gate rejected new immutable terms INSERT/guard statements; their exact statements and compatibility rationale are now registered for the next CI revision.
- Kakao Maps is enabled with the app's free quota. Email, nickname and profile-image scopes are optional; name/phone/gender/birthday/birthyear remain awaiting review. Native platform keys are separate for production and alpha; alpha signing hash is registered and production package/bundle IDs are registered. Native keys and alpha REST/app-ID secrets were transferred to GitHub without logging values.
- iOS now resolves a distinct native key per flavor. Real xcconfig-generation and upload-rejection contracts passed locally. Alpha deployment now uses dedicated credentials and fails closed before activation if required values are invalid. Maps DB/JS alignment and actual new-app login remain required before release.
- AWS CLI session expired during read-only verification. No production credentials changed. User directed switching Ego to For Apps; old TaskSpace 283 closed and TaskSpace 304 has the existing Play app (`kr.co.teameet`, currently under review).

- #1843 merged into dev as `8b9fff12b9c6b066fa6c09b6cfa68a769a13ebb8` after API/Web/Gates success. #1848 merged as `3d7180ea2d44f251648d24eb12a1abf5fb0392cd` after the same checks; root checkout fast-forwarded after each merge.
- #1837 `67dd77add` passed API/Web/Gates, Android and iOS. iOS alpha/production tests, production Release build and built crypto audit passed. Additional user-requested contact/consent changes below need a fresh exact-head CI run.
- Business registration and business-information review submitted for Kakao app `1604606`. Personal information review submitted for optional name, gender, phone, birthday and birthyear using the actual production signup screenshot. Both console statuses are `심사 중`; personal review proceeds after business approval. No age_range, CI or shipping request.
- New-app REST callbacks saved for production and alpha. Both unused new client secrets were regenerated before integration, and secret logging is suppressed. Production credentials remain unchanged pending the release gate.
- User clarified ordinary flows: direct verification for email signup; no duplicate email/SMS verification for Kakao; automatic linking via consistent previously verified service contacts. Code and profile UI now implement this. New provider email/phone are confirmed from server-fetched Kakao data, and Gregorian birth date is prefilled. Contact collision/race/unverified legacy boundaries are tested.
- Focused auth/date tests: 124 passed. Social signup UI tests: 42 passed. Immutable privacy disclosure test: 1 passed. Web TypeScript passed. Stale local Prisma generated types were refreshed; the preceding compile failure is resolved. Local Docker is off, so real DB integration execution is delegated to CI, not claimed passed.
- Added append-only privacy policy v1.5 and signup privacy v1.2 with Kakao collection, optional scopes, contact matching and 30-day deletion grace disclosures. Existing consent/document rows are preserved.
- Current production old-app Kakao authorization/callback reached the actual social profile screen through required terms; the current account is a pending signup, not an admin login. This does not prove the new app or native device login.

- Baseline dev: `7225b1514f8daa885a05fef2f7c0859d0bc9cf14`; main/runtime: `eda4a05de8543f95f0c88376baac7212086c1037` / `1.6.10`.
- #1837 has five unresolved review findings; #1843 has one MSW parity finding; #1848 has no unresolved review thread but conflicts with current dev.
- Existing PR worktrees contain only pre-existing untracked node_modules links; do not stage or remove them. No new branch or worktree is created.
- Kakao app `1604606` was created after the user's explicit new-app request. Name: 팀밋 (Teameet); operator: 아이위(IWI), matching live signup terms; domain: https://teameet.co.kr. No production credentials have been replaced.
- Existing-account transition is not yet safe: verified-email linking exists, but phone-based linking rejects an account that already has an active identity of the same provider. Kakao's official app-management documentation warns that a new app does not automatically carry existing membership across.
- Web Kakao startup/native bridge regression tests: 26/26 passed; web TypeScript passed. Facets MSW tests: 14/14 passed. Native CI and combined deployed verification remain pending.
- Native SDK console/configuration and full successful login remain unverified. Prior green CI does not establish them.

## Validation and cleanup

Use exact pathspec commits. Run the smallest contract tests serially after host preflight; CI owns full rebuilds. Browser QA uses ego against alpha/production, with one reusable task space. Credentials are transferred only to the authorized repository's secret/variable destinations and never logged. No subagents or local web servers are needed.
