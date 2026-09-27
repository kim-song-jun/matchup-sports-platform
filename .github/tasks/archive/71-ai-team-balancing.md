# Task 71 — AI 팀 밸런싱 (AI Team Balancing)

Owners: project-director + tech-planner
Drafted: 2026-04-18
Status: **Complete** — merged 2026-04-18

---

## Context

`POST /matches/:id/teams` 는 매치 호스트가 참가자를 N개 팀으로 배정하는 핵심 API이지만, 현재 `MatchesService.generateTeams()`(apps/api/src/matches/matches.service.ts:659)는 참가자 배열을 단순히 `i % teamCount`로 배분하는 round-robin 스터브로 구현되어 있다. Line 676의 `// TODO: AI 기반 팀 밸런싱 로직 구현`이 명시적 기술 부채로 남아 있다.

ELO 기반 팀 밸런싱을 위한 데이터 인프라는 이미 존재한다.
- `UserSportProfile.eloRating`(Int, default 1000) — 종목별 ELO 저장
- `ScoringService.calculateElo()` / `.updateEloAfterMatch()` — 경기 결과 반영
- `CreateMatchDto.teamConfig.autoBalance`(boolean) — 호스트 의도 신호

Task 69 완료 리포트의 "deferred follow-ups"에 Task 71이 등록되어 있으며, 트리거 조건 "100+ 완료 매치"는 **통계적 성숙도 지표일 뿐 구현 블로커가 아니다**. 사용자가 명시적으로 "샘플 미달 상태에서도 구현 진행"을 승인했다. 알고리즘은 ELO 1000 기본값을 가진 참가자 비중이 높은 cold-start 상황에서도 합리적으로 동작해야 한다.

Task 69에서 이미 정착된 관련 영역:
- `MatchingEngineService`(apps/api/src/matches/matching-engine.service.ts) — 매칭 추천 로직 (참고용)
- 매치 상세 페이지(apps/web/src/app/(main)/matches/[id]/) — 호스트 액션 UI 위치

---

## Goal

매치 호스트가 `POST /matches/:id/teams` 호출 시, 참가자의 종목별 ELO를 기반으로 **팀 간 ELO 분산이 최소화되는 배정**을 받도록 한다. 동시에 호스트가 확정 전에 결과를 미리 볼 수 있는 **Preview API + UI 모달**을 제공하며, ELO 미등록자 포함 상황의 cold-start fallback을 보장한다. 알고리즘 선택과 한계는 별도 설계 문서로 기록한다.

---

## Original Conditions (verbatim, user-facing)

- [x] **C1** `MatchesService.generateTeams()`의 round-robin 스터브를 ELO-aware 알고리즘으로 교체하고, line 676의 `// TODO: AI 기반 팀 밸런싱 로직 구현` 주석을 제거한다 (Principle 1).
- [x] **C2** 팀 배정 **Preview API**(dry-run)를 추가하여 호스트가 확정 전 분산 지표(팀별 평균 ELO, 최대 ELO 격차, 표준편차)를 확인할 수 있게 한다.
- [x] **C3** 프론트엔드 매치 상세 페이지에 "팀 자동 구성" 모달을 추가하여 preview → 재추첨 → 확정 플로우를 제공한다.
- [x] **C4** `UserSportProfile`이 없거나 default 1000 ELO인 참가자에 대한 **cold-start fallback** 전략을 구현하고, 문서화한다.
- [x] **C5** 알고리즘 선택 근거(snake-draft vs simulated annealing)와 fallback 정책, 한계를 정리한 **설계 문서** `docs/design/task-71-team-balancing.md`를 작성한다.
- [x] **C6** 알고리즘 공정성 단위 테스트(다양한 ELO 분포 + 팀 수 + cold-start 시나리오)와 preview→assign 통합 테스트를 추가한다.
- [x] **C7** CLAUDE.md의 API 엔드포인트 섹션과 커스텀 훅 섹션에 신규 엔드포인트·훅을 반영한다.
- [x] **C8** 본 기능은 **기존 필드만 사용** — Prisma 마이그레이션 없음.

---

## User Scenarios

