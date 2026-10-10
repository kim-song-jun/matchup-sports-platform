# 리그 경기 추가 후속 — 옛 리그 라운드 통일(결정 3) + 한 팀 한 조(결정 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (결정 4=A) 조별 단계(`phase === 'group'`) 경기에 **다른 조별 단계 조에 이미 편성된 팀**을 넣으면 서버가 `409 TEAM_IN_OTHER_GROUP`(해요체)으로 거절하고, 웹은 칸 패널·탭/끌어놓기·모바일 선택창·목록 화면의 후보에서 그 팀을 뺀다. 어느 조에도 없는 팀은 지금처럼 자동 편성된다. (결정 3=B) 리그 격자 규칙을 통일한다 — 번호 없는 옛 경기는 계속 조별로 `max(1, floor(팀수/2))` 경기씩 끊어 **k번째 묶음 = k라운드**로 읽고, 번호(`league_r{n}`) 경기는 제 줄로 가며, 둘은 같은 줄에 합쳐진다. 「경기 추가」 라운드 선택지는 옛 리그에서도 `1..N라운드 + 새 라운드(N+1)` 이고 항상 `league_r{k}` 로 저장한다(PR #1766 의 「옛 round 이어 쓰기 + 라운드 선택 숨김」 예외 삭제).

**Architecture:** 서버는 `ensureGroupPhaseTeamsInTx`(`tournament-bracket-tx.ts:87`) 한 곳에 가드를 둔다 — 생성(`createFixture`)과 수정(`PATCH /admin/fixtures/:id`)이 이미 이 함수를 지난다. 자리(slot) 경로는 맞바꾸기 도중 일시적으로 한 팀이 두 조에 걸치므로 즉시 검사 대신 `ensureGroupPhaseTeamsInTx` 가 돌려준 새 편성을 모아 같은 트랜잭션 끝에서 `releaseGroupTeams` 가 이전 편성을 지운 *뒤* 검사한다(`settleGroupTeams`). 목록 화면의 「조 팀 배정」(`createGroupTeam`)은 같은 헬퍼로 같은 409 를 건다. 웹은 순수 헬퍼 `lib/bracket-group-enrollment.ts` 한 곳이 「이 조에 못 넣는 신청 id」를 계산하고 칸 패널·트레이·모바일 선택창·목록 화면이 쓴다. 격자는 `buildLeagueGrid` 가 줄(`rows`)의 유일한 출처이고, 「경기 추가」 라운드 선택지는 그 줄에서 파생한다(두 번째 계산 없음).

**Tech Stack:** NestJS 11 + Prisma 6 + Jest(서버), Next.js 16 + React 19 + TanStack Query 5 + Vitest + Testing Library + MSW(웹).

**Spec:** `.github/tasks/20261057-admin-bracket-canvas.md`(Ambiguity Log 결정 3·4 — 2026-10-10 사용자 확정, 재질문 금지) · 선행 계획 `docs/superpowers/plans/2026-10-10-admin-bracket-canvas-league-add-fixture.md`(Open Questions 1 이 이 후속의 출처).

## 결정 기록 (ADR)

**Context.** PR #1766 은 옛(번호 없는) 대진에서 두 가지를 타협했다. ① 격자 모델 `numbered` 가 대회 전체 스위치(`bracket-league-grid-model.ts:62`)라 번호 경기 하나가 생기는 순간 옛 경기가 `o:조별 리그` 한 줄로 뭉쳐서, 옛 대진에서만 옛 `round` 문자열을 이어 쓰고 라운드 선택을 숨겼다(`bracket-league-add-fixture.ts:44-55`, 폼 `:60-62`). ② 새 경기에 다른 조 팀을 넣으면 서버가 그 조에 조용히 추가 편성한다(`tournament-bracket-tx.ts:87-120` 는 이 조 편성만 보고 다른 조는 보지 않는다) — alpha 2개 대회에서 7팀이 두 조에 동시 편성돼 순위표가 중복됐다.

**Decision (사용자 3=B, 4=A).** 위 Goal 그대로. 데이터 백필 없음, 이미 겹친 편성은 그대로 둔다.

**예외 없음 (계획 비평 반영).** 처음 계획은 결선 단계 코드(`final` 등)로 쓴 round 를 끊지 않는 예외를 더했으나, `isKnockoutPhase` 가 소문자 코드만 알아 실제 저장값(한국어 `결승`·`8강`, `semifinal`)을 못 걸러 반쪽 예외였고 사용자 문구(「번호 없는 옛 경기는 끊는다」)에도 없어 뺐다. 번호가 아닌 round 는 문자열과 무관하게 옛 경기로 끊어 k번째 묶음 라운드 칸에 합친다 — 리그 조에 그런 round 가 들어가는 것은 수동 입력뿐이고, 순수 옛 대진의 결과는 `final` 이 섞인 경우를 제외하면 불변이다.

**Consequences — 3(B).** 장점: 옛 리그도 「N라운드 중 고르기 / 새 라운드」가 되어 막다른 예외 UI 가 사라지고, 격자·모바일 탭·「경기 추가」 선택지가 한 계산을 쓴다(alpha 리그 7개 중 5개가 옛 리그). 번호 경기를 더해도 옛 경기의 끊김 위치가 흔들리지 않는다(끊김은 옛 경기끼리만 센다). 단점: (a) 옛 경기를 지운 적 있는 대회는 추정 라운드가 실제와 어긋날 수 있다 — 지금 화면도 같은 추정이다. (b) 옛 줄 + 번호 경기가 같은 칸에 섞이면 「이 칸의 몇 경기가 옛 추정이고 몇이 확정 번호인지」가 화면에서 구분되지 않는다(안내 문구로만 알린다). (c) 팀 수가 바뀌면(조 편성 변경) 끊김 크기 `k` 가 바뀌어 옛 경기의 줄이 움직인다 — 지금도 같다.

**Consequences — 4(A).** 장점: 순위표 중복의 입구를 서버에서 막는다(UI 우회·API 직접 호출 포함). 단점: (a) 한 조에서 다른 조로 팀을 옮기려면 먼저 옛 조 편성을 빼야 한다(`DELETE /admin/group-teams/:id`, 그 조에 경기가 남아 있으면 `GROUP_TEAM_HAS_FIXTURES` 로 막힘) — 운영자 동선이 한 걸음 늘고, 그 안내를 오류 문구가 해야 한다. (b) 자리 경로는 맞바꾸기 중간의 일시 겹침을 허용해야 해서 즉시 검사 대신 트랜잭션 끝 검사를 쓴다 — 구현이 한 곳 더 늘고(`settleGroupTeams`), 거절되면 자리 변경 전체가 롤백된다. (c) 이미 겹친 팀은 기존 조 경기·자리 안에서만 계속 쓸 수 있다(같은 조는 허용, 새 조로는 불가).

## 조사 (코드 근거)

**1. 격자 모델 — 옛 스위치가 사는 곳.** `lib/bracket-league-grid-model.ts`: `numbered = fixtures.some(league_r)`(`:62`, 대회 전체); 번호 모드에서만 `r:n`/`o:<round>` 줄, 아니면 `c:<k>` 끊김 줄(`:70-83`, 끊김 크기 `gamesPerRound` `:27-33`); 안내 플래그 `legacyChunking: !numbered && fixtures.length > 0`(`:92`). 소비처: 데스크톱 격자 `bracket-league-grid.tsx:29`(안내 문구 `:41-45`), 모바일 라운드 탭 `lib/bracket-canvas-mobile-model.ts:245` `buildLeagueTournamentMobileRounds`(줄 → 탭 그대로 매핑이라 **모델만 고치면 탭이 따라온다**), 「경기 추가」는 모델을 쓰지 않고 별도 계산(`lib/bracket-league-add-fixture.ts:30-39` `leagueRoundPlan` 이 `league_r` 번호만 모은다) — 이게 두 번째 출처다.

**2. 옛 스위치를 박제한 기존 테스트 (바뀌어야 하는 것).** `lib/bracket-league-grid-model.test.ts:117-120` 「번호가 있는 경기가 하나라도 있으면 끊기를 쓰지 않는다」 — 새 규칙의 정반대라 **삭제 후 교체**. `lib/bracket-league-add-fixture.test.ts:101-136` 의 `resolveLeagueRound — 옛(번호 없는) 대진` 블록 전체(`isLegacyLeagueBracket`·옛 round 이어 쓰기·「근거: 옛 대진에 league_r 를 섞으면…」)와 헬퍼 `addVia` 의 `resolveLeagueRound` 의존. `bracket-fixture-tools-dialog.league.test.tsx:181-194` 「번호가 없는 옛 대진은 라운드 선택 없이…」. `bracket-league-grid.test.tsx:72-79` 는 안내 문구 문자열이 바뀌므로 갱신. 같은 파일의 `final` 케이스(`:51-55`)도 이름 줄(`결승`)을 기대하므로 예외 없는 규칙에 맞게 **교체**하고, `lib/bracket-league-add-fixture.test.ts:46-49`·`:92-98` 의 `final` 케이스도 같은 이유로 고친다. 그대로 남는 것: 옛 단독 케이스들(`:81-115`).

**3. 현재 폼/라이브러리 (지울 것).** `isLegacyLeagueBracket`(`bracket-league-add-fixture.ts:19-21`)·`resolveLeagueRound`(`:44-55`)·`newest`(`:41-42`) 삭제; 폼 `bracket-league-add-fixture-form.tsx`: `legacy` 분기와 안내 문구(`:27`, `:60-62`) 삭제, `LeagueAddSubmit.roundName` 은 항상 문자열; 대화상자 `bracket-fixture-tools-dialog.tsx` `handleAddLeague` 토스트 조합의 `null` 처리(`[input.roundName, input.groupName].filter(...)`) 단순화. 라운드 선택지는 `leagueRoundPlan({ groups, fixtures })` 가 `buildLeagueGrid(...).rows` 의 `roundNumber` 에서 만든다.

**4. 서버 — 조별 단계 경기에 팀이 들어가는 길 전수.**
- `POST /admin/tournaments/:id/fixtures` `createFixture`(`tournament-bracket.service.ts:439`) → `:674` `ensureGroupPhaseTeamsInTx` **지난다**. 웹 「경기 추가」는 팀 없이 만들지만 API 는 홈/어웨이 신청 id 를 받는다.
- `PATCH /admin/fixtures/:id` `updateFixture`(`:837`, 수정 tx `:916`) → `updateTournamentFixtureInTx`(`tournament-bracket-tx.ts:153`) → `:162` `ensureGroupPhaseTeamsInTx` **지난다**(칸 패널 select·탭·드래그·모바일 선택창이 모두 이 길).
- 자리(slot) 배정 `assignSlotCore`(`slots/tournament-slot.service.ts:70`, 사이드 반영 `:107-112`) → `assignTournamentFixtureSideInTx`(`tournament-bracket-tx.ts:216`) → 같은 `updateTournamentFixtureInTx` → `ensureGroupPhaseTeamsInTx`. 이전 *점유자*의 편성만 같은 tx 끝 `releaseGroupTeams`(`:144-145`, 배치는 `:195`)가 `releaseUnusedGroupTeamsInTx`(`tournament-bracket-tx.ts:397`)로 지운다(`stillPlaying > 0` 이면 안 푼다). 배치 맞바꾸기(`assignSlotsBatchInTx` `:188-195`)는 새 자리를 먼저 채우고 해제를 마지막에 한 번 하므로 **중간에 한 팀이 두 조에 걸친다** → 즉시 가드를 걸면 정상 맞바꾸기가 409 로 깨진다. 그렇다고 면제하면 **다른 경로로 B조에 편성된 팀을 A조 자리에 넣을 때 두 조에 남는다**(`SLOT_TEAM_ALREADY_PLACED` 는 두 *자리*만 막는다) → 해제가 끝난 뒤 *이번 요청이 새로 만든 편성*만 검사한다.
- 목록 화면 「조 팀 배정」 `POST /admin/tournaments/:id/group-teams` `createGroupTeam`(`:256`): 같은 조 중복만 `TEAM_ALREADY_IN_GROUP`(`:308`), 다른 조는 보지 않는다 → **같은 409 필요**. 웹 목록 화면(`app/admin/tournaments/[id]/bracket-group-card.tsx:211-216`)도 후보를 걸러 주는 게 맞다.
- 부전승 `createBye`(`:360-420`)는 결선 단계(`round12`·`quarter`·`semi`)만 받고 `BYE_ALREADY_IN_ROUND` 로 단계 안 중복을 이미 막는다 → 대상 아님. `bye-slot-sync.ts`·모의 시드·리그 생성기(`league-fixture-generator`)는 운영자 배치가 아니라 서버가 만든 편성이라 대상 아님.
- 동시성: `createFixture`·`updateFixture`·`createGroupTeam` 모두 같은 `league-fixture-generation:<대회>` advisory lock 안이라 검사와 편성 사이에 끼어들 수 없다.

**5. 웹 후보 출처 전수 (직접 지정·자리·목록).** 데스크톱 칸 패널 select `bracket-node-panel.tsx:76`(`confirmed`), `:140-152`(`.filter(id !== other)`); 탭/끌어놓기는 칸 컴포넌트가 `onAssignDirect(fixture.id, side, registrationId)` 로 모아(`bracket-canvas-node.tsx:79`, 격자 `bracket-league-grid.tsx:93`) `bracket-canvas-workspace.tsx:158` `handleAssignDirect` 한 곳에서 `PATCH`; 모바일 `bracket-canvas-mobile-sheet.tsx:289-310` `DirectTeamPicker`(`candidates.filter(id !== other)`); 자리 select 는 `bracket-node-panel.tsx:166-172`·`SlotTeamPicker`·트레이→자리 `handleAssign`(서버가 자리 경로도 거절하므로 같은 후보 제외가 필요); 목록은 세 곳 — 「조 팀 배정」 검색 풀 `bracket-group-card.tsx:215`, 「경기 일정 추가」 홈/어웨이 선택창 `:508-527`(`createFixture`), 경기 수정 대화상자 `bracket-tab.tsx:193`·`:914-929`(`updateFixture`). 모두가 쓸 순수 헬퍼 하나: `lib/bracket-group-enrollment.ts` `registrationIdsBlockedForGroup(groups, groupId)`.

## Global Constraints

- 작업 위치: 이 worktree(`.claude/worktrees/bracket-league-add`, `feat/bracket-league-add-fixture`). 메인 트리·로컬 `dev`·`git stash`·`git add -A` 금지. `node_modules` 심링크는 디렉터리 pathspec 으로 add 하지 않는다.
- 커밋: `git commit -m "..." -- <명시 파일들>` + 직후 `git show --stat HEAD`. 메시지는 한국어 conventional, 본문 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- 서버 테스트: `cd apps/v1_api && ./node_modules/.bin/jest -c "/private/tmp/claude-501/-Users-sungjun-Dev-projects-matchup-sports-platform/d0179df9-b8cd-4d6a-8e02-f73ed90cf450/scratchpad/iso-league-add/jest.iso.config.cjs" <spec>`. 통합 스펙(`test/**/*.integration-spec.ts`)은 로컬에서 못 돈다 — 컴파일만: `./node_modules/.bin/tsc -p "/private/tmp/claude-501/-Users-sungjun-Dev-projects-matchup-sports-platform/d0179df9-b8cd-4d6a-8e02-f73ed90cf450/scratchpad/iso-league-add/tsconfig.isocheck.json"`. `prisma generate`·로컬 Next 서버 금지.
- 웹 테스트: `cd apps/v1_web && ./node_modules/.bin/vitest run <파일>`; 타입 `./node_modules/.bin/tsc --noEmit`; 패턴 `node scripts/v1-pattern-check.mjs`.
- 좁히는 변경의 테스트 규율: 거절 테스트는 항상 **같은 조 팀 허용 / 어느 조에도 없는 팀 자동 편성 / 다른 조 팀 거절 / 결선·조 없는 경기 불변** 네 쪽을 함께 둔다. fixture 에 조를 최소 둘 둔다.
- UI 규칙: 토큰만 · 44px · 해요체 · `useId()` label · 에러는 `describeBracketCanvasError` · 컴포넌트는 `components/v1-ui` 재사용. 주석은 코드가 말하지 못하는 제약만, 추가 줄의 1/3 이하.
- DB·DTO·Prisma 스키마 변경 없음(mock/fixture 드리프트 해당 없음). 새 에러 코드는 `docs/api/domains/tournaments.md` 에 같은 변경에서 올린다(웹은 서버 `message` 를 그대로 보이므로 `BRACKET_CANVAS_MESSAGES` 사본을 만들지 않는다).
- `.changeset`: 기존 `.changeset/admin-bracket-league-add-fixture.md`(web patch)에 **`v1_api: patch` 추가**(Task 11).

