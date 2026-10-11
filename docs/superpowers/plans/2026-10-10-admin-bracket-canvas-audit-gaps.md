# 어드민 대진 그림 편집기 — 스펙 전수 대조 결손 수정 계획

> **For agentic workers:** 태스크 순서대로 구현하고 태스크마다 독립 리뷰를 받는다. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 스펙 전수 대조(2026-10-10, 8영역·적대 검증)에서 확정된 결손 4건을 고친다.

**Architecture:** 서버 2건(리그 반쪽 경기 취소 공개 노출 · 끝난 리그 대진 변경 가드), 웹 1건(대진 변경 뒤 공개 캐시),
통합 테스트 1건(빠른 결과 워커 소비 단언). 공개 게이트 단일 출처(`unfilled-slot-gate.ts`)는 바꾸지 않는다.

**Tech Stack:** NestJS 11 · Prisma 6 · Jest(격리 하네스) · Next.js 16 · TanStack Query 5 · Vitest + MSW

**Spec:** `.github/tasks/20261057-admin-bracket-canvas.md` (S2 잠금 · S6 공개 게이트 · S7 캐시 · Test Scenarios 331·346행)

## Global Constraints

- API 단위 테스트는 격리 하네스로만: `jest -c "$ISO/jest.iso.config.cjs" <파일>`. 공유 `prisma generate` 금지.
- 통합 스펙은 로컬 DB 가 없으면 격리 tsc 로 컴파일만 확인하고 "integration: CI" 로 보고한다.
- 웹 테스트는 `cd apps/v1_web && ./node_modules/.bin/vitest run <파일>`.
- 에러 코드는 `DOMAIN_CODE`, 메시지는 해요체. 주석은 코드가 말하지 못하는 제약만(추가 줄의 1/3 이하).
- 새 에러 코드: `LEAGUE_ENDED`(409) — 끝났거나 취소된 리그의 대진·자리 변경.

## Review Focus

1. 자리 없는 기존 리그 경기(원정 null 포함)를 취소하면 **지금처럼 공개에 남아야** 한다 — T1 이 홈 팀을 비우는 조건이 이 경기에 닿으면 안 된다.
2. 다 찬 자리 경기를 취소하면 팀이 그대로 남고 공개에 보여야 한다(이미 공개됐던 경기).
3. 끝난 리그라도 **등록 취소·참가팀 제외의 자리 풀기**(`lockCompetitionForSlotReleaseInTx`)와 빠른 결과·정정은 막히면 안 된다.
4. 보류 리그는 지금처럼 `LEAGUE_ON_HOLD` 를 받는다(코드가 바뀌지 않는다).
5. 캐시 테스트는 `invalidateQueries` 호출을 세지 말고, 실제 QueryClient 의 공개 쿼리가 무효화 상태가 되는지로 검증한다.

---

### Task 1: 반쪽 리그 경기 취소가 공개로 뒤집히지 않게

**문제:** `cancelLeagueFixtureRowInTx`(`apps/v1_api/src/league-matches/league-match-admin.service.ts`)는 취소하면서
`homeSlotId`·`awaySlotId` 를 지운다. 홈만 찬 반쪽 경기(원정 자리 연결 + `approvedApplicantTeamId` null)는 취소 전에는
게이트(`awaySlotId not null AND approvedApplicantTeamId null`)로 숨지만, 취소 뒤에는 자리 id 가 사라지고 홈 팀이 남아
`cancelled + hostTeamId null` 절에도 걸리지 않는다 → 공개 일정에 "원정 없는 취소 경기"로 처음 나타난다.
단건 취소·템플릿 교체(`replaceExisting`)·참가팀 제외 취소가 모두 이 헬퍼를 지난다.

**결정:** 게이트가 아니라 취소 헬퍼를 고친다. 원정 자리가 비어 있던 경기를 취소하면 홈 팀도 비운다
(그 경기는 공개된 적이 없고 팀 일정·승인 신청서가 없다). 그러면 기존 절(`leagueId + cancelled + hostTeamId null`)이 가린다.
게이트에 "취소 + 원정 null" 을 더하면 자리 없는 기존 경기의 원정 null 취소 기록까지 숨겨 #1746 계약이 깨지므로 쓰지 않는다.

**Files:**
- Modify: `apps/v1_api/src/league-matches/league-match-admin.service.ts` (`cancelLeagueFixtureRowInTx`)
- Test: 이 서비스의 기존 단위 스펙(취소 경로를 다루는 `*.spec.ts` 를 찾아 거기에) + `apps/v1_api/test/league-matches/league-cancelled-empty-gate.integration-spec.ts`

