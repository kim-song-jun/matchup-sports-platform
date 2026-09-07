import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ALL_COMPETITION_KINDS, findTournamentOnSurface } from '../tournament-surface-lookup';
import {
  evaluateSuspension,
  suspensionRulesEnabled,
  type PlayedGameCards,
  type SuspensionVerdict,
} from './card-suspension';

type Tx = Prisma.TransactionClient;

/**
 * 한 대회(또는 정규 리그)의 경기 **하나**. 정지 판정의 기준틀은 "몇 번째 경기인가" 이므로
 * 호출부가 자기 축의 정렬 규칙대로 정렬한 배열을 그대로 넘긴다.
 *
 * - 대회: `V1TournamentFixture` (`scheduledAt` → `round` → `fixtureNumber`)
 * - 정규 리그: `V1TeamMatch` (`leagueFixtureListOrder()` — `startAt` → `id`)
 *
 * `key` 는 그 축의 식별자다(대회=fixtureId, 리그=teamMatchId). `upcomingKey` 와 대조해
 * "지금 제출하려는 경기가 몇 번째인가" 를 구한다.
 */
export interface OrderedCompetitionGame {
  readonly key: string;
  /** 아직 경기 행이 없으면 `null` — 결과가 있을 수 없으므로 카드도 0이다. */
  readonly gameId: string | null;
}

export interface SuspensionVerdictInput {
  readonly competitionId: string;
  readonly orderedGames: readonly OrderedCompetitionGame[];
  readonly upcomingKey: string;
}

const NO_VERDICTS: ReadonlyMap<string, SuspensionVerdict> = new Map();

function emptyVerdicts(): Map<string, SuspensionVerdict> {
  return new Map(NO_VERDICTS);
}

/**
 * `V1GameResultParticipant.cards`(Json)에서 카드 수를 읽는다. 저장 모양은
 * `{ yellow: number, red: number }` 뿐이다(`parseFairPlayCards` 주석 참고 — 경고 누적
 * 퇴장과 직접 퇴장을 구분하는 필드가 데이터 모델에 없다). 모양이 다르면 0으로 본다 —
 * 판정을 못 하는 것이 잘못 막는 것보다 낫다.
 */
function readResultCards(value: unknown): { yellow: number; red: number } {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { yellow?: unknown }).yellow === 'number' &&
    typeof (value as { red?: unknown }).red === 'number'
  ) {
    const record = value as { yellow: number; red: number };
    return { yellow: record.yellow, red: record.red };
  }
  return { yellow: 0, red: 0 };
}

/**
 * 이 대회에서 카드가 누적된 선수들의 "다음 경기(`upcomingKey`) 출전정지" 여부.
 *
 * 규칙 자체는 `card-suspension.ts`(순수 함수, DB 없이 전수 테스트)에 있고 여기서는
 * **조회만** 한다. 축(대회 픽스처 / 리그 팀매치)은 `orderedGames` 로 주입받으므로 이
 * 함수는 어느 축인지 모른다 — 그래서 규칙이 두 벌로 갈라지지 않는다.
 *
 * **주입 서비스가 아니라 평범한 export 함수인 이유**: 이 코드를 쓰는 `GamesService`·
 * `TeamMatchLineupService` 의 생성자에 인자를 하나 더하면 그 클래스를 직접 `new` 하는
 * 스펙들이 전부 깨진다(`GamesService` 쪽만 통합 스펙 41곳 — CI 실측이고, 그 스펙들의
 * 타입은 로컬 `tsc -p tsconfig.json` 대상 밖이라 로컬에서는 보이지도 않는다). `tx` 를
 * 인자로 받으면 호출부의 트랜잭션을 그대로 쓸 수 있어 **제출과 같은 스냅샷**에서 읽는
 * 이점도 유지된다.
 *
 * **신뢰 경계 — 호출자가 지켜야 할 계약**: `orderedGames` 는 **`competitionId` 에 속한
 * 경기여야 한다. 이 함수는 그것을 검증하지 않는다.** 리비전을 `gameId IN (…)` 으로 읽기
 * 때문에, 다른 대회의 경기를 섞어 넣으면 그 카드까지 그대로 센다. (추출 전에는 리비전을
 * 픽스처 관계로 따라가 그 보장이 **구조적**이었다. 축을 인자로 받으면서 그 보장이 호출부로
 * 옮겨졌다 — 현재 두 호출부는 각각 자기 축의 목록만 만들지만, **세 번째 호출부를 쓸 때
 * 지켜야 할 것이 이것이다.**)
 *
 * **판정 단위는 사용자(`userId`)다.** 참가자 행은 경기마다 새로 생기므로 그것으로는
 * 대회 전체 누적을 셀 수 없고, 이름 문자열로 묶으면 동명이인이 서로의 카드를
 * 뒤집어쓴다. **계정 미연결 참가자는 대상에서 빠진다** — 고칠 수 있는 한계가 아니라
 * 아는 한계다(명단을 실제로 제출한 팀만 추적 대상이 된다).
 */