## Review Focus

1. **자리 경로가 깨지지도 뚫리지도 않는가**: 맞바꾸기·무작위 채우기는 중간 겹침 때문에 즉시 검사하지 않고(`deferOtherGroupCheck`), 해제가 끝난 뒤 새 편성만 검사하는가(`settleGroupTeams`) — 다른 경로로 편성된 팀을 다른 조 자리에 넣으면 409, 맞바꾸기는 통과, 이미 겹친 팀이 이미 편성된 조의 자리에 들어가는 것은 통과. 직접 경로(`createFixture`·`PATCH`)는 기본이 즉시 검사인가. 변이: 끝 상태 검사를 지우면 Task 3 케이스 1, 해제 앞으로 옮기면 케이스 2, 즉시 검사를 지우면 Task 1 직접 경로 테스트가 빨개진다.
2. **양쪽 대조군**: 거절(다른 조 팀)과 함께 같은 조 팀(겹친 옛 데이터 포함)·미편성 팀 자동 편성·결선 조·조 없는 경기가 모두 그대로인가 — 서버(Task 1-2)·웹 헬퍼(Task 4)·화면(Task 5-7) 모두 같은 네 쪽을 단언한다.
3. **오류 계약 한 곳**: 코드 `TEAM_IN_OTHER_GROUP` 이 서버 상수·`docs/api/domains/tournaments.md`·웹 `TEAM_IN_OTHER_GROUP_MESSAGE` 에서 같은 문장이고, 웹 탭/끌어놓기 차단은 요청 0건 + 같은 문구 토스트인가.
4. **라운드 출처가 하나**: 「경기 추가」 선택지(`leagueRoundPlan`)가 격자 줄(`buildLeagueGrid().rows[].roundNumber`)에서만 파생되고, 선택한 라운드로 만든 경기가 격자에서 정확히 그 줄·그 조 칸에 떨어지는가(옛 리그 포함, 번호 경기가 옛 끊김 위치를 밀지 않는가).
5. **옛 예외가 남지 않았나**: `isLegacyLeagueBracket`·`resolveLeagueRound`·「라운드 정보가 없는 대진이라 …붙어요」 문구·`roundName: null` 분기가 `apps` 안 코드·테스트에 없는가(`git grep … -- apps` 0건 — 이 계획 문서와 선행 계획의 배너는 대상 밖), 격자에 이름 줄(`o:`)과 결선 코드 예외가 남지 않았는가.

## File Structure

| 파일 | 역할 | 구분 |
|---|---|---|
| `apps/v1_api/src/tournaments/tournament-bracket-tx.ts` | `assertNotInOtherGroupInTx`·즉시/미룬 검사·`enrollmentSink` | 수정 |
| `apps/v1_api/src/tournaments/slots/tournament-slot.service.ts` | `settleGroupTeams` — 해제 뒤 새 편성 검사 | 수정 |
| `apps/v1_api/src/tournaments/tournament-bracket.service.ts` | `createGroupTeam` 가드 | 수정 |
| `apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts` | 서버 단위(가드 4방향 + sink + 목록 경로) | 수정 |
| `apps/v1_api/test/tournaments/tournament-group-team-enrollment.integration-spec.ts` · `tournament-bracket-tx.integration-spec.ts` · `tournament-slots.integration-spec.ts` | 실DB 4방향 + 기존 케이스 재배치 + 자리 경로 끝 상태 검사 | 수정 |
| `apps/v1_web/src/lib/bracket-group-enrollment.ts` (+`.test.ts`) | 「이 조에 못 넣는 신청」 순수 헬퍼 | 신규 |
| `bracket-node-panel.tsx` · `bracket-canvas-workspace.tsx` · `bracket-canvas-mobile-sheet.tsx` · `bracket-canvas-mobile.tsx` · `bracket-canvas-mobile-screen.tsx` · `lib/bracket-canvas-mobile-model.ts` | 후보 제외·차단 | 수정 |
| `app/admin/tournaments/[id]/bracket-group-card.tsx` · `bracket-tab.tsx` | 목록 후보 제외(조 팀 배정·경기 일정 추가·경기 수정) | 수정 |
| `apps/v1_web/src/lib/bracket-league-grid-model.ts` (+test) | 번호 없는 경기를 예외 없이 끊어 번호 줄에 합치기, `roundNumber` | 수정 |
| `apps/v1_web/src/lib/bracket-league-add-fixture.ts` (+test) | 줄에서 파생한 라운드 선택지, 옛 예외 삭제 | 수정 |
| `bracket-league-add-fixture-form.tsx` · `bracket-fixture-tools-dialog.tsx` · `bracket-league-grid.tsx` (+각 테스트) | 폼·토스트·안내 문구 | 수정 |
| `.changeset/admin-bracket-league-add-fixture.md` · `docs/api/domains/tournaments.md` · `.github/tasks/20261057-admin-bracket-canvas.md` · 선행 계획 배너 | v1_api 추가 · 409 문서 · 스펙 결정 행 정정 | 수정 |

(Task 본문은 아래에 이어진다.)

---

# Part A — 결정 4: 한 팀 한 조 (서버 먼저)

## Task 1 — 서버 가드: 직접 경로(생성·수정)는 즉시 거절, 자리 경로는 트랜잭션 끝에 검사

**Files:**
- Modify: `apps/v1_api/src/tournaments/tournament-bracket-tx.ts` (`ensureGroupPhaseTeamsInTx` `:87`, `updateTournamentFixtureInTx` `:153`, `assignTournamentFixtureSideInTx` `:216`)
- Modify: `apps/v1_api/src/tournaments/slots/tournament-slot.service.ts` (`releaseGroupTeams` `:31`, `assignSlotCore` `:70`, `assignSlotInTx` `:143`, `assignSlotsBatchInTx` `:183`, `releaseSlotsForRegistrationInTx` `:224`)
- Test: `apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts` (`조 편성 정합` 블록 `:1985`, `assignTournamentFixtureSideInTx` 블록 `:2225`)

**자리 경로를 면제하지 않는 이유.** 자리 경로는 스스로 단일 조를 지키지 않는다: `releaseGroupTeams` 가 푸는 것은 *그 자리의 이전 점유자* 뿐이고, 다른 경로(경기 추가·조 팀 배정·직접 지정)로 B조에 편성된 팀을 A조 ENTRY 자리에 넣으면 `ensureGroupPhaseTeamsInTx` 가 A조에도 편성해 두 조에 남는다(`SLOT_TEAM_ALREADY_PLACED` 는 한 팀이 두 *자리*를 갖는 것만 막고, `releaseUnusedGroupTeamsInTx` 는 `stillPlaying > 0` 이면 풀지 않는다). 그렇다고 `ensure…` 에서 즉시 검사하면 배치 맞바꾸기(`assignSlotsBatchInTx` 가 새 자리를 먼저 채우고 해제를 마지막에 한 번)가 중간 겹침 때문에 깨진다. 그래서 **즉시 검사는 직접 경로만, 자리 경로는 `ensure…` 가 돌려준 「이번 요청이 새로 만든 편성」을 모아 해제가 끝난 뒤 검사**한다. 이미 그 조에 편성된 팀은 새 편성이 아니라서 이미 겹친 옛 데이터(alpha 7팀)가 영구히 막히지 않는다.

**Interfaces (정확한 이름):**
```ts
// tournament-bracket-tx.ts
export const TEAM_IN_OTHER_GROUP_MESSAGE = '다른 조에 있는 팀은 이 조에 넣을 수 없어요. 그 조에서 먼저 빼 주세요.'; // 서버·웹·문서가 같은 문장
export type GroupEnrollment = { groupId: string; registrationId: string };
export async function assertNotInOtherGroupInTx(
  tx: Tx,
  input: { tournamentId: string; groupId: string; registrationIds: readonly string[] },
): Promise<void>; // 409 TEAM_IN_OTHER_GROUP
export async function ensureGroupPhaseTeamsInTx(
  tx: Tx, admin: V1ActiveAdmin, tournamentId: string, groupId: string, groupPhase: string,
  registrationIds: ReadonlyArray<string | null | undefined>,
  options?: { deferOtherGroupCheck?: boolean },   // 기본 false = 즉시 검사
): Promise<GroupEnrollment[]>;                      // 이번 호출이 새로 만든 편성
// TournamentFixtureUpdateInput 에 추가 (주어지면 검사를 미루고 새 편성을 쌓는다 — 자리 경로 전용)
enrollmentSink?: GroupEnrollment[];
// assignTournamentFixtureSideInTx 의 input 에는 필수: enrollmentSink: GroupEnrollment[]
```

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `조 편성 정합` 블록의 `useStatefulGroupTeams`(`:1990-2001`)를 아래로 바꾸고(조 phase 지도 + `findFirst` 가 **where 의 실제 모양**을 해석한다 — 쿼리 모양이 틀리면 테스트가 빨개진다), 같은 블록 끝(`removeGroupTeam` 블록 앞)에 새 블록을 추가한다.

```ts
    const PHASES: Record<string, string> = { 'group-1': 'group', 'group-2': 'group', 'group-3': 'quarter' };

    function useStatefulGroupTeams(initial: GroupTeamRow[]) {
      groupTeams = [...initial];
      prisma.v1TournamentGroupTeam.findMany.mockImplementation(async ({ where }: { where: { groupId: string } }) =>
        groupTeams.filter((team) => team.groupId === where.groupId));
      prisma.v1TournamentGroupTeam.create.mockImplementation(async ({ data }: { data: Omit<GroupTeamRow, 'id'> }) => {
        const row = { id: `gt-${groupTeams.length + 1}`, ...data };
        groupTeams.push(row);
        return row;
      });
      type Where = { isBye?: boolean; registrationId?: { in: string[] }; groupId?: { not: string }; group?: { tournamentId: string; phase: string } };
      prisma.v1TournamentGroupTeam.findFirst.mockImplementation(async ({ where }: { where: Where }) => {
        if (where.isBye === true) return null; // 부전승 검사 쿼리
        const { registrationId, groupId, group } = where;
        if (registrationId === undefined || groupId === undefined || group === undefined) throw new Error('다른 조 편성 조회의 모양이 달라졌어요');
        return groupTeams.find((team) =>
          registrationId.in.includes(team.registrationId) && team.groupId !== groupId.not &&
          group.tournamentId === 'tournament-1' && PHASES[team.groupId] === group.phase) ?? null;
      });
    }
```

```ts
    describe('한 팀 한 조 — TEAM_IN_OTHER_GROUP', () => {
      const inGroup2 = { id: 'gt-b1', groupId: 'group-2', registrationId: 'reg-1', sortOrder: 0 };
      const createIn = (home: string, away: string) =>
        service.createFixture(ownerUser, 'tournament-1', {
          groupId: 'group-1', round: '조별 1라운드', fixtureNumber: 1, homeRegistrationId: home, awayRegistrationId: away,
        } as never);
      const registrationsOf = () => groupTeams.map(({ groupId, registrationId }) => `${groupId}:${registrationId}`);

      it('다른 조별 조에 편성된 팀으로 조 경기를 만들면 409 이고 상대 팀도 편성하지 않는다', async () => {
        arrangeCreateFixture('group');
        useStatefulGroupTeams([inGroup2]);

        await expect(createIn('reg-1', 'reg-2')).rejects.toMatchObject({ response: { code: 'TEAM_IN_OTHER_GROUP', message: '다른 조에 있는 팀은 이 조에 넣을 수 없어요. 그 조에서 먼저 빼 주세요.' } });

        expect(registrationsOf()).toEqual(['group-2:reg-1']);
        expect(prisma.v1AdminActionLog.create).not.toHaveBeenCalled();
      });

      it('같은 조에도 이미 편성된 팀은 다른 조와 겹쳐 있어도 허용한다 — 이미 겹친 옛 데이터는 그대로', async () => {
        arrangeCreateFixture('group');
        useStatefulGroupTeams([inGroup2, { id: 'gt-a1', groupId: 'group-1', registrationId: 'reg-1', sortOrder: 0 }]);

        await createIn('reg-1', 'reg-2');

        expect(registrationsOf()).toEqual(['group-2:reg-1', 'group-1:reg-1', 'group-1:reg-2']);
      });

      it('어느 조에도 없는 팀은 지금처럼 그 조에 자동 편성된다 (대조군)', async () => {
        arrangeCreateFixture('group');
        useStatefulGroupTeams([]);

        await createIn('reg-1', 'reg-2');

        expect(registrationsOf()).toEqual(['group-1:reg-1', 'group-1:reg-2']);
      });

      it('결선 단계 조에만 편성된 팀은 조별 경기에 넣을 수 있다 (조별 단계끼리만 센다)', async () => {
        arrangeCreateFixture('group');
        useStatefulGroupTeams([{ id: 'gt-q1', groupId: 'group-3', registrationId: 'reg-1', sortOrder: 0 }]);

        await createIn('reg-1', 'reg-2');

        expect(registrationsOf()).toEqual(['group-3:reg-1', 'group-1:reg-1', 'group-1:reg-2']);
      });

      it('결선 단계 조의 경기는 다른 조 편성을 보지 않는다', async () => {
        arrangeCreateFixture('final');
        useStatefulGroupTeams([inGroup2]);

        await createIn('reg-1', 'reg-2');

        expect(registrationsOf()).toEqual(['group-2:reg-1']);
        expect(prisma.v1TournamentGroupTeam.findFirst).not.toHaveBeenCalledWith(expect.objectContaining({ select: { id: true } }));
      });

      it('PATCH 로 다른 조 팀을 넣어도 409 이고 경기는 바뀌지 않는다', async () => {
        arrangeCreateFixture('group');
        useStatefulGroupTeams([{ id: 'gt-b3', groupId: 'group-2', registrationId: 'reg-3', sortOrder: 0 }]);
        prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetailsRow());
        prisma.v1TournamentMatchDetails.findUniqueOrThrow.mockResolvedValue(canonicalDetailsRow());
        queueFixtureUpdateRaw(prisma.$queryRaw, { id: 'game-1', state: 'SCHEDULED', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: null }, { id: 'fixture-1', deletedAt: null });
        prisma.v1TournamentRegistration.findUnique.mockResolvedValue({ team: { id: 'team-reg-3', name: 'reg-3' } });

        await expect(service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' })).rejects.toMatchObject({ response: { code: 'TEAM_IN_OTHER_GROUP' } });

        expect(prisma.v1TournamentMatchDetails.update).not.toHaveBeenCalled();
        expect(registrationsOf()).toEqual(['group-2:reg-3']);
      });
    });
```
그리고 `assignTournamentFixtureSideInTx` 블록(`:2225`)에 자리 경로 테스트 둘을 추가한다. 이 함수는 호출자(자리 서비스)가 끝 상태를 검사하도록 새 편성만 `enrollmentSink` 에 쌓는다:
```ts
    it('자리 경로(enrollmentSink)는 다른 조 팀도 그 자리에서 거절하지 않고, 새 편성만 sink 에 쌓는다 — 검사는 호출자가 이전 편성을 푼 뒤 한다', async () => {
      arrange();
      prisma.v1TournamentGroup.findFirst.mockResolvedValue({ phase: 'group' });
      // 다른 조 편성 조회(부전승 검사가 아닌 findFirst)는 항상 걸리게 해 둔다: 즉시 검사가 남아 있으면 이 테스트는 409 로 빨개진다.
      prisma.v1TournamentGroupTeam.findFirst.mockImplementation(async ({ where }: { where: { isBye?: boolean } }) => (where.isBye === true ? null : { id: 'gt-other' }));
      prisma.v1TournamentRegistration.findMany.mockResolvedValue([{ id: 'reg-3', teamId: 'team-new', team: { name: '새 팀' } }]);
      const enrollmentSink: GroupEnrollment[] = [];

      await assignTournamentFixtureSideInTx(prisma as never, { games } as never, activeAdmin, { fixtureId: 'fixture-1', side: 'HOME', registrationId: 'reg-3', enrollmentSink });

      expect(prisma.v1TournamentGroupTeam.create).toHaveBeenCalledWith({ data: expect.objectContaining({ groupId: 'group-1', registrationId: 'reg-3' }) });
      expect(enrollmentSink).toEqual([{ groupId: 'group-1', registrationId: 'reg-3' }]);
    });

    it('이미 그 조에 편성된 팀은 sink 에 쌓지 않는다 — 새로 만든 편성만 끝 상태 검사 대상이다 (대조군)', async () => {
      arrange();
      prisma.v1TournamentGroup.findFirst.mockResolvedValue({ phase: 'group' });
      prisma.v1TournamentGroupTeam.findMany.mockResolvedValue([{ registrationId: 'reg-3', sortOrder: 0 }]);
      prisma.v1TournamentRegistration.findMany.mockResolvedValue([{ id: 'reg-3', teamId: 'team-new', team: { name: '새 팀' } }]);
      const enrollmentSink: GroupEnrollment[] = [];

      await assignTournamentFixtureSideInTx(prisma as never, { games } as never, activeAdmin, { fixtureId: 'fixture-1', side: 'HOME', registrationId: 'reg-3', enrollmentSink });

      expect(prisma.v1TournamentGroupTeam.create).not.toHaveBeenCalled();
      expect(enrollmentSink).toEqual([]);
    });
```
(`GroupEnrollment` 는 `./tournament-bracket-tx` import 에 더한다. 자리 서비스가 끝 상태 검사를 실제로 거는지는 DB 가 있어야 증명되므로 Task 3 Step 4 통합 스펙이 맡는다.)

