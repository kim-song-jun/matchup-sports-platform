# Task 124 — v1 약관 v1.1 데이터화 및 기존 동의 무손실 연결

## Objective

현재 v1 코드에 고정된 회원가입, 대회 신청, 하단 공개 문서를 공식 `v1.1` 약관 데이터로 등록하고, 기존 사용자·대회 신청 동의 원본을 삭제하거나 변경하지 않은 채 버전형 동의 이력에 연결한다.

## Scope

- Backend/data: `apps/v1_api`, `apps/v1_api/prisma`
- Contract docs: `docs/api/`, `docs/scenarios/`
- Current fixed-copy sources are read-only inputs in this phase:
  - `apps/v1_web/src/components/auth/terms-client.tsx`
  - `apps/v1_web/src/components/auth/auth.view-model.ts`
  - `apps/v1_web/src/app/tournaments/[id]/apply/tournament-apply-client.tsx`
  - `apps/v1_web/src/components/v1-ui/shell.tsx`
- Admin API/UI management, signup/existing-user re-consent runtime, tournament application, and footer/direct-document runtime cutover are included. The signup location choice is included as the independently managed `signup_location` optional policy; the footer `location_terms` document remains a separate public policy.

## Non-negotiable Data Rules

- Existing `v1_terms_documents`, `v1_user_terms_consents`, and tournament registration agreement columns are not deleted, renamed, rewritten, or reset.
- Existing boolean values remain byte-for-byte authoritative legacy values.
- Unknown historical version/time is never guessed.
- Migration is additive and idempotent; no seed/reset flow is used for production data conversion.
- Published document rows are immutable in the application contract; future content changes create a new version.

## Canonical v1.1 Groups

### Signup / account

- Service terms
- Privacy collection/use terms
- Any currently displayed signup optional term discovered during inventory

### Tournament application

- Tournament rules and notices
- Tournament privacy collection/use
- Entry fee/cancellation/refund policy
- Photo/video capture and promotional use

### Footer/public

- Service terms
- Privacy policy
- Location-based service terms
- Tournament operating policy
- Support remains public managed content only if confirmed as a legal/content document; it does not create consent rows.

## Proposed Data Contract

- Stable policy identity separated from immutable version documents.
- Placement/context separated from the document (`signup`, `tournament_application`, `footer`).
- Requirement separated per placement (`required`, `optional`, `display_only`).
- Append-only consent event records reference the exact document version.
- Tournament consent events retain registration, team, and applying user context.
- Legacy provenance and nullable historical decision time are explicit.

## Phases

- [x] Phase 1 — inventory current documents and existing persistence contracts
- [x] Phase 2 — additive Prisma schema and SQL migration
- [x] Phase 3 — register canonical v1.1 documents and placements
- [x] Phase 4 — backfill existing signup/tournament choices without changing originals
- [x] Phase 5 — parity, idempotency, and regression tests
- [x] Phase 6 — API/scenario documentation sync
- [x] Phase 7 — apply the additive migration to the existing local developer database
- [x] Phase 8 — admin list, draft/version, publication, placement, permission, and preview management
- [x] Phase 9 — public current-signup-terms and authenticated consent APIs
- [x] Phase 10 — email/social signup document binding and existing-user re-consent gate
- [x] Phase 11 — runtime migration, responsive QA, regression, and contract documentation
- [x] Phase 12 — document subtitle, effective-date activation, and user-facing summary semantics
- [x] Phase 13 — tournament application and footer/direct-document managed runtime cutover
- [x] Phase 14 — login-time mandatory renewal with browser-back bypass prevention
- [x] Phase 15 — new-version publication, live DB consent decisions, full regression, and browser QA

## Acceptance Criteria

