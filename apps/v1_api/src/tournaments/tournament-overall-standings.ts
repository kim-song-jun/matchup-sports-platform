import type { Prisma } from '@prisma/client';
import {
  calculateCompetitionStandings,
  type CalculatedStanding,
  type CompetitionConfig,
  type StandingFixture,
} from './competition-config/competition-config';
import { standingsFixturesFromGroup, type StandingsSourceGroup } from './tournament-group-standings';

/**
 * 여러 조를 하나의 통합 순위 입력으로 합친다.
 *
 * `calculateCompetitionStandings`는 그룹 개념을 모르는 순수함수이므로
 * "전체 참가팀 + 전체 경기"를 넘기면 그대로 통합 순위가 나온다.
 * 승자승(head-to-head)도 옳게 동작한다 — 다른 조 팀끼리는 맞대결이 0건이라
 * 자동으로 다음 tie-break(득실차)로 넘어간다.
 */
export function overallStandingsInput(groups: readonly StandingsSourceGroup[]): {
  registrationIds: string[];
  fixtures: StandingFixture[];
} {
  const registrationIds = new Set<string>();
  const fixtures: StandingFixture[] = [];
  for (const group of groups) {
    for (const team of group.groupTeams) registrationIds.add(team.registrationId);
    fixtures.push(...standingsFixturesFromGroup(group));
  }
  return { registrationIds: [...registrationIds], fixtures };
}

/**
 * 대회 전체 통합 순위를 계산해 upsert 한다.
 *
 * **반드시 조별 순위와 같은 트랜잭션에서 호출한다.** 한쪽만 갱신되면
 * 조별 화면과 통합 화면이 다른 숫자를 보여준다.
 */
export async function recalculateAndUpsertOverallStandings(
  tx: Prisma.TransactionClient,
  params: {
    tournamentId: string;
    configVersionId: string;
    config: CompetitionConfig;
    groups: readonly StandingsSourceGroup[];
    fairPlayByRegistration?: ReadonlyMap<string, number>;
  },
  recalculatedAt: Date,
): Promise<CalculatedStanding[]> {
  const { registrationIds, fixtures } = overallStandingsInput(params.groups);

  const standings = calculateCompetitionStandings({
    tournamentId: params.tournamentId,
    configVersionId: params.configVersionId,
    registrationIds,
    fixtures,
    config: params.config,
    fairPlayByRegistration: params.fairPlayByRegistration,
  });

  for (const standing of standings) {
    const values = {
      points: standing.points,
      wins: standing.wins,
      draws: standing.draws,
      losses: standing.losses,
      goalsFor: standing.goalsFor,
      goalsAgainst: standing.goalsAgainst,
      fairPlayPoints: standing.fairPlayPoints,
      position: standing.position,
      recalculatedAt,
    };
    await tx.v1TournamentOverallStanding.upsert({
      where: {
        tournamentId_registrationId: {
          tournamentId: params.tournamentId,
          registrationId: standing.registrationId,
        },
      },
      create: {
        tournamentId: params.tournamentId,
        registrationId: standing.registrationId,
        ...values,
      },
      update: values,
    });
  }

  return standings;
}
