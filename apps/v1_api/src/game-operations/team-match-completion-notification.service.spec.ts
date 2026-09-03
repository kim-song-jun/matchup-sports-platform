import { TeamMatchCompletionNotificationService } from './team-match-completion-notification.service';
import { notificationCopyFor } from '../notifications/notifications.service';
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
    // body 는 **문구 테이블의 `defaultBody` 를 단일 소스로** 조합한다. 여기에 문자열을
    // 복사해 두면 테이블만 고쳤을 때 이 스펙이 그 드리프트를 놓친다 — 실제로 Task 166 이
    // 테이블에 "문의는 리그 운영자에게" 를 넣었는데 발송 경로엔 빠져 두 문구가 어긋났고,
    // 그때 이 스펙은 통과했다(Copilot 리뷰). 이제 같은 소스를 읽어 비교한다.
    const leagueCopy = notificationCopyFor('league_team_match_completed', 'team_match', 'tm-league-1');
    expect(data[0].body).toBe(`"리그 3주차 A vs B" ${leagueCopy.defaultBody}`);
    // 그 문구가 이의 안내를 다시 들이지 않았는지는 값으로 따로 본다(정본 §4).
    expect(leagueCopy.defaultBody).not.toContain('이의');
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

  // 2026-08-27 감사 41/44: outbox 트랜잭션이 롤백되면 이미 나간 웹 푸시는 되돌릴 수
  // 없다 — claim.afterCommit이 있으면 project()가 그 안에 push만 하고 커밋 전에는
  // 절대 sendToUser를 직접 부르지 않아야 한다.
  it('claim.afterCommit이 주어지면 push를 즉시 보내지 않고 커밋 후 실행할 effect로만 담는다', async () => {
    const { tx } = fakeTx({
      teamMatch: { id: 'tm-1', title: '테스트 팀매치', hostTeamId: 'team-home', approvedApplicantTeamId: 'team-away', leagueId: null },
      memberships: [{ userId: 'user-host-owner' }],
      preferences: [],
      alreadyDelivered: [],
    });
    const webPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    const service = new TeamMatchCompletionNotificationService(webPush as never);
    const afterCommit: Array<() => void | Promise<void>> = [];
    const claim = { afterCommit } as never;

    await service.project(tx, revisionFixture(), claim);

    // 트랜잭션이 아직 안 끝났으니(테스트에서는 project()가 반환된 시점) 푸시가
    // 나가면 안 된다 — 워커가 커밋 확정 후 afterCommit을 실행하기 전이다.
    expect(webPush.sendToUser).not.toHaveBeenCalled();
    expect(afterCommit).toHaveLength(1);

    // 워커가 커밋 확정 뒤 afterCommit을 실행하는 시점을 흉내낸다.
    await afterCommit[0]();
    expect(webPush.sendToUser).toHaveBeenCalledWith(
      'user-host-owner',
      expect.objectContaining({ url: '/my/reviews/team_match/tm-1' }),
    );
  });
});
