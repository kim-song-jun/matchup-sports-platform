import type { Prisma } from '@prisma/client';
import type { OfficialRevisionRow } from './game-result-official-projection.types';
import { SuspensionNoticeProjectionService } from './suspension-notice.service';

jest.mock('../league-matches/league-roster-autofill', () => ({
  fillLeagueTeamRoster: jest.fn(),
  notifyLeagueRosterFillOutcomes: jest.fn(),
}));

const PROFILE = (nickname: string) => ({ profile: { nickname, displayName: null } });
const KICKOFF = new Date('2026-11-14T09:00:00Z');

const REVISION = {
  revisionId: 'rev-1',
  gameId: 'g1',
  teamMatchId: 'm1',
  tournamentId: 'cup',
  leagueId: null,
  homeTeamId: 'team-A',
  awayTeamId: 'team-B',
  officialAt: new Date('2026-11-07T10:00:00Z'),
} as unknown as OfficialRevisionRow;

interface World {
  rules: { yellowAccumulationLimit: number | null; redCardSuspensionMatches: number | null };
  nextGameState: string;
  results: Array<{ participantId: string; userId: string; yellow: number; red: number }>;
  optedOut?: string[];
  priorOfficial?: boolean;
}

function fakeTx(world: World) {
  const created: Array<Record<string, unknown>> = [];
  const matches = [
    { id: 'm1', hostTeamId: 'team-A', approvedApplicantTeamId: 'team-B', startAt: new Date('2026-11-07T09:00:00Z'), game: { id: 'g1' } },
    { id: 'm2', hostTeamId: 'team-C', approvedApplicantTeamId: 'team-A', startAt: KICKOFF, game: { id: 'g2' } },
  ];
  const tx = {
    v1Tournament: { findFirst: jest.fn(async (args: { select?: Record<string, boolean> }) =>
      args.select?.title === true ? { title: '퀸즈컵' } : world.rules) },
    v1TeamMatch: {
      findMany: jest.fn(async () => matches),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => matches.find((row) => row.id === where.id) ?? null),
    },
    v1Game: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({
          id,
          state: world.nextGameState,
          currentOfficialRevisionId: null,
          resultRevisions: id === 'g1' ? [{ id: 'rev-g1' }] : [],
        })),
      ),
    },
    v1GameResultParticipant: {
      findMany: jest.fn(async () =>
        world.results.map((row) => ({ resultRevisionId: 'rev-g1', participantId: row.participantId, cards: { yellow: row.yellow, red: row.red } })),
      ),
    },
    v1GameParticipant: {
      findMany: jest.fn(async () => world.results.map((row) => ({ id: row.participantId, userId: row.userId }))),
    },
    v1TournamentRegistration: {
      findFirst: jest.fn(async ({ where }: { where: { teamId: string } }) =>
        where.teamId === 'team-A'
          ? {
              id: 'reg-A',
              players: ['pa', 'pb', 'pc'].map((userId, index) => ({ id: `tp-${index}`, userId, goalkeeper: false, user: PROFILE(`선수${userId}`) })),
            }
          : null,
      ),
    },
    $queryRaw: jest.fn(async () => []),
    v1TeamMembership: {
      findMany: jest.fn(async ({ where }: { where: { teamId: string } }) => (where.teamId === 'team-A' ? [{ userId: 'mgr-A' }] : [{ userId: 'mgr-B' }])),
    },
    v1TournamentStaffAssignment: { findMany: jest.fn(async () => [{ userId: 'director' }]) },
    v1NotificationPreference: {
      findMany: jest.fn(async () => (world.optedOut ?? []).map((userId) => ({ userId, teamMatchEnabled: false }))),
    },
    v1Notification: {
      findMany: jest.fn(async () => []),
      createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        created.push(...data);
        return { count: data.length };
      }),
    },
    v1Team: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({ name: { 'team-A': '수원FC', 'team-C': '광교FC' }[where.id] ?? '기타팀' })),
    },
    v1GameResultRevision: { findFirst: jest.fn(async () => (world.priorOfficial === true ? { id: 'rev-0' } : null)) },
  } as unknown as Prisma.TransactionClient;
  return { tx, created };
}

const BASE_WORLD: World = {
  rules: { yellowAccumulationLimit: 2, redCardSuspensionMatches: 1 },
  nextGameState: 'SCHEDULED',
  results: [
    { participantId: 'gp-a', userId: 'pa', yellow: 0, red: 1 },
    { participantId: 'gp-b', userId: 'pb', yellow: 1, red: 0 },
  ],
};

