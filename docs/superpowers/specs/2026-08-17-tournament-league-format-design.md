# 대회 리그전(League Format) 설계

- 상태: 설계 승인됨 (2026-08-17)
- 근거 기획 문서: `팀밋_팀관리_대회시스템_사용플로우_기능정의.pdf` §7(경기구조), `Teameet_app_v1_팀관리_대회운영_상세기획서_2026-07-28.pdf`
- 기준 커밋: `36cbf281` (origin/dev)
- 관련 스펙: 없음 (신규 도메인 기능)

## 1. 배경

기획 문서 §7은 대회 경기구조로 `리그 · 토너먼트 · 조별+토너먼트 · 최소 경기 수`를 정의한다.
이 중 **리그전만 서버 계약이 비어 있다.**

### 1.1 현행 실태 (2026-08-17 실측)

| 레이어 | 리그전 지원 | 증거 |
|---|---|---|
| Prisma enum | `league` 정의됨 | `schema.prisma:1926` |
| 백엔드 로직 | **실질 0건** | v1_api 소스 전체에서 `league` 3건 — 2건은 무관한 escalation businessKey, 1건은 `TOURNAMENT_FORMATS` 상수(`admin-tournament.dto.ts:60`) |
| 프론트엔드 | 21건 (렌더링 레벨) | 생성폼 옵션 `admin/tournaments/new/page.tsx:589`, 우승팀 계산·브래킷 미표시 분기 `tournaments/[id]/tournament-detail-client.tsx:129,1573,1629`, 시상 `awards-page-client.tsx:55`, 진행 스테퍼 `tournament-progress-stepper.tsx:117` |
| 대진 자동생성 | **프론트 순수함수** | `v1_web/src/lib/tournament-bracket-gen.ts:12` circle method → 서버 `POST admin/tournaments/:id/fixtures` 반복 호출 |
| 순위 tie-break | 6단계 구현됨 | `competition-standings.ts` — 승점→승자승→득실차→다득점→페어플레이→SHA-256 결정론적 추첨 |

**즉 리그 대회를 만들 수는 있지만 서버는 그게 리그인지 모른다.** 관리자가 리그 대회에서 브래킷 액션을
눌러도 막히지 않고, 대진 생성 규칙이 클라이언트에만 있어 서버 검증이 존재하지 않는다.

### 1.2 같은 문제를 두 번 푼 상태

별도 도메인 `V1TeamMatchSeries`(팀 정기전 시리즈)에는 **백엔드에 정식 라운드로빈 스케줄러가 이미 있다.**

| | 대회(Tournament) | 시리즈(TeamMatchSeries) |
|---|---|---|
| 식별 키 | `registrationId` | `teamId` |
| 라운드로빈 | 프론트 `roundRobinRounds`, 1회전만 | 백엔드 `generateRoundRobinFixtures`, 주차 기반·홈경기수 균형·**부분/다중 회전 지원** |
| tie-break | 6단계 + `configVersionId` 버저닝 + SHA 추첨 | 4종 (`points/goalDifference/goalsFor/headToHead`) + `tieBreakJson` |
| 일정 | fixture별 개별 지정 | 요일/시각 템플릿 + KST 정교 처리 |

시리즈의 `generateRoundRobinFixtures(teamIds, weeksCount)`는 `weeksCount`가 한 사이클을 넘으면
홈경기수 균형 로직(`round-robin-schedule.ts:36`)이 홈/어웨이를 뒤집으며 순환한다 —
**더블 라운드로빈이 시리즈 쪽엔 이미 동작한다.** 대회 쪽에만 없다.

### 1.3 통합 순위 계산은 이미 가능하다 (중요)

`calculateCompetitionStandings`는 **그룹 개념을 전혀 모른다.** 입력은
`{ tournamentId, configVersionId, registrationIds, fixtures, config }`뿐이다(`competition-standings.ts:94-99`).

- 통합 순위 = 전체 `registrationIds` + 전체 `fixtures`를 넘기면 **함수 수정 없이 산출된다.**
- 승자승도 옳게 동작한다: `directStanding`이 동점 팀들 사이 경기만 필터링하므로(136-140행),
  서로 다른 조 팀끼리는 맞대결 0건 → 자동으로 득실차 단계로 넘어간다.

따라서 통합 순위의 작업량은 **계산이 아니라 저장·정합성 유지**에 있다.

## 2. 목표 / 비목표

