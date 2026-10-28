import {
  findTournamentOnSurface,
  TOURNAMENT_KINDS,
} from '../tournament-surface-lookup';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { parseTournamentFixtureOfficialScore } from '../tournament-fixture-official-result';
import { replaceRankedBracketAssignments } from '../../game-operations/tournament-team-match-advancement';

export type SixTeamState = {
  rounds: [string, string, string, string, string];
  winners: Record<string, string>;
  bye: string | null;
  manual: boolean;
  swapSemi?: boolean;
  swapFinal?: boolean;
  sourceVersion: string | null;
  needsReview: boolean;
};
export function parseSixTeamState(
  value: Prisma.JsonValue | null | undefined
): SixTeamState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as unknown as SixTeamState;
  if (
    !Array.isArray(v.rounds) ||
    v.rounds.length !== 5 ||
    new Set(v.rounds).size !== 5 ||
    v.rounds.some((id) => typeof id !== 'string') ||
    !v.winners ||
    typeof v.winners !== 'object' ||
    Array.isArray(v.winners) ||
    Object.values(v.winners).some((id) => typeof id !== 'string') ||
    typeof v.manual !== 'boolean' ||
    (v.bye !== null && typeof v.bye !== 'string')
  )
    return null;
  return v;
}
export type SixTeamResult = {
  id: string;
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  revisionId: string | null;
  score: Prisma.JsonValue | null;
};
export function rankSixTeamWinners(
  results: SixTeamResult[],
  overrides: Record<string, string>
) {
  const candidates = results.map((result) => {
    const score = parseTournamentFixtureOfficialScore(result.score);
    const chosen = overrides[result.id];
    if (
      chosen &&
      chosen !== result.homeRegistrationId &&
      chosen !== result.awayRegistrationId
    ) {
      throw new UnprocessableEntityException({
        code: 'SIX_TEAM_WINNER_INVALID',
        message: '해당 경기 참가팀 중에서 진출팀을 선택해 주세요.',
      });
    }
    let winner: string | null = chosen ?? null;
    if (!winner && result.revisionId && score) {
      const diff = score.homeScore - score.awayScore;
      const pk = (score.homePenaltyScore ?? 0) - (score.awayPenaltyScore ?? 0);
      winner =
        diff > 0 || (diff === 0 && score.hasPenalty && pk > 0)
          ? result.homeRegistrationId
          : diff < 0 || (diff === 0 && score.hasPenalty && pk < 0)
          ? result.awayRegistrationId
          : null;
    }
    if (!winner) return null;
    const home = winner === result.homeRegistrationId;
    return {
      fixtureId: result.id,
      registrationId: winner,
      goalsFor: score ? (home ? score.homeScore : score.awayScore) : null,
      goalsAgainst: score ? (home ? score.awayScore : score.homeScore) : null,
    };
  });
  const ready = candidates.every((row) => row !== null);
  const rows = candidates.filter(
    (row): row is NonNullable<typeof row> => row !== null
  );
  const comparable =
    ready &&
    results.every((row) => row.revisionId !== null) &&
    rows.every((row) => row.goalsFor !== null && row.goalsAgainst !== null);
  const compare = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    b.goalsFor! - a.goalsFor! ||
    b.goalsFor! - b.goalsAgainst! - (a.goalsFor! - a.goalsAgainst!) ||
    a.goalsAgainst! - b.goalsAgainst!;
  const ranked = comparable ? [...rows].sort(compare) : rows;
  const bye =
    comparable && ranked.length === 3 && compare(ranked[0], ranked[1]) !== 0
      ? ranked[0].registrationId
      : null;
  return { ready, comparable, candidates: ranked, automaticBye: bye };
}

export async function loadSixTeamResults(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  state: SixTeamState
) {
  const details = await tx.v1TournamentMatchDetails.findMany({
    where: {
      tournamentId,
      teamMatchId: { in: state.rounds },
      teamMatch: { deletedAt: null },
    },
    include: {
      teamMatch: {
        include: { game: { include: { currentOfficialRevision: true } } },
      },
    },
  });
  if (details.length !== 5)
    throw new ConflictException({
      code: 'SIX_TEAM_STRUCTURE_INVALID',
      message: '6강 대진이 변경됐어요. 운영자가 대진 구조를 확인해 주세요.',
    });
  return state.rounds.map((id) => {
    const row = details.find((row) => row.teamMatchId === id)!;
    const revision = row.teamMatch.game?.currentOfficialRevision;
    return {
      id,
      homeRegistrationId: row.homeRegistrationId,
      awayRegistrationId: row.awayRegistrationId,
      revisionId: revision?.state === 'OFFICIAL' ? revision.id : null,
      score: revision?.state === 'OFFICIAL' ? revision.score : null,
    };
  });
}
export const sixTeamSourceVersion = (rows: SixTeamResult[]) =>
  createHash('sha256').update(JSON.stringify(rows)).digest('hex');

