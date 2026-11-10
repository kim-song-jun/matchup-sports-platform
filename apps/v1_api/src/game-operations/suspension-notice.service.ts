import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { formatKstMonthDayTime } from '../common/kst-datetime';
import { loadCompetitionRosterBase } from '../games/roster/game-roster-loader';
import type { GameOperationClaim } from '../jobs/v1-game-operations-worker.service';
import { notificationCopyFor } from '../notifications/notifications.service';
import type { WebPushService } from '../notifications/web-push.service';
import {
  isSuspensionImminent,
  suspensionRulesEnabled,
  type SuspensionRules,
  type SuspensionVerdict,
} from '../tournaments/discipline/card-suspension';
import { readDisciplineForUpcomingKeys, readSuspensionRules } from '../tournaments/discipline/suspension-verdicts';
import { loadTeamCompetitionGameOrder } from '../tournaments/discipline/team-game-order';
import { ALL_COMPETITION_KINDS, findTournamentOnSurface } from '../tournaments/tournament-surface-lookup';
import type { OfficialRevisionRow } from './game-result-official-projection.types';

type NoticeType = 'player_suspension_notice' | 'player_suspension_warning';

interface NoticeRow {
  readonly userId: string;
  readonly teamId: string;
  readonly type: NoticeType;
  readonly body: string;
  readonly deepLink: string;
  readonly businessKey: string;
}

/**
 * 결과가 공식으로 확정·정정될 때, 그 팀의 **다음 경기**에 못 뛰는 선수와 경고 한 장이면 정지인 선수를
 * 팀장·매니저와 대회 운영진에게 알린다(MD-QA #191).
 *
 * 정지는 계산값(`evaluateSuspension`)이라 알림은 그 순간의 판정을 말한다. 정정으로 판정이 바뀌어도 이미 보낸 알림을
 * 거두지는 않는다 — 정정 리비전마다 새 판정을 다시 보내고(businessKey 에 리비전이 들어간다), 화면의 명단·칩이 항상 현재 값이다.
 * 알림 row 는 outbox 트랜잭션(`tx`)으로 직접 쓰고 웹 푸시는 커밋 뒤에만 보낸다 — 결과 확정 알림 서비스들과 같은 규칙이다.
 */
export class SuspensionNoticeProjectionService {
  private readonly logger = new Logger(SuspensionNoticeProjectionService.name);

  constructor(private readonly webPush?: WebPushService) {}

  async project(tx: Prisma.TransactionClient, revision: OfficialRevisionRow, claim?: GameOperationClaim): Promise<void> {
    const isLeague = revision.leagueId !== null;
    const competitionId = revision.leagueId ?? revision.tournamentId;
    if (competitionId === null || revision.teamMatchId === null) return;
    const rules = await readSuspensionRules(tx, competitionId);
    if (!suspensionRulesEnabled(rules)) return;

    const teamIds = [...new Set([revision.homeTeamId, revision.awayTeamId].filter((id): id is string => id !== null))];
    const rows: NoticeRow[] = [];
    for (const teamId of teamIds) {
      rows.push(...(await this.rowsForTeam(tx, revision, { competitionId, isLeague, teamId, rules })));
    }
    if (rows.length === 0) return;

    const preferences = await tx.v1NotificationPreference.findMany({
      where: { userId: { in: [...new Set(rows.map((row) => row.userId))] } },
      select: { userId: true, teamMatchEnabled: true },
    });
    const optedOut = new Set(preferences.filter((p) => p.teamMatchEnabled === false).map((p) => p.userId));
    const deliverable = rows.filter((row) => !optedOut.has(row.userId));
    if (deliverable.length === 0) return;

    const existing = await tx.v1Notification.findMany({
      where: { businessKey: { in: deliverable.map((row) => row.businessKey) } },
      select: { businessKey: true },
    });
    const alreadyDelivered = new Set(existing.map((n) => n.businessKey));
    await tx.v1Notification.createMany({
      data: deliverable.map((row) => {
        const copy = notificationCopyFor(row.type, 'team', null);
        return {
          recipientUserId: row.userId,
          targetType: 'team' as const,
          targetId: row.teamId,
          title: copy.title,
          body: row.body,
          deepLink: row.deepLink,
          businessKey: row.businessKey,
        };
      }),
      skipDuplicates: true,
    });

    for (const row of deliverable.filter((candidate) => !alreadyDelivered.has(candidate.businessKey))) {
      const title = notificationCopyFor(row.type, 'team', null).title;
      const send = () =>
        void this.webPush?.sendToUser(row.userId, { title, body: row.body, url: row.deepLink }).catch((error: unknown) => {
          this.logger.warn(`web push failed for suspension notice (revision=${revision.revisionId}): ${String(error)}`);
        });
      if (claim?.afterCommit === undefined) send();
      else claim.afterCommit.push(send);
    }
  }

