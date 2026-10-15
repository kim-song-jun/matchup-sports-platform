import { ConflictException } from '@nestjs/common';
import { Prisma, V1TeamMatch } from '@prisma/client';
import { resolveTeamMatchPeriodConfig } from './resolve-team-match-competition-config';

const ruleGameInclude = {
  periods: true,
  lineups: true,
  events: { select: { id: true }, take: 1 },
  resultRevisions: { select: { id: true }, take: 1 },
  sharedRecord: { select: { gameId: true } },
} satisfies Prisma.V1GameInclude;

type RuleMatch = Pick<V1TeamMatch, 'id' | 'sportId' | 'status' | 'leagueId' | 'tournamentId' | 'approvedApplicantTeamId' | 'competitionConfigVersionId'>;

export function readTeamMatchRulesGame(tx: Prisma.TransactionClient, teamMatchId: string) {
  return tx.v1Game.findUnique({ where: { teamMatchId }, include: ruleGameInclude });
}

export function teamMatchRulesEditable(match: RuleMatch, game: Awaited<ReturnType<typeof readTeamMatchRulesGame>>) {
  return match.leagueId === null && match.tournamentId === null
    && ['recruiting', 'closed'].includes(match.status) && match.approvedApplicantTeamId === null
    && game !== null && game.sourceType === 'TEAM_MATCH' && game.state === 'SCHEDULED'
    && game.competitionConfigVersionId === match.competitionConfigVersionId
    && game.lastSequence === 0 && game.currentOfficialRevisionId === null && game.sharedRecord === null
    && game.events.length === 0 && game.resultRevisions.length === 0
    && game.periods.length > 0 && game.periods.every(period => period.state === 'SCHEDULED'
      && period.startedAt === null && period.endedAt === null && period.pausedAt === null && period.pausedTotalMs === 0)
    && game.lineups.every(lineup => lineup.state === 'DRAFT' && lineup.revision === 1
      && lineup.submittedAt === null && lineup.supersedesId === null && lineup.invalidatedAt === null);
}

/** Called only after Game -> TeamMatch locks and the active host permission recheck. */
export async function repinTeamMatchRules(tx: Prisma.TransactionClient, input: {
  match: RuleMatch;
  periods: readonly { durationMinutes: number }[];
  actorUserId: string;
}) {
  const game = await readTeamMatchRulesGame(tx, input.match.id);
  if (!game || !input.match.competitionConfigVersionId || !teamMatchRulesEditable(input.match, game)) {
    throw new ConflictException({ code: 'TEAM_MATCH_RULES_LOCKED', message: '진행 또는 제출 이력이 있는 경기의 규칙은 변경할 수 없어요.' });
  }
  const next = await resolveTeamMatchPeriodConfig(tx, {
    sportId: input.match.sportId, currentConfigVersionId: input.match.competitionConfigVersionId,
    periods: input.periods, actorUserId: input.actorUserId,
  });
  if (next.id === game.competitionConfigVersionId) return { competitionConfigVersionId: next.id, gameId: game.id };
  await tx.v1Game.update({ where: { id: game.id }, data: { competitionConfigVersionId: next.id, version: { increment: 1 } } });
  await tx.v1GamePeriod.deleteMany({ where: { gameId: game.id } });
  await tx.v1GamePeriod.createMany({ data: next.config.periods.map((_, index) => ({ gameId: game.id, number: index + 1 })) });
  return { competitionConfigVersionId: next.id, gameId: game.id };
}
