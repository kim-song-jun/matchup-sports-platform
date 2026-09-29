# Task 176 — Personal Match Host Review Eligibility

## Scope

- Backend: `apps/v1_api/src/reviews/reviews.service.ts`
- Contract tests: `apps/v1_api/src/reviews/reviews.service.spec.ts`
- API/scenario docs: `docs/api/domains/supporting-domains.md`, `docs/scenarios/12-v1-sm-new-e2e-scenarios.md`

## Problem

Completed personal matches expose a review CTA to the host. When the host created the match with
`hostParticipates=false`, `GET /reviews/sources/match/:id` rejected the host with
`403 NOT_SOURCE_PARTICIPANT`, even though the host remains the event operator and has real participants
to review.

## Acceptance Criteria

- [x] A personal-match host can load and submit reviews for eligible actual participants even when the
  host did not participate.
- [x] A non-participating host is added to eligible participants' review target list, while self-review and duplicate host targets remain excluded.
- [x] A user who is neither host nor eligible participant remains forbidden.
- [x] Pending review lookup uses the same host-or-participant eligibility rule.
- [x] Targeted API tests pass.
- [x] Typecheck passes.

## Progress Snapshot

- 2026-09-28: Alpha match `59b656d9-a963-4f23-9aca-0b8ac75abcdf` reproduced the contract mismatch:
  completed, `hostParticipates=false`, one actual participant, review-source request returned 403.
- 2026-09-28: Implemented host reviewer eligibility while keeping targets restricted to actual eligible
  participants.
- 2026-09-28: Review-focused unit run passed (3 suites, 128 tests). `v1_api` TypeScript check passed.
- 2026-09-29: Product follow-up made the organizer relationship bidirectional: eligible participants can
  now review a non-playing host, and pending target counts include the host exactly once.
