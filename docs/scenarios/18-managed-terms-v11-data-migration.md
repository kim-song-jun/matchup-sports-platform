# Managed terms v1.1 data migration

## Scope

현재 v1 Web에 고정된 회원가입, 대회 신청, 하단 문서를 `v1.1` 기준 데이터로 등록하고 기존 동의 원본을 수정하지 않은 채 append-only 이력으로 연결한다. 로컬 DB 적용, 관리자 관리 화면, 회원가입 및 기존 사용자 재동의 런타임까지 포함한다. 대회 신청·하단 노출의 DB 조회 전환은 범위 밖이다.

## Given / When / Then

### TERMS-DATA-001 — canonical baseline

- Given 현재 v1 고정 문구가 source of truth다.
- When `node scripts/qa/generate-v1-managed-terms-baseline.mjs`를 실행한다.
- Then snapshot과 migration은 11개 policy/document, 11개 placement, 전 문서 `version=v1.1`, source-derived SHA-256 hash와 일치해야 한다.
- And 회원가입 이용약관과 하단 이용약관은 본문이 같아도 서로 다른 policy/document ID를 가져 독립적으로 관리되어야 한다.

### TERMS-DATA-002 — signup legacy preservation

- Given 기존 `terms`, `privacy`, `marketing` 문서와 accepted/revoked 사용자 동의가 있다.
- When baseline migration을 적용한다.
- Then 원본 문서·동의 JSON은 동일해야 하고, `terms/privacy`만 provenance event로 연결되며 marketing은 원본 유지 + audit의 unmapped count로 남아야 한다.
- And 역사적 표시 버전을 증명할 수 없으므로 모든 이관 이벤트는 `versionVerified=false`여야 한다.

### TERMS-DATA-003 — tournament true/false preservation

- Given 네 동의 boolean 조합이 서로 다른 대회 신청이 있다.
- When baseline migration을 적용한다.
- Then 신청 원본 JSON과 각 boolean 분포는 동일해야 한다.
- And 신청마다 rules/privacy/refund/media 이벤트가 하나씩 생기며 true는 `accepted`, false는 `not_accepted`, `decidedAt=null`로 기록되어야 한다.

### TERMS-DATA-004 — idempotency

- Given baseline backfill이 한 번 완료됐다.
- When 동일한 세 backfill insert와 audit insert를 다시 실행한다.
- Then 모든 insert는 0건이고 event/audit 수 및 원본 데이터는 변하지 않아야 한다.

### TERMS-ADMIN-005 — immutable version management and permissions

- Given active owner/ops and support administrators exist.
- When owner/ops creates and edits a draft, publishes or archives it with a reason, or changes placement settings.
- Then every mutation is persisted with an audit record, the prior published version is archived atomically, and published/archived bodies cannot be edited or deleted.
- And support can read the same 11 policies and consent counts but every mutation returns `403` with zero rows written.

### TERMS-ADMIN-006 — responsive actual-content preview

- Given the 11 `v1.1` documents are loaded from the API.
- When `/admin/terms` is opened at desktop, tablet, and mobile widths.
- Then all 11 policies are selectable, the preview uses the selected document's actual stored title/body, and there is no horizontal overflow, console error, or failed network request.

### TERMS-RUNTIME-007 — exact current documents on signup

- Given active required signup placements have published documents.
- When an email or social signup submits the accepted document IDs.
- Then the server creates the user/advances social signup only when every current required ID is present.
- And stale IDs fail with `TERMS_DOCUMENT_STALE`, missing current IDs fail with `TERMS_REQUIRED`, and no managed or legacy consent row is partially rewritten.

### TERMS-RUNTIME-008 — existing-user re-consent

- Given an existing user accepted an earlier/current required document and a new required document is enforced.
- When the user opens a protected route.
- Then the API returns `403 TERMS_RECONSENT_REQUIRED` and the Web moves to `/terms?mode=renewal`.
- And previously satisfied documents stay checked and disabled, while only the new required document must be checked before continuing to the original safe redirect.

### TERMS-RUNTIME-009 — version policy and enforcement time

- Given a published version has `requiresReconsent=false`.
- When the user accepted an earlier version of the same policy.
- Then that earlier acceptance satisfies the current version.
- Given a version has a future `enforcementAt`.
- When an existing user accesses the service before that time.
- Then access is not blocked, while a new signup still accepts the current published required document.

### TERMS-RUNTIME-010 — append-only completion

- Given the user submits all pending current required IDs.
- When `POST /api/v1/terms/consents` succeeds.
- Then only verified `web` acceptance events are added, compliance becomes true, and legacy/prior managed rows remain unchanged.

### TERMS-RUNTIME-011 — subtitle and change-summary semantics

- Given a managed document has both `subtitle` and `changeSummary`.
- When it is rendered in an ordinary signup, tournament, footer, or direct-document view.
- Then the subtitle is the secondary heading and the change summary is not presented as ordinary descriptive copy.
- And when renewal is required, the change summary is shown separately as the reason for the new consent request.