- [ ] **Step 2: 실패를 확인한다.**
Run: `cd apps/v1_api && ./node_modules/.bin/jest -c "<iso config>" src/tournaments/tournament-bracket.service.spec.ts -t "한 팀 한 조|자리 경로는|이미 그 조에"`
Expected: FAIL — 첫 거절 테스트는 `Received promise resolved instead of rejected`(가드 없음), PATCH 테스트도 동일. sink 테스트는 `enrollmentSink` 가 없어 컴파일 오류 또는 sink 가 빈 채로 FAIL. 자리 경로가 *실제로* 겹침을 막는지는 통합 스펙(Task 3 Step 4)이 증명한다.

- [ ] **Step 3: 최소 구현.**
`tournament-bracket-tx.ts` — `ensureGroupPhaseTeamsInTx` 위에 헬퍼 추가, 함수에 `options` 와 가드와 반환값, `updateTournamentFixtureInTx`/`assignTournamentFixtureSideInTx` 배선:
```ts
export const TEAM_IN_OTHER_GROUP_MESSAGE = '다른 조에 있는 팀은 이 조에 넣을 수 없어요. 그 조에서 먼저 빼 주세요.';
export type GroupEnrollment = { groupId: string; registrationId: string };

/** 조별 단계(`phase = group`)는 한 팀이 한 조에만 있다 — 이 조에 없는 신청이 같은 대회의 다른 조별 조에 있으면 거절한다. */
export async function assertNotInOtherGroupInTx(
  tx: Tx,
  input: { tournamentId: string; groupId: string; registrationIds: readonly string[] },
): Promise<void> {
  if (input.registrationIds.length === 0) return;
  const elsewhere = await tx.v1TournamentGroupTeam.findFirst({
    where: {
      registrationId: { in: [...input.registrationIds] },
      groupId: { not: input.groupId },
      group: { tournamentId: input.tournamentId, phase: 'group' },
    },
    select: { id: true },
  });
  if (elsewhere !== null) throw new ConflictException({ code: 'TEAM_IN_OTHER_GROUP', message: TEAM_IN_OTHER_GROUP_MESSAGE });
}
```
`ensureGroupPhaseTeamsInTx` 끝 매개변수 `options: { deferOtherGroupCheck?: boolean } = {}`, 반환 `Promise<GroupEnrollment[]>`(새로 만든 편성; 일찍 끝나는 분기는 `[]`), `assignedIds` 계산 직후:
```ts
  const fresh = ids.filter((id) => !assignedIds.has(id));
  // 자리 경로는 맞바꾸는 동안 한 팀이 잠시 두 조에 걸친다 — 호출자가 이전 편성을 푼 뒤(트랜잭션 끝)에 새 편성만 검사한다.
  if (options.deferOtherGroupCheck !== true) await assertNotInOtherGroupInTx(tx, { tournamentId, groupId, registrationIds: fresh });
```
생성 루프에서 `created.push({ groupId, registrationId })` 를 모아 반환한다. `TournamentFixtureUpdateInput` 에 `enrollmentSink?: GroupEnrollment[];`(주어지면 다른 조 검사를 미루고 새 편성을 여기에 쌓는다 — 자리 경로 전용) 추가, `:162` 를
```ts
    if (group) {
      const enrolled = await ensureGroupPhaseTeamsInTx(tx, admin, input.tournamentId, input.groupId, group.phase,
        [input.homeRegistrationId, input.awayRegistrationId], { deferOtherGroupCheck: input.enrollmentSink !== undefined });
      input.enrollmentSink?.push(...enrolled);
    }
```
로 바꾼다. `assignTournamentFixtureSideInTx` 의 `input` 에 **필수** `enrollmentSink: GroupEnrollment[]` 를 더해 `updateTournamentFixtureInTx` 로 넘긴다(필수여야 호출자가 검사를 빠뜨리지 못한다; 이 스펙의 기존 호출 3곳 `:2237`·`:2260`·`:2274` 에는 `enrollmentSink: []` 를 더한다). `tournament-bracket.service.ts:674` 호출은 **수정하지 않는다**(기본 엄격).

`slots/tournament-slot.service.ts` — 이전 편성 해제와 새 편성 검사를 한 곳에서 한다:
```ts
type GroupTeamLedger = { releases: GroupTeamRelease[]; enrollments: GroupEnrollment[] };

/** 모든 자리 변경이 끝난 뒤에만 부른다: 이전 팀 편성을 풀고, 이번 요청이 새로 만든 편성이 다른 조별 조와 겹치면 409 (전체 롤백). */
async function settleGroupTeams(tx: Tx, ctx: SlotMutationContext, tournamentId: string, ledger: GroupTeamLedger): Promise<void> {
  await releaseGroupTeams(tx, ctx, tournamentId, ledger.releases);
  for (const { groupId, registrationId } of ledger.enrollments) {
    await assertNotInOtherGroupInTx(tx, { tournamentId, groupId, registrationIds: [registrationId] });
  }
}
```
`assignSlotCore` 의 `releases` 매개변수를 `ledger: GroupTeamLedger` 로 바꾸고(`ledger.releases.push`, `assignTournamentFixtureSideInTx(…, { …, enrollmentSink: ledger.enrollments })`), `assignSlotInTx`·`assignSlotsBatchInTx`·`releaseSlotsForRegistrationInTx` 는 `const ledger = { releases: [], enrollments: [] }` 를 만들어 마지막에 `releaseGroupTeams` 대신 `settleGroupTeams` 를 부른다(`releaseSlotsForRegistrationInTx` 는 비우기만 해 `enrollments` 가 항상 비지만 같은 마무리를 거친다). 이미 그 조에 편성된 팀은 새 편성이 아니므로 검사되지 않아, 이미 겹친 옛 데이터의 팀이 편성된 조의 자리에 들어가는 것은 막지 않는다.
- [ ] **Step 4: 통과 + 변이 확인.**
Run: 같은 jest 명령 → PASS, 이어서 `src/tournaments/tournament-bracket.service.spec.ts` 전체와 `src/tournaments/slots/tournament-slot.service.spec.ts`(자리 단위 스펙 회귀) PASS.
변이(단위): `options.deferOtherGroupCheck !== true` 를 `false` 로 바꿔 가드를 끄면 거절 테스트들이 빨개지고, `updateTournamentFixtureInTx` 가 `deferOtherGroupCheck` 를 항상 `true` 로 넘기게 바꾸면 직접 경로 거절 테스트가 빨개진다 — 되돌린다. 자리 경로의 끝 상태 검사 자체는 DB 가 있어야 증명되므로 Task 3 Step 4 의 통합 변이(검사 삭제 → 케이스 1 빨강, 검사를 해제 앞으로 이동 → 케이스 2 빨강)로 확인한다.

- [ ] **Step 5: 타입·커밋.**
Run: `cd apps/v1_api && ./node_modules/.bin/tsc -p "<tsconfig.isocheck.json>"` → 0 오류.
```bash
git commit -m "fix(v1_api): 조별 경기·자리에 다른 조 팀을 넣으면 TEAM_IN_OTHER_GROUP 으로 거절" -m "생성·수정 경로는 즉시 거절하고 자리 배정은 이전 편성을 푼 뒤 새 편성만 트랜잭션 끝에서 검사한다." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/v1_api/src/tournaments/tournament-bracket-tx.ts apps/v1_api/src/tournaments/slots/tournament-slot.service.ts apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts
git show --stat HEAD
```

## Task 2 — 목록 화면의 「조 팀 배정」(`createGroupTeam`)에도 같은 409

**Files:**
- Modify: `apps/v1_api/src/tournaments/tournament-bracket.service.ts` (import `:51`, `createGroupTeam` `:256` 의 `TEAM_ALREADY_IN_GROUP` 직후)
- Test: `apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts` (`createGroupTeam: duplicate in same group` 테스트 `:669` 뒤)

- [ ] **Step 1: 실패하는 테스트.**
```ts
  it('createGroupTeam: 다른 조별 조에 이미 있는 팀 → 409 TEAM_IN_OTHER_GROUP, 만들지 않는다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow());
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TournamentGroupTeam.findUnique.mockResolvedValue(null);
    prisma.v1TournamentGroupTeam.findFirst.mockResolvedValue({ id: 'gt-other' });

    await expect(service.createGroupTeam(ownerUser, 'tournament-1', { groupId: 'group-1', registrationId: 'reg-1' }))
      .rejects.toMatchObject({ response: { code: 'TEAM_IN_OTHER_GROUP', message: '다른 조에 있는 팀은 이 조에 넣을 수 없어요. 그 조에서 먼저 빼 주세요.' } });
    expect(prisma.v1TournamentGroupTeam.findFirst).toHaveBeenCalledWith({
      where: { registrationId: { in: ['reg-1'] }, groupId: { not: 'group-1' }, group: { tournamentId: 'tournament-1', phase: 'group' } },
      select: { id: true },
    });
    expect(prisma.v1TournamentGroupTeam.create).not.toHaveBeenCalled();
  });

  it('createGroupTeam: 결선 단계 조는 다른 조 편성을 보지 않는다 (대조군)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow({ phase: 'quarter' }));
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TournamentGroupTeam.findUnique.mockResolvedValue(null);
    prisma.v1TournamentGroupTeam.findFirst.mockResolvedValue({ id: 'gt-other' });
    prisma.v1TournamentGroupTeam.create.mockResolvedValue({ id: 'gt-1', groupId: 'group-1', registrationId: 'reg-1', sortOrder: 0, createdAt: new Date('2026-06-14T00:00:00Z') });

    await expect(service.createGroupTeam(ownerUser, 'tournament-1', { groupId: 'group-1', registrationId: 'reg-1' })).resolves.toMatchObject({ registrationId: 'reg-1' });
    expect(prisma.v1TournamentGroupTeam.findFirst).not.toHaveBeenCalled();
  });
```
(어느 조에도 없는 팀이 만들어지는 쪽은 기존 `createGroupTeam: confirmed + not-duplicate → created` 가 지킨다 — 이 파일에서 `findFirst` 기본값이 `null`.)

- [ ] **Step 2: 실패 확인.** `jest -c "<iso>" src/tournaments/tournament-bracket.service.spec.ts -t "createGroupTeam"` → 첫 테스트 FAIL(`Received promise resolved`).
- [ ] **Step 3: 구현.** `TEAM_ALREADY_IN_GROUP` 블록 바로 뒤:
```ts
      if (group.phase === 'group') {
        await assertNotInOtherGroupInTx(tx, {
          tournamentId, groupId: group.id, registrationIds: [dto.registrationId],
        });
      }
```
`:51` import 에 `assertNotInOtherGroupInTx` 추가.
- [ ] **Step 4: 통과.** 같은 명령 PASS + 스펙 전체 PASS, `tsc -p "<isocheck>"` 0.
- [ ] **Step 5: 커밋** — `fix(v1_api): 조 팀 배정도 다른 조에 있는 팀은 TEAM_IN_OTHER_GROUP 으로 거절` · pathspec `apps/v1_api/src/tournaments/tournament-bracket.service.ts apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts` + `git show --stat HEAD`.

## Task 3 — 통합 스펙: 실DB 4방향 + 자리 경로 + 기존 교차 배치 테스트 재배치 (CI 에서만 돈다)

**Files:**
- Modify: `apps/v1_api/test/tournaments/tournament-group-team-enrollment.integration-spec.ts` (재배치 + 새 4방향 `describe`)
- Modify: `apps/v1_api/test/tournaments/tournament-bracket-tx.integration-spec.ts` (`:162`)
- Modify: `apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts` (새 `describe` — 자리 경로의 끝 상태 검사)

**왜 필요한가.** 시드(`test/fixtures/competition-config.fixture.ts:118-145`)는 A조(`phase: 'group'`)에 4팀을 전부 편성해 둔다. 아래 스펙들은 그 팀들을 *다른 조별 조*에 넣으므로 이제 정확히 409 다. 이 스펙들이 *지키던 계약*(자동 편성·백필)은 그대로이므로, 팀을 **먼저 다른 조에서 떼는** 준비를 테스트 안에 드러내 놓고 재배치한다(`beforeAll` 에 숨기면 어느 테스트가 어떤 상태를 전제하는지 안 보인다). 로컬에서 못 도니 아래 표는 *코드를 읽어* 확정한 것이다.

- [ ] **Step 1: 영향받는 통합 스펙 감사표 (읽어서 확정한 결과 — 구현자는 이 표대로 고치고, 표에 없는 스펙이 의심되면 `git grep -nE "createFixture|updateFixture|createGroupTeam|assignSlot" -- test` 로 다시 찾는다. `createGroup` 정규식으로 찾지 않는다 — `prisma.v1TournamentGroup.create` 로 조를 만드는 스펙을 놓친다).**

| 스펙 · 테스트 | 넣는 팀 → 대상 조 | 시드 편성과 충돌 | 조치 |
|---|---|---|---|
| enrollment · 「편성 안 된 팀으로 조 경기를 만들면…」 | reg0,reg1,reg2 → B조 | A조에 있음 → 409 | 맨 앞 `detach(reg0, reg1, reg2)` |
| enrollment · 「경기가 남은 팀의 편성 해제는 409…」 | reg3 → B조(`createGroupTeam`) | A조에 있음 → 409 | 맨 앞 `detach(reg3)` |
| enrollment · 백필 「편성이 빠진 조만 채우고…」 | reg3,reg0 → B조 | 앞 테스트가 이미 뗐으므로 통과 | `groupABefore` 읽기 직전 `restoreSeedStage()` 로 A조를 4팀으로 되돌려 「A조 그대로」 단언이 공허해지지 않게 하고 `expect(groupABefore).toHaveLength(4)` |
| enrollment · 백필 「일부만 편성된 조는…」 | SQL 만 | 없음 | 무수정 |
| enrollment · 백필 「확정이 아닌 신청의 팀은…」 | reg1,reg2 → D조 | 앞 테스트 후 B조·A조에 있음 → 409 | 맨 앞 `restoreSeedStage()` → `detach(reg1, reg2)` |
| enrollment · 백필 「정규 리그 …」 | reg0,reg2 → E조 | 같은 이유로 409 | 맨 앞 `restoreSeedStage()` → `detach(reg0, reg2)` |
| enrollment · 「순위 행이 없는 조는…」 | reg0,reg1 → C조 | 409 | 맨 앞 `restoreSeedStage()` → `detach(reg0, reg1)` |
| enrollment · 「순위 행이 있는 조에 팀이 자동 편성되면…」 | reg3,reg0 → A조 | A조 4팀 전제(`before` 길이 4) | 맨 앞 `restoreSeedStage()` — 앞 테스트가 뗀 팀을 되돌린다 |
| bracket-tx · `:162` `updateFixture(… awayRegistrationId: reg1)` | reg1 → `empty-fixtures`(`phase: 'group'`) | A조에 있음 → 409 | 그 줄 앞에서 `prisma.v1TournamentGroupTeam.deleteMany({ where: { groupId: ids.groupId, registrationId: reg1 } })` |
| game-adapter · concurrency · roster-sync · round16 · bracket-template · slots(기존 케이스) | 조가 하나뿐이거나 결선 단계/조 없는 경기 | 없음 | 무수정 |
| correction-guards · quick-result · standings-recalculation · penalty-shootout | `createFixture`/`updateFixture`/`createGroupTeam` 을 부르지 않음(직접 prisma 쓰기) | 없음 | 무수정 |