  private async rowsForTeam(
    tx: Prisma.TransactionClient,
    revision: OfficialRevisionRow,
    scope: { competitionId: string; isLeague: boolean; teamId: string; rules: SuspensionRules },
  ): Promise<NoticeRow[]> {
    const { competitionId, isLeague, teamId, rules } = scope;
    const ordered = await loadTeamCompetitionGameOrder(tx, { competitionId, isLeague, teamId });
    const index = ordered.findIndex((game) => game.key === revision.teamMatchId);
    if (index < 0) return [];
    const later = ordered.slice(index + 1);
    const laterGameIds = later.flatMap((game) => (game.gameId === null ? [] : [game.gameId]));
    const states = new Map(
      laterGameIds.length === 0
        ? []
        : (await tx.v1Game.findMany({ where: { id: { in: laterGameIds } }, select: { id: true, state: true } })).map((game) => [game.id, game.state]),
    );
    // 아직 시작하지 않은 가장 이른 경기가 "다음 경기"다.
    const next = later.find((game) => game.gameId === null || states.get(game.gameId) === 'SCHEDULED');
    if (next === undefined) return [];

    const [{ verdictsByUpcomingKey }, base] = await Promise.all([
      readDisciplineForUpcomingKeys(tx, { competitionId, orderedGames: ordered, upcomingKeys: [next.key] }),
      loadCompetitionRosterBase(tx, { competitionId, isLeague, teamId }),
    ]);
    const verdicts = verdictsByUpcomingKey.get(next.key) ?? new Map<string, SuspensionVerdict>();
    if (base === null) return [];
    const suspended = base.entries.flatMap((entry) => {
      const verdict = verdicts.get(entry.userId);
      return verdict?.suspended === true ? [`${entry.displayNameSnapshot}(${suspensionCause(verdict, rules)})`] : [];
    });
    const imminent = base.entries
      .filter((entry) => {
        const verdict = verdicts.get(entry.userId);
        return verdict !== undefined && !verdict.suspended && isSuspensionImminent(rules, verdict.yellowTotal);
      })
      .map((entry) => entry.displayNameSnapshot);
    if (suspended.length === 0 && imminent.length === 0) return [];

    const [recipients, context] = await Promise.all([
      loadNoticeRecipients(tx, competitionId, teamId),
      loadNoticeContext(tx, { competitionId, teamId, nextTeamMatchId: next.key }),
    ]);
    if (recipients.length === 0) return [];

    const corrected =
      (await tx.v1GameResultRevision.findFirst({
        where: { gameId: revision.gameId, id: { not: revision.revisionId }, officialAt: { not: null, lt: revision.officialAt } },
        select: { id: true },
      })) !== null;
    const prefix = `${context.competitionTitle} · ${context.teamName}`;
    const nextGame = `다음 경기(${context.nextGameLabel})`;
    const deepLink = next.gameId === null ? `/teams/${teamId}/game-rosters` : `/teams/${teamId}/games/${next.gameId}/roster`;
    const correction = corrected ? '결과가 정정돼 다시 계산했어요. ' : '';
    const built: { type: NoticeType; body: string }[] = [];
    if (suspended.length > 0) {
      built.push({ type: 'player_suspension_notice', body: `${correction}${prefix} ${nextGame}에 출전할 수 없는 선수: ${suspended.join(', ')}.` });
    }
    if (imminent.length > 0) {
      built.push({
        type: 'player_suspension_warning',
        body: `${correction}${prefix} 경고 임박 선수: ${imminent.join(', ')}. ${notificationCopyFor('player_suspension_warning', 'team', null).defaultBody}`,
      });
    }
    return recipients.flatMap((userId) =>
      built.map((notice) => ({
        userId,
        teamId,
        type: notice.type,
        body: notice.body,
        deepLink,
        businessKey: `player-suspension:${revision.revisionId}:${teamId}:${notice.type}:${userId}`,
      })),
    );
  }
}

/** "퇴장 1회", "경고 2장 누적" — 판정이 정지로 본 근거를 짧게. */
function suspensionCause(verdict: SuspensionVerdict, rules: SuspensionRules): string {
  const causes: string[] = [];
  if (rules.redCardSuspensionMatches !== null && verdict.redTotal > 0) causes.push(`퇴장 ${verdict.redTotal}회`);
  if (rules.yellowAccumulationLimit !== null && verdict.yellowTotal >= rules.yellowAccumulationLimit) {
    causes.push(`경고 ${verdict.yellowTotal}장 누적`);
  }
  return causes.length > 0 ? causes.join(' · ') : '카드 누적';
}

/** 그 팀의 팀장·매니저와 그 대회·리그의 대회 총괄 운영진(활성 배정). */
async function loadNoticeRecipients(tx: Prisma.TransactionClient, competitionId: string, teamId: string): Promise<string[]> {
  const [managers, directors] = await Promise.all([
    tx.v1TeamMembership.findMany({
      where: { teamId, status: 'active', role: { in: ['owner', 'manager'] } },
      select: { userId: true },
    }),
    tx.v1TournamentStaffAssignment.findMany({
      where: {
        tournamentId: competitionId,
        role: 'TOURNAMENT_DIRECTOR',
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { userId: true },
    }),
  ]);
  return [...new Set([...managers, ...directors].map((row) => row.userId))];
}

async function loadNoticeContext(
  tx: Prisma.TransactionClient,
  input: { competitionId: string; teamId: string; nextTeamMatchId: string },
): Promise<{ competitionTitle: string; teamName: string; nextGameLabel: string }> {
  const [competition, team, nextMatch] = await Promise.all([
    findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, { where: { id: input.competitionId }, select: { title: true } }),
    tx.v1Team.findUnique({ where: { id: input.teamId }, select: { name: true } }),
    tx.v1TeamMatch.findUnique({
      where: { id: input.nextTeamMatchId },
      select: { startAt: true, hostTeamId: true, approvedApplicantTeamId: true },
    }),
  ]);
  const opponentId = nextMatch?.hostTeamId === input.teamId ? nextMatch.approvedApplicantTeamId : (nextMatch?.hostTeamId ?? null);
  const opponent = opponentId === null ? null : await tx.v1Team.findUnique({ where: { id: opponentId }, select: { name: true } });
  const when = nextMatch?.startAt == null ? '일정 미정' : formatKstMonthDayTime(nextMatch.startAt);
  return {
    competitionTitle: competition?.title ?? '대회',
    teamName: team?.name ?? '우리 팀',
    nextGameLabel: `${when} vs ${opponent?.name ?? '상대 미정'}`,
  };
}
