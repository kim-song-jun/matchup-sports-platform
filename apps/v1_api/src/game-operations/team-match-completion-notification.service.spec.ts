import { TeamMatchCompletionNotificationService } from './team-match-completion-notification.service';
import type { OfficialRevisionRow } from './game-result-official-projection.types';

function revisionFixture(overrides: Partial<OfficialRevisionRow> = {}): OfficialRevisionRow {
  return {
    revisionId: 'revision-1',
    gameId: 'game-1',
    revision: 1,
    score: { home: 3, away: 1 },
    sourceHash: 'hash',
    playedAt: new Date('2026-08-01T00:00:00Z'),
    officialAt: new Date('2026-08-01T00:00:00Z'),
    reason: null,
    sourceType: 'TEAM_MATCH',
    currentOfficialRevisionId: 'revision-1',
    tournamentId: null,
    tournamentFixtureId: null,
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    visibility: 'PUBLIC' as never,
    ...overrides,
  };
}

/** Minimal fake of the Prisma.TransactionClient surface this service touches. */
function fakeTx(options: {
  teamMatch: {
    id: string;
    title: string;
    hostTeamId: string;
    approvedApplicantTeamId: string | null;
    leagueId: string | null;
  } | null;
  memberships: Array<{ userId: string }>;
  preferences: Array<{ userId: string; teamMatchEnabled: boolean }>;
  alreadyDelivered: string[];
}) {
  const createMany = jest.fn().mockResolvedValue({ count: 0 });
  const tx = {
    v1Game: {
      findUnique: jest.fn().mockResolvedValue(
        options.teamMatch === null
          ? { teamMatchId: null, teamMatch: null }
          : { teamMatchId: options.teamMatch.id, teamMatch: options.teamMatch },
      ),
    },
    v1TeamMembership: {
      findMany: jest.fn().mockResolvedValue(options.memberships),
    },
    v1NotificationPreference: {
      findMany: jest.fn().mockResolvedValue(options.preferences),
    },
    v1Notification: {
      findMany: jest
        .fn()
        .mockResolvedValue(options.alreadyDelivered.map((businessKey) => ({ businessKey }))),
      createMany,
    },
  };
  return { tx: tx as never, createMany };
}

describe('TeamMatchCompletionNotificationService', () => {
  it('is a no-op for tournament fixtures (sourceType !== TEAM_MATCH)', async () => {
    const { tx, createMany } = fakeTx({
      teamMatch: { id: 'tm-1', title: '테스트 팀매치', hostTeamId: 'team-home', approvedApplicantTeamId: 'team-away', leagueId: null },
      memberships: [{ userId: 'user-owner' }],
      preferences: [],
      alreadyDelivered: [],
    });
    const service = new TeamMatchCompletionNotificationService();

    await service.project(tx, revisionFixture({ sourceType: 'TOURNAMENT_FIXTURE' }));

    expect((tx as { v1Game: { findUnique: jest.Mock } }).v1Game.findUnique).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('creates a durable notification per active owner/manager of both teams, gated by teamMatchEnabled', async () => {
    const { tx, createMany } = fakeTx({
      teamMatch: { id: 'tm-1', title: '테스트 팀매치', hostTeamId: 'team-home', approvedApplicantTeamId: 'team-away', leagueId: null },
      memberships: [{ userId: 'user-host-owner' }, { userId: 'user-away-manager' }, { userId: 'user-opted-out' }],
      preferences: [{ userId: 'user-opted-out', teamMatchEnabled: false }],
      alreadyDelivered: [],
    });
    const webPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    const service = new TeamMatchCompletionNotificationService(webPush as never);

    await service.project(tx, revisionFixture());

    expect(createMany).toHaveBeenCalledTimes(1);
    const data = createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    const recipientIds = data.map((row) => row.recipientUserId).sort();
    // user-opted-out has teamMatchEnabled=false and must be excluded entirely.
    expect(recipientIds).toEqual(['user-away-manager', 'user-host-owner']);
    for (const row of data) {
      expect(row.targetType).toBe('team_match');
      expect(row.targetId).toBe('tm-1');
      expect(row.deepLink).toBe('/my/reviews/team_match/tm-1');
      expect(row.body).toBe('"테스트 팀매치" 팀매치 리뷰를 남겨보세요.');
      expect(row.businessKey).toBe(`team-match-completed:tm-1:${row.recipientUserId}`);
    }

    expect(webPush.sendToUser).toHaveBeenCalledTimes(2);
    expect(webPush.sendToUser).toHaveBeenCalledWith(
      'user-host-owner',
      expect.objectContaining({ url: '/my/reviews/team_match/tm-1' }),
    );
  });

  it('리그 대진(leagueId 있음)은 결과 영수증 화면으로 가는 리그 전용 문구를 쓴다', async () => {
    const { tx, createMany } = fakeTx({
      teamMatch: {
        id: 'tm-league-1',
        title: '리그 3주차 A vs B',
        hostTeamId: 'team-home',
        approvedApplicantTeamId: 'team-away',
        leagueId: 'league-1',
      },
      memberships: [{ userId: 'user-host-owner' }],
      preferences: [],
      alreadyDelivered: [],
    });
    const webPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    const service = new TeamMatchCompletionNotificationService(webPush as never);

    await service.project(tx, revisionFixture());

    expect(createMany).toHaveBeenCalledTimes(1);
    const data = createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('리그 경기 결과가 확정됐어요');
    expect(data[0].body).toBe('"리그 3주차 A vs B" 경기 결과가 확정됐어요. 7일 안에 이의를 제기할 수 있어요.');
    expect(data[0].deepLink).toBe('/team-matches/tm-league-1/result');
    // businessKey 네임스페이스는 일반 팀매치와 동일 — 팀매치 하나는 생애주기 내내
    // 리그 아니면 일반 중 하나로 고정이라 나눌 이유가 없다.
    expect(data[0].businessKey).toBe('team-match-completed:tm-league-1:user-host-owner');

    expect(webPush.sendToUser).toHaveBeenCalledWith(
      'user-host-owner',
      expect.objectContaining({ title: '리그 경기 결과가 확정됐어요', url: '/team-matches/tm-league-1/result' }),
    );
  });

  it('does not re-push to a recipient whose businessKey was already delivered (correction re-officialize)', async () => {
    const { tx, createMany } = fakeTx({
      teamMatch: { id: 'tm-1', title: '테스트 팀매치', hostTeamId: 'team-home', approvedApplicantTeamId: 'team-away', leagueId: null },
      memberships: [{ userId: 'user-host-owner' }],
      preferences: [],
      alreadyDelivered: ['team-match-completed:tm-1:user-host-owner'],
    });
    const webPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    const service = new TeamMatchCompletionNotificationService(webPush as never);

    await service.project(tx, revisionFixture());

    // createMany is still called (skipDuplicates absorbs the collision at the DB level),
    // but Web Push must not fire again for an already-delivered recipient.
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(webPush.sendToUser).not.toHaveBeenCalled();
  });

  it('is a no-op when the game has no attached team match', async () => {
    const { tx, createMany } = fakeTx({
      teamMatch: null,
      memberships: [],
      preferences: [],
      alreadyDelivered: [],
    });
    const service = new TeamMatchCompletionNotificationService();

    await service.project(tx, revisionFixture());

    expect(createMany).not.toHaveBeenCalled();
  });
});