자리 경로 기존 케이스(`tournament-slots` `:212` A→B 교체, `:358` 맞바꾸기)는 단일 조 대회라 새 끝 상태 검사에도 걸리지 않는다 — **무수정 통과가 면제/검사 설계의 증거**다.

- [ ] **Step 2: enrollment 스펙 재배치.** 파일 상단(`teamsOf` 아래)에 헬퍼 둘:
```ts
/** 조별 단계 편성에서 이 팀을 뗀다 — 시드 A조의 팀을 다른 조에 넣는 테스트의 명시적 준비. */
const detach = (...registrationIds: string[]) =>
  prisma.v1TournamentGroupTeam.deleteMany({ where: { registrationId: { in: registrationIds }, group: { tournamentId: ids.tournamentId, phase: 'group' } } });

/** 시드 상태 복원 — A조에 4팀, 다른 조별 조의 편성은 없음. 앞 테스트가 만든 편성에 기대는 테스트 앞에서 부른다. */
const restoreSeedStage = async () => {
  await prisma.v1TournamentGroupTeam.deleteMany({ where: { groupId: { not: ids.groupId }, group: { tournamentId: ids.tournamentId, phase: 'group' } } });
  const have = new Set((await teamsOf(ids.groupId)).map((team) => team.registrationId));
  const missing = ids.registrationIds.map((registrationId, sortOrder) => ({ groupId: ids.groupId, registrationId, sortOrder })).filter((row) => !have.has(row.registrationId));
  if (missing.length > 0) await prisma.v1TournamentGroupTeam.createMany({ data: missing });
};
```
위 표의 조치를 해당 테스트 **맨 앞**에 적용한다. 이 스펙은 앞 테스트가 만든 편성에 뒤 테스트가 기대는 *순서 의존 체인*이므로 테스트 순서는 바꾸지 않는다(전역 `beforeEach` 복원은 백필 체인을 깨므로 쓰지 않는다). 「데이터 보정 마이그레이션」 블록의 SQL 은 이 가드를 타지 않으므로(raw SQL) 그대로다 — 단 위 표의 `createFixture` 준비 줄은 가드를 탄다.
- [ ] **Step 3: 새 4방향 테스트를 최상위 `describe` 안, `자동 편성과 순위 행` 블록 뒤에 추가한다** (최상위 `describe` 밖에 두면 그 `afterAll` 이 `prisma.$disconnect()` 한 뒤에 돌아 연결 오류가 난다).
```ts
  describe('한 팀 한 조 (결정 4) — 서버가 지킨다', () => {
    let groupC: string;
    let groupD: string;
    const createIn = (groupId: string, home: string | undefined, away: string | undefined, fixtureNumber: number) =>
      bracket.createFixture(user, ids.tournamentId, { groupId, round: `한팀한조 ${fixtureNumber}`, fixtureNumber, homeRegistrationId: home, awayRegistrationId: away });

    beforeAll(async () => {
      groupC = (await bracket.createGroup(user, ids.tournamentId, { name: '한팀한조 C조', phase: 'group' })).id;
      groupD = (await bracket.createGroup(user, ids.tournamentId, { name: '한팀한조 D조', phase: 'group' })).id;
    });
    beforeEach(() => detach(reg0, reg1, reg2, reg3)); // 모든 조별 조에서 뗀다 — 앞 블록이 남긴 B·C·D·E 편성 포함

    it('다른 조별 조에 편성된 팀으로 만들면 409 TEAM_IN_OTHER_GROUP 이고 경기도 편성도 생기지 않는다', async () => {
      await bracket.createGroupTeam(user, ids.tournamentId, { groupId: groupC, registrationId: reg0 });

      await expect(createIn(groupD, reg0, reg1, 301)).rejects.toMatchObject({ response: { code: 'TEAM_IN_OTHER_GROUP' } });

      expect(await teamsOf(groupD)).toEqual([]); // 상대 팀 reg1 도 편성되지 않았다
      expect(await prisma.v1TournamentMatchDetails.count({ where: { groupId: groupD } })).toBe(0);
    });

    it('같은 조에 편성된 팀은 허용되고, 어느 조에도 없는 상대 팀은 자동 편성된다 (대조군)', async () => {
      await bracket.createGroupTeam(user, ids.tournamentId, { groupId: groupC, registrationId: reg0 });

      await createIn(groupC, reg0, reg1, 302);

      expect((await teamsOf(groupC)).map((team) => team.registrationId)).toEqual([reg0, reg1]);
    });

    it('이미 두 조에 겹친 옛 데이터의 팀도 편성된 그 조 경기에는 계속 넣을 수 있다', async () => {
      // 게이트 이전에 생긴 겹침을 SQL 로 재현한다(서비스는 이제 만들지 못한다).
      await prisma.v1TournamentGroupTeam.createMany({ data: [
        { groupId: groupC, registrationId: reg2, sortOrder: 0 },
        { groupId: groupD, registrationId: reg2, sortOrder: 0 },
      ] });

      await expect(createIn(groupC, reg2, reg3, 303)).resolves.toBeDefined();

      expect(await prisma.v1TournamentGroupTeam.count({ where: { registrationId: reg2, group: { phase: 'group', tournamentId: ids.tournamentId } } })).toBe(2);
    });

    it('PATCH 로 다른 조 팀을 넣으면 409 이고 경기는 비어 있는 채다, 편성 안 된 팀은 들어가 자동 편성된다', async () => {
      await bracket.createGroupTeam(user, ids.tournamentId, { groupId: groupC, registrationId: reg0 });
      const fixture = await createIn(groupD, undefined, undefined, 304);

      await expect(bracket.updateFixture(user, fixture.id, { homeRegistrationId: reg0 })).rejects.toMatchObject({ response: { code: 'TEAM_IN_OTHER_GROUP' } });
      expect((await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: fixture.id } })).homeRegistrationId).toBeNull();

      await bracket.updateFixture(user, fixture.id, { homeRegistrationId: reg1 });
      expect((await teamsOf(groupD)).map((team) => team.registrationId)).toEqual([reg1]);
    });

    it('목록 화면의 조 팀 배정도 다른 조 팀은 409, 결선 단계 조는 그대로 받는다', async () => {
      await bracket.createGroupTeam(user, ids.tournamentId, { groupId: groupC, registrationId: reg0 });

      await expect(bracket.createGroupTeam(user, ids.tournamentId, { groupId: groupD, registrationId: reg0 }))
        .rejects.toMatchObject({ response: { code: 'TEAM_IN_OTHER_GROUP' } });
      await expect(bracket.createGroupTeam(user, ids.tournamentId, { groupId: groupFinal, registrationId: reg0 })).resolves.toBeDefined();
    });
  });
```
(`groupFinal` 은 `phase: 'final'` 로 이 스펙 상단에서 이미 만든다.)
- [ ] **Step 4: 자리 경로 통합 테스트 — `tournament-slots.integration-spec.ts` 에 새 `describe`.** 두 조별 조가 있는 `group_knockout` 대회(`seedBracketTournament({ format: 'group_knockout', teamCount: 6 })` + `templates.apply(user, tournamentId, { kind: 'group_knockout', groupCount: 2, teamsPerGroup: 3, advancePerGroup: 1, legs: 1, thirdPlace: false })`)에서 조마다 첫 ENTRY 자리를 `findFirstOrThrow({ where: { tournamentId, groupId, kind: 'ENTRY' }, orderBy: { position: 'asc' } })` 로 구한다(조별 자리의 `position` 이 조마다 겹칠 수 있어 `slotAt` 은 쓰지 않는다). 새 `describe` 는 기존 `자리 배정 (PostgreSQL)` 최상위 `describe` 안에 두어 `inLane`·`slots`·`bracket` 헬퍼와 `afterAll` 을 공유한다. 세 케이스:
  1. **직접 경로로 B조에 편성된 팀을 A조 자리에 넣으면 409** — `bracket.createGroupTeam(B, reg0)` 뒤 `slots.assignSlot(user, slotA.id, reg0)` → `TEAM_IN_OTHER_GROUP`, 자리의 `registrationId` 는 그대로 null(트랜잭션 롤백), A조 편성 0행.
  2. **맞바꾸기는 통과 (대조군)** — reg0 → A 자리, reg1 → B 자리를 넣은 뒤(각각 자기 조에 편성) `inLane(... assignSlotsBatchInTx ...)` 로 두 자리를 맞바꾸면 성공하고 편성은 reg1 이 A조에만, reg0 이 B조에만 있다(중간 겹침이 끝 상태 검사 전에 풀린다).
  3. **이미 겹친 팀은 이미 편성된 조의 자리에는 들어간다** — SQL 로 reg2 를 A·B 둘 다 편성해 둔 뒤 A 자리에 reg2 → 성공, 두 편성 모두 유지(새로 만든 편성이 없으므로 검사 대상이 아니다). 같은 reg2 를 편성이 없는 C 조 자리에 넣으면 409.
  변이 확인(CI 에서 빨개져야 하는 지점): `settleGroupTeams` 의 끝 상태 검사를 지우면 1 이, 검사를 `releases` 이전으로 옮기면 2 가 빨개진다.
- [ ] **Step 5: 컴파일 확인.** `cd apps/v1_api && ./node_modules/.bin/tsc -p "<tsconfig.isocheck.json>"` → 0 오류(`createMany` 의 필수 필드는 컴파일이 잡는다). 로컬 실행은 불가하므로 PR 본문에 「통합 스펙은 CI 에서만 검증」이라고 적는다(오케스트레이터 몫).
- [ ] **Step 6: 커밋** — `test(v1_api): 한 팀 한 조 통합 스펙 — 4방향 대조군, 자리 경로, 교차 배치 재배치` · pathspec 은 위 세 스펙 파일 + `git show --stat HEAD`.
---

# Part B — 결정 4: 웹 후보 제외·차단 (서버 다음)

서버 코드를 바꾼 뒤에도 웹이 다른 조 팀을 후보로 보여 주면 운영자가 매번 409 토스트를 만난다. 모든 후보 출처(칸 패널 select · 탭/끌어놓기 · 모바일 선택창 · 목록 화면 세 곳)가 **한 헬퍼**를 쓴다. 서버가 판정의 정본이고, 웹 헬퍼는 같은 규칙의 *예방용 사본*이다(규칙이 바뀌면 둘 다).

## Task 4 — 순수 헬퍼 `registrationIdsBlockedForGroup`

**Files:**
- Create: `apps/v1_web/src/lib/bracket-group-enrollment.ts`
- Test: `apps/v1_web/src/lib/bracket-group-enrollment.test.ts`

**Interface:**
```ts
export const TEAM_IN_OTHER_GROUP_MESSAGE = '다른 조에 있는 팀은 이 조에 넣을 수 없어요. 그 조에서 먼저 빼 주세요.'; // 서버 TEAM_IN_OTHER_GROUP_MESSAGE 와 같은 문장
export const TEAM_IN_OTHER_GROUP_HIDDEN_NOTE = '다른 조에 있는 팀은 목록에서 빠져 있어요.'; // 후보가 실제로 빠졌을 때만 보이는 안내
/** groupId 의 조가 조별 단계일 때, 그 조에는 없고 다른 조별 조에는 있는 신청 id. 결선 단계·조 없음·모르는 id 는 빈 집합. */
export function registrationIdsBlockedForGroup(groups: readonly V1AdminBracketGroup[], groupId: string | null): ReadonlySet<string>;
```

- [ ] **Step 1: 실패하는 테스트.**
```ts
import { describe, expect, it } from 'vitest';
import { makeGroup } from '@/test/bracket-canvas-fixtures';
import { registrationIdsBlockedForGroup } from './bracket-group-enrollment';

const member = (groupId: string, registrationId: string | null) => ({ id: `gt-${groupId}-${registrationId}`, groupId, registrationId, teamName: registrationId, sortOrder: 0, createdAt: '' });
const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', groupTeams: [member('gA', 'r1')] });
const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1, groupTeams: [member('gB', 'r2'), member('gB', 'r3')] });
const quarter = makeGroup({ id: 'gQ', name: '8강', phase: 'quarter', sortOrder: 2, groupTeams: [member('gQ', 'r4')] });
const ids = (set: ReadonlySet<string>) => [...set].sort();

describe('registrationIdsBlockedForGroup', () => {
  it('조별 조에는 다른 조별 조의 팀만 못 넣고, 이 조의 팀과 어느 조에도 없는 팀은 그대로다', () => {
    expect(ids(registrationIdsBlockedForGroup([gA, gB], 'gA'))).toEqual(['r2', 'r3']);
    expect(ids(registrationIdsBlockedForGroup([gA, gB], 'gB'))).toEqual(['r1']);
  });

  it('결선 단계 조에 편성된 팀은 세지 않는다', () => {
    expect(ids(registrationIdsBlockedForGroup([gA, gB, quarter], 'gA'))).toEqual(['r2', 'r3']); // r4 는 막히지 않는다
  });

  it('이 조에도 편성된 팀은 다른 조와 겹쳐 있어도 막지 않는다 — 이미 겹친 옛 데이터', () => {
    const crossed = makeGroup({ id: 'gC', name: 'C조', phase: 'group', sortOrder: 3, groupTeams: [member('gC', 'r1'), member('gC', 'r2')] });
    expect(ids(registrationIdsBlockedForGroup([gA, gB, crossed], 'gA'))).toEqual(['r2', 'r3']); // r1 은 A조에도 있어 허용
    expect(ids(registrationIdsBlockedForGroup([gA, gB, crossed], 'gC'))).toEqual(['r3']);      // r1·r2 는 C조에도 있어 허용
  });

  it('결선 조·조 없음·모르는 id 는 아무것도 막지 않고, 미정 부전승 자리(registrationId null)는 무시한다', () => {
    expect(registrationIdsBlockedForGroup([gA, gB, quarter], 'gQ').size).toBe(0);
    expect(registrationIdsBlockedForGroup([gA, gB], null).size).toBe(0);
    expect(registrationIdsBlockedForGroup([gA, gB], 'ghost').size).toBe(0);
    const withEmptySlot = makeGroup({ id: 'gD', name: 'D조', phase: 'group', sortOrder: 4, groupTeams: [member('gD', null)] });
    expect(ids(registrationIdsBlockedForGroup([gA, withEmptySlot], 'gA'))).toEqual([]);
  });
});
```
- [ ] **Step 2: 실패 확인.** `cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-group-enrollment.test.ts` → FAIL(모듈 없음).
- [ ] **Step 3: 구현.**
```ts
import type { V1AdminBracketGroup } from '@/types/api';

export const TEAM_IN_OTHER_GROUP_MESSAGE = '다른 조에 있는 팀은 이 조에 넣을 수 없어요. 그 조에서 먼저 빼 주세요.';
export const TEAM_IN_OTHER_GROUP_HIDDEN_NOTE = '다른 조에 있는 팀은 목록에서 빠져 있어요.';

const NONE: ReadonlySet<string> = new Set();

export function registrationIdsBlockedForGroup(groups: readonly V1AdminBracketGroup[], groupId: string | null): ReadonlySet<string> {
  const target = groups.find((group) => group.id === groupId);
  if (target === undefined || target.phase !== 'group') return NONE;
  const here = new Set(target.groupTeams.map((team) => team.registrationId));
  const blocked = new Set<string>();
  for (const group of groups) {
    if (group.id === target.id || group.phase !== 'group') continue;
    for (const team of group.groupTeams) {
      if (team.registrationId !== null && !here.has(team.registrationId)) blocked.add(team.registrationId);
    }
  }
  return blocked;
}
```
- [ ] **Step 4: 통과.** 같은 명령 PASS, `./node_modules/.bin/tsc --noEmit` 0.
- [ ] **Step 5: 커밋** — `feat(web): 한 팀 한 조 — 이 조에 못 넣는 신청 id 계산 헬퍼` · pathspec 두 파일 + `git show --stat HEAD`.