describe('SuspensionNoticeProjectionService', () => {
  it('다음 경기에 못 뛰는 선수와 경고 임박 선수를 팀장·대회 총괄에게 따로 알리고, 카드 없는 선수는 싣지 않는다', async () => {
    const { tx, created } = fakeTx(BASE_WORLD);
    await new SuspensionNoticeProjectionService().project(tx, REVISION);

    expect(created.map((row) => [row.recipientUserId, row.title])).toEqual([
      ['mgr-A', '다음 경기에 못 뛰는 선수가 있어요'],
      ['mgr-A', '경고 한 장이면 정지인 선수가 있어요'],
      ['director', '다음 경기에 못 뛰는 선수가 있어요'],
      ['director', '경고 한 장이면 정지인 선수가 있어요'],
    ]);
    const suspension = created[0];
    expect(suspension.body).toBe('퀸즈컵 · 수원FC 다음 경기(11/14 (토) 18:00 vs 광교FC)에 출전할 수 없는 선수: 선수pa(퇴장 1회).');
    expect(created[1].body).toContain('경고 임박 선수: 선수pb.');
    expect(String(created[1].body)).not.toContain('선수pc');
    expect(suspension).toMatchObject({ targetType: 'team', targetId: 'team-A', deepLink: '/teams/team-A/games/g2/roster' });
    expect(suspension.businessKey).toBe('player-suspension:rev-1:team-A:player_suspension_notice:mgr-A');
  });

  it('정지 중인 선수가 경고도 한 장 모자라면 정지로만 알리고 경고 임박 알림은 싣지 않는다', async () => {
    const { tx, created } = fakeTx({ ...BASE_WORLD, results: [{ participantId: 'gp-a', userId: 'pa', yellow: 1, red: 1 }] });
    await new SuspensionNoticeProjectionService().project(tx, REVISION);
    expect(new Set(created.map((row) => row.title))).toEqual(new Set(['다음 경기에 못 뛰는 선수가 있어요']));
    expect(String(created[0].body)).toContain('선수pa');
  });

  it('다음 경기가 없는 팀(B)에는 알리지 않고, 알림을 끈 수신자는 거른다', async () => {
    const { tx, created } = fakeTx({ ...BASE_WORLD, optedOut: ['director'] });
    await new SuspensionNoticeProjectionService().project(tx, REVISION);
    expect(new Set(created.map((row) => row.recipientUserId))).toEqual(new Set(['mgr-A']));
    expect(created.every((row) => row.targetId === 'team-A')).toBe(true);
  });

  it('정지 규정이 꺼진 대회는 카드가 있어도 아무것도 쓰지 않는다', async () => {
    const { tx, created } = fakeTx({ ...BASE_WORLD, rules: { yellowAccumulationLimit: null, redCardSuspensionMatches: null } });
    await new SuspensionNoticeProjectionService().project(tx, REVISION);
    expect(created).toEqual([]);
  });

  it('다음 경기가 이미 시작됐으면 알리지 않는다', async () => {
    const { tx, created } = fakeTx({ ...BASE_WORLD, nextGameState: 'LIVE' });
    await new SuspensionNoticeProjectionService().project(tx, REVISION);
    expect(created).toEqual([]);
  });

  it('정정으로 다시 확정된 결과는 정정 문구를 붙이고 리비전별 businessKey 로 따로 쓴다', async () => {
    const { tx, created } = fakeTx({ ...BASE_WORLD, priorOfficial: true });
    await new SuspensionNoticeProjectionService().project(tx, REVISION);
    expect(String(created[0].body).startsWith('결과가 정정돼 다시 계산했어요. ')).toBe(true);
  });

  it('웹 푸시는 커밋 뒤 훅에 담고, 이미 보낸 업무 키는 다시 보내지 않는다', async () => {
    const { tx } = fakeTx(BASE_WORLD);
    (tx.v1Notification.findMany as jest.Mock).mockResolvedValue([
      { businessKey: 'player-suspension:rev-1:team-A:player_suspension_notice:mgr-A' },
    ]);
    const webPush = { sendToUser: jest.fn(async () => undefined) };
    const afterCommit: Array<() => void> = [];
    await new SuspensionNoticeProjectionService(webPush as never).project(tx, REVISION, { afterCommit } as never);
    expect(webPush.sendToUser).not.toHaveBeenCalled();
    afterCommit.forEach((send) => send());
    expect(webPush.sendToUser).toHaveBeenCalledTimes(3);
  });
});