- [x] Original document, user-consent, and tournament boolean row counts are unchanged.
- [x] Original tournament agreement `true/false` distributions are unchanged.
- [x] Every canonical current document has a stable policy code and immutable `v1.1` document row.
- [x] Existing signup consent rows remain linked to their original document IDs and receive explicit legacy provenance in the new history model.
- [x] Existing tournament agreement values can be resolved per registration/team/applicant without overwriting the source columns.
- [x] Historical timestamps or versions that cannot be proven remain null/unverified.
- [x] Re-running the backfill creates no duplicates and changes no original values.
- [x] Prisma generation, focused tests, API regression suite, build, and scoped diff checks pass.
- [x] Active owner/ops can manage policies and immutable versions; active support can read but cannot mutate.
- [ ] Admin desktop/tablet/mobile views show all 12 policies, the actual stored body preview, no horizontal overflow, and no console/network failures.
- [x] New signups submit the exact current required document IDs; a stale or incomplete document set is rejected server-side.
- [x] Signup exposes `signup_location` as an optional third item, stores accepted/not-accepted append-only decisions, and never blocks signup or existing-user compliance when unchecked.
- [x] Existing users keep their onboarding state and prior events, see satisfied current terms checked, and cannot continue through protected routes until newly enforced required documents are accepted.
- [x] Re-consent creates append-only `web` events and never rewrites legacy consent rows or prior managed events.
- [x] A new document version can explicitly require re-consent and can schedule when enforcement begins for existing users.
- [x] A future-effective version does not replace the currently effective document early; an immediate version becomes current atomically.
- [x] Tournament applications submit the exact current managed document IDs and record append-only decisions in the registration transaction.
- [x] Footer/direct legal pages render managed footer documents and expose the subtitle separately from the renewal-only change summary.
- [x] Email login routes a non-compliant user directly to renewal, preserves the original safe destination, and browser Back cannot bypass the gate.

## Ambiguity Log

- The existing signup DB seed documents may not match the full hardcoded Web copy shown historically. Preserve the original relation and mark display-version provenance unverified unless equality can be proven.
- A false optional tournament media boolean means `not accepted`; it must not be promoted to an affirmative decline if the UI did not record that distinction.
- Footer support content is not itself a consent document and must not create user consent history.

## Progress Snapshot

- 2026-07-23 final signup copy: The required-consent summary and all three signup document subtitles were pinned to the user-approved Korean copy. The canonical JSON, baseline generator, subtitle migration, Web rendering test, current local DB, and live signup terms API must remain byte-for-byte aligned with these strings.
- 2026-07-23 final footer copy: The user separately pinned the four footer document title/subtitle pairs for service terms, privacy policy, location terms, and tournament policy. These footer copies remain independent from the three signup policies even where the approved subtitle text is identical.
- 2026-07-23 final tournament copy: The four tournament-application document subtitles were pinned to the user-approved eligibility/identity, participant privacy, payment/refund, and media-usage summaries while retaining the existing immutable titles and policy IDs.
- 2026-07-22 extension in progress: Before production rollout, the user requested restoring the signup location choice into the v1.1 baseline. It is normalized as `signup_location`, optional in the signup context, and independently versioned from footer `location_terms`; existing policy/document IDs 1-11 remain stable.
- 2026-07-22 extension verification: The regenerated production baseline contains 12 policies/documents/placements, baseline contract tests passed 7/7, and the existing Web optional-selection contract passed 6/6. The current `db push` local database received only policy/document/placement 12 plus its subtitle in one transaction; the live API returned `ready=true` with required items at display order 0/1 and optional `signup_location` at order 2.

- 2026-07-22 final extension: Added independent subtitles for all 11 canonical documents; ordinary views use `subtitle` and renewal guidance uses `changeSummary`. The local migration verified 11/11 populated subtitles.
- 2026-07-22 final extension: Scheduled publication retained the effective version until `effectiveAt`; an immediate version became current. Tournament application and footer/direct legal reads now consume managed runtime documents.
- 2026-07-22 final extension: Real API/browser QA created isolated temporary versions and a user, verified login-to-renewal, protected API 403, browser-Back blocking, acceptance return to `/my`, managed footer subtitle, four tournament documents, and zero console/network failures at 390x844. Exact cleanup left zero matching QA policies/users.
- 2026-07-22 final extension: Validation passed API 88 suites / 1,047 tests excluding the known shared-upload-directory spec, Web 120 files / 602 tests, API/Web typechecks, Prisma generation, and both production builds.