> `describeBracketCanvasError` 에는 `TEAM_IN_OTHER_GROUP` 문구를 **추가하지 않는다** — 코드에 매핑이 없으면 서버가 보낸 해요체 `message` 가 그대로 나오고(`extractErrorMessage`), 같은 문장의 사본을 하나 더 만들지 않는다. 클라이언트에서 요청 없이 막는 경우만 위 상수를 쓴다.

## Task 5 — 데스크톱: 칸 패널 select 후보(직접·자리) + 탭/끌어놓기 차단

**Files:**
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-node-panel.tsx` (`:76` 근처 `confirmed`, 직접 select `:140-152`, 자리 select `:166-172`)
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx` (`handleAssign` `:144`, `handleAssignDirect` `:158`)
- Test: `bracket-node-panel.test.tsx`(`자리 없이 팀을 직접 지정한 줄` 블록 `:135` + 자리 select 블록), `bracket-canvas-workspace.test.tsx`(`팀 배정(키보드 경로)` 블록 `:173` 뒤)

자리(slot) 경로도 서버가 같은 409 를 건다(Task 1) — 직접 지정만 거르면 자리 select 에서 같은 토스트를 만난다. 판정 기준은 둘 다 「그 경기/자리의 조」다(`fixture.groupId` / `slot.groupId`).

- [ ] **Step 1: 실패하는 테스트 — 칸 패널.** `자리 없이 팀을 직접 지정한 줄` 블록 안에 추가한다(파일 상단 `registrations` = r1 서울FC · r2 부산FC · r3 대구FC).
```ts
    describe('한 팀 한 조', () => {
      const member = (groupId: string, registrationId: string) => ({ id: `gt-${registrationId}`, groupId, registrationId, teamName: registrationId, sortOrder: 0, createdAt: '' });
      const stageA = makeGroup({ id: 'g-a', name: 'A조', phase: 'group', groupTeams: [member('g-a', 'r1')] });
      const stageB = makeGroup({ id: 'g-b', name: 'B조', phase: 'group', sortOrder: 1, groupTeams: [member('g-b', 'r2')] });
      const quarter = makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter', sortOrder: 2 });
      const empty = (groupId: string) => legacy({ groupId, homeRegistrationId: null, homeTeamName: '홈 팀 미정' });
      const homeOptions = () => within(screen.getByLabelText('홈 팀 선택')).getAllByRole('option').map((option) => option.textContent);

      it('조별 경기의 후보에서 다른 조 팀을 빼고, 이 조 팀과 어느 조에도 없는 팀은 남기며, 빠졌다는 안내를 보여 준다', () => {
        renderPanel(empty('g-a'), { groups: [stageA, stageB, quarter] });
        expect(homeOptions()).toEqual(['비워 두기', '서울FC', '대구FC']); // 부산FC(B조) 만 빠진다
        expect(screen.getByText('다른 조에 있는 팀은 목록에서 빠져 있어요.')).toBeInTheDocument();
      });

      it('대조군 — B조 경기에서는 반대로 A조 팀(서울FC)이 빠지고, 빠진 팀이 없으면 안내도 없다', () => {
        renderPanel(empty('g-b'), { groups: [stageA, stageB, quarter] });
        expect(homeOptions()).toEqual(['비워 두기', '부산FC', '대구FC']);
        cleanup();
        renderPanel(empty('g-a'), { groups: [stageA, quarter] });
        expect(screen.queryByText('다른 조에 있는 팀은 목록에서 빠져 있어요.')).not.toBeInTheDocument();
      });

      it('대조군 — 결선 단계 경기는 조 편성과 상관없이 모두 보인다', () => {
        renderPanel(empty('g-qf'), { groups: [stageA, stageB, quarter] });
        expect(homeOptions()).toEqual(['비워 두기', '서울FC', '부산FC', '대구FC']);
      });

      it('이미 들어 있는 팀이 다른 조 편성이어도 현재 값은 목록에 남는다 (선택창이 값을 잃지 않는다)', () => {
        renderPanel(legacy({ groupId: 'g-a', homeRegistrationId: 'r2', homeTeamName: '부산FC' }), { groups: [stageA, stageB] });
        expect(screen.getByLabelText('홈 팀 선택')).toHaveValue('r2');
        expect(homeOptions()).toContain('부산FC');
      });
    });
```
자리 select 쪽은 기존 자리 블록(`s-away` 를 쓰는 테스트 근처)에 같은 모양의 한 쌍을 더한다 — `슬롯.groupId` 가 조별 조('g-a')이고 대구FC(r3)가 B조에만 편성된 상태에서 **미편성 신규 팀(r4 인천FC)은 보이고 대구FC 는 빠진다**, 같은 상태에서 슬롯 조가 결선 조이면 둘 다 보인다.
```ts
    it('자리 select 도 같은 기준으로 다른 조 팀을 뺀다 — 인천FC(미편성)는 남고 대구FC(B조)는 빠진다', () => {
      const memberOfB = { id: 'gt-r3', groupId: 'g-b', registrationId: 'r3', teamName: '대구FC', sortOrder: 0, createdAt: '' };
      const stageA = makeGroup({ id: 'g-a', name: 'A조', phase: 'group' });
      const stageB = makeGroup({ id: 'g-b', name: 'B조', phase: 'group', sortOrder: 1, groupTeams: [memberOfB] });
      renderPanel(fixtureOf({ groupId: 'g-a' }), {
        groups: [stageA, stageB],
        slots: [slots[0], makeSlot({ id: 's-away', label: '2번 자리', groupId: 'g-a' }), slots[2]],
        registrations: [...registrations, makeRegistration({ id: 'r4', teamName: '인천FC' })],
      });
      const options = within(screen.getByLabelText('어웨이 팀 선택')).getAllByRole('option').map((option) => option.textContent);
      expect(options).toContain('인천FC');
      expect(options).not.toContain('대구FC');
    });
```
- [ ] **Step 2: 실패하는 테스트 — 워크스페이스(탭).** `bracket-canvas-workspace.test.tsx` 의 리그 블록 쪽(`leagueBracket` `:462` 아래)에 추가. 요청이 **0건**이고 같은 문구가 토스트로 나오며 고른 팀이 유지되어야 한다.
```ts
describe('BracketCanvasWorkspace — 한 팀 한 조(탭 배정)', () => {
  const member = (groupId: string, registrationId: string) => ({ id: `gt-${registrationId}`, groupId, registrationId, teamName: registrationId, sortOrder: 0, createdAt: '' });
  const withTeams = makeBracket({
    groups: [
      makeGroup({ id: 'lgA', name: 'A조', phase: 'group', sortOrder: 0, groupTeams: [member('lgA', 'r1')] }),
      makeGroup({ id: 'lgB', name: 'B조', phase: 'group', sortOrder: 1, groupTeams: [member('lgB', 'r2')] }),
    ],
    fixtures: [makeFixture({ id: 'l1', groupId: 'lgA', fixtureNumber: 1, round: 'league_r1' })],
  });
  const placeInto = (teamName: RegExp) => {
    const props = leagueProps('league');
    setBracket(withTeams);
    render(<BracketCanvasWorkspace {...props} />);
    fireEvent.click(screen.getByRole('button', { name: teamName }));
    fireEvent.click(within(screen.getByRole('group', { name: '1라운드 A조' })).getByRole('button', { name: /^홈 .*선택한 팀을 여기에 넣어요/ }));
    return props;
  };

  it('다른 조 팀(부산FC)을 A조 칸에 넣으려 하면 요청 없이 해요체로 막고 고른 팀을 유지한다', () => {
    const props = placeInto(/부산FC/);
    expect(mocks.updateFixture).not.toHaveBeenCalled();
    expect(props.showToast).toHaveBeenCalledWith('다른 조에 있는 팀은 이 조에 넣을 수 없어요. 그 조에서 먼저 빼 주세요.', 'error');
    expect(screen.getByRole('button', { name: /부산FC/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('대조군 — 같은 조 팀(서울FC)과 어느 조에도 없는 팀(대구FC)은 그대로 PATCH 된다', () => {
    placeInto(/서울FC/);
    expect(mocks.updateFixture).toHaveBeenCalledWith({ fixtureId: 'l1', homeRegistrationId: 'r1' }, expect.any(Object));
    cleanup();
    mocks.updateFixture.mockClear();
    placeInto(/대구FC/);
    expect(mocks.updateFixture).toHaveBeenCalledWith({ fixtureId: 'l1', homeRegistrationId: 'r3' }, expect.any(Object));
  });
});
```
(`leagueProps`·`setBracket`·`mocks` 는 이 파일 기존 헬퍼. 끌어놓기는 같은 `place()`(`bracket-canvas-node.tsx:79`)를 지나 같은 `handleAssignDirect` 로 합류하므로 별도 DnD 테스트를 두지 않는다 — 합류점 차단이 두 입력을 함께 막는다. 트레이→자리 배정(`handleAssign`)도 같은 차단을 받으므로 토너먼트 캔버스 블록에 같은 모양의 「다른 조 팀을 조별 자리에 넣으려 하면 `assignSlot` 호출 0건 + 같은 토스트」 한 쌍(차단/대조군)을 둔다 — 자리의 조는 `slot.groupId`.)
- [ ] **Step 3: 실패 확인.** `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-node-panel.test.tsx src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx` → 새 테스트 FAIL(후보에 부산FC 있음 / `updateFixture` 호출됨 / 안내 문구 없음).
- [ ] **Step 4: 구현.**
`bracket-node-panel.tsx` — `confirmed` 아래에 `const blockedIds = registrationIdsBlockedForGroup(groups, fixture.groupId);`. 직접 select 후보 필터를
```tsx
.filter((registration) => registration.id !== other && (!blockedIds.has(registration.id) || registration.id === current))
```
로(현재 값은 잃지 않는다). 자리 select 는 `slotBlocked = registrationIdsBlockedForGroup(groups, slot.groupId)` 를 같은 방식으로 `options` 필터에 더한다. 두 select 아래에 후보가 실제로 숨겨졌을 때만(`confirmed.some((r) => blocked.has(r.id) && r.id !== current)`) 안내를 그린다:
```tsx
<p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{TEAM_IN_OTHER_GROUP_HIDDEN_NOTE}</p>
```
`bracket-canvas-workspace.tsx` — `handleAssignDirect` 와 `handleAssign` 맨 앞:
```ts
    const groupId = bracket.fixtures.find((fixture) => fixture.id === fixtureId)?.groupId ?? null; // handleAssign 은 bracket.slots.find(slot.id === slotId)?.groupId
    if (registrationIdsBlockedForGroup(bracket.groups, groupId).has(registrationId)) {
      showToast(TEAM_IN_OTHER_GROUP_MESSAGE, 'error');
      return;
    }
```
두 파일에 `@/lib/bracket-group-enrollment` import 추가.
- [ ] **Step 5: 통과 + 타입.** 위 vitest 명령 PASS, `tsc --noEmit` 0, `node scripts/v1-pattern-check.mjs` 통과.
- [ ] **Step 6: 커밋** — `feat(web): 대진 그림 — 다른 조 팀은 후보에서 빼고 탭 배정은 막는다` · pathspec 네 파일 + `git show --stat HEAD`.

## Task 6 — 모바일 선택창(`DirectTeamPicker`·`SlotTeamPicker`) 후보에서 다른 조 팀 제외

**Files:**
- Modify: `apps/v1_web/src/lib/bracket-canvas-mobile-model.ts` (`MobileNode` `:33`, `bracketMobileNode` `:100`, `leagueMobileNode` `:131`)
- Modify: `bracket-canvas-mobile-sheet.tsx`(`MobileNodeSheetBodyProps` `:29`, `TeamPickerView` `:150`, `SlotTeamPicker` `:266`, `DirectTeamPicker` `:289`, 호출 `:351`), `bracket-canvas-mobile.tsx`(`BracketCanvasMobileProps` `:23`, 시트 호출 `:187`), `bracket-canvas-mobile-screen.tsx`(`:67`)
- Test: `bracket-canvas-mobile.test.tsx`, `bracket-canvas-mobile-screen.test.tsx`

**Interface 변경:**
```ts
// MobileNode 에 추가 — 조별 단계 후보 제외에만 쓴다. 리그 매치(scope 'league')는 대회 조가 없어 null.
groupId: string | null;
// BracketCanvasMobileProps · MobileNodeSheetBodyProps 에 추가 — tournament scope 에서만 넘긴다.
groups?: readonly V1AdminBracketGroup[];
// TeamPickerView 에 추가 — 다른 조 팀이 후보에서 빠졌을 때만 안내를 그린다.
hiddenNote?: string;
```
`groups` 를 선택 prop 으로 두는 이유: `league-match-fixtures-client.tsx:770` 의 리그 매치 화면은 대회 조 개념이 없고 같은 컴포넌트를 쓴다(그 호출부는 건드리지 않는다).

