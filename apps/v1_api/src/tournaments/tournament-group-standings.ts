import type { Prisma } from '@prisma/client';
import {
  calculateCompetitionStandings,
  type CalculatedStanding,
  type CompetitionConfig,
  type StandingFixture,
} from './competition-config/competition-config';
import { fairPlayPointsOf, parseFairPlayCards } from './league-fair-play';
import {
  resolveTournamentFixtureOfficialScore,
  type TournamentFixtureOfficialScore,
} from './tournament-fixture-official-result';

/**
 * The shape both `TournamentBracketService.recalculateStandings()` (all
 * group-phase groups in a tournament, admin-triggered) and
 * `GameResultStandingsProjectionService` (a single affected group,
 * triggered automatically when a tournament-fixture result becomes the
 * current OFFICIAL revision) already fetch: a group's teams plus its
 * completed fixtures, each carrying `game.currentOfficialRevision.{state,
 * score}` — the R3 §4-3 new-path source of truth for a fixture's result
 * (see `tournament-fixture-official-result.ts`).
 *
 * `result` is the R3 §4-3~§4-4 한시적 legacy fallback input
 * (`V1TournamentFixtureResult`'s score columns only — standings never need
 * goals/note). It is optional: `recalculateStandings()` fetches it and
 * therefore gets the fallback, while `GameResultStandingsProjectionService`
 * does not fetch it (that automatic trigger only ever fires off a fresh
 * new-path OFFICIAL revision, and in production the other fixtures in the
 * same group have already been through the GAME_BACKFILL migration too —
 * see `tournament-fixture-official-result.ts`'s file-level doc comment).
 * Removed together with the rest of the fallback in R3 §4-4단계.
 */
export type StandingsSourceGroup = {
  id: string;
  groupTeams: readonly { registrationId: string }[];
  fixtures: readonly {
    homeRegistrationId: string | null;
    awayRegistrationId: string | null;
    game: {
      currentOfficialRevision: {
        state: string;
        score: Prisma.JsonValue;
        /**
         * F5: 페어플레이 tie-break용 카드 원천. 신규 경로(OFFICIAL 리비전) 픽스처만
         * 갖는다 — 옵셔널인 이유는 아래 `fairPlayByRegistrationFromGroups()` 주석 참고.
         */
        resultParticipants?: readonly { sideId: string; cards: Prisma.JsonValue }[];
      } | null;
      /** F5: participant.sideId → home/away 매핑에 필요 (V1GameSideKey: 'HOME' | 'AWAY'). */
      sides?: readonly { id: string; sideKey: string }[];
    } | null;
    result?: TournamentFixtureOfficialScore | null;
  }[];
};

/**
 * 그룹(들)의 완료 픽스처에서 팀(registrationId)별 페어플레이 벌점 합계를 뽑는다.
 *
 * **레거시 폴백 픽스처는 카드 데이터가 없다.** `V1TournamentFixtureResult`(R3
 * §4-3~§4-4단계 레거시 폴백, `resolveTournamentFixtureOfficialScore` 참고)에는 애초에
 * 참가자 카드 컬럼이 없으므로, `game.currentOfficialRevision`이 없거나
 * `state !== 'OFFICIAL'`인 픽스처는 그냥 건너뛴다(0점 기여) — 조용히 계산 불가로
 * 남는 것이지 회귀가 아니다. `sides`/`resultParticipants`를 옵셔널로 둔 것도 같은
 * 이유: 이 필드들을 select하지 않은 호출부(예: 카드 무관한 기존 조회)가 있어도
 * 타입이 깨지지 않게 하기 위함이며, 실제로는 F5를 연결한 3개 호출부
 * (tournament-bracket.service.ts / tournament-standings-recalculation.ts /
 * game-result-standings-projection.service.ts) 모두 두 필드를 select한다.
 */
export function fairPlayByRegistrationFromGroups(
  groups: readonly StandingsSourceGroup[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const group of groups) {
    for (const fixture of group.fixtures) {
      if (!fixture.homeRegistrationId || !fixture.awayRegistrationId) continue;
      const revision = fixture.game?.currentOfficialRevision;
      if (!revision || revision.state !== 'OFFICIAL') continue;
      const resultParticipants = revision.resultParticipants;
      const sides = fixture.game?.sides;
      if (!resultParticipants || !sides) continue;
      const sideKeyById = new Map(sides.map((side) => [side.id, side.sideKey] as const));
      for (const participant of resultParticipants) {
        const sideKey = sideKeyById.get(participant.sideId);
        const registrationId =
          sideKey === 'HOME'
            ? fixture.homeRegistrationId
            : sideKey === 'AWAY'
              ? fixture.awayRegistrationId
              : null;
        if (!registrationId) continue;
        const points = fairPlayPointsOf(parseFairPlayCards(participant.cards));
        totals.set(registrationId, (totals.get(registrationId) ?? 0) + points);
      }
    }
  }
  return totals;
}

/** Same "no fictitious score" filtering recalculateStandings() already applied inline. */
export function standingsFixturesFromGroup(group: StandingsSourceGroup): StandingFixture[] {
  return group.fixtures.flatMap((fixture) => {
    if (!fixture.homeRegistrationId || !fixture.awayRegistrationId) return [];
    const score = resolveTournamentFixtureOfficialScore(fixture.game, fixture.result);
    if (!score) return [];
    return [
      {
        homeRegistrationId: fixture.homeRegistrationId,
        awayRegistrationId: fixture.awayRegistrationId,
        homeScore: score.homeScore,
        awayScore: score.awayScore,
      },
    ];
  });
}

/**
 * Computes standings for one group and upserts its `V1TournamentStanding`
 * rows. Extracted out of `TournamentBracketService.recalculateStandings()`
 * so the admin recalculate route and the automatic per-result trigger
 * (`GameResultStandingsProjectionService`) share the exact same
 * calculation and persistence instead of a second implementation drifting
 * from it — the actual points/tie-break rules live in
 * `calculateCompetitionStandings()` alone and must not be re-derived here.
 */
export async function recalculateAndUpsertGroupStandings(
  tx: Prisma.TransactionClient,
  params: {
    tournamentId: string;
    configVersionId: string;
    config: CompetitionConfig;
    group: StandingsSourceGroup;
    /** F5: registrationId → 누적 페어플레이 벌점. 안 주면 전부 0(기존 동작). */
    fairPlayByRegistration?: ReadonlyMap<string, number>;
  },
  recalculatedAt: Date,
): Promise<CalculatedStanding[]> {
  const standings = calculateCompetitionStandings({
    tournamentId: params.tournamentId,
    configVersionId: params.configVersionId,
    registrationIds: params.group.groupTeams.map((team) => team.registrationId),
    fixtures: standingsFixturesFromGroup(params.group),
    config: params.config,
    fairPlayByRegistration: params.fairPlayByRegistration,
  });

  for (const standing of standings) {
    await tx.v1TournamentStanding.upsert({
      where: {
        groupId_registrationId: {
          groupId: params.group.id,
          registrationId: standing.registrationId,
        },
      },
      create: {
        groupId: params.group.id,
        registrationId: standing.registrationId,
        points: standing.points,
        wins: standing.wins,
        draws: standing.draws,
        losses: standing.losses,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        fairPlayPoints: standing.fairPlayPoints,
        position: standing.position,
        recalculatedAt,
      },
      update: {
        points: standing.points,
        wins: standing.wins,
        draws: standing.draws,
        losses: standing.losses,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        fairPlayPoints: standing.fairPlayPoints,
        position: standing.position,
        recalculatedAt,
      },
    });
  }

  return standings;
}
