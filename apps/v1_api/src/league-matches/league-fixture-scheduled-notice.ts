import { withWaGwa } from '../common/korean-josa';
import { formatKstMonthDayTime } from '../common/kst-datetime';
import type { PrismaService } from '../prisma/prisma.service';

/** 대진 확정 알림에서 선수에게 알릴 "첫 경기" 하나. */
export interface FirstGame {
  startAt: Date;
  opponentName: string;
}

export interface ScheduledFixtureRow {
  startAt: Date | null;
  hostTeamId: string | null;
  hostTeam: { name: string } | null;
  approvedApplicantTeamId: string | null;
  approvedApplicantTeam: { name: string } | null;
}

/** 팀마다 가장 이른 대진. 시각이 아직 없는 대진은 알릴 일정이 없으므로 건너뛴다. */
export function firstGameByTeam(fixtures: readonly ScheduledFixtureRow[]): Map<string, FirstGame> {
  const firstByTeam = new Map<string, FirstGame>();
  for (const fixture of fixtures) {
    if (fixture.startAt === null) continue;
    const sides = [
      { teamId: fixture.hostTeamId, opponent: fixture.approvedApplicantTeam },
      { teamId: fixture.approvedApplicantTeamId, opponent: fixture.hostTeam },
    ];
    for (const { teamId, opponent } of sides) {
      if (teamId === null || opponent === null) continue;
      const current = firstByTeam.get(teamId);
      if (current === undefined || fixture.startAt < current.startAt) {
        firstByTeam.set(teamId, { startAt: fixture.startAt, opponentName: opponent.name });
      }
    }
  }
  return firstByTeam;
}

export function firstGameNoticeBody(leagueTitle: string, game: FirstGame): string {
  return `"${leagueTitle}" 첫 경기는 ${formatKstMonthDayTime(game.startAt)}, ${withWaGwa(game.opponentName)} 해요.`;
}

/**
 * 팀별로 "첫 경기" 알림을 받을 선수 — 시즌 참가 명단(확정된 신청의 활성 선수) 중 지금도 그 팀의 활성
 * 멤버인 사람. 팀장·매니저는 대진 확정 알림을 이미 받으므로 뺀다(한 사람에게 한 건).
 */
export function playerRecipientsByTeam(input: {
  registrations: ReadonlyArray<{ teamId: string; players: ReadonlyArray<{ userId: string }> }>;
  memberships: ReadonlyArray<{ teamId: string; userId: string; role: string }>;
}): Map<string, string[]> {
  const plainMemberKeys = new Set(
    input.memberships
      .filter((membership) => membership.role !== 'owner' && membership.role !== 'manager')
      .map((membership) => `${membership.teamId}:${membership.userId}`),
  );
  const recipients = new Map<string, string[]>();
  for (const registration of input.registrations) {
    const userIds = registration.players
      .map((player) => player.userId)
      .filter((userId) => plainMemberKeys.has(`${registration.teamId}:${userId}`));
    if (userIds.length === 0) continue;
    recipients.set(registration.teamId, [...new Set([...(recipients.get(registration.teamId) ?? []), ...userIds])]);
  }
  return recipients;
}

export interface FirstGamePlayerNotice {
  teamId: string;
  userIds: string[];
  body: string;
}

type NoticeDb = Pick<PrismaService, 'v1TeamMatch' | 'v1TournamentRegistration' | 'v1TeamMembership'>;

/**
 * 방금 만든 대진(`fixtureIds`)에서 팀별 첫 경기를 구하고, 그 팀의 시즌 참가 명단 선수에게 보낼 알림을 만든다.
 * 발송 시점의 명단을 읽는다 — 대진 확정 뒤에 명단에서 빠졌거나 팀을 나간 사람은 대상이 아니다.
 */
export async function loadFirstGamePlayerNotices(
  db: NoticeDb,
  input: { leagueId: string; leagueTitle: string; fixtureIds: readonly string[] },
): Promise<FirstGamePlayerNotice[]> {
  const fixtures = await db.v1TeamMatch.findMany({
    where: { id: { in: [...input.fixtureIds] }, deletedAt: null },
    select: {
      startAt: true,
      hostTeamId: true,
      hostTeam: { select: { name: true } },
      approvedApplicantTeamId: true,
      approvedApplicantTeam: { select: { name: true } },
    },
  });
  const firstGames = firstGameByTeam(fixtures);
  const teamIds = [...firstGames.keys()];
  if (teamIds.length === 0) return [];

  const [registrations, memberships] = await Promise.all([
    db.v1TournamentRegistration.findMany({
      where: { tournamentId: input.leagueId, teamId: { in: teamIds }, status: 'confirmed' },
      select: { teamId: true, players: { where: { removedAt: null }, select: { userId: true } } },
    }),
    db.v1TeamMembership.findMany({
      where: { teamId: { in: teamIds }, status: 'active' },
      select: { teamId: true, userId: true, role: true },
    }),
  ]);
  const recipientsByTeam = playerRecipientsByTeam({ registrations, memberships });

  const notices: FirstGamePlayerNotice[] = [];
  for (const [teamId, userIds] of recipientsByTeam) {
    const game = firstGames.get(teamId);
    if (game === undefined) continue;
    notices.push({ teamId, userIds, body: firstGameNoticeBody(input.leagueTitle, game) });
  }
  return notices;
}
