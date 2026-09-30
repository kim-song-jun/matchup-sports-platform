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
    teamMatchId: 'tm-1',
    tournamentTeamMatchId: null,
    leagueId: null,
    teamMatchTournamentId: null,
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
  memberships: Array<{ userId: string; teamId: string }>;
  preferences: Array<{ userId: string; teamMatchEnabled: boolean; activityEnabled?: boolean }>;
  alreadyDelivered: string[];
  /**
   * 사이드별 최신 라인업에 실린 계정 연결 참가자 userId. 지정하지 않으면 게임에 라인업 행이 없다.
   * 빈 배열은 참가자 없는 빈 rev1 라인업이다(게임 생성이 사이드마다 항상 만든다).
   */
  lineups?: { home: string[]; away: string[] };
}) {
  const sides = [{ id: 'side-home', teamId: 'team-home' }, { id: 'side-away', teamId: 'team-away' }];
  const lineupRows = options.lineups ? sides.map((side) => ({ id: `lineup-${side.id}`, sideId: side.id })) : [];
  const participantRows = lineupRows.flatMap((lineup) =>
    (lineup.sideId === 'side-home' ? options.lineups?.home : options.lineups?.away)?.map((userId) => ({
      id: `participant-${lineup.sideId}-${userId}`,
      gameId: 'game-1',
      sideId: lineup.sideId,
      lineupId: lineup.id,
      userId,
      displayNameSnapshot: userId,
    })) ?? [],
  );
  const createMany = jest.fn().mockResolvedValue({ count: 0 });
  const tx = {
    v1Game: {
      findUnique: jest.fn().mockResolvedValue(
        options.teamMatch === null
          ? { teamMatchId: null, teamMatch: null }
          : { teamMatchId: options.teamMatch.id, teamMatch: options.teamMatch },
      ),
      findMany: jest.fn().mockResolvedValue(
        options.lineups && options.teamMatch
          ? [{ id: 'game-1', teamMatchId: options.teamMatch.id, sides }]
          : [],
      ),
    },
    v1GameLineup: { findMany: jest.fn().mockResolvedValue(lineupRows) },
    v1GameParticipant: {
      findMany: jest.fn(async ({ where }: { where: { lineupId: { in: string[] } } }) =>
        participantRows.filter((row) => where.lineupId.in.includes(row.lineupId))),
    },
    v1ParticipantIdentityLinkCurrent: {
      findMany: jest.fn().mockResolvedValue(participantRows.map((row) => ({ participantId: row.id, userId: row.userId }))),
    },
    v1ParticipantIdentityLinkEvent: { findMany: jest.fn().mockResolvedValue([]) },
    v1TeamMembership: {
      findMany: jest.fn().mockResolvedValue(options.memberships),
    },
    v1NotificationPreference: {
      findMany: jest.fn().mockResolvedValue(options.preferences),
    },
    v1Tournament: {
      findUnique: jest.fn().mockResolvedValue({ title: '테스트 대회' }),
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
      memberships: [{ userId: 'user-owner', teamId: 'team-home' }],
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
      memberships: [{ userId: 'user-host-owner', teamId: 'team-home' }, { userId: 'user-away-manager', teamId: 'team-away' }, { userId: 'user-opted-out', teamId: 'team-away' }],
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

  // 알림은 후기 작성 화면(/my/reviews/team_match/:id)으로 간다 — 후기 작성 자격(F88)과 같은 판정으로
  // 수신자를 걸러야 명단 밖 팀장·매니저가 누르고 403 을 만나지 않는다. 대조군을 한 fixture 에 함께 둔다.
  it('일반 팀매치 알림은 명단 안 팀장과 명단 없는 사이드 팀장에게만 가고, 명단 밖 팀장에게는 가지 않는다', async () => {
    const { tx, createMany } = fakeTx({
      teamMatch: { id: 'tm-1', title: '테스트 팀매치', hostTeamId: 'team-home', approvedApplicantTeamId: 'team-away', leagueId: null },
      memberships: [
        { userId: 'user-host-in', teamId: 'team-home' },
        { userId: 'user-host-out', teamId: 'team-home' },
        { userId: 'user-away-leader', teamId: 'team-away' },
      ],
      preferences: [],
      alreadyDelivered: [],
      // 홈은 계정 연결 참가자가 있는 명단, 원정은 참가자 없는 빈 rev1 라인업(명단 없음과 같다).
      lineups: { home: ['user-host-in'], away: [] },
    });
    const service = new TeamMatchCompletionNotificationService();

    await service.project(tx, revisionFixture());

    const data = createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(data.map((row) => row.recipientUserId).sort()).toEqual(['user-away-leader', 'user-host-in']);
  });

  describe('리그 결과 확정 (Task 180 G7)', () => {
    /** 리그 경로가 읽는 표면만 흉내낸다 — 양 팀 멤버십(역할 포함), 공식 결과 참가자 행, 형제 대진 시각. */
    function fakeLeagueTx(options: {
      members: Array<{ userId: string; teamId: string; role: string }>;
      resultRows: Array<{ participantId: string; sideId: string; userId: string | null; goals: number; assists: number }>;
      preferences?: Array<{ userId: string; teamMatchEnabled: boolean }>;
    }) {
      const createMany = jest.fn().mockResolvedValue({ count: 0 });
      const tx = {
        v1Game: {
          findUnique: jest.fn().mockResolvedValue({
            teamMatchId: 'tm-league-1',
            teamMatch: {
              title: '가을 리그 2주차 1경기',
              hostTeamId: 'team-home',
              approvedApplicantTeamId: 'team-away',
              leagueId: 'league-1',
              startAt: new Date('2026-09-12T10:00:00Z'),
              league: { title: '가을 리그' },
            },
          }),
        },
        v1TeamMembership: { findMany: jest.fn().mockResolvedValue(options.members) },
        v1GameSide: { findMany: jest.fn().mockResolvedValue([{ id: 'side-home', teamId: 'team-home' }, { id: 'side-away', teamId: 'team-away' }]) },
        v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue(options.resultRows) },
        v1GameParticipant: {
          findMany: jest.fn().mockResolvedValue(
            options.resultRows.map((row) => ({ id: row.participantId, sideId: row.sideId, userId: row.userId, displayNameSnapshot: row.participantId })),
          ),
        },
        v1ParticipantIdentityLinkCurrent: { findMany: jest.fn().mockResolvedValue([]) },
        v1ParticipantIdentityLinkEvent: { findMany: jest.fn().mockResolvedValue([]) },
        v1Team: { findMany: jest.fn().mockResolvedValue([{ id: 'team-home', name: '성수 FC' }, { id: 'team-away', name: '망원 FC' }]) },
        // 경기일 두 날 중 두 번째 — "2주차"(저장된 제목의 주차가 아니라 경기일 순번).
        v1TeamMatch: { findMany: jest.fn().mockResolvedValue([{ startAt: new Date('2026-09-05T10:00:00Z') }, { startAt: new Date('2026-09-12T10:00:00Z') }]) },
        v1NotificationPreference: { findMany: jest.fn().mockResolvedValue(options.preferences ?? []) },
        v1Notification: { findMany: jest.fn().mockResolvedValue([]), createMany },
      };
      return { tx: tx as never, createMany };
    }
    const leagueRevision = () => revisionFixture({ teamMatchId: 'tm-league-1', leagueId: 'league-1', score: { home: 2, away: 1 } });
    const members = [
      { userId: 'home-owner', teamId: 'team-home', role: 'owner' }, // 출전하지 않은 팀장
      { userId: 'home-scorer', teamId: 'team-home', role: 'member' },
      { userId: 'home-dropped', teamId: 'team-home', role: 'member' }, // 명단에서 빠져 결과 행이 없다
      { userId: 'away-manager', teamId: 'team-away', role: 'manager' }, // 출전한 매니저
      { userId: 'away-bench', teamId: 'team-away', role: 'member' }, // 출전하지 않은 팀원
    ];
    const resultRows = [
      { participantId: 'p-scorer', sideId: 'side-home', userId: 'home-scorer', goals: 1, assists: 1 },
      { participantId: 'p-left', sideId: 'side-home', userId: 'home-left', goals: 1, assists: 0 }, // 그 뒤 팀을 나갔다
      { participantId: 'p-guest', sideId: 'side-home', userId: null, goals: 0, assists: 0 }, // 계정 없는 참가자
      { participantId: 'p-manager', sideId: 'side-away', userId: 'away-manager', goals: 0, assists: 0 },
    ];

    it('팀장·매니저와 공식 결과의 출전자가 받고, 빠진 선수·팀 나간 출전자·출전 안 한 팀원은 받지 않는다', async () => {
      const { tx, createMany } = fakeLeagueTx({ members, resultRows });
      const webPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };
      await new TeamMatchCompletionNotificationService(webPush as never).project(tx, leagueRevision());

      const data = createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
      expect(data.map((row) => [row.recipientUserId, row.body])).toEqual([
        ['home-scorer', '가을 리그 2주차 · 성수 FC 2 : 1 망원 FC · 승리. 내 기록 1골 1도움이에요.'],
        ['home-owner', '가을 리그 2주차 · 성수 FC 2 : 1 망원 FC · 승리.'],
        ['away-manager', '가을 리그 2주차 · 성수 FC 2 : 1 망원 FC · 패배.'],
      ]);
      expect(data[0]).toMatchObject({
        title: '경기 결과가 확정됐어요',
        deepLink: '/team-matches/tm-league-1/result',
        // businessKey 네임스페이스는 일반 팀매치와 같다 — 정정 리비전이 다시 확정돼도 재알림하지 않는다.
        businessKey: 'team-match-completed:tm-league-1:home-scorer',
      });
      expect(data.some((row) => String(row.body).includes('문의'))).toBe(false);
      expect(webPush.sendToUser).toHaveBeenCalledWith('away-manager', expect.objectContaining({ title: '경기 결과가 확정됐어요' }));
    });

    it('경기·대회 알림(teamMatchEnabled)을 끈 출전자는 받지 않는다', async () => {
      const { tx, createMany } = fakeLeagueTx({ members, resultRows, preferences: [{ userId: 'home-scorer', teamMatchEnabled: false }] });
      await new TeamMatchCompletionNotificationService().project(tx, leagueRevision());

      const recipients = (createMany.mock.calls[0][0].data as Array<{ recipientUserId: string }>).map((row) => row.recipientUserId);
      expect(recipients).toEqual(['home-owner', 'away-manager']);
    });
  });

  it('canonical tournament TeamMatch is left to the tournament notification lane', async () => {
    const { tx, createMany } = fakeTx({
      teamMatch: { id: 'tm-tournament-1', title: '결승', hostTeamId: 'team-home', approvedApplicantTeamId: 'team-away', leagueId: null },
      memberships: [{ userId: 'user-host-owner', teamId: 'team-home' }],
      preferences: [{ userId: 'user-host-owner', teamMatchEnabled: false, activityEnabled: true }],
      alreadyDelivered: [],
    });
    const service = new TeamMatchCompletionNotificationService();
    await service.project(tx, revisionFixture({ gameId: 'game-1', tournamentTeamMatchId: 'tm-tournament-1', teamMatchTournamentId: 'tour-1', leagueId: null }));
    expect(createMany).not.toHaveBeenCalled();
  });

  it('does not re-push to a recipient whose businessKey was already delivered (correction re-officialize)', async () => {
    const { tx, createMany } = fakeTx({
      teamMatch: { id: 'tm-1', title: '테스트 팀매치', hostTeamId: 'team-home', approvedApplicantTeamId: 'team-away', leagueId: null },
      memberships: [{ userId: 'user-host-owner', teamId: 'team-home' }],
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
      memberships: [{ userId: 'user-host-owner', teamId: 'team-home' }],
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
