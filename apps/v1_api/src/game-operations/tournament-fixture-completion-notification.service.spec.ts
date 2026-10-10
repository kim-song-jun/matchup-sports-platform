import { TournamentFixtureCompletionNotificationService } from './tournament-fixture-completion-notification.service';
import type { OfficialRevisionRow } from './game-result-official-projection.types';

function revisionFixture(overrides: Partial<OfficialRevisionRow> = {}): OfficialRevisionRow {
  return {
    revisionId: 'revision-1',
    gameId: 'game-1',
    revision: 1,
    score: { home: 2, away: 1 },
    sourceHash: 'hash',
    playedAt: new Date('2026-08-01T00:00:00Z'),
    officialAt: new Date('2026-08-01T00:00:00Z'),
    reason: null,
    sourceType: 'TEAM_MATCH',
    currentOfficialRevisionId: 'revision-1',
    tournamentId: 'tour-1',
    teamMatchId: 'fixture-1',
    tournamentTeamMatchId: 'fixture-1',
    leagueId: null,
    teamMatchTournamentId: 'tour-1',
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    visibility: 'LIVE',
    ...overrides,
  };
}

/** Minimal fake of the Prisma.TransactionClient surface this service touches. */
function fakeTx(options: {
  /** 팀을 적지 않으면 홈팀 팀장이다. */
  memberships: Array<{ userId: string; teamId?: string; role?: string }>;
  preferences: Array<{ userId: string; activityEnabled: boolean }>;
  alreadyDelivered: string[];
  /** 공식 결과 참가자(출전자). */
  resultRows?: Array<{ participantId: string; sideId: string; userId: string; goals: number; assists: number }>;
  details?: { round: string; legNumber: number; group: { name: string } | null };
  /** 이 경기에 이번 리비전보다 먼저 공식 확정된 리비전이 있는가(= 이번 확정은 정정). */
  earlierOfficialRevision?: boolean;
}) {
  const createMany = jest.fn().mockResolvedValue({ count: 0 });
  const resultRows = options.resultRows ?? [];
  const tx = {
    v1TeamMembership: {
      findMany: jest.fn().mockResolvedValue(
        options.memberships.map((m) => ({ userId: m.userId, teamId: m.teamId ?? 'team-home', role: m.role ?? 'owner' })),
      ),
    },
    v1GameSide: { findMany: jest.fn().mockResolvedValue([{ id: 'side-home', teamId: 'team-home' }, { id: 'side-away', teamId: 'team-away' }]) },
    v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue(resultRows) },
    v1GameParticipant: {
      findMany: jest.fn().mockResolvedValue(resultRows.map((row) => ({ id: row.participantId, sideId: row.sideId, userId: row.userId, displayNameSnapshot: row.userId }))),
    },
    v1ParticipantIdentityLinkCurrent: { findMany: jest.fn().mockResolvedValue([]) },
    v1ParticipantIdentityLinkEvent: { findMany: jest.fn().mockResolvedValue([]) },
    v1TournamentMatchDetails: {
      findUnique: jest.fn().mockResolvedValue(options.details ?? { round: 'final', legNumber: 1, group: null }),
    },
    v1GameResultRevision: {
      findFirst: jest.fn().mockResolvedValue(options.earlierOfficialRevision ? { id: 'revision-1' } : null),
    },
    v1NotificationPreference: {
      findMany: jest.fn().mockResolvedValue(options.preferences),
    },
    v1Tournament: {
      findFirst: jest.fn().mockResolvedValue({ title: '테스트 대회' }),
    },
    v1Team: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'team-home', name: '홈팀FC' },
        { id: 'team-away', name: '원정팀FC' },
      ]),
    },
    v1Notification: {
      findMany: jest
        .fn()
        .mockResolvedValue(options.alreadyDelivered.map((businessKey) => ({ businessKey }))),
      createMany,
    },
  };
  return { tx: tx as never, createMany, findEarlierOfficial: tx.v1GameResultRevision.findFirst };
}

