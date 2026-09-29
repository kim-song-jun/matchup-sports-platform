import type { Prisma } from '@prisma/client';
import {
  leagueKickoffPassed,
  migrateLeagueRosterAdjustments,
  planLeagueSideMigration,
  resolveLineupSaver,
} from './league-roster-adjustment-migration';

describe('planLeagueSideMigration — 팀장 저장본을 조정으로 옮기는 계획', () => {
  const entry = (userId: string, jerseyNumber: number | null = null) => ({
    userId,
    jerseyNumber,
    sourceParticipantId: `player-${userId}`,
  });
  const base = ['u-1', 'u-2', 'u-3', 'u-4'].map((userId) => entry(userId));
  const row = (userId: string | null, jerseyNumber: number | null = null) => ({ userId, jerseyNumber });
  const plan = (input: {
    base?: ReturnType<typeof entry>[];
    saved: ReturnType<typeof row>[];
    excluded?: string[];
    baseIsRegistration?: boolean;
  }) =>
    planLeagueSideMigration({
      base: input.base ?? base,
      baseIsRegistration: input.baseIsRegistration ?? true,
      saved: input.saved,
      activeExcludedUserIds: new Set(input.excluded ?? []),
    });

  it('기준 명단에 있는데 저장본에 없는 사람만 EXCLUDE 로 옮기고, 저장본에 있는 사람은 그대로 둔다', () => {
    expect(plan({ saved: [row('u-1'), row('u-3')] })).toEqual({
      excludeUserIds: ['u-2', 'u-4'],
      unrepresentableRows: 0,
      jerseyCopies: [],
      jerseyChangedRows: 0,
    });
  });

  it('저장본이 기준 명단과 같으면 옮길 것이 없다 (회귀 방향)', () => {
    expect(plan({ saved: base.map((e) => row(e.userId)) })).toEqual({
      excludeUserIds: [],
      unrepresentableRows: 0,
      jerseyCopies: [],
      jerseyChangedRows: 0,
    });
  });

  it('게스트(계정 없음)와 기준 명단 밖 계정은 조정으로 표현할 수 없어 세기만 하고 번호도 옮기지 않는다', () => {
    const result = plan({ saved: [row('u-1'), row(null, 5), row(null), row('outsider', 6), row('u-2')] });
    expect(result).toMatchObject({ excludeUserIds: ['u-3', 'u-4'], unrepresentableRows: 3, jerseyCopies: [] });
  });

  it('이미 활성 EXCLUDE 가 있는 사람은 다시 만들지 않는다', () => {
    expect(plan({ saved: [row('u-1')], excluded: ['u-2'] }).excludeUserIds).toEqual(['u-3', 'u-4']);
  });

  it('참가 명단 번호가 비어 있으면 저장본 번호를 옮겨 적고, 있는 번호는 덮지 않고 차이로 센다', () => {
    const result = plan({
      base: [entry('u-1'), entry('u-2', 10), entry('u-3', 11), entry('u-4')],
      saved: [row('u-1', 7), row('u-2', 10), row('u-3', 99), row('u-4')],
    });
    expect(result.jerseyCopies).toEqual([{ playerId: 'player-u-1', userId: 'u-1', jerseyNumber: 7 }]);
    expect(result.jerseyChangedRows).toBe(1);
  });

  it('팀 안에서 이미 쓰는 번호는 옮겨 적지 않는다 — 참가 명단의 번호든 이번에 옮겨 적은 번호든', () => {
    const result = plan({
      base: [entry('u-1'), entry('u-2', 7), entry('u-3'), entry('u-4')],
      saved: [row('u-1', 7), row('u-3', 9), row('u-4', 9)],
    });
    expect(result.jerseyCopies).toEqual([{ playerId: 'player-u-3', userId: 'u-3', jerseyNumber: 9 }]);
    expect(result.jerseyChangedRows).toBe(2);
  });

  it('팀원 폴백(참가 명단 없음)이면 번호를 적을 행이 없어 차이로만 센다', () => {
    const result = plan({ saved: [row('u-1', 7)], baseIsRegistration: false });
    expect(result.jerseyCopies).toEqual([]);
    expect(result.jerseyChangedRows).toBe(1);
  });
});

