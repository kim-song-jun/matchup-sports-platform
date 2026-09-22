> 친선 팀매치의 현재 전체 화면 흐름, 화면별 입출력, 공식 기록 반영 규칙과 모바일/데스크톱
> 스크린샷 32개는 [`friendly-team-match-screen-flow.md`](../qa-screenshots/friendly-team-match-screen-flow.md)를 참고한다.

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
| `POST` | `/admin/team-matches` | owner/ops 플랫폼 운영자가 팀을 지정하지 않은 `recruiting` 팀매치 생성 |
| `POST` | `/admin/team-matches/:teamMatchId/applications/:applicationId/approve` | owner/ops 플랫폼 운영자가 신청 팀을 한 팀씩 승인. 두 번째 승인에서 `matched`로 확정 |
| `GET` | `/me/team-matches` | my team matches |
| `GET` | `/team-matches/:teamMatchId/lineup` | lineup read |
| `PUT` | `/team-matches/:teamMatchId/lineup` | lineup save, via `TeamMatchLineupService` — **not** the generic `PUT /games/:gameId/lineups/:sideId` route, which returns `409 TEAM_MATCH_GENERIC_LINEUP_FORBIDDEN` for a team-match-sourced game (Task 14 deviation, see `docs/api/domains/games.md`) |
| `POST` | `/team-matches/:teamMatchId/lineup/submit` | lineup submit |
| `POST` | `/team-matches/:teamMatchId/lineup/change-request` | opponent requests a lineup change |

- 상대팀이 아직 승인되지 않은 모집 상태에서도 호스트 팀 owner/manager는 HOME 라인업을 조회하고 저장할 수 있어야 한다.
- 팀 owner/manager는 팀 일정 참석 응답이나 초대 없이 활성 팀원을 참석명단에 직접 추가할 수 있어야 한다.
- 등록 이미지가 있는 상세 hero는 원본 비율과 무관하게 `cover`/`center`로 표시해야 한다.

There is **no** `check-in`, `evaluate`, or `referee-schedule` route in this controller — the legacy section below's `TM-004` "도착 인증 / 경기 후 평가" scenario has no v1 equivalent today; it is not implemented, not merely undocumented.

**Result entry is a Game aggregate concern, not a `team-matches` route at all.** Per `docs/api/domains/games.md` (Task 16), a team match's result is drafted and submitted through `POST /games/:gameId/result-revisions` and `POST /games/:gameId/result-revisions/:revisionId/submit` (host team owner/manager only), and decided by the opposing team through `POST /games/:gameId/result-revisions/:revisionId/decision` (`approve`/`change_request`). The old `POST /api/v1/team-matches/:teamMatchId/complete` shortcut this replaced no longer exists (Task 16 removed it — see `games.md`'s route table). Web screens: `apps/v1_web/src/app/team-matches/[id]/result/page.tsx` (host draft/submit) and `apps/v1_web/src/app/team-matches/[id]/result/approval/page.tsx` (opponent decision) — these call the Game result-revision routes above, not a `team-matches`-namespaced result route.

**Friendly player records (Task 159):** the host result screen submits detailed statistics for its own visible lineup. The API then merges the latest valid lineup for both HOME and AWAY before freezing the revision. Missing opponent rows receive zero counting stats but keep their side and identity link, so approval makes both teams' lineup participants eligible for appearance and win/draw/loss records. Team facts remain the existing two-sided official-result projection.

### Todo 26 E2E scenario ledger for this domain

| ID | Covers | Primary spec |
|---|---|---|
| `E2E-TEAM-01` | Opponent lineup-change authorization: `POST /team-matches/:teamMatchId/lineup/change-request` is reachable only by the approved opponent team (not the host, not a non-participant team), and a host's own `PUT`/`submit` on their own lineup is unaffected by an opponent's pending change request. | `e2e/v1-tests/team-match.spec.ts` |
| `E2E-TEAM-02` | Host result submit → opponent decision round trip: host drafts and submits a `V1GameResultRevision` via the Game result-revision routes above, the match transitions to `completed` (idempotently, per the `games.md` "Deviations" `status != completed` guard), and only the *opposing* team's manager/owner — never the host's own manager/owner — can call the `decision` route (`approve`/`change_request`). | `e2e/v1-tests/team-match.spec.ts` |
| `E2E-TEAM-03` | Platform admin creates a hostless recruitment, the exact ID appears in the public list, a same-sport team manager applies through the real browser/API path, and the persisted `requested` application appears in admin detail. | `e2e/v1-tests/admin-platform-team-match-flow.spec.ts` |

