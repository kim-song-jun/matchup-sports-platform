import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, V1GameSideKey } from '@prisma/client';
import type { V1ActiveAdmin } from '../common/admin-context.service';
import { competitionTeamTargets, enqueueRosterResync, type RosterResyncTarget } from '../games/roster/roster-resync-events';
import { revokeReplacedSideTeamAdjustments } from '../games/roster/side-team-change';
import { cascadeCancelTeamMatchSchedulesInTx } from '../team-schedules/team-schedules.service';
import type { BracketTxDeps } from '../tournaments/tournament-bracket-tx';
import { invalidateLineupAndTactics, upsertSchedule } from '../tournaments/tournament-match-update';
import { LEAGUE_APPLICATION_MESSAGE } from './league-fixture-creation';

type Tx = Prisma.TransactionClient;

export type LeagueSideAssignmentInput = {
  teamMatchId: string;
  side: 'HOME' | 'AWAY';
  registrationId: string | null;
};

const UNDECIDED_SIDE_NAME = { HOME: '홈 팀 미정', AWAY: '어웨이 팀 미정' } as const;
const SIDE_INCOMPLETE_CANCEL_REASON = 'LEAGUE_SLOT_SIDE_INCOMPLETE';
const TEAM_CHANGED_CANCEL_REASON = 'LEAGUE_SLOT_TEAM_CHANGED';

/**
 * 리그 경기 한 사이드의 팀을 바꾼다(null = 비우기). 호출자가 어드민 권한과 "자리를 쓰는 경기가
 * 전부 시작 전인가"를 이미 확인했다 — 여기서는 행 수준 변경과 그 파급(사이드·팀 일정·신청서·명단)만 소유한다.
 *
 * 잠금 순서는 결과 확인·대진 수정과 같다: Game → TeamMatch. `_deps` 는 PR-1a 의 `assignTournamentFixtureSideInTx` 와
 * 같은 호출 모양을 맞추는 자리표시다(사이드 배정에 서비스 의존성이 필요 없다).
 */