### 시나리오 1 — 균등 2팀 배정 (happy path)
10명의 참가자가 있는 풋살 매치. 호스트가 "팀 자동 구성"을 누르면 백엔드가 2팀을 생성하여 preview를 반환한다. 팀 A/B의 평균 ELO 격차가 100 이하로 유지되며, 최대 ELO 격차는 UI에 "균형 양호" 배지로 표시된다. 호스트가 "확정"을 누르면 `Team` 레코드가 생성되고 `MatchParticipant.teamId`가 갱신된다.

### 시나리오 2 — 홀수 인원 11명 + 3팀
11명 중 일부 ELO가 800~1400 분포로 퍼져 있다. 호스트가 teamCount=3을 지정한다. 알고리즘은 snake-draft로 자연 분배하여 [3, 4, 4]를 구성하되 팀 평균 ELO 편차를 최소화한다(top-ELO 참가자는 3명 팀에 배정되어 공정성 유지). Preview는 "팀 A: 3명, 평균 1090 / 팀 B: 4명, 평균 1075 / 팀 C: 4명, 평균 1080"을 보여준다.

### 시나리오 3 — Cold-start (ELO 미등록자 다수 포함)
8명 참가자 중 6명은 해당 종목 `UserSportProfile`이 없음(default 1000으로 취급). 2명만 실제 ELO 1250, 950. Fallback 정책에 따라 ELO 1000 참가자를 "미확정 그룹"으로 분류하고, 1250·950을 서로 다른 팀에 배치한 뒤 나머지 6명을 교대로 배정한다. Preview 응답에 `coldStartCount: 6` 필드가 포함되어 UI가 "ELO 미등록 6명은 1000으로 가정해요" 경고 배지를 표시한다.

### 시나리오 4 — 호스트 재추첨 후 확정
호스트가 preview 결과를 보고 마음에 들지 않아 "재추첨" 버튼을 누른다. 동일 엔드포인트를 다시 호출하되 `seed` 파라미터를 변경하여 다른 배정 결과를 받는다. ELO 분산이 더 낮은 쪽을 선택해 "확정" 누르면 실제 팀 레코드가 persist 된다. Preview는 **상태를 변경하지 않는다**(idempotent).

---

## Test Scenarios

### Happy path
- `POST /matches/:id/teams/preview` with 10 participants, teamCount=2 → 200, `teams.length===2`, `|teams[0].avgElo - teams[1].avgElo| < 100`, `balanceMetric.stdDev` 반환
- `POST /matches/:id/teams` (기존 엔드포인트, preview와 동일 결과 보장) → 200, `Team` 2개 생성 + `MatchParticipant.teamId` 10건 갱신
- 단위 테스트: 균등 ELO 분포 8명 → 팀 평균 편차 ≤ 25
- 단위 테스트: snake-draft 정렬 입력(ELO 내림차순) → 팀 A = [1번, 4번, 5번, 8번], 팀 B = [2번, 3번, 6번, 7번] 순서로 배정
- 단위 테스트: seed 고정 시 100회 반복 동일 결과 (determinism)

### Edge cases
- 홀수 인원 11명, teamCount=2 → 6·5 분배, 소수 팀에 ELO 상위자 포함
- 참가자 전원 default ELO 1000 → cold-start fallback 경로 실행, 팀 분배 결과는 결정적(seed 기반), `coldStartCount === participantCount`
- teamCount=1 → 400 (`TEAM_COUNT_INVALID`)
- teamCount > participantCount → 400 (`TEAM_COUNT_EXCEEDS_PARTICIPANTS`)
- 참가자 0명 → 400 (`NO_PARTICIPANTS`)
- 참가자 `UserSportProfile` 일부만 존재(3명) + 미등록 5명 → 혼합 fallback, preview 응답에 `coldStartCount: 5`
- 4-team snake: A-B-C-D-D-C-B-A 패턴 검증

### Error cases
- 비호스트가 preview 호출 → 403 (`MATCH_NOT_HOST`)
- 존재하지 않는 matchId → 404 (`MATCH_NOT_FOUND`)
- 매치 상태가 `completed` / `cancelled` → 409 (`MATCH_NOT_OPEN_FOR_TEAM_ASSIGNMENT`)
- seed가 음수/문자열 → 400 (validation)
- 기존 팀 배정이 있는 매치에 assign 재호출 → transactional replace (Team/MatchParticipant.teamId 초기화 후 재배정)