`E2E-TEAM-01` and `E2E-TEAM-02` remain unverified: `e2e/v1-tests/team-match.spec.ts` does not yet drive lineup-change authorization or result submit/decision end to end. `E2E-TEAM-03` is separately verified by Task 149's real API/DB and browser run below; that proof does not imply the other two scenarios passed.

### Admin platform recruitment

- 2026-09-21 assigned-detail proof: headed Chrome created a real admin recruitment, submitted two same-sport team applications, assigned HOME/AWAY, followed the public list card link, and verified `platformManaged=true`, both real teams, and the 120,000/60,000 cost split on the public detail. Evidence: `docs/screenshots/task149-admin-team-match-condition-parity/*-public-detail-provenance.png`; focused E2E 2/2 passed.

- active owner/ops admin은 `/admin/team-matches/new`에서 일반 팀매치 모집과 같은 대표 이미지·실력·경기 방식·스타일·유니폼·성별·총 비용/상대팀 비용·지역·장소·일정을 입력해 팀 없는 모집을 연다. 신청 마감은 선택 사항이다.
- 생성 직후 팀매치는 `recruiting`이며 Game과 팀 일정은 아직 만들지 않는다.
- 공개 목록과 상세는 생성 직후 `Teameet 운영`과 `플랫폼 주관`을 표시한다.
- 관리자 상세는 저장된 대표 이미지와 실력 등급을 기존 형식·스타일·성별·유니폼·비용 조건과 함께 보여준다.
- 같은 종목의 활성 팀 manager 이상이 공개 상세에서 기존 신청 API로 참가를 요청한다.
- 관리자는 `/admin/team-matches/:id`의 신청 목록에서 서로 다른 두 신청을 홈·원정으로 선택한다.
- 확정 시 서버는 팀 상태와 종목을 다시 검증한 뒤 팀매치를 `matched`로 바꾸고 Game의 HOME/AWAY side, 양 팀 일정, 선택 신청 승인, 나머지 신청 거절, 감사 로그를 같은 트랜잭션에서 기록한다.
- 확정 뒤 공개 목록과 상세는 `플랫폼 주관` 출처를 유지하면서 실제 `홈팀 vs 원정팀` 이름과 홈팀 상세 링크를 보여준다.
- support admin은 생성·확정 UI 대신 권한 안내를 보고, API 직접 호출도 `403`으로 거절된다.
- 기존 팀 관리자용 모집/신청/승인 시나리오는 그대로 유지된다.
- 2026-09-19 actual-runtime proof: isolated v1 PostgreSQL/API/Web + headed Chrome에서 관리자 생성 `201`, 공개 목록 same-ID 노출, `송파 풋살 모임` 브라우저 신청 `201 requested`, 관리자 상세 신청 1건 영속 조회를 확인했다. 데스크톱·태블릿·모바일 증거와 JSON verdict는 `docs/screenshots/task149-admin-team-match/real-*`에 있다. 재현 스펙은 공식 Playwright QA 컨테이너 desktop 1/1 통과했다.

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

## V1 공동 경기 기록 — Task 172

정본: `.github/tasks/172-team-match-shared-record.md`. 친선 팀매치만 대상이며 대회/리그 운영 권한은 유지한다.

| ID | 페르소나 / 조건 | 액션 | 기대 결과 |
|---|---|---|---|
| TM-SHARED-01 | 경기 전 / 일반 사용자 | 상세 조회 | 기존 매치 정보, 기록 편집 없음 |
| TM-SHARED-02 | 시작 시간 경과 / 상대 확정 | 목록 조회 | 진행 중 표시, 목록에서 유지 |
| TM-SHARED-03 | 일반 사용자 | 진행 중 상세 | 점수 조회만 가능, 참가자·이력 비공개 |
| TM-SHARED-04 | 양 팀 일반 선수 | 상세 클릭 | 공동 기록 화면 진입 |
| TM-SHARED-05 | 홈 선수 | 팀·득점자·시간 등록 | 득점 수로 점수 계산, 상대 화면 반영 |
| TM-SHARED-06 | 원정 선수 | 홈 선수가 등록한 골 수정 | 득점자 수정·작성자 이력 공유 |
| TM-SHARED-07 | 양 팀 선수 | 삭제 → 이력에서 복구 | 점수 감소·복원, 새 변경 이력 |
| TM-SHARED-08 | 동시 작성 | 다른 참가자가 먼저 저장 | 작성 중 값 보존·충돌 안내, stale overwrite 금지 |
| TM-SHARED-09 | 첫 팀 | 종료 확인 | 상대팀 확인 대기, 아직 결과 미확정 |
| TM-SHARED-10 | 상대팀 | 같은 기록 종료 확인 | 공식 결과·전적 outbox·편집 잠금 |
| TM-SHARED-11 | 비참가자/경기 전/취소/확정 | API 수정 시도 | 서버 403/409, DB 변경 없음 |
| TM-SHARED-12 | 서버 응답 유실 | 같은 commandId 재시도 | 중복 득점 없이 최신 상태 반환 |