- [ ] **Step 1: 실패하는 테스트 — 모바일.** `bracket-canvas-mobile.test.tsx` 의 **기존 `describe('BracketCanvasMobile — 팀 넣기')` 안**(`:371`, `optionNames` 가 그 블록 안에서만 선언돼 있다)에 추가한다. 파일 상단의 `candidates`: r1 강남 · r2 마포 · r3 서초 · r4 송파 · r5 용산, `card()`·`loaded`·`buildGroup`·`makeFixture`·`buildGame` 기존 헬퍼. 후보를 바꿔 가며 여는 대조군은 `cleanup` 대신 **테스트를 나눠** 쓴다(자동 cleanup 과 충돌하지 않게).
```ts
  describe('한 팀 한 조 — 직접 지정 후보', () => {
    const member = (groupId: string, registrationId: string) => ({ id: `gt-${registrationId}`, groupId, registrationId, teamName: registrationId, sortOrder: 0, createdAt: '' });
    const stageA = buildGroup({ id: 'g-a', name: 'A조', phase: 'group', sortOrder: 0, groupTeams: [member('g-a', 'r1')] });
    const stageB = buildGroup({ id: 'g-b', name: 'B조', phase: 'group', sortOrder: 1, groupTeams: [member('g-b', 'r2')] });
    const quarter = buildGroup({ id: 'g-q2', name: '8강', phase: 'quarter', sortOrder: 2 });
    const hiddenNote = '다른 조에 있는 팀은 목록에서 빠져 있어요.';

    function openHomePicker(groupId: string) {
      const stageGroups = [stageA, stageB, quarter];
      const stageFixtures = [makeFixture({ id: 'gx-1', groupId, fixtureNumber: 1, round: '조별 1라운드', game: buildGame({ id: 'g-x1' }) })];
      renderMobile({
        rounds: buildBracketMobileRounds({ groups: stageGroups, fixtures: stageFixtures, slots: [] }),
        slots: [], groups: stageGroups,
      });
      fireEvent.click(card(/1번 경기/));
      fireEvent.click(screen.getByRole('button', { name: '홈 팀 고르기' }));
    }

    it('A조 경기의 후보에서 B조 팀(마포FC)만 빠지고 안내가 보인다 — A조 팀과 어느 조에도 없는 팀은 남는다', () => {
      openHomePicker('g-a');
      expect(optionNames()).toEqual(['강남FC', '서초FC', '송파FC', '용산FC']);
      expect(screen.getByText(hiddenNote)).toBeInTheDocument();
    });

    it('대조군 — B조 경기에서는 A조 팀(강남FC)이 빠진다', () => {
      openHomePicker('g-b');
      expect(optionNames()).toEqual(['마포FC', '서초FC', '송파FC', '용산FC']);
    });

    it('대조군 — 결선 단계 경기는 모두 보이고 안내도 없다', () => {
      openHomePicker('g-q2');
      expect(optionNames()).toEqual(['강남FC', '마포FC', '서초FC', '송파FC', '용산FC']);
      expect(screen.queryByText(hiddenNote)).not.toBeInTheDocument();
    });
  });
```
(`renderMobile` 은 이 파일 기존 헬퍼로 `overrides` 를 받는다 — `groups` 를 `BracketCanvasMobileProps` 에 더하면 타입이 맞는다. 핵심 단언 값은 실제 `candidates` 순서를 따른다.) 자리 선택창 쪽은 **자리의 조**(`slot.groupId`)가 조별 조일 때 같은 후보 제외가 걸리는 한 쌍(제외/대조군)을 `팀 넣기` 블록의 자리 테스트 옆에 둔다.
`bracket-canvas-mobile-screen.test.tsx` 는 mock 이 `groups` 를 받아 개수를 노출하게 하고(`data-groups={props.groups?.length ?? -1}`), 「응답에서 만든 라운드·자리…」 테스트에 `expect(mobile).toHaveAttribute('data-groups', '1')` 를 더한다(스크린이 `bracket.groups` 를 실제로 내려보내는지).
- [ ] **Step 2: 실패 확인.** `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.test.tsx` → FAIL(마포FC 가 후보에 있음 / `data-groups` -1). `tsc --noEmit` 은 새 prop 때문에 테스트 파일에서 먼저 오류.
- [ ] **Step 3: 구현.** 모델에 `groupId` 추가(`bracketMobileNode` → `groupId: fixture.groupId`, `leagueMobileNode` → `groupId: null`). `DirectTeamPicker`·`SlotTeamPicker` 가 `groups` 를 받고
```tsx
  const blocked = registrationIdsBlockedForGroup(groups, node.groupId); // SlotTeamPicker 는 slot.groupId
  const options = candidates.filter((candidate) => candidate.registrationId !== other.registrationId && !blocked.has(candidate.registrationId));
  ...
  hiddenNote={candidates.some((candidate) => blocked.has(candidate.registrationId)) ? TEAM_IN_OTHER_GROUP_HIDDEN_NOTE : undefined}
```
(자리 선택창은 `pickableCandidates(...)` 결과에 `!blocked.has(...)` 를 더 건다. `TeamPickerView` 는 현재 팀을 목록에서 이미 빼므로 「현재 값 유지」 처리는 필요 없다.) `TeamPickerView` 는 `hiddenNote` 가 있으면 목록 아래에 `<p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">` 로 그린다. `groups` 기본값은 호출부 `props.groups ?? []` 한 곳 — 리그 매치 화면은 빈 배열이라 아무것도 막지 않는다. `BracketCanvasMobile` → `MobileNodeSheetBody` → 두 선택창으로 `groups` 를 내려보내고 `BracketCanvasMobileScreen` 이 `groups={bracket.groups}` 를 넘긴다. `tsc --noEmit` 이 `MobileNode` 리터럴을 만드는 테스트 헬퍼의 `groupId` 누락을 알려 주면 그 헬퍼에만 `groupId: null` 을 더한다.
- [ ] **Step 4: 통과 + 타입 + 패턴.** 위 vitest 명령 PASS, 이어서 `src/lib/bracket-canvas-mobile-model.test.ts` PASS, `tsc --noEmit` 0, `node scripts/v1-pattern-check.mjs` 통과.
- [ ] **Step 5: 커밋** — `feat(web): 모바일 팀 선택창에서 다른 조 팀 제외` · pathspec 수정 파일 전부(+ `groupId` 를 더한 테스트 헬퍼) + `git show --stat HEAD`.

## Task 7 — 목록 화면(「조 팀 배정」·「경기 일정 추가」 선택창·경기 수정 대화상자) 후보에서 다른 조 팀 제외

목록 화면에서 조별 단계 경기에 팀이 들어가는 길은 셋이고 모두 `createFixture`/`updateFixture`/`createGroupTeam` 으로 간다(사용자가 말한 「직접 입력」 포함). 셋 다 같은 헬퍼로 거른다.

**Files:**
- Modify: `apps/v1_web/src/app/admin/tournaments/[id]/bracket-group-card.tsx` (`:215` 팀 검색 풀, `:508-527` 「경기 일정 추가」 홈/어웨이 `EntityPicker`)
- Modify: `apps/v1_web/src/app/admin/tournaments/[id]/bracket-tab.tsx` (`:193` `editFixtureTeamItems`, `:914-929` 경기 수정 홈/어웨이 `EntityPicker`)
- Test: `.../bracket-group-card.test.tsx` (`팀 일괄 배정` 블록 안, `조별(group) 단계 조는 추천칩 없이…` 테스트 뒤), `.../bracket-tab.test.tsx` (`경기 수정: 팀 해제(TBD) 전송` 블록 뒤)

- [ ] **Step 1: 실패하는 테스트 — 팀 검색 풀과 「경기 일정 추가」 선택창.**
```tsx
  describe('한 팀 한 조 — 후보에서 다른 조 팀 제외', () => {
    const memberOf = (groupId: string, registrationId: string) => ({ id: `gt-${registrationId}`, groupId, registrationId, teamName: registrationId, sortOrder: 0, createdAt: '2026-08-01T00:00:00.000Z' });
    const stageA = { ...groupA, groupTeams: [memberOf('group-a', 'r1')] };
    const stageB = { ...groupA, id: 'group-b', name: 'B조', sortOrder: 1, groupTeams: [memberOf('group-b', 'r2')] };
    const knockout = { ...semiGroup, groupTeams: [memberOf('semi-1', 'r2')] };
    const renderCard = (group: V1AdminBracketGroup, allGroups: V1AdminBracketGroup[]) =>
      render(
        <BracketGroupCard
          group={group} allGroups={allGroups} allStandings={[]} fixtures={[]}
          confirmedTeamItems={[{ id: 'r2', label: '마포FC' }, { id: 'r3', label: '송파FC' }]}
          assignGroupTeam={noopMutation() as unknown as ReturnType<typeof import('@/hooks/use-v1-api').useV1AssignGroupTeam>}
          createFixture={noopMutation()} isAutoGenerating={false} onAutoGenerate={vi.fn()} onEditGroup={vi.fn()}
          onDeleteGroup={vi.fn()} onRemoveGroupTeam={vi.fn()} autoFocus={false} showToast={vi.fn()}
        />,
      );
    const searchFor = (placeholder: string) => fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: 'FC' } });
    const optionLabels = () => screen.queryAllByRole('option').map((option) => option.textContent ?? '');

    it('조별 단계 조의 팀 검색에서 다른 조별 조에 편성된 팀(마포FC)은 빠지고 어느 조에도 없는 팀(송파FC)은 남는다', () => {
      renderCard(stageA, [stageA, stageB]);
      searchFor('팀 검색');
      expect(optionLabels().join()).toContain('송파FC');
      expect(optionLabels().join()).not.toContain('마포FC');
    });

    it('대조군 — 다른 조가 없으면 마포FC 도 보이고, 결선 단계 조에만 편성된 팀은 막지 않는다', () => {
      const { unmount } = renderCard(stageA, [stageA]);
      searchFor('팀 검색');
      expect(optionLabels().join()).toContain('마포FC');
      unmount();
      renderCard(stageA, [stageA, knockout]); // 마포FC 는 4강 조에만 있다
      searchFor('팀 검색');
      expect(optionLabels().join()).toContain('마포FC');
    });

    it('「경기 일정 추가」 홈 팀 선택창도 같은 후보만 보여 주고, 결선 단계 조는 거르지 않는다', () => {
      const { unmount } = renderCard(stageA, [stageA, stageB]);
      fireEvent.click(screen.getByRole('button', { name: /직접 입력/ }));
      fireEvent.change(screen.getByPlaceholderText('홈 팀 검색'), { target: { value: 'FC' } });
      expect(optionLabels().join()).not.toContain('마포FC');
      expect(optionLabels().join()).toContain('송파FC');
      unmount();
      renderCard(knockout, [stageA, stageB, knockout]);
      fireEvent.click(screen.getByRole('button', { name: /직접 입력/ }));
      fireEvent.change(screen.getByPlaceholderText('홈 팀 검색'), { target: { value: 'FC' } });
      expect(optionLabels().join()).toContain('마포FC');
    });
  });
```
(검색 입력이 `option` 역할로 후보를 그리는 방식은 같은 파일의 부전승 테스트와 같다. 다른 role 로 그려지면 그 파일의 기존 선택자를 따르고, `조 팀 배정` 입력 placeholder 가 `팀 검색` 이 아니면 실제 값으로 바꾼다.)

**경기 수정 대화상자 테스트** — `bracket-tab.test.tsx`. 모듈 변수 `bracketGroups` 를 두 조로 바꾼 뒤(A조 r1 · B조 r2 편성, 대조군으로 r3 는 미편성) A조 경기의 수정 대화상자를 연다.
```tsx
describe('BracketTab — 경기 수정: 한 팀 한 조', () => {
  const groupWith = (id: string, name: string, phase: 'group' | 'semi', sortOrder: number, teams: string[]) => ({
    ...bracket.groups[0], id, name, phase, sortOrder,
    groupTeams: teams.map((registrationId, index) => ({ id: `gt-${registrationId}`, groupId: id, registrationId, teamName: registrationId, sortOrder: index })),
  });
  const registrations = () => ['r1', 'r2', 'r3'].map((id, index) => confirmedRegistration({ id, teamName: ['강남FC', '마포FC', '송파FC'][index] }));
  const openEdit = async () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'A조 · 조별리그 1라운드 1번 경기 수정' })[0]);
    return screen.findByRole('dialog', { name: '경기 수정' });
  };
  const homeOptions = (dialog: HTMLElement) => {
    fireEvent.click(within(dialog).getAllByRole('button', { name: '선택 해제' })[0]); // 홈 칩을 지워야 검색창이 열린다
    fireEvent.change(within(dialog).getByPlaceholderText('홈 팀 검색'), { target: { value: 'FC' } });
    return screen.getAllByRole('option').map((option) => option.textContent ?? '').join();
  };

  beforeEach(() => {
    bracketFixtures = [fixtureRow({ id: 'fx-1', round: 'league_r1', fixtureNumber: 1, homeRegistrationId: 'r1', awayRegistrationId: null, awayTeamName: null })];
  });
  afterEach(() => { bracketGroups = bracket.groups; });

  it('조별 단계 경기의 수정 후보에서 다른 조 팀(마포FC)은 빠지고 이 조 팀·미편성 팀은 남는다', async () => {
    bracketGroups = [groupWith('group-a', 'A조', 'group', 0, ['r1']), groupWith('group-b', 'B조', 'group', 1, ['r2'])];
    renderTab(vi.fn(), registrations());
    const labels = homeOptions(await openEdit());
    expect(labels).toContain('강남FC');
    expect(labels).toContain('송파FC');
    expect(labels).not.toContain('마포FC');
  });

  it('대조군 — 마포FC 가 결선 단계 조에만 있으면 보인다', async () => {
    bracketGroups = [groupWith('group-a', 'A조', 'group', 0, ['r1']), groupWith('semi-1', '4강', 'semi', 1, ['r2'])];
    renderTab(vi.fn(), registrations());
    expect(homeOptions(await openEdit())).toContain('마포FC');
  });
});
```
(`renderTab`·`confirmedRegistration`·`bracketFixtures`·`bracketGroups` 는 이 파일의 기존 헬퍼/변수이고 `afterEach` 가 import 에 없으면 더한다. 「직접 입력」 버튼 이름이 조별 단계 조에서 다르면 실제 이름을 따른다. 칩을 지우는 순서와 placeholder 는 위 `팀 해제(TBD)` 블록과 같은 방식이다.)
- [ ] **Step 2: 실패 확인.** `./node_modules/.bin/vitest run "src/app/admin/tournaments/[id]/bracket-group-card.test.tsx" "src/app/admin/tournaments/[id]/bracket-tab.test.tsx"` → 새 테스트 FAIL(마포FC 가 보임).
- [ ] **Step 3: 구현.**
`bracket-group-card.tsx` — `assignedIds` 아래:
```ts
  const blockedIds = registrationIdsBlockedForGroup(allGroups, group.id);
  const searchPoolItems = confirmedTeamItems.filter((it) => !assignedIds.has(it.id) && !blockedIds.has(it.id));
  const fixtureTeamItems = confirmedTeamItems.filter((it) => !blockedIds.has(it.id));
```
홈/어웨이 `EntityPicker` 의 `items` 를 `fixtureTeamItems.filter(...)` 로(선택값 `value` 는 `confirmedTeamItems.find` 그대로 — 이미 고른 팀이 사라지지 않는다). `suggestedTeams` 는 조별 단계 조에서 항상 빈 배열이라 손대지 않는다.
`bracket-tab.tsx` — `editFixture` 의 조를 기준으로:
```ts
  const editBlockedIds = registrationIdsBlockedForGroup(groups, editFixture?.groupId ?? null);
  const editPickerItems = (selectedId: string) => editFixtureTeamItems.filter((it) => !editBlockedIds.has(it.id) || it.id === selectedId);
```
홈 `items={editPickerItems(editFxHomeRegId)}`, 어웨이 `items={editPickerItems(editFxAwayRegId)}` (현재 값은 잃지 않는다). 세 파일에 import 추가.
- [ ] **Step 4: 통과.** 같은 명령 PASS, `tsc --noEmit` 0.
- [ ] **Step 5: 커밋** — `feat(web): 목록 화면의 팀 후보에서 다른 조에 있는 팀은 뺀다` · pathspec 네 파일 + `git show --stat HEAD`.

---

# Part C — 결정 3: 옛 리그 라운드 통일 (격자 모델 → 선택지 → 폼)

> **Task 8·9·10 은 한 커밋이다.** 격자 모델을 바꾸는 순간 `bracket-league-add-fixture.test.ts`·대화상자·격자 테스트의 옛 전제(번호가 하나라도 있으면 끊기 끔 · 옛 round 이어 쓰기)가 빨개지고 `tsc` 도 폼의 옛 시그니처에서 깨진다. 중간 커밋을 녹색으로 만들려고 옛 예외를 임시로 남기면 그것이 곧 지우려는 기술부채이므로, Task 8·9 는 커밋하지 않고 Task 10 Step 5 에서 한 번에 커밋한다. 각 Task 의 Step 4 는 *그 Task 가 소유한 테스트만* 돌린다.

## Task 8 — 격자 모델: 번호 없는 옛 경기는 끊고, 번호 경기와 같은 줄에 합친다

**Files:**
- Modify: `apps/v1_web/src/lib/bracket-league-grid-model.ts` (`LeagueGridRow` `:7`, `RowDraft` `:35`, 본문 `:62-92`)
- Test: `apps/v1_web/src/lib/bracket-league-grid-model.test.ts` (`:48-52` 수동 추가 케이스 · `:81-121` 옛 데이터 블록), `bracket-canvas-mobile-model.test.ts`(`buildLeagueTournamentMobileRounds` 블록 `:385`)

**규칙 (사용자 결정 3, 예외 없음).** `league_r{n}` 이 아닌 round 는 **문자열이 무엇이든**(`조별 리그`·`예선`·`final`·`8강`) 옛 경기다 — 조(열)마다 경기 번호 순으로 `max(1, floor(팀수/2))` 경기씩 끊고 k번째 묶음을 k라운드로 읽는다. 결선 단계 코드는 예외로 두지 않는다: `isKnockoutPhase` 는 소문자 코드(`final`·`semi`)만 알아서 실제 저장값인 한국어 이름(`결승`·`8강`)과 `semifinal` 은 못 거르는 반쪽 예외가 되고, 사용자 문구(「번호 없는 옛 경기는 끊는다」)에도 없다. 리그 조(`phase=group`)에 그런 round 가 들어가는 것은 수동 입력뿐이고, 그 경기는 k번째 묶음 칸에 합쳐진다. 결과적으로 **모든 줄이 번호 줄**이다 — 이름 줄(`o:<round>`)은 없어진다.

