import { ConflictException } from '@nestjs/common';
import { Prisma, V1GameSideKey } from '@prisma/client';
import { createSourceRosterIdentityLinks } from '../games/games.service';

/**
 * 모집 시점에 만들어 둔 teamId 없는 AWAY side를 승인된 팀으로 채우고, 생성 시점의
 * revision-1 명단 스냅샷과 계정 연결을 함께 만든다. 일반 모집과 플랫폼 모집이 같은
 * Game aggregate 규칙을 사용하도록 transaction-only 함수로 공유한다.
 */
export async function hydrateApprovedTeamMatchAwaySnapshot(
  tx: Prisma.TransactionClient,
  teamMatchId: string,
  awayTeamId: string,
): Promise<void> {
  const [game, awayTeam] = await Promise.all([
    tx.v1Game.findUnique({
      where: { teamMatchId },
      include: {
        sides: true,
        lineups: { where: { revision: 1 } },
      },
    }),
    tx.v1Team.findFirst({
      where: { id: awayTeamId, status: 'active', deletedAt: null },
      select: {
        id: true,
        name: true,
        memberships: {
          where: { status: 'active' },
          orderBy: { id: 'asc' },
          select: {
            userId: true,
            user: {
              select: {
                profile: { select: { nickname: true, displayName: true } },
              },
            },
          },
        },
      },
    }),
  ]);
  if (game === null || awayTeam === null) {
    throw new ConflictException({
      code: 'TEAM_MATCH_GAME_REQUIRED',
      message: 'Approved TeamMatch requires its atomically created Game',
    });
  }
  const awaySide = game.sides.find((side) => side.sideKey === V1GameSideKey.AWAY);
  const awayLineup = game.lineups.find((lineup) => lineup.sideId === awaySide?.id);
  if (awaySide === undefined || awayLineup === undefined) {
    throw new ConflictException({
      code: 'TEAM_MATCH_GAME_REQUIRED',
      message: 'Approved TeamMatch requires an AWAY side and lineup',
    });
  }
  if (awaySide.teamId !== null && awaySide.teamId !== awayTeam.id) {
    throw new ConflictException({
      code: 'TEAM_MATCH_GAME_REQUIRED',
      message: 'The AWAY side is already pinned to another team',
    });
  }
  await tx.v1GameSide.update({
    where: { id: awaySide.id },
    data: { teamId: awayTeam.id, displayNameSnapshot: awayTeam.name },
  });
  const createdParticipants = await tx.v1GameParticipant.createManyAndReturn({
    data: awayTeam.memberships.map((membership) => ({
      gameId: game.id,
      sideId: awaySide.id,
      lineupId: awayLineup.id,
      userId: membership.userId,
      displayNameSnapshot:
        membership.user.profile?.nickname ??
        membership.user.profile?.displayName ??
        '팀원',
    })),
    select: { id: true, userId: true },
  });
  await createSourceRosterIdentityLinks(
    tx,
    createdParticipants
      .filter((participant): participant is { id: string; userId: string } => participant.userId !== null)
      .map((participant) => ({ participantId: participant.id, userId: participant.userId })),
    { actorType: 'SYSTEM', systemActor: 'TEAM_MATCH_AWAY_ROSTER_SYNC' },
    'team_match_away_approval_snapshot',
  );
}