export async function assignLeagueFixtureSideInTx(
  tx: Tx,
  _deps: BracketTxDeps,
  admin: V1ActiveAdmin,
  input: LeagueSideAssignmentInput,
): Promise<void> {
  const gameRows = await tx.$queryRaw<Array<{ id: string; state: string; currentOfficialRevisionId: string | null }>>`
    SELECT id, state::text AS state, current_official_revision_id AS "currentOfficialRevisionId"
    FROM v1_games WHERE team_match_id = ${input.teamMatchId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM v1_team_matches WHERE id = ${input.teamMatchId} FOR UPDATE`;
  const teamMatch = await tx.v1TeamMatch.findUnique({
    where: { id: input.teamMatchId },
    select: {
      id: true,
      leagueId: true,
      title: true,
      startAt: true,
      endAt: true,
      hostTeamId: true,
      approvedApplicantTeamId: true,
    },
  });
  if (teamMatch === null || teamMatch.leagueId === null || gameRows.length !== 1) {
    throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '리그 경기를 찾을 수 없어요.' });
  }
  const { leagueId, startAt } = teamMatch;
  const game = gameRows[0];

  const registration = input.registrationId === null
    ? null
    : await tx.v1TournamentRegistration.findFirst({
        where: { id: input.registrationId, tournamentId: leagueId, status: 'confirmed' },
        select: { teamId: true, team: { select: { name: true } } },
      });
  if (input.registrationId !== null && registration === null) {
    throw new BadRequestException({ code: 'REGISTRATION_INVALID', message: '대진 등록이 해당 리그에 없거나 확정되지 않았어요.' });
  }

  const isHome = input.side === 'HOME';
  const previousTeamId = isHome ? teamMatch.hostTeamId : teamMatch.approvedApplicantTeamId;
  const otherTeamId = isHome ? teamMatch.approvedApplicantTeamId : teamMatch.hostTeamId;
  const nextTeamId = registration?.teamId ?? null;
  if (nextTeamId !== null && nextTeamId === otherTeamId) {
    throw new BadRequestException({ code: 'FIXTURE_SAME_TEAM', message: '같은 팀끼리 경기를 만들 수 없어요.' });
  }
  if (nextTeamId === previousTeamId) return;
  if (game.state !== 'SCHEDULED' || game.currentOfficialRevisionId !== null) {
    throw new ConflictException({
      code: 'FIXTURE_HAS_RESULT',
      message: '진행 중이거나 결과가 확정된 경기는 팀을 바꿀 수 없어요. 결과를 먼저 처리해 주세요.',
    });
  }

  const nextHostTeamId = isHome ? nextTeamId : otherTeamId;
  const nextAwayTeamId = isHome ? otherTeamId : nextTeamId;
  await tx.v1TeamMatch.update({
    where: { id: teamMatch.id },
    data: { hostTeamId: nextHostTeamId, approvedApplicantTeamId: nextAwayTeamId },
  });

  const sideKey = isHome ? V1GameSideKey.HOME : V1GameSideKey.AWAY;
  const gameSide = await tx.v1GameSide.findUnique({ where: { gameId_sideKey: { gameId: game.id, sideKey } }, select: { id: true } });
  if (gameSide === null) {
    throw new ConflictException({ code: 'TOURNAMENT_MATCH_GAME_SIDE_MISSING', message: '경기의 게임 사이드를 찾을 수 없어요.' });
  }
  const newLineupId = await invalidateLineupAndTactics(tx, game.id, gameSide.id);
  await tx.v1GameSide.update({
    where: { id: gameSide.id },
    data: { teamId: nextTeamId, displayNameSnapshot: registration?.team.name ?? UNDECIDED_SIDE_NAME[input.side] },
  });
  await revokeReplacedSideTeamAdjustments(tx, { gameId: game.id, sideId: gameSide.id });
  await tx.v1Game.update({ where: { id: game.id }, data: { version: { increment: 1 } } });

  if (nextHostTeamId !== null && nextAwayTeamId !== null && startAt !== null) {
    await upsertSchedule(tx, nextHostTeamId, teamMatch.id, teamMatch.title, startAt, teamMatch.endAt);
    await upsertSchedule(tx, nextAwayTeamId, teamMatch.id, teamMatch.title, startAt, teamMatch.endAt);
    await tx.v1TeamSchedule.updateMany({
      where: { teamMatchId: teamMatch.id, teamId: { notIn: [nextHostTeamId, nextAwayTeamId] }, state: 'SCHEDULED' },
      data: { state: 'CANCELLED', cancelReason: TEAM_CHANGED_CANCEL_REASON, version: { increment: 1 } },
    });
  } else {
    // 반쪽 경기는 공개 게이트로 숨겨지므로 팀 일정도 남기지 않는다(일정 링크가 404 가 된다).
    await cascadeCancelTeamMatchSchedulesInTx(tx, teamMatch.id, SIDE_INCOMPLETE_CANCEL_REASON);
  }

  if (!isHome) {
    // `(teamMatchId, applicantTeamId)` 유일 제약 — 지우고 다시 만들지 않고 되살린다.
    if (previousTeamId !== null) {
      await tx.v1TeamMatchApplication.updateMany({
        where: { teamMatchId: teamMatch.id, applicantTeamId: previousTeamId, status: 'approved' },
        data: { status: 'withdrawn', withdrawnAt: new Date() },
      });
    }
    if (nextTeamId !== null) {
      const now = new Date();
      await tx.v1TeamMatchApplication.upsert({
        where: { teamMatchId_applicantTeamId: { teamMatchId: teamMatch.id, applicantTeamId: nextTeamId } },
        create: {
          teamMatchId: teamMatch.id,
          applicantTeamId: nextTeamId,
          appliedByUserId: admin.userId,
          status: 'approved',
          reviewedByUserId: admin.userId,
          reviewedAt: now,
          message: LEAGUE_APPLICATION_MESSAGE,
        },
        update: { status: 'approved', reviewedByUserId: admin.userId, reviewedAt: now, withdrawnAt: null },
      });
    }
  }

  // 새 팀의 명단은 방금 만든 빈 리비전 위에 후속 이벤트가 채운다(대회 쪽과 같은 조건).
  const resync: RosterResyncTarget[] = competitionTeamTargets(leagueId, [previousTeamId, nextTeamId, otherTeamId]);
  if (newLineupId !== null && nextTeamId !== null) resync.push({ scope: 'game', gameId: game.id });
  await enqueueRosterResync(tx, resync);
}