### Mock / fixture updates
- `apps/web/src/test/msw/handlers.ts` — `POST /matches/:id/teams/preview` + `POST /matches/:id/teams` 핸들러 업데이트, success + cold-start + forbidden 3가지 분기
- `apps/api/test/fixtures/matches.ts` — ELO 분포가 다른 참가자 헬퍼(`buildMatchWithEloSpread({ range: [800, 1400], count: 10 })`)
- `apps/web/src/components/match/__tests__/auto-balance-modal.test.tsx` — 모달 렌더/재추첨/확정 플로우 mock

---

## Parallel Work Breakdown

### Wave 0 (sequential — shared files, single owner)

- **[backend-api-dev]** `apps/api/src/matches/dto/match.dto.ts` (+~80 LOC) — append `ComposeTeamsDto`(strategy + seed + teamCount) + `PreviewTeamsResponseDto` + `BalanceMetricsDto`(nested). Single owner prevents diff collision.
- **[backend-data-dev]** `apps/api/src/matches/matches.module.ts` (+2 LOC) — register `TeamBalancingService` as provider + export. Must precede Wave 1 backend work.

> Rationale: `match.dto.ts` and `matches.module.ts` are touched by multiple Wave 1 tracks. Serializing them into Wave 0 eliminates merge conflicts.

### Wave 1 (parallel — leaf files, no overlap)

**Track A — backend-data-dev (algorithm core)**
- NEW `apps/api/src/matches/team-balancing.service.ts` (~160 LOC)
  - `class TeamBalancingService`
  - `balance(participants: ParticipantWithElo[], teamCount: number, seed?: number): BalancedDistribution`
  - `computeMetrics(distribution: BalancedDistribution): BalanceMetrics`
  - Pure — no Prisma, no I/O. Injected into MatchesService.
  - Snake-draft over ELO-sorted list, deterministic tie-break by `userId` ASC, optional `seed` only permutes equal-ELO groups via mulberry32 PRNG.
- NEW `apps/api/src/matches/team-balancing.service.spec.ts` (~220 LOC) — 7+ test cases covering happy, edge, cold-start, determinism, 4-team snake

**Track B — backend-api-dev (controller + service wiring)**
- EDIT `apps/api/src/matches/matches.service.ts` (-30 / +120 LOC) — replace TODO at L676; new `previewTeams()` method; refactor `generateTeams()` to accept `ComposeTeamsDto`; wrap in `$transaction` with `deleteMany` + `createMany` + `updateMany`
- EDIT `apps/api/src/matches/matches.controller.ts` (+30 LOC) — new `POST :id/teams/preview` endpoint + update `POST :id/teams` to accept body
- NEW `apps/api/test/integration/matches-team-balancing.e2e-spec.ts` (~180 LOC) — seed 10 participants with known ELO distribution, assert preview returns balanced teams + non-host 403 + confirm persists

**Track C — frontend-ui-dev (modal + page wiring)**
- NEW `apps/web/src/components/match/auto-balance-modal.tsx` (~220 LOC)
  - Props: `{ matchId, open, onClose, onConfirm, defaultTeamCount }`
  - Uses `Modal` from `components/ui/modal.tsx` (focus trap + ESC)
  - 3-step wizard: (1) 옵션(teamCount 2~4, strategy toggle) → (2) Preview 로딩 → team cards + `maxEloGap` badge + cold-start warning → (3) Retry (re-roll seed) / Confirm
  - Uses `UserCard` from Task 69 for participant rows
  - 해요체 UI text; dark mode; `aria-modal` + `min-h-[44px]`
- EDIT `apps/web/src/app/(main)/matches/[id]/page.tsx` (+30 LOC) — host + status in `['recruiting','full']` → "팀 자동 구성" button opens modal; onConfirm invalidates match detail cache
- NEW `apps/web/src/components/match/__tests__/auto-balance-modal.test.tsx` (~180 LOC) — render + retry + confirm + cold-start banner

**Track D — frontend-data-dev (hooks + MSW)**
- EDIT `apps/web/src/hooks/use-api.ts` (+55 LOC) — `usePreviewTeams(matchId)` + `useComposeTeams(matchId)` mutations with `extractErrorMessage(err, '팀을 구성하지 못했어요.')`
- EDIT `apps/web/src/test/msw/handlers.ts` (+40 LOC) — handlers for preview + compose endpoints

