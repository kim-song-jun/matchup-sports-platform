import { ConflictException } from '@nestjs/common';
import { Prisma, V1GameSourceType } from '@prisma/client';
import { validateCompetitionConfig } from './competition-config/competition-config';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from './tournament-surface-lookup';
import type { StandingsSourceGroup } from './tournament-group-standings';

const canonicalGame = {
  select: {
    id: true,
    sourceType: true,
    teamMatchId: true,
    currentOfficialRevision: {
      select: {
        state: true,
        score: true,
        resultParticipants: { select: { sideId: true, cards: true } },
      },
    },
    sides: { select: { id: true, sideKey: true } },
  },
} satisfies Prisma.V1TeamMatchSelect['game'];

type CanonicalDetails = {
  groupId: string | null;
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  teamMatch: {
    id: string;
    tournamentId: string | null;
    leagueId: string | null;
    deletedAt: Date | null;
    status: string;
    game: Prisma.V1TeamMatchGetPayload<{ select: { game: typeof canonicalGame } }>['game'];
  };
};

export type CanonicalStandingsSource = {
  groups: StandingsSourceGroup[];
  config: ReturnType<typeof validateCompetitionConfig>;
  configVersionId: string;
  recalculatedAt: Date;
};

const detailsSelect = {
  groupId: true,
  homeRegistrationId: true,
  awayRegistrationId: true,
  teamMatch: {
    select: {
      id: true,
      tournamentId: true,
      leagueId: true,
      deletedAt: true,
      status: true,
      game: canonicalGame,
    },
  },
} as const;

/**
 * Loads one tournament's canonical standings source under the same lock order
 * used by result commands: tournament, Game ids, then TeamMatch ids. The source
 * is re-read after those locks and fingerprinted, so callers never calculate
 * from a pre-lock source snapshot.
 */
export async function loadCanonicalStandingsSource(
  tx: Prisma.TransactionClient,
  tournamentId: string,
): Promise<CanonicalStandingsSource | null> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${tournamentId}`}, 0))`;
  await tx.$queryRaw`SELECT id FROM v1_tournaments WHERE id = ${tournamentId} FOR UPDATE`;
  const tournament = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, {
    where: { id: tournamentId, deletedAt: null },
    include: { competitionConfig: true },
  });
  if (tournament === null) return null;
  if (!tournament.competitionConfigVersionId) {
    throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '대회 경기에는 활성 경기 규칙 버전이 필요해요.' });
  }
  const config = validateCompetitionConfig(tournament.competitionConfig);
  const sourceWhere = { tournamentId, groupId: { not: null }, teamMatch: { is: { deletedAt: null } } } as const;
  const initial = await tx.v1TournamentMatchDetails.findMany({ where: sourceWhere, select: detailsSelect });
  const gameIds = initial.map((row) => row.teamMatch.game?.id).filter((id): id is string => id !== undefined).sort();
  const matchIds = initial.map((row) => row.teamMatch.id).sort();
  for (const gameId of gameIds) await tx.$queryRaw`SELECT id FROM v1_games WHERE id = ${gameId} FOR UPDATE`;
  for (const teamMatchId of matchIds) await tx.$queryRaw`SELECT id FROM v1_team_matches WHERE id = ${teamMatchId} FOR UPDATE`;
  const details = await tx.v1TournamentMatchDetails.findMany({ where: sourceWhere, select: detailsSelect });
  const fingerprint = (rows: readonly CanonicalDetails[]) => rows.map((row) => `${row.teamMatch.id}:${row.teamMatch.game?.id ?? 'missing'}`).sort().join('|');
  if (fingerprint(initial) !== fingerprint(details)) {
    throw new ConflictException({ code: 'COMMAND_CONCURRENCY_CONFLICT', message: '경기 결과가 변경되는 동안 순위를 계산할 수 없어요. 다시 시도해 주세요.', details: { teamMatchIds: matchIds } });
  }
  const invalid = details.filter((row) =>
    row.teamMatch.tournamentId !== tournamentId || row.teamMatch.leagueId !== null || row.teamMatch.game === null ||
    row.teamMatch.game.sourceType !== V1GameSourceType.TEAM_MATCH || row.teamMatch.game.teamMatchId !== row.teamMatch.id);
  if (invalid.length > 0) {
    throw new ConflictException({ code: 'TOURNAMENT_MATCH_GAME_MISSING', message: '대회 경기의 정본 게임을 찾을 수 없어요.', details: { teamMatchIds: invalid.map((row) => row.teamMatch.id) } });
  }
  const groupRows = await tx.v1TournamentGroup.findMany({ where: { tournamentId, phase: 'group' }, include: { groupTeams: { orderBy: { registrationId: 'asc' } } } });
  const byGroup = new Map<string, CanonicalDetails[]>();
  for (const row of details) {
    if (row.groupId === null) continue;
    if (row.teamMatch.status !== 'completed') continue;
    const entries = byGroup.get(row.groupId) ?? [];
    entries.push(row);
    byGroup.set(row.groupId, entries);
  }
  const groups = groupRows.map((group) => ({
    ...group,
    fixtures: (byGroup.get(group.id) ?? []).map((row) => ({
      homeRegistrationId: row.homeRegistrationId,
      awayRegistrationId: row.awayRegistrationId,
      game: row.teamMatch.game,
      result: null,
    })),
  })) as StandingsSourceGroup[];
  return { groups, config, configVersionId: tournament.competitionConfigVersionId, recalculatedAt: new Date() };
}
