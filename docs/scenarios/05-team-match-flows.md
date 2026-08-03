# Team Match Flow Scenarios

> **Stack scope note (Todo 26 reconciliation, 2026-08-04):** everything from `## Scenario Checklist` through `## Notes` below describes the **legacy** `apps/api` (port 8111) / `apps/web` (port 3003) stack. Its routes (`POST /team-matches/:id/result`, `POST /team-matches/:id/check-in`, `POST /team-matches/:id/evaluate`, `GET /team-matches/:id/referee-schedule`) still exist verbatim in `apps/api/src/team-matches/team-matches.controller.ts` — none of this is false, it just documents a different, older team-match implementation than the one Tasks 12-24 shipped. The **v1 team-match implementation is a full rewrite** with a different controller, different route shapes, a versioned `Game`/`GameResultRevision` result model, and no `check-in`/`evaluate`/`referee-schedule` routes at all. See `## v1 stack (Tasks 12-24)` immediately below for the current, verified v1 surface and the two Todo-26 E2E scenario IDs this domain owns.

## v1 stack (Tasks 12-24)

v1 team-match lives in `apps/v1_api/src/team-matches/team-matches.controller.ts` (`TeamMatchesController`), verified directly against the controller file (not inferred from an older doc):

| Method | Path | Notes |
|---|---|---|
| `GET` | `/team-matches` | list, `OptionalV1AuthGuard` |
| `POST` | `/team-matches` | create, `V1AuthGuard` + `CreatorProfileGuard` |
| `GET` | `/team-matches/:teamMatchId/edit`, `/team-matches/:teamMatchId` | edit-prefill / detail |
| `GET` | `/team-matches/:teamMatchId/application-eligibility` | pre-apply eligibility |
| `PATCH` | `/team-matches/:teamMatchId` | update |
| `POST` | `/team-matches/:teamMatchId/cancel`, `/close`, `/reopen` | lifecycle mutations |
| `POST` / `GET` | `/team-matches/:teamMatchId/applications` | apply / list applications (host view) |
| `POST` | `/team-match-applications/:applicationId/withdraw\|approve\|reject` | application lifecycle (own top-level path, not nested under `/team-matches`) |
| `GET` | `/me/team-matches` | my team matches |
| `GET` | `/team-matches/:teamMatchId/lineup` | lineup read |
| `PUT` | `/team-matches/:teamMatchId/lineup` | lineup save, via `TeamMatchLineupService` — **not** the generic `PUT /games/:gameId/lineups/:sideId` route, which returns `409 TEAM_MATCH_GENERIC_LINEUP_FORBIDDEN` for a team-match-sourced game (Task 14 deviation, see `docs/api/domains/games.md`) |
| `POST` | `/team-matches/:teamMatchId/lineup/submit` | lineup submit |
| `POST` | `/team-matches/:teamMatchId/lineup/change-request` | opponent requests a lineup change |

There is **no** `check-in`, `evaluate`, or `referee-schedule` route in this controller — the legacy section below's `TM-004` "도착 인증 / 경기 후 평가" scenario has no v1 equivalent today; it is not implemented, not merely undocumented.

**Result entry is a Game aggregate concern, not a `team-matches` route at all.** Per `docs/api/domains/games.md` (Task 16), a team match's result is drafted and submitted through `POST /games/:gameId/result-revisions` and `POST /games/:gameId/result-revisions/:revisionId/submit` (host team owner/manager only), and decided by the opposing team through `POST /games/:gameId/result-revisions/:revisionId/decision` (`approve`/`change_request`). The old `POST /api/v1/team-matches/:teamMatchId/complete` shortcut this replaced no longer exists (Task 16 removed it — see `games.md`'s route table). Web screens: `apps/v1_web/src/app/team-matches/[id]/result/page.tsx` (host draft/submit) and `apps/v1_web/src/app/team-matches/[id]/result/approval/page.tsx` (opponent decision) — these call the Game result-revision routes above, not a `team-matches`-namespaced result route.

### Todo 26 E2E scenario ledger for this domain