### 목표
1. `format='league'`를 서버가 인지하고 리그 전용 검증·자동화를 수행한다.
2. 조별 리그 + **통합 순위표**를 지원한다.
3. 홈/어웨이 더블 라운드로빈(2회전)을 지원한다.
4. 라운드로빈 생성 로직을 **서버의 단일 소스**로 통합한다(대회·시리즈 공용).
5. 부가 기능 4종: 진행률·잔여경기 / 페어플레이 포인트 / 매직넘버 / 최소 경기 수 보장.

### 비목표
- 스위스 방식, 플레이오프 자동 연결, 승강제
- 순위 변동 이력("지난주 대비 ▲2") — 저장 스냅샷이 아니라 현재 순위만 유지
- 시리즈 도메인의 tie-break를 대회 6단계로 통합하는 것 (§3 D-6)
- 리그전 이외 포맷(knockout/group_knockout)의 동작 변경

## 3. 확정된 설계 결정

| ID | 항목 | 결정 | 근거 |
|---|---|---|---|
| D-1 | 리그전 도메인 | **대회 + 시리즈 병행** | 사용자 결정 |
| D-2 | 더블 라운드로빈 | **MVP에 포함** | 사용자 결정 — 생활체육 리그 관행 |
| D-3 | 조 분할 | **조별 리그 + 통합 순위표** | 사용자 결정 |
| D-4 | 통합 순위 저장 | **저장** (파생 계산 아님) | 사용자 결정 |
| D-5 | 저장 위치 | **신규 테이블** `V1TournamentOverallStanding` | 기존 조별 upsert 경로 무손상 → 회귀 위험 최소 |
| D-6 | 라운드로빈 통합 범위 | **생성기만 공유 커널로 추출, tie-break는 각자 유지** | 두 tie-break는 계약이 다름(configVersion 버저닝+SHA 추첨 vs `tieBreakJson` 4종). 억지 통합은 회귀 위험이 이득보다 큼 |
| D-7 | 부가 기능 | **4종 전부 포함** | 사용자 결정 |
| D-8 | 프론트 `roundRobinRounds` | **삭제** (서버로 이동) | 프로젝트 원칙 1 — 기술부채 즉시 해결 |

### D-4의 트레이드오프 (명시)

파생 계산일 때는 **구조적으로 불가능**했던 문제가 저장을 택하면서 생긴다:

| | 파생 계산 (채택 안 함) | 저장 (채택) |
|---|---|---|
| 스키마 변경 | 없음 | 신규 테이블 1 |
| 조별↔통합 불일치 | 구조적으로 불가능 | **재계산 누락 시 발생** → §7 방어책 필수 |
| 응답 비용 | 매 요청 계산 | 조회만 |
| DB 정렬/필터/페이징 | 불가 | 가능 |
| 순위 변동 이력 | 불가 | (스냅샷 추가 시) 가능 |

저장을 택한 대가는 **정합성 유지 책임**이다. §7이 그 방어책을 정의한다.

## 4. 데이터 모델 (마이그레이션 `20260817000000_v1_tournament_league_format`)

스키마 변경 3건을 **단일 마이그레이션**에 담는다 — `SOURCE_SNAPSHOT_DRIFT` 게이트 대응을 1회로 끝내기 위함(§8.3).

### 4.1 신규 — `V1TournamentOverallStanding`

```prisma
model V1TournamentOverallStanding {
  id             String    @id @default(uuid())
  tournamentId   String    @map("tournament_id")
  registrationId String    @map("registration_id")
  points         Int       @default(0)
  wins           Int       @default(0)
  draws          Int       @default(0)
  losses         Int       @default(0)
  goalsFor       Int       @default(0) @map("goals_for")
  goalsAgainst   Int       @default(0) @map("goals_against")
  fairPlayPoints Int       @default(0) @map("fair_play_points")
  position       Int?
  recalculatedAt DateTime? @map("recalculated_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  tournament   V1Tournament             @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  registration V1TournamentRegistration @relation(fields: [registrationId], references: [id], onDelete: Cascade)

  @@unique([tournamentId, registrationId])
  @@index([tournamentId, position])
  @@map("v1_tournament_overall_standings")
}
```

**소화 경기 수는 별도 컬럼으로 두지 않는다** — `wins + draws + losses`가 곧 소화 경기 수이므로
`playedCount`를 따로 저장하면 같은 사실을 두 곳에 적어 어긋날 여지만 만든다.
조별 순위 테이블도 같은 이유로 이 컬럼이 없다.