브라우저: `scripts/qa/team-match-shared-record-flow.cjs` (headed), 실제 API와 격리 DB 사용.
스크린샷: `output/playwright/visual-audit/team-match-shared-record/` → PR용 선정본은 `docs/screenshots/team-match-shared-record/`.
증거·실측 결과·프로세스 cleanup은 Task 172에 기록한다.

## V1 공동 경기 기록 서브매치 — Task 173

정본: `.github/tasks/173-team-match-shared-record-submatches.md`. Task 172의 양 팀 참가자 공동 기록과 공식 결과 한 경기 계약을 유지한다.

| ID | 페르소나 / 조건 | 액션 | 기대 결과 |
|---|---|---|---|
| TM-SUB-01 | 서브매치 없음 / 양 팀 라인업 참가자 | 득점 추가 | 기존 공동 점수판에서 직접 기록 |
| TM-SUB-02 | 기존 직접 득점 있음 | 첫 서브매치 생성 | 기존 득점이 첫 서브매치로 이동하고 합계 유지 |
| TM-SUB-03 | 서브매치 있음 | 득점 선수 선택 | 해당 팀 최신 제출 라인업의 사진·이니셜·등번호·이름 표시 |
| TM-SUB-04 | 데스크톱 / 모바일 | 이름 수정 | 카드 제목이 입력 폼으로 교체되고 제목·버튼·입력 겹침 없음 |
| TM-SUB-05 | 서브매치 2개 | 각 카드에 득점 추가 | 카드별 점수와 최상단 합계가 함께 갱신 |
| TM-SUB-06 | 상대 팀 참가자 | 같은 경기 진입 | 같은 서브매치·득점·합계가 동기화 |
| TM-SUB-07 | 양 팀 참가자 | 팀매치 종료 확인 | 모든 서브매치 합계를 공식 결과 한 경기로 확정하고 편집 잠금 |

브라우저: `scripts/qa/team-match-shared-submatches-flow.cjs` (headed), 실제 API와 격리 DB 사용.
스크린샷과 기계 판독 결과: `docs/screenshots/team-match-shared-record-submatches/` 및 `docs/scenarios/team-match-shared-submatches-gallery.md`.

## TM-149-P 일반/관리자 모집 조건 parity

- [x] 두 폼에서 경기 스타일 직접 입력을 포함한 조건이 저장된다(최대 3개).
- [x] 과거 신청 마감은 생성 전에 차단되고 직접 API 요청도 400으로 거절된다.
- [x] 시작 전 종료 시각은 일반 폼에서도 오류로 표시되며 입력이 사라지지 않는다.
- [x] 23:00 시작 → 다음 날 01:00 종료가 양쪽에서 저장되고 일반 수정에서도 유지된다.
- [x] 접수 후 마감 경과: 새 신청은 거절되지만 기존 신청의 관리자 개별 승인은 시작 전까지 가능하다.
- [x] 명시적 모집 종료/경기 시작 이후에는 확정이 거절된다.
- [x] 390/768/1440에서 before/after, console/network, 수평 overflow를 확인한다.
### TM-172 verification evidence (2026-09-22)

- Headed Playwright: mobile + desktop `2/2` passed; desktop run also captured the 834×1112 tablet viewport.
- Actual persisted flow: `전반전 2:1` + `후반전 1:3` → aggregate `3:4`, then host submission and submitted-history readback.
- Console errors `0`, failed API requests `0`, horizontal overflow `0`.
- Screenshots and machine-readable report: [`docs/screenshots/task172-team-match-submatches/`](../screenshots/task172-team-match-submatches/).