| ID | Covers | Primary spec |
|---|---|---|
| `E2E-TEAM-01` | Opponent lineup-change authorization: `POST /team-matches/:teamMatchId/lineup/change-request` is reachable only by the approved opponent team (not the host, not a non-participant team), and a host's own `PUT`/`submit` on their own lineup is unaffected by an opponent's pending change request. | `e2e/v1-tests/team-match.spec.ts` |
| `E2E-TEAM-02` | Host result submit → opponent decision round trip: host drafts and submits a `V1GameResultRevision` via the Game result-revision routes above, the match transitions to `completed` (idempotently, per the `games.md` "Deviations" `status != completed` guard), and only the *opposing* team's manager/owner — never the host's own manager/owner — can call the `decision` route (`approve`/`change_request`). | `e2e/v1-tests/team-match.spec.ts` |

Both IDs are **new** as of this reconciliation — `e2e/v1-tests/team-match.spec.ts` today only asserts `/team-matches` list render and the desktop/mobile "팀매치 만들기" CTA (step-0 smoke, verified by reading the spec file); it does not yet drive create→apply→approve, lineup save/submit/change-request, or result submit/decision. Implementing `E2E-TEAM-01`/`E2E-TEAM-02` end to end is out of this doc-reconciliation task's own scope (Todo 26 names the two IDs and points at where they belong; a later pass in the same task adds the actual Playwright assertions). Do not mark this row `Verified` until that Playwright coverage exists — this section is `Implemented` (routes exist and are wired) but `Unverified` (no E2E proof) as of this revision.

## Legacy stack (`apps/api` / `apps/web`) — Scenario Checklist

- [ ] TM-001 팀 매치 생성과 팀 선택 검증
- [ ] TM-002 상대 팀 신청과 상호 확인
- [ ] TM-003 승인 / 거절 후 상태 동기화와 알림 반영
- [ ] TM-003-B 신청 취소 / 모집 마감 / 재개 상태 동기화와 알림 반영
- [ ] TM-004 도착 인증 / 점수 입력 / 경기 후 평가

## TM-001 팀 매치 생성과 팀 선택 검증

### Preconditions

- [ ] `팀장오너E2E` 또는 `매니저E2E` 계정을 준비한다.
- [ ] 생성 가능한 팀이 존재한다.

### Steps

- [ ] `/team-matches/new`에 진입한다.
- [ ] 생성 가능한 팀 목록이 노출되는지 확인한다.
- [ ] 팀을 선택하고 팀 매치를 생성한다.
- [ ] 생성 후 상세 페이지로 이동한다.

### Expected

- [ ] 생성 가능한 팀만 선택 가능하다.
- [ ] host team 정보가 상세에 노출된다.
- [ ] `/team-matches`, `/my/team-matches`에 반영된다.
- [ ] 일반팀원은 생성이 차단된다.

## TM-002 상대 팀 신청과 상호 확인

### Preconditions

- [ ] 호스트 팀이 생성한 팀 매치가 있다.
- [ ] 신청 가능한 다른 팀 계정을 준비한다.

### Steps

- [ ] 신청 사용자 컨텍스트에서 상세를 연다.
- [ ] 어떤 팀으로 신청할지 선택한다.
- [ ] 신청을 제출한다.
- [ ] 호스트 컨텍스트에서 신청 목록 또는 상태 화면을 연다.
- [ ] 신청자 컨텍스트에서 내 신청 상태를 본다.

### Expected

- [ ] 팀 선택 없이 신청이 완료되지 않는다.
- [ ] 호스트는 신청 팀 목록을 볼 수 있다.
- [ ] 신청자는 자신의 상태를 볼 수 있다.

## TM-003 승인 / 거절 후 상태 동기화와 알림 반영

### Steps

- [ ] 호스트가 신청을 승인한다.
- [ ] 신청자 화면에서 상태를 확인한다.
- [ ] 알림 화면을 확인한다.
- [ ] 거절 케이스도 별도 데이터로 재현한다.

### Expected

- [ ] `pending -> approved/rejected` 전환이 양쪽에 반영된다.
- [ ] 알림이 생성된다.
- [ ] 새로고침 후에도 상태가 유지된다.

## TM-003-B 신청 취소 / 모집 마감 / 재개 상태 동기화와 알림 반영

### Steps

- [ ] 신청팀 owner/manager가 신청을 취소한다.
- [ ] 호스트 컨텍스트에서 신청 취소 알림과 신청 상태를 확인한다.
- [ ] 호스트가 모집을 마감한다.
- [ ] 대기 중 신청이 `expired`로 바뀌고 신규 신청이 차단되는지 확인한다.
- [ ] 호스트가 모집을 재개한다.
- [ ] 재개 후 신규 신청이 가능한지 확인한다.

