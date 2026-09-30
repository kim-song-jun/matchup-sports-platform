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
    v1TournamentMatchDetails: { findUnique: jest.fn().mockResolvedValue({ round: 'final' }) },
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
  return { tx: tx as never, createMany };
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

  it('does not push again for a correction re-officialize (businessKey already delivered)', async () => {
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