### 4.2 추가 — `V1Tournament.minMatchesPerTeam`

```prisma
minMatchesPerTeam Int? @map("min_matches_per_team")
```

null이면 검증하지 않는다(기존 대회 무영향).

### 4.3 추가 — `V1TournamentStanding.fairPlayPoints`

```prisma
fairPlayPoints Int @default(0) @map("fair_play_points")
```

현재 `CalculatedStanding.fairPlayPoints`는 계산 필드에만 존재하고 스키마에 없어 **항상 0**이다.
tie-break 5단계가 사실상 죽어 있으므로 조별·통합 양쪽에 대칭으로 저장한다.

## 5. 라운드로빈 공유 커널

### 5.1 신규 모듈

```
apps/v1_api/src/common/scheduling/round-robin.ts
```

```ts
export interface RoundRobinPairing {
  /** 1-based. 모든 leg를 통틀어 연속 증가한다. */
  round: number;
  /** 1-based. 몇 번째 회전인지. */
  leg: number;
  homeId: string;
  awayId: string;
}

export interface RoundRobinOptions {
  /** 총 라운드 수를 직접 지정 (부분 회전 허용). legs와 상호 배타. */
  rounds?: number;
  /** 회전 수. rounds = cycleRounds * legs 로 환산된다. legs=2가 홈/어웨이 2회전. */
  legs?: number;
  /** 홈 경기 수를 참가자 간에 균등 분배한다. 기본 true. */
  balanceHome?: boolean;
}

export function generateRoundRobin(
  participantIds: readonly string[],
  options: RoundRobinOptions,
): RoundRobinPairing[];
```

- 홀수 참가자는 `bye` 패딩으로 처리하고 결과에서 제외한다(양 도메인 기존 동작 동일).
- `rounds`와 `legs`를 둘 다 주면 `rounds`가 우선한다. 둘 다 없으면 `legs: 1`.
- `balanceHome`은 시리즈의 기존 알고리즘(`round-robin-schedule.ts:36`)을 그대로 옮긴다 —
  홈 경기 수가 적은 쪽을 홈으로 배정하고, 이 규칙이 2회전에서 자연히 홈/어웨이를 뒤집는다.

### 5.2 시리즈 어댑터 (기존 계약 유지)

`generateRoundRobinFixtures(teamIds, weeksCount)`는 커널의 얇은 래퍼가 된다:

```ts
export function generateRoundRobinFixtures(teamIds, weeksCount): RoundRobinFixture[] {
  return generateRoundRobin(teamIds, { rounds: weeksCount, balanceHome: true })
    .map(({ round, homeId, awayId }) => ({ round, homeTeamId: homeId, awayTeamId: awayId }));
}
```

**시그니처·반환 형태·`resolveFixtureStartAt`는 변경하지 않는다.**
기존 `round-robin-schedule.spec.ts`가 회귀 게이트다 — 통과하지 못하면 커널이 틀린 것이다.

### 5.3 대회 어댑터

`registrationId`를 넘기고, 각 라운드의 `startAt`은 아래 중 하나로 결정한다:
- 요일/시각 템플릿(시리즈의 `resolveFixtureStartAt`과 동일 규칙, KST 기준) — 주간 리그
- 라운드별 명시 일시 — 하루에 여러 라운드를 소화하는 단기 대회

### 5.4 프론트 정리

`apps/v1_web/src/lib/tournament-bracket-gen.ts`의 `roundRobinRounds`를 **삭제**하고
호출부(`tournament-detail-client.tsx:1463-1485` 조별리그 자동생성 분기)를 새 서버 API로 교체한다.
같은 파일의 녹아웃 시드 페어링(`knockoutPairs` 계열)은 이번 범위 밖이므로 유지한다.

## 6. API 계약

### 6.1 대진 생성 — `POST /api/v1/admin/tournaments/:tournamentId/league/fixtures/generate`

| | |
|---|---|
| 권한 | 대회 mutation admin (기존 `getMutationAdmin`) |
| 전제 | `tournament.format === 'league'` |

요청:
```jsonc
{
  "groupId": "grp_...",          // 조별 리그면 조 단위로 호출. 단일 리그면 그 그룹 1개
  "legs": 2,                      // 또는 "rounds": 7
  "balanceHome": true,
  "schedule": {                   // 선택. 없으면 fixture는 startAt 미정으로 생성
    "template": { "dayOfWeek": 6, "time": "20:00" },
    "startsOn": "2026-09-05T00:00:00.000Z"
  },
  "replaceExisting": false        // §6.1.1 참조
}
```

