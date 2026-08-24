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
    sourceType: 'TOURNAMENT_FIXTURE',
    currentOfficialRevisionId: 'revision-1',
    tournamentId: 'tour-1',
    tournamentFixtureId: 'fixture-1',
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    visibility: 'PUBLIC' as never,
    ...overrides,
  };
}

/** Minimal fake of the Prisma.TransactionClient surface this service touches. */
function fakeTx(options: {
  memberships: Array<{ userId: string }>;
  preferences: Array<{ userId: string; activityEnabled: boolean }>;
  alreadyDelivered: string[];
}) {
  const createMany = jest.fn().mockResolvedValue({ count: 0 });
  const tx = {
    v1TeamMembership: {
      findMany: jest.fn().mockResolvedValue(options.memberships),
    },
    v1NotificationPreference: {
      findMany: jest.fn().mockResolvedValue(options.preferences),
    },
    v1Tournament: {
      findUnique: jest.fn().mockResolvedValue({ title: '테스트 대회' }),
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
  it('is a no-op for team-match games (sourceType !== TOURNAMENT_FIXTURE)', async () => {
    const { tx, createMany } = fakeTx({
      memberships: [{ userId: 'user-1' }],
      preferences: [],
      alreadyDelivered: [],
    });
    await new TournamentFixtureCompletionNotificationService().project(
      tx,
      revisionFixture({ sourceType: 'TEAM_MATCH', tournamentId: null, tournamentFixtureId: null }),
    );
    expect(createMany).not.toHaveBeenCalled();
  });

  it('notifies both teams\' owner/manager with the scoreline and the public match deep link', async () => {
    const { tx, createMany } = fakeTx({
      memberships: [{ userId: 'captain-home' }, { userId: 'captain-away' }],
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
    expect(rows[0]).toMatchObject({
      targetType: 'tournament',
      targetId: 'tour-1',
      body: '테스트 대회 — 홈팀FC 2:1 원정팀FC 결과가 공식 확정됐어요.',
      deepLink: '/tournaments/tour-1/matches/fixture-1',
      businessKey: 'tournament-fixture-completed:fixture-1:captain-home',
    });
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
    expect(rows[0].body).toBe(
      '테스트 대회 — 홈팀FC 1:1 (승부차기 4:3) 원정팀FC 결과가 공식 확정됐어요.',
    );
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
});