**Track E — infra/docs (design document)**
- NEW `docs/design/task-71-team-balancing.md` (~350 LOC) — see Design Document Outline below
- No infra changes (no migration, no env vars, no new service dependency)

### Wave 2 (sequential — integration verification)

- Run `pnpm -F @teameet/api lint && pnpm -F @teameet/api build && pnpm -F @teameet/api test` → unit + spec green
- Run `pnpm -F @teameet/api test:integration -- matches-team-balancing`
- Run `pnpm -F @teameet/web typecheck && pnpm -F @teameet/web test -- auto-balance-modal`
- Manual smoke: create match with 10 dev users (seed) → host view `/matches/:id` → auto-balance → confirm → verify teams written
- No Prisma types regen (no schema change)

---

## Acceptance Criteria

1. `MatchesService.generateTeams()` round-robin 코드와 line 676 TODO 주석이 제거되고, ELO-aware 알고리즘이 프로덕션 경로로 호출된다.
2. 신규 엔드포인트 `POST /matches/:id/teams/preview` 가 인증된 호스트에게만 열리며, `{ teams, balanceMetric, coldStartCount, seed }` 구조를 반환한다.
3. Preview 호출은 DB를 변경하지 않는다(회귀 테스트로 검증).
4. 기존 `POST /matches/:id/teams` 가 동일 알고리즘으로 일관된 결과를 persist 하며, preview와 동일 seed로 호출 시 동일 배정을 보장한다.
5. 참가자 전원이 default ELO 1000인 cold-start 상황에서도 배정이 결정적이고, `coldStartCount` 가 정확히 보고된다.
6. 매치 상세 페이지에 "팀 자동 구성" 모달이 추가되어 preview → 재추첨 → 확정 3단계 플로우가 동작한다(다크모드 + 터치 타겟 44px + aria-modal 준수).
7. 단위 테스트 ≥ 6건(균등 분포, 치우친 분포, 홀수 인원, cold-start, teamCount 3, invariants) + 통합 테스트 ≥ 2건(preview dry-run, preview→assign 일치) 추가.
8. 설계 문서 `docs/design/task-71-team-balancing.md` 가 알고리즘 선택 근거 / fallback 정책 / 한계 / 향후 개선(SA, 포지션 가중치)을 포함한다.
9. CLAUDE.md의 API 엔드포인트 및 `hooks/use-api.ts` 커스텀 훅 섹션이 업데이트된다.
10. PR CI(Test + Deploy 워크플로우) 통과 후 main merge + deploy 런 성공.

---

## Tech Debt Resolved

- `apps/api/src/matches/matches.service.ts:676` — `// TODO: AI 기반 팀 밸런싱 로직 구현` 제거(Principle 1 준수).
- `MatchesService.generateTeams()`의 round-robin 스터브(naive `i % teamCount`) 완전 대체.
- `CreateMatchDto.teamConfig.autoBalance` 플래그가 실제 경로를 가지게 되어 dead-field 상태 해소.
- Preview/assign 단일 알고리즘 경로로 통일되어 호스트 의사결정과 persist 결과의 일관성 보장.
- 기존 `generateTeams()`가 비-트랜잭션으로 팀 생성·참가자 업데이트를 했던 부분 → `$transaction`으로 원자성 확보.

---

## Security Notes

- **Host-only gate**: preview/assign 모두 `matchId` + `match.hostId === currentUserId` 검증을 서비스 레이어에서 수행. `JwtAuthGuard` + `@CurrentUser()` 사용.
- **No mutation on preview**: preview 엔드포인트는 어떠한 Prisma `create`/`update`/`delete`도 호출하지 않음. 통합 테스트에서 `prisma.$transaction` / `prisma.team.create` spy로 mutation 0건 검증.
- **Input validation**:
  - `ComposeTeamsDto.strategy` — `@IsIn(['random','balanced'])`
  - `ComposeTeamsDto.seed` — `@IsInt() @Min(0) @Max(2147483647) @IsOptional()`
  - `ComposeTeamsDto.teamCount` — `@IsInt() @Min(2) @Max(4)` (mirrors existing TeamConfigDto)
  - `sportType`는 클라이언트에서 받지 않음 — 서버가 `match.sportType`으로 조회 (spoofing 차단)