응답:
```jsonc
{
  "created": 30,
  "deleted": 0,
  "perTeamMatches": 10,
  "rounds": 10,
  "warnings": [
    { "code": "SCHEDULE_NOT_SET", "message": "경기 일시가 지정되지 않았어요." }
  ]
}
```

`warnings`는 **생성을 막지 않는 사항**만 담는다(현재 정의: 일시 미지정 `SCHEDULE_NOT_SET`,
조 배정 팀이 홀수라 라운드마다 부전승이 생기는 `ODD_TEAM_COUNT_BYE`).
생성을 막아야 하는 조건은 전부 아래 422 목록에 있다.

#### 6.1.1 `replaceExisting` 의미

| 값 | 동작 |
|---|---|
| `false` (기본) | 대상 조에 fixture가 이미 하나라도 있으면 `LEAGUE_FIXTURES_ALREADY_EXIST`로 거부한다 |
| `true` | 대상 조의 fixture를 **전부 삭제하고 재생성**한다. 단 결과가 확정된 fixture가 하나라도 있으면 `LEAGUE_FIXTURES_HAVE_RESULTS`로 **거부한다** — 확정 결과가 걸린 대진은 재생성 대상이 아니다 |

즉 재생성은 "아직 아무 경기도 치르지 않은 조"에서만 허용한다. 일부 경기가 끝난 뒤의 대진 수정은
단건 API(`POST admin/tournaments/:id/fixtures`, `PATCH admin/fixtures/:id`)로 처리한다.

검증 (실패 시 422):

| code | 조건 |
|---|---|
| `TOURNAMENT_NOT_LEAGUE` | `format !== 'league'` |
| `LEAGUE_GROUP_PHASE_INVALID` | 대상 그룹의 `phase !== 'group'` |
| `LEAGUE_MIN_MATCHES_NOT_MET` | `perTeamMatches < minMatchesPerTeam`. 응답에 필요한 최소 `legs`를 함께 반환 |
| `LEAGUE_TEAMS_INSUFFICIENT` | 조 배정 팀 2팀 미만 |
| `LEAGUE_FIXTURES_ALREADY_EXIST` | `replaceExisting=false`인데 대상 조에 fixture가 이미 존재 |
| `LEAGUE_FIXTURES_HAVE_RESULTS` | `replaceExisting=true`인데 결과가 확정된 fixture가 존재 |

이 엔드포인트는 멱등하지 않다 — 재호출은 §6.1.1에 따라 거부되거나 전체 재생성이다.
중복 클릭 방어는 프론트에서 처리하고, 서버는 "이미 있으면 거부"로 보수적으로 막는다.

### 6.2 통합 순위 조회 — `GET /api/v1/tournaments/:tournamentId/standings/overall`

공개 API. 응답:
```jsonc
{
  "standings": [
    { "registrationId": "...", "teamName": "...", "position": 1,
      "points": 18, "wins": 6, "draws": 0, "losses": 1,
      "goalsFor": 22, "goalsAgainst": 9, "fairPlayPoints": 3 }
  ],
  "progress": { "total": 30, "played": 21, "remaining": 9, "percent": 70 },
  "magicNumber": { "registrationId": "...", "value": 4, "clinched": false },
  "recalculatedAt": "2026-08-17T10:00:00.000Z"
}
```

PII를 싣지 않는다 — 팀 표시명만 반환하고 선수 실명·연락처는 포함하지 않는다.

### 6.3 리그 전용 차단 규칙

`format === 'league'`인 대회에서 아래를 422로 거부한다:

| 대상 | code |
|---|---|
| `phase='knockout'` 그룹 생성 | `LEAGUE_KNOCKOUT_GROUP_FORBIDDEN` |
| 브래킷 진출 연결(다음 라운드 자동 배치) | `LEAGUE_BRACKET_ADVANCE_FORBIDDEN` |
| 그룹의 `advanceCount` 설정 | `LEAGUE_ADVANCE_COUNT_FORBIDDEN` |

기존 `POST admin/tournaments/:id/fixtures`(단건 생성)는 리그에서도 유지한다 — 우천 순연 등 수동 보정 경로가 필요하다.

## 7. 정합성 — 조별 ↔ 통합

D-4(저장)의 대가를 방어하는 설계다.

### 7.1 동일 트랜잭션 갱신