**Interface 변경:**
```ts
export type LeagueGridRow = { key: string; label: string; roundNumber: number; cells: Record<string, V1AdminBracketFixture[]> };
// roundNumber: 줄이 나타내는 라운드(번호 경기의 n, 옛 경기의 끊김 묶음 k). 「경기 추가」 선택지의 유일한 출처.
// legacyChunking: league_r{n} 이 아닌 round 의 경기가 하나라도 있으면 true — 화면의 안내 문구 조건.
```

- [ ] **Step 1: 옛 스위치를 박제한 테스트를 지우고 새 계약 테스트를 쓴다.** `bracket-league-grid-model.test.ts` 에서
  - `번호가 있는 경기가 하나라도 있으면 끊기를 쓰지 않는다`(`:117-120`)를 **삭제**한다.
  - `league_r 형식이 아닌 round 값은 번호 행 뒤에 그 이름으로 붙는다(수동 추가 경기)`(`:51-55`)는 새 규칙의 정반대 전제(이름 줄)이므로 **아래 `final` 케이스로 교체**한다.

같은 파일의 옛 데이터 `describe`(`four`·`six`·`ids`·`fx` 를 쓸 수 있는 블록) 안에 넣는다.
```ts
  it('번호 경기가 섞여도 옛 경기는 계속 끊기고, k번째 묶음은 league_r{k} 와 같은 줄·같은 칸에 합쳐진다', () => {
    const grid = buildLeagueGrid({ groups: [four], fixtures: [...six, fx('n2', 'gA', 7, 'league_r2')] });
    expect(grid.legacyChunking).toBe(true);
    expect(grid.rows.map((row) => [row.label, row.roundNumber])).toEqual([['1라운드', 1], ['2라운드', 2], ['3라운드', 3]]);
    expect(grid.rows.map((row) => ids(row.cells.gA))).toEqual([['f1', 'f2'], ['f3', 'f4', 'n2'], ['f5', 'f6']]);
  });

  it('번호 경기는 옛 경기의 끊김 위치를 밀지 않는다 — 번호 경기를 더해도 옛 줄은 같다 (대조군)', () => {
    const legacyIdsPerRow = (grid: ReturnType<typeof buildLeagueGrid>) => grid.rows.map((row) => ids(row.cells.gA).filter((id) => id.startsWith('f')));
    const without = buildLeagueGrid({ groups: [four], fixtures: six });
    const withNumbered = buildLeagueGrid({ groups: [four], fixtures: [fx('n0', 'gA', 0, 'league_r1'), ...six] });
    expect(legacyIdsPerRow(withNumbered)).toEqual(legacyIdsPerRow(without));
    expect(ids(withNumbered.rows[0].cells.gA)).toEqual(['n0', 'f1', 'f2']); // 경기 번호 순으로 한 칸에 쌓인다
  });

  it('옛 묶음 수보다 큰 번호는 새 줄이 되고 줄은 숫자 순서다', () => {
    const grid = buildLeagueGrid({ groups: [four], fixtures: [...six, fx('n9', 'gA', 8, 'league_r9')] });
    expect(grid.rows.map((row) => row.label)).toEqual(['1라운드', '2라운드', '3라운드', '9라운드']);
    expect(ids(grid.rows[3].cells.gA)).toEqual(['n9']);
  });

  it('결선 단계 코드(final)·한국어 이름(결승)으로 쓴 round 도 예외 없이 옛 경기로 끊긴다', () => {
    const numbered = fx('a1', 'gA', 1, 'league_r1');
    for (const round of ['final', '결승']) {
      const grid = buildLeagueGrid({ groups: [gA], fixtures: [fx('m', 'gA', 9, round), numbered] });
      expect(grid.rows.map((row) => [row.label, row.roundNumber])).toEqual([['1라운드', 1]]); // 이름 줄이 생기지 않는다
      expect(ids(grid.rows[0].cells.gA)).toEqual(['a1', 'm']);
      expect(grid.legacyChunking).toBe(true);
    }
  });

  it('번호가 아닌 자유 문자열(예선)도 옛 경기로 끊긴다', () => {
    const grid = buildLeagueGrid({ groups: [four], fixtures: [...six, fx('x', 'gA', 7, '예선')] });
    expect(grid.rows.map((row) => row.label)).toEqual(['1라운드', '2라운드', '3라운드', '4라운드']);
    expect(ids(grid.rows[3].cells.gA)).toEqual(['x']);
    expect(grid.legacyChunking).toBe(true);
  });

  it('번호 경기만 있으면 안내 플래그는 꺼진다', () => {
    expect(buildLeagueGrid({ groups: [four], fixtures: [fx('n1', 'gA', 1, 'league_r1')] }).legacyChunking).toBe(false);
  });
```
`bracket-canvas-mobile-model.test.ts` 의 `buildLeagueTournamentMobileRounds` 블록에 추가(모바일 탭이 같은 모델을 쓴다는 증거):
```ts
  it('옛 경기와 번호 경기가 섞여도 탭은 번호 줄 하나씩이고 옛 묶음은 같은 번호 탭에 합쳐진다', () => {
    const legacy = [1, 2, 3].map((n) => makeFixture({ id: `o${n}`, groupId: 'gA', fixtureNumber: n, round: '조별 리그' }));
    const rounds = buildLeagueTournamentMobileRounds({
      groups: [gA], slots: [], fixtures: [...legacy, makeFixture({ id: 'n2', groupId: 'gA', fixtureNumber: 9, round: 'league_r2' })],
    });
    expect(rounds.map((round) => round.label)).toEqual(['1라운드', '2라운드', '3라운드']);
    expect(rounds[1].sections[0].nodes.map((node) => node.fixtureId)).toEqual(['o2', 'n2']);
  });
```
- [ ] **Step 2: 실패 확인.** `./node_modules/.bin/vitest run src/lib/bracket-league-grid-model.test.ts src/lib/bracket-canvas-mobile-model.test.ts` → 새 테스트 FAIL — 현재 모델은 섞이면 `o:조별 리그` 한 줄로 뭉쳐 `['1라운드','2라운드','3라운드']` 대신 `['2라운드','조별 리그']` 같은 모양이 나오고 `roundNumber` 가 undefined 다. 삭제·교체한 테스트 외 기존 테스트는 계속 PASS 여야 한다.
- [ ] **Step 3: 최소 구현.** `tournament-round-label` import 는 이름 줄이 없어지므로 지운다. `RowDraft` 의 `sort` 가 곧 라운드 번호이므로 `roundNumber: draft.sort` 로 내보낸다. `numbered` 상수와 `:62-92` 의 분기를 아래로 교체:
```ts
  const drafts = new Map<string, RowDraft>();
  const place = (columnKey: string, fixture: V1AdminBracketFixture, round: number) => {
    const key = `r:${round}`;
    const draft = drafts.get(key) ?? { key, label: leagueRoundLabel(round), sort: round, order: drafts.size, cells: new Map() };
    draft.cells.set(columnKey, [...(draft.cells.get(columnKey) ?? []), fixture]);
    drafts.set(key, draft);
  };

  for (const column of columns) {
    const list = byColumn.get(column.key) ?? [];
    // 끊김은 번호 없는 경기끼리만 센다 — 번호 경기가 끼어도 옛 경기의 k번째 묶음이 밀리지 않는다.
    const chunk = gamesPerRound(groups.find((group) => group.id === column.groupId), list.filter(isLegacyRound));
    let legacySeen = 0;
    for (const fixture of list) {
      place(column.key, fixture, leagueRoundNumber(fixture.round) ?? Math.floor(legacySeen++ / chunk) + 1);
    }
  }
```
`isLegacyRound = (f) => leagueRoundNumber(f.round) === null` 를 모듈 상수로 두고, `rows` 매핑에 `roundNumber: draft.sort`, 반환 `legacyChunking: fixtures.some(isLegacyRound)`. `gamesPerRound` 의 doc 주석은 「그 열의 번호 없는 경기에 나온 서로 다른 팀」으로 한 줄만 고친다.
- [ ] **Step 4: 통과.** 위 vitest 명령 PASS(기존 옛 단독 케이스 `:81-115` 포함). `tsc --noEmit` 은 `LeagueGridRow` 리터럴을 만드는 테스트가 있으면 `roundNumber` 누락 오류가 나므로 그 테스트에만 값을 더한다. 폼 쪽 `tsc` 오류는 Task 9-10 에서 해소된다.
- [ ] **Step 5: 커밋하지 않는다** (Task 10 Step 5 에서 Task 9·10 과 한 커밋).

## Task 9 — 「경기 추가」 라운드 선택지를 격자 줄에서 파생하고 옛 예외를 지운다

**Files:**
- Modify: `apps/v1_web/src/lib/bracket-league-add-fixture.ts` (`isLegacyLeagueBracket` `:19-21`·`newest` `:41-42`·`resolveLeagueRound` `:44-55`·타입 `LeagueRoundResolution` `:8` 삭제, `leagueRoundPlan` `:30-39` 교체)
- Test: `apps/v1_web/src/lib/bracket-league-add-fixture.test.ts`

**Interface:**
```ts
export type LeagueRoundChoice = { value: string; label: string; round: string; name: string }; // 불변
export type LeagueRoundPlan = { choices: LeagueRoundChoice[]; defaultChoice: LeagueRoundChoice };   // 불변
export function leagueAddableGroups(groups): V1AdminBracketGroup[];                                  // 불변
export function leagueRoundPlan(input: {
  groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[];
}): LeagueRoundPlan;   // choices = buildLeagueGrid(input).rows 의 roundNumber (이미 오름차순) + 「새 라운드 (최댓값+1)」
// 삭제: isLegacyLeagueBracket, resolveLeagueRound, LeagueRoundResolution
```
저장되는 `round` 는 항상 `choice.round`(`league_r{k}`) 다 — 변환 단계가 없다.

- [ ] **Step 1: 테스트를 새 계약으로 바꾼다.** 헬퍼 `addVia` 와 `leagueRoundPlan` 호출을 `{ groups, fixtures }` 입력으로 바꾸고(`resolveLeagueRound` import 삭제), 옛 블록(`:101-136`)을 아래로 **교체**한다.
```ts
/** 대화상자가 하는 일 그대로 — 고른 선택지의 round 와 다음 경기 번호로 경기를 하나 붙인다. */
function addVia(groups: ReturnType<typeof makeGroup>[], fixtures: ReturnType<typeof fx>[], groupId: string, choiceValue: string) {
  const choice = leagueRoundPlan({ groups, fixtures }).choices.find((candidate) => candidate.value === choiceValue);
  if (choice === undefined) throw new Error(`선택지에 ${choiceValue} 가 없어요`);
  return { round: choice.round, fixtures: [...fixtures, fx('new', groupId, nextFixtureNumber(fixtures), choice.round)] };
}
```
`leagueRoundPlan` 블록의 호출은 `leagueRoundPlan({ groups: [gA, gB], fixtures: [...] })` / `leagueRoundPlan({ groups: [], fixtures: [] })`, `격자 착지` 블록의 `addVia(base, …)` 는 `addVia([gA, gB], base, …)`(빈 조 케이스는 `[gA, gB, empty]`) 로 바꾼다. `final` 을 쓰는 두 기존 테스트는 Task 8 의 규칙(번호가 아니면 예외 없이 옛 경기)에 맞춰 고친다:
- `league_r 가 아닌 수동 추가 round 는 선택지에 넣지 않는다`(`:46-49`) — 제목을 「번호가 아닌 round(final)는 옛 경기로 끊겨 같은 줄로 읽히므로 새 선택지를 만들지 않는다」로 바꾸고 호출을 `leagueRoundPlan({ groups: [gA], fixtures: [fx('a1', 'gA', 1, 'league_r1'), fx('m', 'gA', 2, 'final')] })` 로, 기대 `['r1', 'new']` 는 그대로.
- `혼합 데이터(번호 + 수동 final)에서 새 라운드 행은 final 행 앞에 온다`(`:92-98`) — 「…에서 final 은 1라운드 줄에 합쳐지고 새 라운드는 3라운드다」로 바꾸고 기대를 `rows.map(label)` = `['1라운드', '2라운드', '3라운드']`, `ids(rows[0].cells.gA)` = `['a1', 'm']`, `legacyChunking` = `true` 로.

옛 블록 교체:
```ts
describe('leagueRoundPlan·착지 — 옛(번호 없는) 대진', () => {
  const team = (id: string, n: number) => ({ id: `gt-${id}`, groupId: 'gA', registrationId: id, teamName: id, sortOrder: n, createdAt: '' });
  const four = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0, groupTeams: ['r1', 'r2', 'r3', 'r4'].map((id, i) => team(id, i)) });
  const six = [1, 2, 3, 4, 5, 6].map((n) => fx(`f${n}`, 'gA', n, '조별 리그'));

  it('옛 대진도 격자 줄과 같은 1..N라운드 + 새 라운드를 고르게 한다 — 선택지는 격자 줄에서만 나온다', () => {
    const plan = leagueRoundPlan({ groups: [four], fixtures: six });
    expect(plan.choices.map((c) => [c.value, c.label, c.round])).toEqual([
      ['r1', '1라운드', 'league_r1'], ['r2', '2라운드', 'league_r2'], ['r3', '3라운드', 'league_r3'], ['new', '새 라운드 (4라운드)', 'league_r4'],
    ]);
    expect(plan.defaultChoice.value).toBe('r3');
    // 같은 출처 증명: 선택지 이름 = 격자 줄 라벨
    expect(plan.choices.slice(0, -1).map((c) => c.name)).toEqual(buildLeagueGrid({ groups: [four], fixtures: six }).rows.map((r) => r.label));
  });

  it('옛 대진에서 2라운드를 고르면 league_r2 로 저장되어 옛 2라운드 묶음과 같은 줄·같은 칸에 들어가고 옛 줄은 그대로다', () => {
    const { round, fixtures } = addVia([four], six, 'gA', 'r2');
    expect(round).toBe('league_r2');
    const grid = buildLeagueGrid({ groups: [four], fixtures });
    expect(grid.legacyChunking).toBe(true);
    expect(grid.rows.map((r) => ids(r.cells.gA))).toEqual([['f1', 'f2'], ['f3', 'f4', 'new'], ['f5', 'f6']]);
  });

  it('새 라운드를 고르면 옛 줄 뒤에 4라운드 줄이 생기고 고른 조 칸에만 들어간다', () => {
    const b = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
    const { round, fixtures } = addVia([four, b], six, 'gB', 'new');
    expect(round).toBe('league_r4');
    const grid = buildLeagueGrid({ groups: [four, b], fixtures });
    expect(grid.rows.map((r) => r.label)).toEqual(['1라운드', '2라운드', '3라운드', '4라운드']);
    expect(ids(grid.rows[3].cells.gB)).toEqual(['new']);
    expect(ids(grid.rows[3].cells.gA)).toEqual([]); // 대조군: 다른 조 칸은 비어 있다
  });

  it('번호 경기가 이미 섞인 대진에서도 선택지는 합쳐진 줄이다 (옛 3묶음 + league_r5)', () => {
    const plan = leagueRoundPlan({ groups: [four], fixtures: [...six, fx('n5', 'gA', 7, 'league_r5')] });
    expect(plan.choices.map((c) => c.value)).toEqual(['r1', 'r2', 'r3', 'r5', 'new']);
    expect(plan.choices[plan.choices.length - 1].round).toBe('league_r6');
  });
});
```
(`isLegacyLeagueBracket`·`resolveLeagueRound` 를 import 하던 줄과 `근거: 옛 대진에 league_r 를 섞으면…` 테스트는 삭제 — 그 전제가 Task 8 로 사라졌다.)
- [ ] **Step 2: 실패 확인.** `./node_modules/.bin/vitest run src/lib/bracket-league-add-fixture.test.ts` → FAIL(`leagueRoundPlan` 이 `{groups, fixtures}` 를 배열처럼 `flatMap` → TypeError, 옛 블록의 선택지 불일치).
- [ ] **Step 3: 구현.**
```ts
import { buildLeagueGrid, leagueRoundLabel, sortLeagueGroups } from '@/lib/bracket-league-grid-model';

export function leagueRoundPlan(input: {
  groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[];
}): LeagueRoundPlan {
  const numbers = buildLeagueGrid(input).rows.map((row) => row.roundNumber);
  const created = choiceOf((numbers.at(-1) ?? 0) + 1, true);
  const existing = numbers.map((n) => choiceOf(n, false));
  return { choices: [...existing, created], defaultChoice: existing.at(-1) ?? created };
}
```
`leagueRoundNumber` import·`isLegacyLeagueBracket`·`newest`·`resolveLeagueRound`·`LeagueRoundResolution`·`NEW_LEAGUE_ROUND` 외 사용처 없는 것을 지운다(`choiceOf` 는 유지).
- [ ] **Step 4: 통과.** 위 명령 PASS(이 Task 의 테스트 파일만). `tsc --noEmit` 은 폼이 아직 옛 시그니처를 써서 실패하는 것이 정상이다 — Task 10 에서 해소된다.
- [ ] **Step 5: 커밋하지 않는다** (Task 10 Step 5 에서 Task 8·10 과 한 커밋).