- **ELO boundaries**: 기존 `ScoringService`의 ELO cap/floor 정책 존중. 알고리즘은 ELO 값을 읽기만 함.
- **PII minimization**: preview 응답은 `{ userId, nickname, profileImageUrl, eloRating, teamIndex }` 만 포함. 이메일/전화/oauthId 등 민감 필드 포함 금지. 명시적 Prisma `select` 사용 (spread 금지).
- **Transactional atomicity**: generateTeams는 `prisma.$transaction([deleteMany({matchId}), team.createMany, participant.updateMany])`로 원자성 보장.
- **Rate limiting (deferred, Warning)**: preview 호출 남용 방지는 v1에 포함하지 않음. v2 모니터링 기준 "100 preview calls per match per 10min" 알람 조건 설계 문서에 기록.

---

## Risks & Dependencies

| ID | Risk | Impact | Mitigation |
|----|------|--------|-----------|
| R1 | Cold-start participants dominate preview and produce trivially-equal teams | Medium | UI banner "ELO 미등록 N명은 1000으로 가정해요." + `coldStartCount` in response; logged on server |
| R2 | Existing `teamConfig.autoBalance` silently ignored by clients that POST without body | Low | Service-side default: `autoBalance === true ? 'balanced' : 'random'`. Integration test covers both |
| R3 | 홀수 인원 공정성 — 소수 팀에 고ELO 배정이 공정한가? | Low | 설계 문서에 정책 명시: snake-natural distribution → 소수 팀이 고ELO 1명 보유 (fairness invariant) |
| R4 | 재실행 시 orphan Team rows | Medium | `$transaction([deleteMany({matchId}), createMany, updateMany])`. 재호출 테스트 케이스 포함 |
| R5 | `autoBalance` 플래그 해석 | Low | 플래그는 UI의 기본값 힌트일 뿐, 엔드포인트 게이트는 아님 (Ambiguity Log A7) |
| R6 | Preview와 assign 결과 불일치 (참가자 목록 변경) | Medium | 같은 seed로 최신 participant 목록 재조회. Preview 응답에 `participantHash` 포함 검토(v1은 seed만) |
| R7 | 성능 | Low | 참가자 ≤ 30 가정. Snake-draft O(n log n). DB fetch 1회로 제한 |
| R8 | Preview returning PII due to wildcard select | High | Explicit `select: { user: { select: { id, nickname, profileImageUrl }}}`. Reviewer Critical if spread |

### Dependencies
- Wave 0 (dto + module) → Wave 1 (모든 builder tracks가 DTO import)
- No external service dependency (Firebase/FCM 등 무관)
- No DB migration
- Existing test infra (`truncateAll`, personas, MSW) 재사용

---

## Ambiguity Log

| ID | 질문 | 답변 |
|----|------|------|
| A1 | v1 알고리즘? | **Greedy snake-draft over ELO-sorted list** — O(n log n) + O(n), deterministic, <1ms for n<=30. SA는 설계 문서에 "future work" |
| A2 | Preview idempotency? | 선택적 `seed: number` (IsInt, 0..2^31). Seed 미지정 시 서버가 `Date.now() & 0x7fffffff` 사용하고 응답에 포함. 호스트 "재추첨" = 새 seed. "확정" = 동일 seed 재사용 |
| A3 | 호스트 노출 지표? | `{ maxEloGap: number, variance: number, teamAvgElos: number[], coldStartCount: number }`. UI는 maxEloGap 기준 배지 (≤50: "균형 양호", ≤150: "균형 보통", >150: "균형 주의") |
| A4 | Cold-start 정책? | 없는 `UserSportProfile` → eloRating = 1000. `coldStartCount` 별도 카운트 + logger.debug. 절대 silent drop 하지 않음 |
| A5 | 홀수 인원? | **Snake-natural distribution**: snake-draft로 배정 후 팀 크기는 [floor(n/k), ..., ceil(n/k)] 분포. 11명/2팀 → team A=5, team B=6 (top-ELO 참가자는 5명 팀에 배정되어 공정성 유지). 11명/3팀 → [3, 4, 4]. |
| A6 | Multi-team (3-4) snake? | A-B-C-D-D-C-B-A-A-B-C-D-... (classic reverse-row snake). `team = (i / k) even ? i % k : k - 1 - (i % k)` |
| A7 | 기존 API back-compat? | body 없으면 `strategy = autoBalance ? 'balanced' : 'random'`. 기존 클라이언트 breaking change 없음 |
| A8 | 복수 종목 프로필 시 어떤 ELO? | `match.sportType`만 사용. 해당 종목 프로필 없음 → cold-start |
| A9 | 이미 팀이 있는 매치 재호출? | 허용 — `$transaction` 내에서 이전 Team 삭제 + 참가자 teamId 초기화 후 재배정. 재추첨 후 결과 좋을 때 확정 유스케이스 |
| A10 | Preview는 누가? | Host only (기존 가드 재사용). 비호스트 참가자는 `/teams` 확정 후에만 팀을 볼 수 있음 |