현재 결과 확정은 `recalculateAndUpsertGroupStandings(group)`을 그룹 단위로 호출한다
(`tournament-group-standings.ts:82-99`). 여기에 통합 재계산을 **같은 트랜잭션 안에서** 잇는다:

```
tx: [ 조별 standings upsert ] → [ 통합 standings upsert ] → commit
```

한쪽만 성공하는 경우가 존재하지 않게 한다.

### 7.2 워터마크

`recalculatedAt`을 조별·통합 양쪽에 기록한다. 통합의 `recalculatedAt`이 어떤 조의 값보다
과거이면 stale로 판정하고 운영 화면에 경고를 노출한다.

### 7.3 reconcile 스크립트

`apps/v1_api/src/tournaments/tournament-standings-reconcile.cli.ts` (신규)

조별 standings 합계 vs 통합 저장값을 대조해 불일치를 리포트한다.
불일치가 있으면 `--fix`로 통합만 재계산한다(조별이 단일 진실 원천).

> 이 프로젝트에는 현재 reconciliation job이 존재하지 않는다. 리그전이 첫 사례가 되며,
> 이후 다른 projection(선수 누적 기록 등)이 같은 패턴을 재사용할 수 있게 범용 구조로 둔다.

## 8. 부가 기능 4종

### 8.1 진행률·잔여 경기

`{ total, played, remaining, percent }`. `total`은 해당 스코프(조 또는 대회 전체)의 fixture 수,
`played`는 결과가 확정된 fixture 수다. 팀별 소화 경기 수가 필요하면 순위 행의
`wins + draws + losses`로 계산한다(§4.1).

### 8.2 페어플레이 포인트

원천: `V1GameResultParticipant.cards` (Json) — 공식(OFFICIAL) 결과 리비전의 참가자별 카드.

**구현 중 확인된 데이터 한계 (2026-08-17 실측 — 설계 초안 정정)**

초안은 FIFA 관례대로 4단계 벌점표를 적었지만, 이 저장소의 `cards` Json은
**`{ yellow, red }` 2종만 저장한다** — "경고 누적 퇴장"과 "직접 퇴장"을 구분하는 필드가
도메인 모델 어디에도 없다(`games.service.ts`의 CARD 이벤트 집계에서 확인).
따라서 실제 집계는 아래와 같다:

| 사건 | 벌점 | 비고 |
|---|---|---|
| 옐로 카드 | 1 | |
| 레드 카드 | 4 | 직접 퇴장으로 간주 |
| ~~옐로 2장 누적 퇴장~~ | ~~3~~ | **저장된 데이터로 복원 불가** |

즉 실제로는 경고 누적 퇴장이었던 레드 카드가 **1점씩 과대 계상**된다. 이 오차를 없애려면
카드 이벤트에 퇴장 사유를 저장하는 별도 작업이 필요하며, 그 전까지는 이 근사를 사용한다.
`league-fair-play.ts`에 같은 내용을 주석으로 남긴다.

**레거시 fallback 경기**(신 경로 OFFICIAL 리비전 이전, `V1TournamentFixtureResult`만 있는 경기)는
카드 컬럼 자체가 없어 페어플레이 기여가 0이다. 조용히 0으로 두지 않고 코드에 명시한다.

**낮을수록 상위**(`competition-standings.ts:161-163`이 이미 오름차순 비교로 구현돼 있다).
`calculateCompetitionStandings`에 `fairPlayByRegistration?: Map<string, number>` 입력을 추가하고,
없으면 현재와 동일하게 0으로 동작한다(하위 호환).

**주의 — 파라미터만 추가하면 기능이 아니다.** 초안대로 입력 파라미터만 만들고 실제로 카드를
집계해 넘기는 호출부를 두지 않으면 운영에서는 여전히 전부 0이라 5단계 tie-break가 죽어 있다.
`recalculateAndUpsertGroupStandings`가 호출되는 **모든 경로**(§7.1의 3곳)에서 카드 조회를
포함하도록 include를 확장해야 한다.

### 8.3 매직넘버

```
magicNumber = (2위 현재승점 + 2위 잔여경기 × 승리승점) − 1위 현재승점 + 1
clinched = magicNumber <= 0
```

동점 시 tie-break로 갈리는 경우까지 엄밀히 반영하지 않고 `+1`로 보수적으로 계산한다 —
"확정"이라고 표시했는데 뒤집히는 것보다, 확정을 늦게 표시하는 쪽이 안전하다.