- 2026-07-22: User approved the DB-first, zero-data-loss v1.1 baseline and existing-consent connection phase.
- 2026-07-22: Work started from `dev` commit `2e455e04` on `feat/v1-versioned-terms-consent-v11-20260722`.
- 2026-07-22: Current Web sources initially produced 10 shared policies/documents and 11 placements.
- 2026-07-22: User required identical content to remain independently manageable per surface. Signup service terms and footer service terms were split, producing 11 stable policies, 11 immutable `v1.1` documents, and 11 placements.
- 2026-07-22: An isolated PostgreSQL 16 database applied all 70 prior migrations plus the new baseline. Mixed legacy rows remained JSON-identical, false choices were preserved, and a backfill rerun inserted zero rows.
- 2026-07-22: After the explicit 11-document split, focused baseline tests passed (6/6), Prisma validate/generate passed, API build passed, and the API unit suite passed 85 suites / 1031 tests excluding the pre-existing real-upload-directory spec.
- 2026-07-22: A fresh isolated PostgreSQL 16 run re-applied all 70 prior migrations and the regenerated baseline, proving 11 policies/documents/placements, separate IDs with equal service-term bodies, signup-only legacy mapping, original-row JSON equality, false preservation, and zero inserts on backfill rerun.
- 2026-07-22: The excluded upload spec targets the shared `apps/v1_api/uploads` directory and attempted non-recursive cleanup against the existing `2026` directory. It was not rerun to avoid deleting runtime files; this is unrelated to the managed-terms change.
- 2026-07-22: User approved local DB application and admin management. The existing developer DB retained 29 users, 18 legacy user-consent rows, and 8 tournament registrations with all original agreement boolean distributions unchanged. The migration added 11 policies/documents/placements and 50 append-only provenance events.
- 2026-07-22: The local database had been created through historical `db push` and had no `_prisma_migrations` history, so `prisma migrate deploy` correctly stopped with P3005. Only the reviewed Task 124 SQL migration was then applied directly; no baseline, seed, reset, delete, or source-row update was run.
- 2026-07-22: Admin owner/ops CRUD, immutable version publication/archive, placement configuration, support read-only access, audit logging, and real stored-body preview were implemented. Live owner mutation with exact-ID cleanup and support 403/no-write checks passed.
- 2026-07-22: `/admin/terms` passed 1440×900, 768×900, and 390×844 browser checks with 11/11 policies, HTTP 200, zero horizontal overflow, and no console or failed-network entries. Signup/tournament/footer runtime consumption remains out of scope.
- 2026-07-22: Final regression was green: API 86 suites / 1,037 tests (excluding the destructive shared-upload-directory spec), Web 119 files / 593 tests, API build, Web build, and Web typecheck. The production build includes the static `/admin/terms` route.
- 2026-07-22: Signup runtime now serves current DB documents, validates exact document IDs for email/social signup, records append-only verified Web events, and gates existing users only for newly enforced required terms while preserving prior checked choices.
- 2026-07-22: Focused runtime validation passed API 4 suites / 39 tests, Web 3 files / 17 tests, and both v1 TypeScript checks. Full regression and responsive live-browser evidence remain Phase 11.
- 2026-07-22: Live startup caught and fixed a Nest guard dependency scope issue. The terms runtime is globally available in the application, while narrow controller test modules use the same Prisma-backed implementation through optional injection.
- 2026-07-22: Live protected-route QA caught and fixed a redirect race that replaced the original `/my` destination with `/terms`. The completion route now preserves the original safe redirect and the terms screen derives renewal mode from authenticated compliance.
- 2026-07-22: Final browser QA passed at 1440×900, 768×900, and 390×844 with one prior acceptance checked/disabled and one new requirement pending, HTTP 200, no horizontal overflow, no console errors, and no failed requests. Accepting only the new ID returned to `/my`, changed the protected API from 403 to 200, and produced two verified Web events total.
- 2026-07-22: Final regression passed API 88 suites / 1,044 tests (excluding the destructive shared-upload-directory spec), Web 120 files / 598 tests, API/Web typechecks, Prisma generation, and both production builds.
- 2026-07-22: The current compose DB had been recreated since the earlier 29-user verification and contained 1 user, 0 legacy consent rows, and 0 tournament registrations. The additive managed-terms data was reconciled to 11/11/11 without seed/reset or original-row updates. Browser QA used one exact-ID temporary user and two exact-user events; cleanup returned counts to 1/0/0 and left no QA rows.
- 2026-07-22: The manual Windows PowerShell SQL pipe used for local reconciliation had replaced Korean characters with `?` in all 11 baseline policy/document text rows. Canonical JSON and migration SQL remained valid UTF-8. `repair-v1-managed-terms-utf8.mjs` transactionally restored only the 11 fixed baseline IDs, retained 0→0 consent-event parity, wrote a migration audit, and reran with 0 repairs. DB and live API now return Korean titles/bodies; mobile `/terms` rendered the same text with HTTP 200 and no console/network failures.