모든 항목 planning authority 내에서 해결. 사용자 에스컬레이션 없음.

---

## Complexity Estimate

**Medium** (1 build cycle + 1 review cycle 예상)

| Item | Complexity | Est. LOC |
|------|------------|----------|
| TeamBalancingService + unit spec | Low-Medium | ~380 |
| DTOs (ComposeTeamsDto, PreviewTeamsResponseDto, BalanceMetricsDto) | Low | ~80 |
| MatchesService refactor (preview + generateTeams strategy + tx) | Medium | ~150 |
| MatchesController endpoint addition | Low | ~30 |
| Integration test | Medium | ~180 |
| useComposeTeams / usePreviewTeams + MSW handlers | Low | ~95 |
| AutoBalanceModal component + RTL test | Medium | ~400 |
| Match detail page integration | Low | ~30 |
| Design doc `docs/design/task-71-team-balancing.md` | Medium | ~350 |
| **Overall** | **Medium** | **~1,700** |

예상 PR 규모: 중간(변경 8~12 파일, 신규 4~6 파일, +~1,700 / -~80 LOC).

---

## Design Document Outline (for `docs/design/task-71-team-balancing.md`)

1. **Problem statement** — round-robin의 한계, 목표: 결정적, 감사 가능, <1ms for n<=30 across 2-4 teams
2. **Prior art** — FACEIT/CS2 MMR snake, ILP/MILP 오버킬 이유, Kernighan-Lin 그래프 이분할 한계
3. **Algorithm: greedy snake-draft** — pseudocode, O(n log n) + O(n) 복잡도, Karmarkar-Karp 계열 2-approx
4. **Metric definition** — teamAvgElo, maxEloGap, variance; n=10 sigma=200에서 maxEloGap ≤ 100 목표
5. **Cold-start & odd count handling** — 미등록자 1000 처리 + 통계 제공, snake-natural distribution 분배표 (top-ELO → 소수 팀 공정성 보장)
6. **Multi-team extension** — snake 공식 `team = (i/k) even ? i%k : k-1-(i%k)`
7. **Performance envelope** — n<=30, k<=4, sort 30 items ≈ 10μs on M1
8. **Testing strategy** — synthetic Gaussian (mean 1000, sigma 200) 1000 trials, p95(maxEloGap) < 150
9. **Limitations & future work** — mannerScore 가중, 포지션 밸런스, history-aware, fairness audit
10. **API contract summary** — preview/compose 요청·응답 + back-compat 표

---

## Handoff checklist for builders

- [ ] Wave 0: single owners confirmed for `match.dto.ts` + `matches.module.ts`
- [ ] Wave 1: 4 tracks start in parallel after Wave 0 green
- [ ] Wave 2: integration smoke before PR
- [ ] Each track references this doc + owns their completion checklist on `Original Conditions`
- [ ] Review gate: all tracks' tests green, then @review with Critical=0
- [ ] Design gate: `@design` audit before QA (dark mode, 44px, WCAG AA)
- [ ] QA gate: 4-persona scenarios pass
- [ ] Docs gate: CLAUDE.md + AGENTS.md + this file's status → "Complete"
- [ ] Ship gate: PR → CI pass → merge → main deploy run success