## Task 10 — 폼·대화상자·격자 안내: 옛 예외 제거와 문구

**Files:**
- Modify: `bracket-league-add-fixture-form.tsx`(`:13` 타입, `:25-39`, `:60-71`), `bracket-fixture-tools-dialog.tsx`(`handleAddLeague`), `bracket-league-grid.tsx`(`:41-45`)
- Test: `bracket-league-add-fixture-form.test.tsx`, `bracket-fixture-tools-dialog.league.test.tsx`(`:181-194` 교체), `bracket-league-grid.test.tsx`(`:72-79` 갱신 + 섞임 케이스)

- [ ] **Step 1: 테스트.**
`bracket-fixture-tools-dialog.league.test.tsx` 의 `번호가 없는 옛 대진은 라운드 선택 없이…`(`:181-194`)를 교체:
```tsx
  it('번호가 없는 옛 대진도 격자 줄과 같은 라운드를 고르고, 고른 라운드는 league_r{k} 로 저장되어 그 줄에 합쳐진다', async () => {
    const legacyFixtures = [1, 2, 3].map((n) => makeFixture({ id: `f${n}`, groupId: 'gA', fixtureNumber: n, round: '조별 리그' }));
    const legacy = makeBracket({ groups: [gA, gB], fixtures: legacyFixtures });
    const { props } = renderLeagueDialog(legacy);
    expect(screen.queryByText(/라운드 정보가 없는 대진이라/)).not.toBeInTheDocument();
    const round = screen.getByLabelText('라운드') as HTMLSelectElement;
    expect(optionTexts(round)).toEqual(['1라운드', '2라운드', '3라운드', '새 라운드 (4라운드)']);
    expect(round.selectedOptions[0].textContent).toBe('3라운드');

    fireEvent.change(screen.getByLabelText('조'), { target: { value: 'gB' } });
    fireEvent.change(round, { target: { value: 'r1' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(bodies).toEqual([{ groupId: 'gB', round: 'league_r1', fixtureNumber: 4 }]);
    expect(props.showToast).toHaveBeenCalledWith('1라운드 B조 경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.', 'success');

    const grid = buildLeagueGrid({ groups: legacy.groups, fixtures: [...legacyFixtures, makeFixture({ id: 'new-1', groupId: 'gB', fixtureNumber: 4, round: 'league_r1' })] });
    expect(grid.legacyChunking).toBe(true);
    expect(grid.rows.map((r) => r.label)).toEqual(['1라운드', '2라운드', '3라운드']); // 옛 줄이 뭉치지 않는다
    expect(grid.rows[0].cells.gB.map((f) => f.id)).toEqual(['new-1']);
    expect(grid.rows[0].cells.gA.map((f) => f.id)).toEqual(['f1']);
  });
```
`bracket-league-grid.test.tsx` — 안내 문구 단언(`:75`)을 `'라운드 정보가 없는 경기는 경기 번호 순서로 나눴어요.'` 로 바꾸고 섞임 케이스를 추가:
```tsx
  it('옛 경기와 번호 경기가 섞이면 같은 줄에 합쳐 보이고 안내는 유지한다', () => {
    const mixed = fixtures.map((f) => (f.id === 'a1' ? { ...f, round: '조별 리그' } : f));
    render(<BracketLeagueGrid {...{ groups: [gA, gB], fixtures: mixed, slots: [], selectedFixtureId: null, pendingRegistrationId: null, canWrite: true, onSelectFixture: vi.fn(), onAssignSlot: vi.fn(), onAssignDirect: vi.fn() }} />);
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['1라운드', '2라운드']); // '조별 리그' 줄이 따로 생기지 않는다
    expect(screen.getByText('라운드 정보가 없는 경기는 경기 번호 순서로 나눴어요.')).toBeInTheDocument();
  });
```
`bracket-league-add-fixture-form.test.tsx` 에 폼이 옛 대진에서도 라운드 선택을 그리는지:
```tsx
describe('BracketLeagueAddFixtureForm — 옛 대진', () => {
  it('번호가 없어도 라운드 선택을 그리고 고른 라운드의 league_r{k} 와 이름으로 보낸다', () => {
    const onSubmit = vi.fn();
    const legacy = makeBracket({ groups: [group], fixtures: [1, 2].map((n) => makeFixture({ id: `o${n}`, groupId: 'gA', fixtureNumber: n, round: '조별 리그' })) });
    render(<BracketLeagueAddFixtureForm bracket={legacy} pending={false} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('라운드'), { target: { value: 'r1' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    expect(onSubmit).toHaveBeenCalledWith({ groupId: 'gA', groupName: 'A조', round: 'league_r1', roundName: '1라운드' });
  });
});
```
(`group` 에 팀이 없으므로 끊김 크기 1 → 옛 2경기 = 2라운드, 선택지 `1라운드`·`2라운드`·`새 라운드 (3라운드)`.)
- [ ] **Step 2: 실패 확인.** `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-league-add-fixture-form.test.tsx src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.league.test.tsx src/components/admin/bracket-canvas/bracket-league-grid.test.tsx` → 새 테스트 FAIL(라운드 라벨이 없음 / 옛 안내 문구).
- [ ] **Step 3: 구현.**
폼: `isLegacyLeagueBracket`·`resolveLeagueRound` import 와 `legacy` 상수·안내 `<p>` 삭제, `plan = useMemo(() => leagueRoundPlan({ groups: bracket.groups, fixtures: bracket.fixtures }), [bracket.groups, bracket.fixtures])`, 라운드 `<select>` 는 항상 그린다, 제출은
```ts
    onSubmit({ groupId: group.id, groupName: group.name, round: choice.round, roundName: choice.name });
```
`LeagueAddSubmit.roundName: string`. 대화상자 `handleAddLeague` 의 `toastLabel` 은 `` `${input.roundName} ${input.groupName}` `` 로 단순화. 격자 안내 `<p>` 는 `라운드 정보가 없는 경기는 경기 번호 순서로 나눴어요.`.
- [ ] **Step 4: 통과 + 전수 grep.** 위 vitest 명령 PASS 후 Task 8-9 의 영향 파일을 한 번에(이 커밋의 녹색 게이트): `./node_modules/.bin/vitest run src/lib/bracket-league-grid-model.test.ts src/lib/bracket-league-add-fixture.test.ts src/lib/bracket-canvas-mobile-model.test.ts src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx`. `tsc --noEmit` 0, `node scripts/v1-pattern-check.mjs` 통과. 옛 예외가 남지 않았는지: `git grep -nE "isLegacyLeagueBracket|resolveLeagueRound|LeagueRoundResolution|라운드 정보가 없는 대진이라|roundName: null" -- apps/v1_web` 결과 **0건**.
- [ ] **Step 5: 커밋(Task 8·9·10 한 커밋)** — `feat(web): 리그 경기 추가 — 옛 리그도 라운드를 고르고 항상 league_r{k} 로 저장` · pathspec: `lib/bracket-league-grid-model.ts`·`.test.ts`, `lib/bracket-canvas-mobile-model.test.ts`, `lib/bracket-league-add-fixture.ts`·`.test.ts`, 폼·폼 테스트, 대화상자·`.league.test.tsx`, `bracket-league-grid.tsx`·`.test.tsx` + `git show --stat HEAD`.

---

# Part D — 마무리

## Task 11 — changeset · API 문서 · 스펙/선행 계획 정정 · 최종 게이트

**Files:**
- Modify: `.changeset/admin-bracket-league-add-fixture.md`
- Modify: `docs/api/domains/tournaments.md` (`### 조별리그 경기와 조 편성 정합 (2026-10-08)` 절의 자동 편성 문단 뒤, 그리고 `PUT /admin/tournament-slots/:slotId/assignment` 의 「`phase = group` 조에서는 조 편성을 만들고…」 불릿)
- Modify: `.github/tasks/20261057-admin-bracket-canvas.md` (Ambiguity Log 의 2026-10-10 「리그 방식 대회의 「경기 추가」」 행과 「결정 3」 행)
- Modify: `docs/superpowers/plans/2026-10-10-admin-bracket-canvas-league-add-fixture.md` (맨 위 배너 한 줄)

- [ ] **Step 1: changeset 에 `v1_api` 를 더한다.** 서버 코드(`apps/v1_api/`)가 바뀌었으므로 dev-push CI 의 changeset 정책(`scripts/release/check-changeset-policy.mjs`)이 `v1_api` 도 요구한다. 파일 전체를 아래로 바꾼다.
```md
---
"v1_api": patch
"v1_web": patch
---

리그 방식 대회의 대진 그림에서 「경기 추가」로 조와 라운드를 골라 경기를 만들 수 있어요. 옛 리그(라운드 번호가 없는 대진)도 같은 라운드 규칙으로 보이고 고를 수 있어요. 조별 단계에서는 한 팀이 한 조에만 들어가요 — 다른 조에 있는 팀을 경기나 자리에 넣으면 거절하고, 후보에서도 빠져요.
```
- [ ] **Step 2: `docs/api/domains/tournaments.md` 를 같은 변경에서 고친다.** 자동 편성 문단 뒤에 한 문단을 더한다.
> - **한 팀 한 조 (2026-10-10, 결정 4)**: 위 자동 편성은 그 팀이 **같은 대회의 다른 `phase = group` 조에 이미 편성돼 있지 않을 때만** 일어난다. 이 조에 없는 신청이 다른 조별 조에 있으면 `POST /admin/tournaments/:id/fixtures`·`PATCH /admin/fixtures/:id`·`POST /admin/tournaments/:id/group-teams` 는 `409 TEAM_IN_OTHER_GROUP`("다른 조에 있는 팀은 이 조에 넣을 수 없어요. 그 조에서 먼저 빼 주세요.")로 거절하고 아무것도 쓰지 않는다(상대 팀 자동 편성 포함). 자리 배정(`PUT /admin/tournament-slots/:slotId/assignment`·배치 변경·무작위 채우기)도 같은 코드로 거절하되, 맞바꾸기 도중의 일시적 겹침을 허용하려고 **트랜잭션 끝에서 이전 팀의 편성을 푼 뒤 이번 요청이 새로 만든 편성만** 검사한다(거절되면 자리 변경 전체가 롤백). 이미 이 조에도 편성된 팀은 다른 조와 겹쳐 있어도 허용하고(이미 겹친 데이터는 그대로), 결선 단계 조·조 없는 경기는 이 검사를 하지 않는다. 다른 조로 옮기려면 먼저 `DELETE /admin/group-teams/:id` 로 옛 조 편성을 뺀다(그 조에 경기가 남아 있으면 `GROUP_TEAM_HAS_FIXTURES`).

자리 배정 불릿(`phase = group` 조에서는 조 편성을 만들고…) 끝에 「새로 만든 편성이 같은 대회의 다른 `phase = group` 조 편성과 겹치면 `409 TEAM_IN_OTHER_GROUP` — 위 한 팀 한 조 문단」을 한 문장 더한다.
- [ ] **Step 3: 스펙과 선행 계획을 현재 결정에 맞춘다.**
  - `.github/tasks/20261057-admin-bracket-canvas.md` 2026-10-10 「리그 방식 대회의 「경기 추가」」 행의 「서버 무변경」을 「이 기능 자체는 서버 무변경(조별 단계 한 팀 한 조 가드는 결정 4 행)」으로 고친다.
  - 같은 파일 「결정 3」 행 끝에 「결선 단계 코드(`final` 등)나 한국어 이름으로 쓴 round 도 번호가 아니면 예외 없이 옛 경기로 끊는다 — 사용자 문구(번호 없는 옛 경기는 끊는다)를 그대로 따른다. 리그 조에 그런 round 가 들어가는 것은 수동 입력뿐이고 그 경기는 k번째 묶음 라운드 칸에 합쳐진다(2026-10-10 계획 비평 반영).」를 더한다.
  - 선행 계획 맨 위(제목 아래)에 배너 한 줄: `> **Superseded (2026-10-10):** 옛 대진의 「round 이어 쓰기 + 라운드 선택 숨김」 예외(`isLegacyLeagueBracket`·`resolveLeagueRound`)와 「서버 무변경」은 후속 계획 `2026-10-10-admin-bracket-canvas-league-add-followup.md` 의 결정 3·4 로 대체됐다.`
- [ ] **Step 4: 최종 게이트(변경 크기에 비례, 이 브랜치에서 1회).**
  - 서버: `cd apps/v1_api && ./node_modules/.bin/jest -c "<iso config>" src/tournaments/tournament-bracket.service.spec.ts src/tournaments/slots/tournament-slot.service.spec.ts` PASS · `./node_modules/.bin/tsc -p "<tsconfig.isocheck.json>"` 0 · `node scripts/v1-surface-check.mjs` 통과.
  - 웹: Task 4-10 의 vitest 파일 묶음 PASS · `cd apps/v1_web && ./node_modules/.bin/tsc --noEmit` 0 · `node scripts/v1-pattern-check.mjs` 통과 · 풀스위트는 돌리지 않는다(오케스트레이터의 통합 게이트 몫).
  - 전수 grep(0건이어야 함): `git grep -nE "isLegacyLeagueBracket|resolveLeagueRound|LeagueRoundResolution|라운드 정보가 없는 대진이라|roundName: null" -- apps`. `git diff origin/dev --stat -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-sheet.tsx` 는 Task 6 의 의도된 변경만(선행 계획의 「팀 지정 경로 불변」 Review Focus 4 는 이 후속에서 의도적으로 뒤집힌다).
  - 주석 비율: `git diff origin/dev -- apps | grep -cE "^\+\s*(//|\*)"` 가 추가 줄의 1/3 안팎인지 한 번 본다.
- [ ] **Step 5: 커밋** — `docs: 한 팀 한 조 409 문서와 changeset(v1_api 추가)` · pathspec `.changeset/admin-bracket-league-add-fixture.md docs/api/domains/tournaments.md .github/tasks/20261057-admin-bracket-canvas.md docs/superpowers/plans/2026-10-10-admin-bracket-canvas-league-add-fixture.md` + `git show --stat HEAD`.

(PR 갱신·머지·alpha 검증은 오케스트레이터가 한다 — 이 계획에 포함하지 않는다. 단 알려 둘 것: ① UI 변경이라 머지 후 alpha 3폭 갤러리 필요 · ② 통합 스펙은 CI 에서만 검증 · ③ 서버 변경은 dev 머지 즉시 alpha 실배포이므로 alpha 에서 「A조 경기에 B조 팀을 넣어 409 토스트」「같은 조 팀은 그대로」「자리 맞바꾸기는 그대로」「다른 조에 편성된 팀을 자리에 넣으면 409」 네 가지를 화면으로 확인.)

## Open Questions

없음. 이 계획이 처음 올렸던 두 질문은 사용자 결정 문구로 닫았다 — ① 결선 단계 코드 round 는 예외 없이 끊는다(Task 8, 사용자 「번호 없는 옛 경기는 끊는다」 그대로) · ② 자리 경로는 면제하지 않고 트랜잭션 끝 검사로 막는다(Task 1, 결정 4 의 「다른 서버 경로에도 같은 409」).