describe('TournamentFixtureCompletionNotificationService', () => {
  it('does not deliver tournament notifications for retired source types', async () => {
    const { tx, createMany } = fakeTx({
      memberships: [{ userId: 'user-1' }],
      preferences: [],
      alreadyDelivered: [],
    });
    // sourceType만 바꾼다 — tournamentId/fixtureId를 함께 null로 만들면 소스타입
    // 가드가 제거돼도 다음 가드가 대신 통과시켜 테스트가 무력화된다(Copilot 지적).
    await new TournamentFixtureCompletionNotificationService().project(
      tx,
      revisionFixture({ sourceType: 'TOURNAMENT_FIXTURE' }),
    );
    expect(createMany).not.toHaveBeenCalled();
  });

  it('notifies both teams\' owner/manager with the scoreline and the public match deep link', async () => {
    const { tx, createMany } = fakeTx({
      memberships: [{ userId: 'captain-home' }, { userId: 'captain-away', teamId: 'team-away' }],
      preferences: [],
      alreadyDelivered: [],
    });
    await new TournamentFixtureCompletionNotificationService().project(tx, revisionFixture());
    expect(createMany).toHaveBeenCalledTimes(1);
    const rows = createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows.map((row: { recipientUserId: string }) => row.recipientUserId).sort()).toEqual([
      'captain-away',
      'captain-home',
    ]);
    // 배열 순서(멤버십 findMany 결과 순서)에 의존하지 않고 해당 수신자 row를 찾아
    // 검증한다(Copilot 지적 — DB findMany는 정렬을 보장하지 않는다).
    const homeRow = rows.find(
      (row: { recipientUserId: string }) => row.recipientUserId === 'captain-home',
    );
    expect(homeRow).toMatchObject({
      title: '대회 경기 결과가 확정됐어요',
      targetType: 'tournament',
      targetId: 'tour-1:fixture-1',
      body: '테스트 대회 · 결승 · 홈팀FC 2 : 1 원정팀FC · 승리.',
      deepLink: '/tournaments/tour-1/matches/fixture-1',
      businessKey: 'tournament-fixture-completed:fixture-1:captain-home',
    });
    // 승패는 받는 사람 팀 기준이다.
    expect(rows.find((row: { recipientUserId: string }) => row.recipientUserId === 'captain-away').body).toBe(
      '테스트 대회 · 결승 · 홈팀FC 2 : 1 원정팀FC · 패배.',
    );
  });

  // W9-V2 — 알림도 화면과 같은 경기 이름("A조 · 조별리그 2라운드")을 쓴다. 예전엔 조 이름이 빠졌다.
  it('names a group-stage fixture with its group and round, as every screen does', async () => {
    const { tx, createMany } = fakeTx({
      memberships: [{ userId: 'captain-home' }],
      preferences: [],
      alreadyDelivered: [],
      details: { round: 'league_r2', legNumber: 2, group: { name: 'A조' } },
    });
    await new TournamentFixtureCompletionNotificationService().project(tx, revisionFixture());
    expect(createMany.mock.calls[0][0].data[0].body).toBe(
      '테스트 대회 · A조 · 조별리그 2라운드 · 홈팀FC 2 : 1 원정팀FC · 승리.',
    );
  });

  it('notifies a canonical tournament TeamMatch through the same tournament lane and key', async () => {
    const { tx, createMany } = fakeTx({
      memberships: [{ userId: 'captain-home' }],
      preferences: [],
      alreadyDelivered: [],
    });
    await new TournamentFixtureCompletionNotificationService().project(
      tx,
      revisionFixture({ teamMatchId: 'tm-1', tournamentTeamMatchId: 'tm-1' }),
    );
    const row = createMany.mock.calls[0][0].data[0];
    expect(row).toMatchObject({ targetType: 'tournament', targetId: 'tour-1:tm-1', deepLink: '/tournaments/tour-1/matches/tm-1', businessKey: 'tournament-fixture-completed:tm-1:captain-home' });
  });

  it('renders the penalty shoot-out score when the official score carries one', async () => {
    const { tx, createMany } = fakeTx({
      memberships: [{ userId: 'captain-home' }],
      preferences: [],
      alreadyDelivered: [],
    });
    await new TournamentFixtureCompletionNotificationService().project(
      tx,
      revisionFixture({ score: { home: 1, away: 1, penalties: { home: 4, away: 3 } } }),
    );
    const rows = createMany.mock.calls[0][0].data;
    expect(rows[0].body).toBe('테스트 대회 · 결승 · 홈팀FC 1 : 1 원정팀FC (승부차기 4 : 3) · 승리.');
  });

  it('공식 결과의 출전자도 받고, 골·도움이 있으면 내 기록을 붙인다 — 결과 행이 없는 팀원은 받지 않는다', async () => {
    const { tx, createMany } = fakeTx({
      memberships: [
        { userId: 'captain-home' },
        { userId: 'scorer-away', teamId: 'team-away', role: 'member' },
        { userId: 'dropped-away', teamId: 'team-away', role: 'member' },
      ],
      preferences: [],
      alreadyDelivered: [],
      resultRows: [{ participantId: 'p-1', sideId: 'side-away', userId: 'scorer-away', goals: 1, assists: 0 }],
    });
    await new TournamentFixtureCompletionNotificationService().project(tx, revisionFixture());

    const rows = createMany.mock.calls[0][0].data as Array<{ recipientUserId: string; body: string }>;
    expect(rows.map((row) => [row.recipientUserId, row.body])).toEqual([
      ['captain-home', '테스트 대회 · 결승 · 홈팀FC 2 : 1 원정팀FC · 승리.'],
      ['scorer-away', '테스트 대회 · 결승 · 홈팀FC 2 : 1 원정팀FC · 패배. 내 기록 1골이에요.'],
    ]);
  });

  it('drops recipients whose activityEnabled preference is false, keeping missing rows enabled', async () => {
    const { tx, createMany } = fakeTx({
      memberships: [{ userId: 'muted' }, { userId: 'no-preference-row' }],
      preferences: [{ userId: 'muted', activityEnabled: false }],
      alreadyDelivered: [],
    });
    await new TournamentFixtureCompletionNotificationService().project(tx, revisionFixture());
    const rows = createMany.mock.calls[0][0].data;
    expect(rows.map((row: { recipientUserId: string }) => row.recipientUserId)).toEqual([
      'no-preference-row',
    ]);
  });

  it('does not push again when the same revision is projected twice (businessKey already delivered)', async () => {
    const sendToUser = jest.fn().mockResolvedValue(undefined);
    const { tx } = fakeTx({
      memberships: [{ userId: 'captain-home' }],
      preferences: [],
      alreadyDelivered: ['tournament-fixture-completed:fixture-1:captain-home'],
    });
    await new TournamentFixtureCompletionNotificationService({ sendToUser } as never).project(
      tx,
      revisionFixture(),
    );
    expect(sendToUser).not.toHaveBeenCalled();
  });

  // MD-QA #79 — 확정된 결과를 어드민이 정정해도 새 알림이 가지 않아, 팀장 알림함에는 정정 전 점수가 그대로 남았다.
  describe('정정(앞서 공식 확정한 리비전이 있음)', () => {
    const corrected = () =>
      revisionFixture({
        revisionId: 'revision-2',
        revision: 2,
        officialAt: new Date('2026-08-02T00:00:00Z'),
        score: { home: 2, away: 1 },
        reason: '점수 오기 정정',
      });

    it('최초 확정은 먼저 확정된 리비전이 있는지 같은 경기·다른 리비전·더 이른 확정 시각으로 묻는다', async () => {
      const { tx, findEarlierOfficial } = fakeTx({
        memberships: [{ userId: 'captain-home' }],
        preferences: [],
        alreadyDelivered: [],
      });
      await new TournamentFixtureCompletionNotificationService().project(tx, corrected());
      expect(findEarlierOfficial).toHaveBeenCalledWith({
        where: {
          gameId: 'game-1',
          id: { not: 'revision-2' },
          officialAt: { not: null, lt: new Date('2026-08-02T00:00:00Z') },
        },
        select: { id: true },
      });
    });

    it('정정 제목과 정정된 점수로 리비전마다 한 번씩 새로 보낸다 — 이미 완료 알림을 받은 사람도 받는다', async () => {
      const { tx, createMany } = fakeTx({
        memberships: [{ userId: 'captain-home' }, { userId: 'captain-away', teamId: 'team-away' }],
        preferences: [],
        // 처음 확정 때 받은 완료 알림. 정정 알림은 이것과 별개다.
        alreadyDelivered: ['tournament-fixture-completed:fixture-1:captain-home'],
        earlierOfficialRevision: true,
      });
      await new TournamentFixtureCompletionNotificationService().project(tx, corrected());

      const rows = createMany.mock.calls[0][0].data as Array<{ recipientUserId: string }>;
      const home = rows.find((row) => row.recipientUserId === 'captain-home');
      expect(home).toMatchObject({
        title: '대회 경기 결과가 정정됐어요',
        targetType: 'tournament',
        targetId: 'tour-1:fixture-1',
        body: '테스트 대회 · 결승 · 홈팀FC 2 : 1 원정팀FC · 승리.',
        deepLink: '/tournaments/tour-1/matches/fixture-1',
        businessKey: 'tournament-fixture-corrected:fixture-1:revision-2:captain-home',
      });
      expect(rows.find((row) => row.recipientUserId === 'captain-away')).toMatchObject({
        body: '테스트 대회 · 결승 · 홈팀FC 2 : 1 원정팀FC · 패배.',
        businessKey: 'tournament-fixture-corrected:fixture-1:revision-2:captain-away',
      });
    });

    it('정정 알림도 웹 푸시로 보낸다 — 완료 알림을 이미 받은 사람에게도', async () => {
      const sendToUser = jest.fn().mockResolvedValue(undefined);
      const { tx } = fakeTx({
        memberships: [{ userId: 'captain-home' }],
        preferences: [],
        alreadyDelivered: ['tournament-fixture-completed:fixture-1:captain-home'],
        earlierOfficialRevision: true,
      });
      await new TournamentFixtureCompletionNotificationService({ sendToUser } as never).project(tx, corrected());
      expect(sendToUser).toHaveBeenCalledWith('captain-home', {
        title: '대회 경기 결과가 정정됐어요',
        body: '테스트 대회 · 결승 · 홈팀FC 2 : 1 원정팀FC · 승리.',
        url: '/tournaments/tour-1/matches/fixture-1',
      });
    });

    it('같은 정정 리비전을 다시 처리하면 푸시를 또 보내지 않는다 (정정 키가 이미 배달됨)', async () => {
      const sendToUser = jest.fn().mockResolvedValue(undefined);
      const { tx } = fakeTx({
        memberships: [{ userId: 'captain-home' }],
        preferences: [],
        alreadyDelivered: ['tournament-fixture-corrected:fixture-1:revision-2:captain-home'],
        earlierOfficialRevision: true,
      });
      await new TournamentFixtureCompletionNotificationService({ sendToUser } as never).project(tx, corrected());
      expect(sendToUser).not.toHaveBeenCalled();
    });

    it('수신 거부한 사람에게는 정정 알림도 보내지 않는다', async () => {
      const { tx, createMany } = fakeTx({
        memberships: [{ userId: 'muted' }],
        preferences: [{ userId: 'muted', activityEnabled: false }],
        alreadyDelivered: [],
        earlierOfficialRevision: true,
      });
      await new TournamentFixtureCompletionNotificationService().project(tx, corrected());
      expect(createMany).not.toHaveBeenCalled();
    });
  });

  // 2026-08-27 감사 41/44: outbox 트랜잭션이 롤백되면 이미 나간 웹 푸시는 되돌릴 수
  // 없다 — claim.afterCommit이 있으면 project()가 그 안에 push만 하고 커밋 전에는
  // 절대 sendToUser를 직접 부르지 않아야 한다.
  it('claim.afterCommit이 주어지면 push를 즉시 보내지 않고 커밋 후 실행할 effect로만 담는다', async () => {
    const sendToUser = jest.fn().mockResolvedValue(undefined);
    const { tx } = fakeTx({
      memberships: [{ userId: 'captain-home' }],
      preferences: [],
      alreadyDelivered: [],
    });
    const afterCommit: Array<() => void | Promise<void>> = [];
    const claim = { afterCommit } as never;

    await new TournamentFixtureCompletionNotificationService({ sendToUser } as never).project(
      tx,
      revisionFixture(),
      claim,
    );

    expect(sendToUser).not.toHaveBeenCalled();
    expect(afterCommit).toHaveLength(1);

    await afterCommit[0]();
    expect(sendToUser).toHaveBeenCalledWith(
      'captain-home',
      expect.objectContaining({ url: '/tournaments/tour-1/matches/fixture-1' }),
    );
  });
});