### Expected

- [ ] 신청 취소는 `requested -> withdrawn`으로 저장되고 호스트에게 알림이 생성된다.
- [ ] 모집 마감은 팀매치를 `closed`로 저장하고 pending 신청을 `expired`로 전환한다.
- [ ] 모집 재개는 `closed -> recruiting`으로 저장하되 expired 신청을 자동 복구하지 않는다.
- [ ] 각 전이는 새로고침 후에도 유지된다.

## TM-004 도착 인증 / 점수 입력 / 경기 후 평가

### Steps

- [ ] 양 팀이 도착 인증 페이지에 진입한다.
- [ ] 점수 입력과 결과 제출을 수행한다.
- [ ] 경기 후 평가를 제출한다.

### Expected

- [ ] 단계가 끊기지 않고 이어진다.
- [ ] 이미 완료한 단계를 중복 제출할 수 없다.
- [ ] 결과와 평가가 후속 화면에 반영된다.
- [ ] `arrival`은 실제 참가 팀과 저장된 `arrivalChecks` 기준으로 hydrate된다.
- [ ] GPS 반경 판정, 사진 업로드, 상대팀 지각/노쇼 판정은 미지원이면 fake control 대신 안내형 UI로 노출된다.
- [ ] `score`는 실제 `quarterCount`와 확정된 두 참가 팀 기준으로 저장되고, `completed` 후에는 read-only 상태를 본다.
- [ ] `evaluate`는 `completed` 경기에서만 제출 가능하고, 실제 참가 팀 기준으로 팀당 1회만 제출된다.

## Notes

- 팀 매치는 권한, 실시간, 알림이 함께 얽혀 있어 핵심 회귀 세트로 다룬다.
- 2026-06-04: 팀매치 생성은 현재 사용자의 owner/manager 팀만 선택지로 표시하도록 고정했고, 팀매치 상세의 신청팀 섹션은 호스트에게만 노출하며 승인 완료 이후에만 채팅 진입점을 보여주도록 정리했다.
- 2026-04-07: `/teams/new`, `/my/teams`, `/team-matches`, `/team-matches/new` step 0 Desktop Chrome 스모크는 통과했다. 실제 신청/승인/거절/알림/경기 후 평가 흐름은 다음 자동화 묶음으로 남아 있다.
- 2026-04-07: `e2e/tests/team-owner-flow.spec.ts` Desktop Chrome smoke는 통과했다. 현재 자동화 범위는 팀 생성/my teams/team-matches step-0 진입까지이며, 신청/승인/알림/평가 시나리오는 후속 범위다.
- 2026-04-11: `TM-004` 운영 화면 계약은 실제 `team-match` detail 기반으로 정렬되었고, arrival 재제출도 backend에서 차단되도록 닫았다. 전용 Playwright spec(`e2e/tests/team-match-operations.spec.ts`)은 `/team-matches` warmup으로 조정했고, live API `health`/`dev-login`도 다시 통과했다. 다만 현재 host Next dev runtime에서 `/team-matches` 계열이 간헐적으로 `ERR_CONNECTION_RESET` 또는 generic `Internal Server Error`를 반환해 browser green은 아직 별도 런타임 정리 후 다시 확인해야 한다.
- 2026-04-23: team-match 관리 follow-up으로 `PATCH /team-matches/:id` 수정/취소와 history 조회 status list 계약을 추가했다. `/my/team-matches`, `/teams/:id/matches`는 기본 `recruiting`만 보지 않고 history status를 명시적으로 조회해야 한다.
- 2026-08-04 (Todo 26): added the `## v1 stack (Tasks 12-24)` section above after verifying the actual v1 `TeamMatchesController` route table and cross-checking result entry against `docs/api/domains/games.md`. The legacy `TM-004` scenario's `check-in`/`evaluate`/`referee-schedule` steps have no v1 route today (confirmed by reading the controller, not inferred) — this is recorded as a real gap, not silently dropped. `E2E-TEAM-01`/`E2E-TEAM-02` are named per Todo 26's acceptance criteria and pointed at `e2e/v1-tests/team-match.spec.ts`, which does not yet implement them.