export async function readSuspensionVerdicts(
  tx: Tx,
  input: SuspensionVerdictInput,
): Promise<Map<string, SuspensionVerdict>> {
  // **행이 없으면 규정이 조용히 꺼진다**(아래 `?? null` → `suspensionRulesEnabled` false).
  // 그래서 대회/리그를 가리지 않고 찾는다 — 좁혀 두면 리그 경기가 여기로 오는 순간
  // 리그 징계 규정이 에러 없이 사라진다(경고 누적·퇴장 정지가 통째로 안 돈다).
  const competition = await findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, {
    where: { id: input.competitionId },
    select: { yellowAccumulationLimit: true, redCardSuspensionMatches: true },
  });
  const rules = {
    yellowAccumulationLimit: competition?.yellowAccumulationLimit ?? null,
    redCardSuspensionMatches: competition?.redCardSuspensionMatches ?? null,
  };
  // 규정이 꺼져 있으면 **조회조차 하지 않는다** — 대다수 대회·리그가 그렇다(옵트인).
  if (!suspensionRulesEnabled(rules)) return emptyVerdicts();

  const orderByKey = new Map(input.orderedGames.map((game, index) => [game.key, index + 1]));
  const upcomingGameOrder = orderByKey.get(input.upcomingKey);
  if (upcomingGameOrder === undefined) return emptyVerdicts();

  const gameIds = input.orderedGames
    .map((game) => game.gameId)
    .filter((gameId): gameId is string => gameId !== null);
  if (gameIds.length === 0) return emptyVerdicts();

  /**
   * 경기마다 **딱 한 개**의 리비전만 센다 — 여러 개를 세면 정정 이력이 카드로 중복
   * 집계돼 멀쩡한 선수가 정지된다.
   *
   * 고르는 순서: **공식 확정본 우선, 없으면 최신 제출본(SUBMITTED)**.
   *
   * 공식본만 보면 안 되는 이유(2026-08-24 alpha 실측으로 발견): 경기를 `end` 하면 결과
   * 리비전은 `SUBMITTED` 로 남고 `currentOfficialRevisionId` 는 **null 이다** — 공식
   * 확정은 운영진이 결과 검토를 거쳐 따로 눌러야 하는 별도 단계다. 당일 대회는 다음
   * 경기가 그 검토보다 먼저 시작되는 게 보통이라, 공식본만 세면 **정작 필요한 순간에
   * 가드가 조용히 안 걸린다**(실측: 레드카드 받은 선수가 다음 경기 라인업에 그대로
   * 제출돼 201 로 통과했다).
   *
   * **리그에서는 이게 상시 상황이다** — 리그 결과는 어드민이 확인을 누를 때까지
   * `SUBMITTED` 로 머문다. 공식본만 세면 리그 정지는 사실상 한 번도 안 걸린다.
   *
   * DRAFT·VOID 는 세지 않는다 — 초안은 아직 아무도 제출하지 않은 값이고 VOID 는
   * 무효화된 값이다.
   */
  const games = await tx.v1Game.findMany({
    where: { id: { in: gameIds } },
    select: {
      id: true,
      currentOfficialRevisionId: true,
      resultRevisions: {
        where: { state: 'SUBMITTED' },
        orderBy: { revision: 'desc' },
        take: 1,
        select: { id: true },
      },
    },
  });
  const revisionByGameId = new Map(
    games.map((game) => [
      game.id,
      game.currentOfficialRevisionId ?? game.resultRevisions?.[0]?.id ?? null,
    ]),
  );

  const revisionToOrder = new Map<string, number>();
  for (const game of input.orderedGames) {
    const order = orderByKey.get(game.key);
    if (order === undefined || game.gameId === null) continue;
    const revisionId = revisionByGameId.get(game.gameId) ?? null;
    if (revisionId !== null) revisionToOrder.set(revisionId, order);
  }
  if (revisionToOrder.size === 0) return emptyVerdicts();

  const resultParticipants = await tx.v1GameResultParticipant.findMany({
    where: { resultRevisionId: { in: [...revisionToOrder.keys()] } },
    select: { resultRevisionId: true, participantId: true, cards: true },
  });
  if (resultParticipants.length === 0) return emptyVerdicts();

  const participants = await tx.v1GameParticipant.findMany({
    where: { id: { in: resultParticipants.map((row) => row.participantId) } },
    select: { id: true, userId: true },
  });
  const userByParticipantId = new Map(participants.map((row) => [row.id, row.userId]));

  const playedByUserId = new Map<string, PlayedGameCards[]>();
  for (const row of resultParticipants) {
    const userId = userByParticipantId.get(row.participantId) ?? null;
    if (userId === null) continue;
    const gameOrder = revisionToOrder.get(row.resultRevisionId);
    if (gameOrder === undefined) continue;
    const bucket = playedByUserId.get(userId) ?? [];
    bucket.push({ gameOrder, cards: readResultCards(row.cards) });
    playedByUserId.set(userId, bucket);
  }

  const verdicts = new Map<string, SuspensionVerdict>();
  for (const [userId, played] of playedByUserId) {
    verdicts.set(userId, evaluateSuspension({ rules, played, upcomingGameOrder }));
  }
  return verdicts;
}