- [ ] **Step 1: 실패하는 테스트**
  - 단위: 원정 자리 연결 + 원정 팀 없음 + 홈 팀 있음 경기를 취소하면 그 행의 `hostTeamId` 가 null 로 저장된다.
    대조군 둘: (a) 다 찬 자리 경기 취소 → 홈·원정 팀 유지, (b) 자리 없는 기존 경기(원정 null) 취소 → 홈 팀 유지.
  - 통합: 4팀 리그 템플릿 → 한 경기의 홈 자리만 채움 → 그 경기 단건 취소 → 공개 일정(`GET /league-matches/:id` 계열 또는
    이 스펙이 이미 쓰는 공개 조회)에서 그 경기가 **없다**. 같은 스펙의 기존 대조군(팀 있는 취소 경기는 보인다)은 그대로 통과.
    템플릿 `replaceExisting` 로 반쪽 경기를 접는 경우도 한 줄로 단언한다.
- [ ] **Step 2: 단위 테스트가 이유대로 실패하는지 확인**
- [ ] **Step 3: 구현** — 기존 `update` 앞에 조건부 갱신 한 문장:
  ```ts
  // 원정 자리가 비어 있던 경기는 공개된 적이 없다 — 홈 팀도 비워야 공개 게이트의 취소 절이 계속 가린다.
  await tx.v1TeamMatch.updateMany({
    where: { id: teamMatchId, awaySlotId: { not: null }, approvedApplicantTeamId: null },
    data: { hostTeamId: null },
  });
  ```
  호출부의 알림 판정은 취소 전에 읽은 행으로 하므로 바뀌지 않는다(반쪽 경기는 지금도 알림 0건).
- [ ] **Step 4: 단위 green, 격리 tsc 0, 통합은 컴파일 확인 후 "integration: CI"**
- [ ] **Step 5: 커밋** `fix(v1): 반쪽 리그 경기를 취소해도 공개에 나타나지 않게`

### Task 2: 끝났거나 취소된 리그의 대진·자리 변경 거부 (`LEAGUE_ENDED`)

**문제:** `assertLeagueFixtureGenerationAllowedInTx`(`apps/v1_api/src/league-matches/league-fixture-generation-guard.ts`)는
`on_hold` 만 거부한다. 스펙 346행 "보류·완료 리그 템플릿·자리 변경 거부" 와 S2 "보류·완료 등 불허 상태 거부" 를 어긴다 —
경기가 0건이거나 전부 취소된 completed 리그는 템플릿·자리 배정·무작위 채우기가 통과한다.

**Files:**
- Modify: `apps/v1_api/src/league-matches/league-fixture-generation-guard.ts`
- Create: `apps/v1_api/src/league-matches/league-fixture-generation-guard.spec.ts`
- Modify: `apps/v1_api/test/league-matches/league-template.integration-spec.ts` (또는 자리 배정 통합 스펙 — 경기 0건 completed 리그 케이스)
- Modify: `apps/v1_web/src/lib/bracket-canvas-errors.ts` + 그 테스트(표 한 줄)
- Modify: `docs/api/domains/league-matches.md` (보류 가드 문단 옆에 `409 LEAGUE_ENDED` 한 줄)

- [ ] **Step 1: 실패하는 테스트** — 가드 단위 스펙: `completed`·`cancelled` → 409 `LEAGUE_ENDED`; `on_hold` → `LEAGUE_ON_HOLD`(회귀);
  `draft`·`open`·`closed`·`in_progress` → 통과; 없음 → 404 `LEAGUE_NOT_FOUND`. 트랜잭션 클라이언트는 `findTournamentOnSurface`
  가 실제로 부르는 메서드만 최소 스텁한다(스텁 호출 횟수를 증거로 쓰지 않는다 — 던진 응답 코드로 판정).
  통합: 경기 0건 completed 리그에 템플릿 적용 → 409 `LEAGUE_ENDED`.
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — 보류 검사 뒤에:
  ```ts
  if (league.status === 'completed' || league.status === 'cancelled') {
    throw new ConflictException({ code: 'LEAGUE_ENDED', message: '끝났거나 취소된 리그는 대진을 만들거나 바꿀 수 없어요.' });
  }
  ```
  자리 풀기 경로(`lockCompetitionForSlotReleaseInTx`)는 이 가드를 부르지 않으므로 등록 취소는 그대로다 — 그 사실을 바꾸지 않는다.
  웹 오류 표에 `LEAGUE_ENDED: '끝났거나 취소된 리그라 대진을 바꿀 수 없어요.'`.
- [ ] **Step 4: 가드 스펙 green · 웹 오류 표 테스트 green · 격리 tsc 0 · `node scripts/v1-surface-check.mjs`(apps/v1_api)**
- [ ] **Step 5: 커밋** `fix(v1): 끝났거나 취소된 리그의 대진·자리 변경을 막는다`