/** Called inside official-result transactions and manual selection, under the same competition lock. */
export async function syncSixTeamBracket(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  excludedFixtureId?: string
) {
  const lock = await tx.$queryRaw<
    Array<{ acquired: boolean }>
  >`SELECT pg_try_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${tournamentId}`}, 0)) AS acquired`;
  if (!lock[0]?.acquired)
    throw new ConflictException({
      code: 'SIX_TEAM_BUSY',
      message:
        '다른 운영자가 대진을 변경하고 있어요. 잠시 후 다시 시도해 주세요.',
    });
  const tournament = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, {
    where: { id: tournamentId },
    select: { sixTeamBracket: true },
  });
  const state = parseSixTeamState(tournament?.sixTeamBracket);
  if (!state) {
    if (tournament?.sixTeamBracket != null)
      throw new ConflictException({
        code: 'SIX_TEAM_STRUCTURE_INVALID',
        message:
          '6강 진행 정보가 올바르지 않아요. 운영자가 대진을 확인해 주세요.',
      });
    return;
  }
  const results = await loadSixTeamResults(tx, tournamentId, state);
  // Voiding happens before the official pointer swap; treat that source as unavailable now.
  if (excludedFixtureId) {
    const row = results.find((row) => row.id === excludedFixtureId);
    if (row) {
      row.revisionId = null;
      row.score = null;
    }
  }
  const version = sixTeamSourceVersion(results.slice(0, 3));
  if (state.manual && state.sourceVersion !== version) {
    await tx.v1Tournament.update({
      where: { id: tournamentId },
      data: { sixTeamBracket: { ...state, needsReview: true } },
    });
    return;
  }
  const ranked = rankSixTeamWinners(results.slice(0, 3), state.winners);
  const bye = state.manual ? state.bye : ranked.automaticBye;
  const remaining =
    ranked.ready && bye
      ? results
          .slice(0, 3)
          .map(
            (row) =>
              ranked.candidates.find(
                (candidate) => candidate.fixtureId === row.id
              )!.registrationId
          )
          .filter((id) => id !== bye)
      : [];
  if (
    bye &&
    (!ranked.ready ||
      !ranked.candidates.some((row) => row.registrationId === bye) ||
      remaining.length !== 2)
  ) {
    throw new UnprocessableEntityException({
      code: 'SIX_TEAM_BYE_INVALID',
      message: '6강 진출팀 3팀 중에서 결승 직행팀을 선택해 주세요.',
    });
  }
  if (
    state.winners[state.rounds[3]] &&
    !remaining.includes(state.winners[state.rounds[3]])
  ) {
    throw new UnprocessableEntityException({
      code: 'SIX_TEAM_WINNER_INVALID',
      message: '준결승 진출팀 지정을 해제한 뒤 새 대진으로 변경해 주세요.',
    });
  }
  if (state.swapSemi) remaining.reverse();
  const semifinal =
    rankSixTeamWinners([results[3]], state.winners).candidates[0]
      ?.registrationId ?? null;
  const semifinalWinner = remaining.includes(semifinal ?? '')
    ? semifinal
    : null;
  if (
    state.winners[state.rounds[4]] &&
    ![bye, semifinalWinner].includes(state.winners[state.rounds[4]])
  ) {
    throw new UnprocessableEntityException({
      code: 'SIX_TEAM_WINNER_INVALID',
      message: '결승 우승팀 지정을 해제한 뒤 새 대진으로 변경해 주세요.',
    });
  }
  await replaceRankedBracketAssignments(tx, tournamentId, [
    {
      fixtureId: state.rounds[3],
      home: remaining[0] ?? null,
      away: remaining[1] ?? null,
    },
    {
      fixtureId: state.rounds[4],
      home: state.swapFinal
        ? remaining.includes(semifinal ?? '')
          ? semifinal
          : null
        : bye,
      away: state.swapFinal
        ? bye
        : remaining.includes(semifinal ?? '')
        ? semifinal
        : null,
    },
  ]);
  await tx.v1Tournament.update({
    where: { id: tournamentId },
    data: {
      sixTeamBracket: {
        ...state,
        bye,
        sourceVersion: version,
        needsReview: false,
      },
    },
  });
}