### TERMS-RUNTIME-012 — effective publication

- Given one published document is currently effective and a new version is published with a future `effectiveAt`.
- When current terms are queried before that time.
- Then the existing effective document remains current.
- And an immediately effective version becomes current atomically without exposing two current versions.

### TERMS-RUNTIME-013 — tournament and footer cutover

- Given current managed placements exist for `tournament_application` and `footer`.
- When a team submits a tournament application or a user opens a footer/direct legal page.
- Then the UI and API use those exact current document versions rather than hardcoded runtime copy.
- And the tournament transaction records exact document decisions with registration, team, and applicant provenance while retaining the legacy booleans.

### TERMS-RUNTIME-014 — login and browser-back enforcement

- Given an existing user is missing a newly effective required signup document.
- When email login succeeds with an original protected destination.
- Then login immediately routes to renewal, preserves the original safe redirect, and protected APIs remain blocked.
- And browser Back cannot leave the renewal gate; only accepting all pending required documents can continue to the original destination.

## Verification evidence — 2026-07-22

- Existing 70 migration directories applied to an isolated `postgres:16-alpine` database.
- Mixed fixture: 3 legacy documents, 3 user consents including revocation and unmapped marketing, 2 tournament registrations with true/false combinations.
- Baseline migration applied successfully after the explicit document split: 11 policies, 11 published `v1.1` documents, 11 placements, 11 migrated events.
- Backfill rerun result: four inserts each reported `INSERT 0 0`.
- SQL assertions passed for byte-equivalent JSON of legacy documents, user consents, tournament registrations, exact event distributions, unverified versions, nullable historical tournament decision times, and preserved false values.
- The isolated container was stopped with `--rm`; no developer or deployed database was used.
- The existing local developer database retained 29 users, 18 user-consent rows, and 8 tournament registrations. Each tournament agreement column retained its original 6 true / 2 false distribution; 50 append-only provenance events were added.
- Local migration topology caveat: the database had no `_prisma_migrations` table because it predated migration tracking. `migrate deploy` stopped with P3005, so only the reviewed Task 124 SQL was applied directly; no baseline, seed, reset, delete, or source-row update ran.
- Live API owner flow created, edited, and archived one temporary version, verified three audit rows, and removed only those exact QA IDs. Support read 11 policies, received `403` on mutation, and wrote zero rows.
- Browser verification passed at 1440×900, 768×900, and 390×844: route 200, policy count 11, actual preview visible, horizontal overflow false, console errors 0, failed requests 0.
- Runtime focused tests passed: API 4 suites / 39 tests, Web renewal/auth 17 tests, and both v1 TypeScript checks.
- Final API regression passed 88 suites / 1,044 tests, excluding the known destructive shared-upload-directory spec; final Web regression passed 120 files / 598 tests. API/Web production builds and Prisma generation passed.
- Live API verified anonymous current terms (2 required), authenticated compliance with 1 accepted + 1 pending, protected-route `403 TERMS_RECONSENT_REQUIRED`, stale-ID `400 TERMS_DOCUMENT_STALE`, and protected-route 200 after completion.
- Live browser verification passed at 1440×900, 768×900, and 390×844 from `/my`: one prior item stayed checked/disabled, one item showed `새 동의 필요`, no horizontal overflow/console error/failed request occurred, and submitting only the new ID returned to `/my`.
- QA found and fixed two integration defects before completion: Nest guard dependency visibility across domain modules, and a renewal redirect race that overwrote `redirect=/my` with `redirect=/terms`.
- Runtime QA used one exact-ID temporary user and exact-user consent events. After verification, 2 QA events and the QA user were deleted; current compose counts returned to 1 user, 0 legacy consent rows, and 0 tournament registrations.
- Windows PowerShell string piping corrupted the manually applied baseline Korean text to `?` while repository JSON/SQL remained valid UTF-8. The scoped remediation restored 11 policy names and 11 immutable baseline document text rows from canonical JSON, preserved consent-event count 0→0, recorded an audit snapshot, and produced 0 changes on rerun.
- Post-remediation DB checks found 11/11 policies and documents with zero replacement-question-mark rows. Live `GET /api/v1/terms/current?context=signup` returned Korean titles and bodies, and mobile `/terms` rendered them with HTTP 200 and no console or failed-network entries.
- Subtitle migration populated all 11 canonical documents. Ordinary managed views render `subtitle`, while renewal guidance renders `changeSummary` separately.
- Real admin API version-flow QA proved that a scheduled version stays inactive early and an immediate version becomes current. The same run verified login routing to renewal, protected API 403, browser-Back blocking, acceptance return to `/my`, managed footer subtitle, four current tournament documents, and zero browser console/network failures at 390x844.
- The live QA used one exact temporary policy and one exact temporary user and removed both in `finally`; post-cleanup counts were zero for both QA selectors.
- Final regression passed API 88 suites / 1,047 tests excluding the known shared-upload-directory spec, Web 120 files / 602 tests, both TypeScript checks, Prisma generation, and both production builds.