### Task 3: 대진 변경 뒤 공개 화면 캐시도 갱신

**문제:** 스펙 S7 "변경 후 adminTournamentBracket·adminLeagueMatch·공개 tournament 키와 결과 훅 키를 함께 invalidate".
- `useV1DeleteFixture`(`apps/v1_web/src/hooks/use-v1-api.ts`)는 `adminTournamentBracket` 만 턴다(`useV1UpdateFixture` 는 `tournament` 도 턴다).
- `invalidateCompetitionViews`(`apps/v1_web/src/hooks/use-v1-bracket-canvas.ts`)의 리그 범위와
  `useLeagueResultToast`(`apps/v1_web/src/components/admin/bracket-canvas/use-league-result-toast.ts`)는 `adminLeagueMatch` 만 턴다 —
  공개 리그 키 `v1Keys.leagueMatch(id)`(순위·선수 기록 하위 키 포함)와 `v1Keys.tournament(id)` 가 staleTime 동안 옛 값으로 남는다.

**Files:**
- Modify: 위 세 곳. 리그 범위 키 = `[v1Keys.adminLeagueMatch(id), v1Keys.leagueMatch(id), v1Keys.tournament(id)]`.
  `invalidateCompetitionViews` 위 주석 "리그는 상세 키 하나가 전부다" 는 사실이 아니므로 고친다.
- Test: `use-v1-bracket-canvas.test.tsx`(리그 범위 한 케이스), 삭제 훅·결과 토스트 훅 테스트(있는 파일에 추가, 없으면 같은 폴더에 새로).

- [ ] **Step 1: 실패하는 테스트** — 실제 `QueryClient` 에 공개 키(`v1Keys.leagueMatch(id)`, `v1Keys.leagueMatchStandings(id)`,
  `v1Keys.tournament(id)`) 데이터를 `setQueryData` 로 심고, MSW 로 성공 응답을 준 뮤테이션(리그 자리 배정 또는 무작위 채우기,
  경기 삭제)과 `useLeagueResultToast` 의 성공 토스트를 실행한 뒤 `queryClient.getQueryState(key)?.isInvalidated === true` 를 단언한다.
  대조군: 관련 없는 다른 리그 id 의 `leagueMatch` 키는 무효화되지 않는다. 실패 토스트(`'error'`)는 아무것도 무효화하지 않는다.
- [ ] **Step 2: 실패 확인 · Step 3: 구현 · Step 4: 해당 테스트 green, `tsc --noEmit`, `node scripts/v1-pattern-check.mjs`(apps/v1_web)**
- [ ] **Step 5: 커밋** `fix(v1): 대진을 바꾸면 공개 대회·리그 화면 캐시도 갱신`

### Task 4: 빠른 결과 워커 소비 통합 단언 보강

**문제:** Test Scenarios 331행 "빠른 결과 → 워커 소비(통합): 순위·팀 전적·개인 기록(출전)·완료 알림 1회". 현재
`apps/v1_api/test/tournaments/tournament-quick-result.integration-spec.ts` 의 워커 케이스는 `drainOutboxWorker` 뒤
공식 사실·알림 수·진출만 본다.

**Files:**
- Modify: `apps/v1_api/test/tournaments/tournament-quick-result.integration-spec.ts`

- [ ] **Step 1:** 워커 케이스(`drainOutboxWorker` 직후)에 단언을 더한다. 모델·필드 이름은 워커가 실제로 쓰는 투영을 읽어 정한다
  (`GAME_RESULT_OFFICIAL` 소비자를 따라가 순위 테이블·팀 전적 사실·선수 출전 기록이 어디에 쓰이는지 확인):
  - 순위: 그 경기 조(그룹)의 순위 행에서 이긴 팀 승 1·승점, 진 팀 패 1.
  - 팀 전적: 양 팀 전적 사실이 그 경기로 각 1건, 승/패가 점수와 일치.
  - 개인 기록(출전): 명단 선수(양 팀 최신 유효 라인업)마다 출전 기록 1건.
  - 같은 경기 정정 뒤 다시 소비해도 위 행 수가 늘지 않는다(기존 알림 재발송 없음 단언 옆).
- [ ] **Step 2:** 격리 tsc 로 컴파일 확인. 로컬 DB 가 없으면 "integration: CI" — 단언 대상 모델·필드가 실제 스키마에 있는지 tsc 가 보증한다.
- [ ] **Step 3: 커밋** `test(v1): 빠른 결과 워커 소비가 순위·전적·출전 기록을 남기는지 단언`
