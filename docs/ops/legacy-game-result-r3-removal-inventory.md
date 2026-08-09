# 레거시 대회 결과(Game Result) 호환 리더 제거 인벤토리 (R3 전용, 미실행)

> **이 문서는 실행 계획이 아니다.** Task 25("모든 레거시 결과 호출을 append-only 쓰기로
> 전환하고 호환성 게이트를 강제한다")의 산출물 중 하나로, **별도로 승인될 R3 롤아웃**이
> 착수될 때 참고할 "무엇을 어떤 순서로 지워도 되는지"의 정확한 인벤토리다. 이 문서 자체가
> 어떤 삭제도 수행하지 않으며, Task 25 범위에서는 아래 호환 리더를 **전혀 건드리지 않는다.**
> `docs/ops/` 하위 다른 런북과 마찬가지로 운영자가 직접 참조해 실행하는 문서다.

## 0. 현재 상태 요약 (2026-08-04 기준, 소스 직접 확인)

- **레거시 쓰기(WRITE)는 이미 전부 퇴역**했다 — 아래 §2.
- **레거시 읽기(READ)는 아직 3곳에 남아 있다** — 아래 §1. 이들은 Task 25 계획상
  "Todo 27 및 F1–F4를 거쳐 별도로 승인된 R3 롤아웃까지는 유지"가 명시적 결정이다.
- 신규 경로(Game 결과 공식 리비전, `V1Game.currentOfficialRevision` /
  `V1GameResultRevision`)와 레거시 경로(`V1TournamentFixtureResult`) 사이의 데이터 정합성은
  `CompareGameReadAuthorityService`(`apps/v1_api/src/tournament-operations/board/compare-game-read-authority.service.ts`)
  가 `GAME_READ` 운영 플래그가 `compare` 모드일 때 인구 전체 단위로 검증한다. 이 서비스는
  **하나라도 divergence(불일치)가 남아 있으면 compare 모드의 모든 읽기를 닫힌 상태로
  실패시킨다**(`ConflictException` / `GAME_RESULT_COMPARISON_MISMATCH`) — 즉 "몇 건 남았는지"를
  운영자가 직접 세지 않아도, compare 모드가 정상 통과하는 것 자체가 "현재 eligible 모집단에서
  발산 0건"의 증거가 된다. R3 전제 조건(§4)은 이 사실에 의존한다.

## 1. 유지되는 레거시 호환 READER 3곳 (건드리지 말 것)

각 항목은 파일 · 앵커 스니펫(라인 번호는 드리프트될 수 있어 재검색용) · 무엇을 읽는지 ·
어떤 API 응답을 채우는지 순으로 기술한다.

### 1-1. `apps/v1_api/src/tournaments/tournament-bracket.service.ts`

이 서비스 안에 레거시 결과를 읽는 지점이 **세 곳** 있다(모두 `V1TournamentFixtureResult`를
`include`/참조).

- **(a) `updateFixture()` 팀 변경 가드** — 약 437번째 줄 부근.
  ```ts
  const fixture = await this.prisma.v1TournamentFixture.findUnique({
    where: { id: fixtureId },
    include: { result: true },
  });
  ...
  if (changesTeams && fixture.result) {
    throw new ConflictException({ code: 'FIXTURE_HAS_RESULT', ... });
  }
  ```
  결과가 이미 기록된 경기는 홈/어웨이 팀을 바꿀 수 없다는 가드 조건으로만 `result` 존재
  여부를 읽는다. 응답 바디에 결과 필드를 노출하지는 않는다(존재 유무만 분기).

- **(b) `deleteFixture()` 삭제 가드** — 약 509번째 줄 부근. (a)와 동일한
  `include: { result: true }` 패턴, `fixture.result`가 있으면 `409 FIXTURE_HAS_RESULT`로
  "결과부터 지워라"라고 막는다. 이것도 존재 유무 가드이며 응답에 결과 데이터를 싣지 않는다.

- **(c) `recalculateStandings()`의 순위 재계산 입력** — 약 670번째 줄 부근.
  ```ts
  fixtures: {
    where: { status: 'completed' },
    include: { result: true },
  },
  ```
  완료된 조별리그 픽스처의 결과(스코어)를 읽어 `calculateCompetitionStandings()`에 넘긴다.
  즉 **대회 조 순위표(standings) 계산의 데이터 소스**가 여전히 레거시
  `V1TournamentFixtureResult`다. 이 함수가 만드는 `V1TournamentStanding` 로우가
  `GET /tournaments/:id` 상세 응답의 `standings` 필드로 나간다(§1-2 참조).

- **(d) `recalculateStandings()` 응답 조립 + `serializeResult()`** — 약 815번째,
  872번째 줄 부근.
  ```ts
  result: f.result
    ? { ...this.serializeResult(f.result), goals: f.result.goals.map((g) => this.serializeGoal(g)) }
    : null,
  ```
  ```ts
  private serializeResult(row: V1TournamentFixtureResult) {
    return { id: row.id, fixtureId: row.fixtureId, homeScore: row.homeScore, ... };
  }
  ```
  `recalculateStandings()`가 반환하는 관리자용 재계산 결과 payload(`groups` / `fixtures` /
  `standings`)에 픽스처별 `result` 블록을 그대로 직렬화해 포함시킨다. 이건 어드민 재계산
  액션의 응답이며, 별도의 공개 조회 엔드포인트가 아니다.

  참고로 같은 파일의 `recordResult()`(약 644번째 줄)와 `deleteFixtureResult()`(약 539번째
  줄)는 **쓰기 경로**이고 이미 무조건 `409 TOURNAMENT_RESULT_DERIVED_ONLY`를 던지는 스텁이다
  — §2에서 다룬다. 이 둘은 READER가 아니라서 §1 인벤토리에서 제외했다.

### 1-2. `apps/v1_api/src/tournaments/tournament-detail.presenter.ts`

- **`presentTournamentDetail()`의 `fixtures[].result` 필드** — 약 150번째 줄 부근.
  ```ts
  result: fixture.result
    ? {
        homeScore: fixture.result.homeScore,
        awayScore: fixture.result.awayScore,
        hasPenalty: fixture.result.hasPenalty,
        ...
        goals: fixture.result.goals.map((goal) => ({ ... })),
      }
    : null,
  ```
  입력 `row: TournamentDetailRow`는 `apps/v1_api/src/tournaments/tournaments-read.query.ts`의
  `TOURNAMENT_DETAIL_INCLUDE`가 만든 조회 결과다. 그 include 정의(같은 파일, 약 55번째 줄)에
  `result: { include: { goals: { orderBy: { createdAt: 'asc' } } } }`가 그대로 남아 있어,
  Prisma 쿼리 자체가 레거시 테이블을 조인한다. 이 presenter가 채우는 필드는 **공개 대회 상세
  조회(`GET /tournaments/:id`)의 `fixtures[].result`** — 사용자가 직접 보는 스코어보드다.
  대진표 비공개 상태(`bracketPublished === false`)일 때는 `fixtures` 자체가 빈 배열로
  가려지므로 이 경로를 안 탄다.

### 1-3. `apps/v1_api/src/reviews/tournament-fixture-review-mappers.ts` +
     `apps/v1_api/src/reviews/tournament-fixture-reviews.service.ts`

- **`tournamentFixtureSelect()`의 `result: { select: { recordedAt: true } }`** —
  `tournament-fixture-review-mappers.ts` 약 34번째 줄.
  ```ts
  export function tournamentFixtureSelect() {
    return {
      ...
      result: { select: { recordedAt: true } },
      ...
    } as const;
  }
  ```
  `homeScore`/`awayScore` 등 스코어 자체는 읽지 않고 **`recordedAt` 타임스탬프 한 필드만**
  프로젝션한다. 두 곳에서 소비한다.
  - `reviewContext()`(`tournament-fixture-reviews.service.ts` 약 178번째 줄 부근)의
    `if (fixture.status !== 'completed' || !fixture.result) throw conflict('SOURCE_NOT_COMPLETED', ...)`
    — 리뷰 제출 가능 여부를 판정하는 게이트. 결과 존재 유무만 본다.
  - `sourceSummaries()`(같은 파일 약 155번째 줄)의
    `fixture.result?.recordedAt ?? fixture.scheduledAt ?? fixture.updatedAt`
    — 대회 픽스처 소스에 대한 리뷰 요약(`sourceSummary()`)의 "언제 있었던 일인지" 타임스탬프
    폴백 체인 1순위. 이 요약은 **리뷰 대상 목록/상세 API**(`GET /reviews/pending` 등, `reviewInclude()`를
    함께 쓰는 `reviews.service.ts`의 여러 엔드포인트)의 `sourceSummary` 필드로 나간다.

> 지금까지의 §1-1~1-3이 grep(`result: true` / `V1TournamentFixtureResult` / `serializeResult`)
> 로 찾은 전부다. **추가로 relation-include 스타일이라 grep에 안 걸릴 수 있는 경로를 별도로
> 훑었으나, 위 3개 파일 외에 `V1TournamentFixtureResult`를 읽는 지점은 없었다** — 지시받은
> 목록과 100% 일치하며 새로 발견한 리더는 없다(보고 섹션 참조).

## 2. 이미 퇴역한 레거시 WRITE 엔드포인트

`apps/v1_api/src/tournaments/tournament-bracket.service.ts`:

- `recordResult(user, _fixtureId, _dto)` (약 644번째 줄) — 무조건
  `409 TOURNAMENT_RESULT_DERIVED_ONLY` (`'대회 결과는 Game 종료 명령과 결과 리비전으로만
  기록할 수 있어요.'`).
- `deleteFixtureResult(user, _fixtureId)` (약 539번째 줄) — 무조건
  `409 TOURNAMENT_RESULT_DERIVED_ONLY` (`'대회 결과는 삭제할 수 없고 Game 결과 리비전으로만
  정정할 수 있어요.'`).

두 메서드 모두 파라미터 앞에 `_`가 붙어 있어 사용되지 않음을 타입 레벨에서도 드러낸다.
Controller/DTO 계층은 손대지 않았고, 프론트/외부 호출자가 예전 계약대로 호출해도 항상 같은
409로 막힌다. **R3에서 이 두 메서드와 그것들이 남겨둔 DTO를 완전히 삭제하는 것도 범위에
포함된다** — §3, §4 참조.

## 3. R3에서 제거 가능해지는 테이블/컬럼과, 그때까지 남아 있는 의존

- **`v1_tournament_fixture_results`** (`V1TournamentFixtureResult` 모델,
  `apps/v1_api/prisma/schema.prisma` 약 2149번째 줄) — §1의 3개 리더가 전부 제거되어야
  이 테이블 자체가 무의미해진다. `V1TournamentFixture`와 `onDelete: Cascade` 1:1 관계이고,
  `V1AdminUser`(누가 기록했는지)에 `onDelete: SetNull`로 걸려 있다.
- **`v1_tournament_fixture_goals`** (`V1TournamentFixtureGoal` 모델, 약 2190번째 줄) —
  `fixtureResultId`로 위 테이블에 `onDelete: Cascade` 종속. `V1TournamentFixtureResult`가
  없어지는 순간(또는 그보다 먼저, `include`에서 `goals`가 빠지는 순간부터) 같이 제거 대상이
  된다. §1-2(공개 상세의 `fixtures[].result.goals`)가 유일하게 이 하위 테이블까지 읽는
  경로다.
- **남는 의존**: R3 이전까지는 위 두 테이블이 (1) 공개 대회 상세 스코어보드
  (§1-2), (2) 관리자 순위 재계산 데이터 소스(§1-1c), (3) 리뷰 게이트/타임스탬프 폴백(§1-3)
  세 가지 실사용처를 갖고 있다. `recordedByAdminUserId`도 `V1AdminUser` FK로 살아 있으므로
  admin 유저 삭제 로직이 이 테이블을 계속 인지해야 한다.

## 4. 제거 순서와 각 단계의 사전 조건

R3는 아래 순서를 반드시 지킨다. 각 단계는 이전 단계가 그린(green)임을 확인한 뒤에만
시작한다.

1. **비교기 무발산 관찰 기간 확보.** `GAME_READ` 운영 플래그를 `compare` 모드로 두고
   `CompareGameReadAuthorityService`가 서빙하는 트래픽에서 `GAME_RESULT_COMPARISON_MISMATCH`
   0건이 **정해진 관찰 기간 동안 연속으로** 유지됨을 확인한다. 이 서비스는 설계상 "eligible
   population 전체에 발산이 하나라도 있으면 compare 모드 읽기를 전부 닫아버리는" 구조이므로,
   compare 모드가 그 기간 내내 정상 서빙됐다는 사실 자체가 증거다(별도 카운트 대조 스크립트를
   새로 만들 필요는 없다 — `docs/ops/`의 기존 cutover 관련 runbook 및
   `scripts/qa/verify-game-result-cutover.mjs`가 이 계약을 검증하는 하네스로 이미 존재한다).
2. **`GAME_READ`를 `new`로 전환.** 1단계가 끝나야만 compare 모드를 벗어나 신규 경로 단독
   서빙으로 넘어갈 수 있다(`task10-runtime-manifest.cli.ts`가 문서화한 전진 전용 게이트
   순서를 따른다 — 역행 없이 `legacy -> compare -> new`).
3. **§1의 3개 리더를 각각 신규 경로(`V1Game.currentOfficialRevision`)로 교체하거나 제거.**
   - `tournament-bracket.service.ts`의 (a)(b) 가드는 "결과 존재 여부"를 신규 경로 기준으로
     다시 묻도록 바꾸거나, 신규 경로에서 이미 별도로 막고 있다면 가드 자체를 삭제한다.
   - (c) `recalculateStandings()`의 순위 계산 입력을 신규 경로로 교체한다 — standings 계산
     로직(`calculateCompetitionStandings`)이 스코어를 어디서 읽는지가 바뀌므로 회귀 테스트가
     필요하다.
   - (d) `serializeResult()` 응답 조립도 신규 경로 필드로 교체.
   - `tournament-detail.presenter.ts`의 공개 상세 `result` 필드를 신규 경로로 교체 — 사용자
     대면 화면이므로 이 전환은 필드 형태(스코어/승부차기/골 목록)가 신규 경로에서 동일하게
     제공되는지부터 먼저 확인한다.
   - `tournament-fixture-review-mappers.ts`의 `tournamentFixtureSelect()`에서
     `result: { select: { recordedAt: true } }`를 신규 경로의 대응 타임스탬프로 교체.
4. **3단계의 각 교체가 개별적으로 그린임을 확인한 뒤에만** `tournaments-read.query.ts`의
   `TOURNAMENT_DETAIL_INCLUDE`에서 `result: { include: { goals: ... } }` 절을 제거한다 —
   이게 남아있는 한 Prisma가 여전히 레거시 테이블을 조인하므로, 실제 미사용 확인 없이 먼저
   지우면 안 된다.
5. **§2의 두 스텁(`recordResult`, `deleteFixtureResult`)과 관련 DTO
   (`RecordResultDto` 등)를 삭제.** 이건 이미 쓰기 경로가 전부 죽어 있어 3·4단계와 독립적으로
   가장 먼저 해도 되지만, 리더 정리와 같은 릴리스에서 묶어서 처리하는 편이 리뷰 단위를
   깔끔하게 만든다.
6. **모든 애플리케이션 코드에서 `V1TournamentFixtureResult`/`V1TournamentFixtureGoal` 참조가
   0건임을 확인한 뒤**, `apps/v1_api/prisma/schema.prisma`에서 두 모델을 제거하고 대응하는
   migration을 작성한다(CLAUDE.md의 "스키마 변경은 반드시 migration 파일 동반" 원칙 그대로
   적용 — `prisma db push`만으로 끝내지 않는다). 백필 CLI
   (`apps/v1_api/src/games/migration/game-result-backfill.cli.ts` 등)가 이 시점 이후에도
   레거시 테이블을 참조한다면 CLI도 같은 변경에서 함께 정리한다.

## 5. 실행 승인 범위에 대한 명시적 진술

**이 문서가 기술하는 어떤 삭제·교체·플래그 전환도 Task 25(현재 진행 중인 통합 브랜치
`codex/teameet-task25-cutover`)의 범위에서 실행되지 않는다.** Task 25는 레거시 쓰기 퇴역
확인과 이 인벤토리 작성까지가 범위이며, §1의 호환 리더 3곳은 이 커밋 이후에도 코드베이스에
그대로 남는다. 위 §4의 단계는 **별도로 승인된(signed-off) R3 롤아웃**의 실행 계획으로만
개시된다 — 그 승인은 CLAUDE.md의 롤백/배포 안전 원칙(사용자 게이트, `dev`/`main` 배포
분리)과 마찬가지로 사용자 또는 운영 책임자의 명시적 ok를 전제로 한다. 이 문서 자체를
근거로 어떤 세션도 §1~§4를 자율적으로 진행해서는 안 된다.