### 8.4 최소 경기 수 보장

`minMatchesPerTeam`이 설정된 대회에서 대진 생성 시 `perTeamMatches`를 검증한다(§6.1).
미달이면 필요한 최소 `legs`를 계산해 응답에 담아 관리자가 바로 조정할 수 있게 한다.

## 9. 프론트엔드

| 화면 | 변경 |
|---|---|
| `admin/tournaments/[id]` 대진 관리 | 조별리그 자동생성 분기를 새 서버 API 호출로 교체. `legs` 선택 UI(1회전/2회전) 추가 |
| `admin/tournaments/new` | 리그 선택 시 `minMatchesPerTeam` 입력 노출 |
| `tournaments/[id]` 공개 상세 | 리그일 때 통합 순위표 + 진행률 + 매직넘버 배지 |
| `tournaments/[id]/bracket` | 리그는 브래킷 대신 순위표를 주 콘텐츠로 (현재 `format === 'league'` 분기가 이미 있음) |

디자인은 기존 v1 토큰·컴포넌트를 그대로 사용한다. 진행률은 색만으로 전달하지 않고
숫자를 병기한다(프로젝트 접근성 기준).

## 10. 검증 전략

| 계층 | 시나리오 | 게이트 |
|---|---|---|
| 커널 단위 | bye 처리, 홈 균형, 2회전 홈/어웨이 뒤집기, 부분 회전 | 신규 spec |
| **회귀** | **기존 `round-robin-schedule.spec.ts` 전부 통과** | **하드 게이트 — 실패 시 커널이 틀린 것** |
| 통합 순위 | 다른 조 팀이 동점일 때 승자승을 건너뛰고 득실차로 가는지 | 신규 spec |
| 정합성 | 결과 확정 → 조별·통합이 같은 트랜잭션에서 갱신되는지, 한쪽 실패 시 롤백되는지 | 통합 테스트 (실제 PostgreSQL) |
| 검증 거부 | 리그에서 knockout 그룹 생성·브래킷 진출이 422로 막히는지 | 각 mutation 최소 1개 deny test |
| 페어플레이 | 카드 집계가 tie-break 5단계를 실제로 갈라놓는지 | 신규 spec |
| reconcile | 의도적으로 통합을 어긋나게 만든 뒤 스크립트가 탐지·수정하는지 | 통합 테스트 |
| 시각 | 순위표·진행률·매직넘버가 390/768/1440에서 정상 렌더 | **alpha 배포 후 스크린샷** (로컬 next 서버 사용 금지) |

## 11. 마이그레이션·배포

1. **additive migration** — 신규 테이블 + nullable 컬럼 2개. 기존 데이터 무영향.
2. `apps/v1_api/test/fixtures/game-schema.fixture.ts`의 `gameSchemaSourceManifest.schema`를
   재핀하고 **근거 주석을 덧붙인다**(무엇이 바뀌었는지 / 게임 도메인 무관 / additive / 뒷받침 마이그레이션).
   재핀하지 않으면 CI `V1 migration replay + drift gate`가 `SOURCE_SNAPSHOT_DRIFT`로 실패한다.
3. PR 단위 분리: `스키마+커널` → `서버 API` → `프론트` 순. 한 거대 PR로 합치지 않는다.
4. base는 `dev`. dev 머지 = alpha 즉시 실배포이므로 머지 전 검증을 실배포 게이트로 취급한다.

## 12. 리스크

| 리스크 | 대응 |
|---|---|
| 커널 추출이 프로덕션 시리즈를 깨뜨림 | 기존 spec을 하드 게이트로. 시그니처·반환 형태 불변 |
| 조별↔통합 불일치 | 동일 트랜잭션 + 워터마크 + reconcile (§7) |
| 병렬 세션이 같은 파일 수정 | `drop-fixture-status`, `v1-correction-source` 브랜치가 tournament fixture를 건드리는 중 — 착수 전 재확인 |
| drift gate 누락으로 CI red | §11.2를 체크리스트로 |

## 13. 미결

- 리그 대진의 `startAt` 기본 정책: 주간 템플릿 vs 라운드별 명시. 대회 유형에 따라 다르므로
  **둘 다 지원**하되 UI 기본값을 무엇으로 할지는 구현 시 결정한다.
- 페어플레이 벌점 기본값을 `CompetitionConfig` 프리셋에 넣을지, 하드코딩 후 나중에 config화할지.