describe('resolveLineupSaver — 저장본을 만든 팀장', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 8, 1, 0, minute));
  const records = [
    { actorUserId: 'home-manager-old', responseBody: { sideId: 'side-home', revision: 2 }, createdAt: at(1) },
    { actorUserId: 'home-manager-new', responseBody: { sideId: 'side-home', revision: 3 }, createdAt: at(2) },
    { actorUserId: 'away-manager', responseBody: { sideId: 'side-away', revision: 4 }, createdAt: at(3) },
  ];

  it('그 사이드의 현재 리비전 이하 저장 중 가장 최근 것을 고른다', () => {
    expect(resolveLineupSaver(records, 'side-home', 3)).toBe('home-manager-new');
    expect(resolveLineupSaver(records, 'side-home', 2)).toBe('home-manager-old');
  });

  it('상대 사이드의 저장은 섞이지 않는다 — 정정 요청 복사본도 그 사이드를 저장한 팀장에게 돌아간다', () => {
    expect(resolveLineupSaver(records, 'side-away', 5)).toBe('away-manager');
    expect(resolveLineupSaver(records, 'side-home', 5)).toBe('home-manager-new');
  });

  it('찾을 수 없으면 null — 작성자를 지어내지 않는다', () => {
    expect(resolveLineupSaver(records, 'side-home', 1)).toBeNull();
    expect(resolveLineupSaver([{ actorUserId: 'x', responseBody: null, createdAt: at(0) }], 'side-home', 9)).toBeNull();
  });
});

describe('leagueKickoffPassed — 동기화와 같은 리그 "시작 전" 경계', () => {
  const now = new Date('2026-10-01T10:00:00Z');
  it.each([
    ['킥오프 시각 그 순간', new Date('2026-10-01T10:00:00Z'), true],
    ['1초 전 킥오프', new Date('2026-10-01T09:59:59Z'), true],
    ['1초 뒤 킥오프', new Date('2026-10-01T10:00:01Z'), false],
    ['시각 없는 경기', null, false],
  ])('%s → %s', (_label, startAt, passed) => {
    expect(leagueKickoffPassed(startAt, now)).toBe(passed);
  });
});

describe('migrateLeagueRosterAdjustments — 킥오프 지난 SCHEDULED 리그 경기', () => {
  const HOUR = 3_600_000;
  /** 사이드마다 최신 리비전(팀장 저장본이면 rev 3 SUBMITTED)과 킥오프 시각. 이관 표시 감사 행은 없다. */
  function fakePrisma(sides: Array<{ id: string; teamAuthored: boolean; startAt: Date | null }>) {
    const bySide = new Map(sides.map((side) => [side.id, side]));
    const writes: string[] = [];
    const tx = {
      v1GameLineup: {
        findFirst: jest.fn(async ({ where }: { where: { sideId: string } }) =>
          bySide.get(where.sideId)!.teamAuthored
            ? { id: `lineup-${where.sideId}`, revision: 3, state: 'SUBMITTED' }
            : { id: `lineup-${where.sideId}`, revision: 1, state: 'DRAFT' },
        ),
      },
      v1OperationAudit: { findFirst: jest.fn(async () => null) },
      v1Game: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const side = bySide.get(where.id.replace('game-', 'side-'))!;
          return {
            id: where.id,
            state: 'SCHEDULED',
            teamMatch: { id: `tm-${side.id}`, tournamentId: 'league-1', leagueId: 'league-1', startAt: side.startAt },
            sides: [{ id: side.id, teamId: 'team-A' }],
          };
        }),
        // 잠금(lockRosterWriteScope)의 첫 조회 — 킥오프 지난 사이드는 여기까지 오면 안 된다.
        findMany: jest.fn(async () => {
          writes.push('lock');
          return [];
        }),
      },
      $queryRaw: jest.fn(async () => {
        writes.push('lock');
        return [];
      }),
    };
    const prisma = {
      v1GameSide: {
        findMany: jest.fn(async () => sides.map((side) => ({ id: side.id, gameId: side.id.replace('side-', 'game-'), game: { teamMatchId: `tm-${side.id}` } }))),
      },
      $transaction: jest.fn(async (fn: (client: Prisma.TransactionClient) => Promise<unknown>) => fn(tx as never)),
    };
    return { prisma: prisma as never as Parameters<typeof migrateLeagueRosterAdjustments>[0], writes };
  }

  it.each([false, true])('apply=%s: 팀장 저장본은 KICKOFF_PASSED 로 세기만 하고 잠그거나 쓰지 않는다', async (apply) => {
    const { prisma, writes } = fakePrisma([
      { id: 'side-played', teamAuthored: true, startAt: new Date(Date.now() - HOUR) },
      { id: 'side-played-system', teamAuthored: false, startAt: new Date(Date.now() - HOUR) },
      { id: 'side-upcoming-system', teamAuthored: false, startAt: new Date(Date.now() + HOUR) },
    ]);
    const result = await migrateLeagueRosterAdjustments(prisma, { apply });
    expect(result).toMatchObject({ sidesScanned: 3, teamAuthoredSides: 1, migratedSides: 0, kickoffPassedSides: 1 });
    expect(result.sides).toEqual([
      expect.objectContaining({ sideId: 'side-played', status: 'KICKOFF_PASSED', excludeCount: 0, rosterChanged: false }),
    ]);
    expect(writes).toEqual([]);
  });
});