/**
 * 이 라인업에 출전정지 선수가 있으면 400 `DISCIPLINE_SUSPENDED` 로 막는다.
 *
 * **명단 = 출전자**이므로 갈래가 없다(정본 §3). 예전 이름과 주석은 "선발만 막고 후보는
 * 막지 않는다"고 적고 있었는데, 그 벤치 개념 자체가 폐기됐다 — `started` 로 좁히던
 * 조건도 함께 걷어냈다(쓰기 경로 7곳이 전부 `true` 라 결과는 같고, 남겨 두면 `started`
 * 가 다시 의미를 갖는 날 이 가드가 조용히 죽는다).
 *
 * 규정이 꺼진 대회·리그면 `readSuspensionVerdicts` 가 조회 없이 빈 맵을 돌려주므로 여기서도
 * 즉시 통과한다.
 */
export async function assertNoSuspendedParticipants(
  tx: Tx,
  input: SuspensionVerdictInput & { readonly lineupId: string },
): Promise<void> {
  const verdicts = await readSuspensionVerdicts(tx, input);
  if (verdicts.size === 0) return; // 규정 미적용이거나 누적 카드가 아직 없다.

  const participants = await tx.v1GameParticipant.findMany({
    where: { lineupId: input.lineupId },
    select: { userId: true, displayNameSnapshot: true },
  });
  const blocked = participants
    .map((participant) => {
      const verdict = participant.userId === null ? undefined : verdicts.get(participant.userId);
      return verdict?.suspended === true
        ? { name: participant.displayNameSnapshot, reason: verdict.reason }
        : null;
    })
    .filter((entry): entry is { name: string; reason: string | null } => entry !== null);
  if (blocked.length === 0) return;

  throw new BadRequestException({
    code: 'DISCIPLINE_SUSPENDED',
    message: `${blocked.map((entry) => entry.name).join(', ')} 선수는 출전정지 상태예요. 명단에서 빼고 다시 제출해 주세요.`,
    details: { blocked },
  });
}
