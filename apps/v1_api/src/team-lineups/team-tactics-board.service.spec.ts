import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TeamTacticsBoardService } from './team-tactics-board.service';

/**
 * 전술보드가 **그 팀 밖으로 나가지 않는다**는 계약을 못박는다.
 *
 * 이 보드에는 상대에게 알려지면 안 되는 것(선발/후보·포지션·배치 좌표)이 들어간다.
 * 그래서 "누가 볼 수 있나"가 이 기능의 본체이고, 배치를 저장·조회하는 일은 그 다음이다.
 *
 * 특히 `board.teamId === side.teamId` 불변식은 DB 제약으로 걸 수 없다 —
 * `V1GameSide.teamId` 가 게스트 상대를 위해 nullable 이라 복합 FK 가 성립하지 않는다.
 * 그 자리를 이 스펙이 대신 지킨다.
 */

const USER = { id: 'user-1' } as never;
const TEAM_ID = 'team-home';
const GAME_ID = 'game-1';
const SIDE_ID = 'side-home';

type PrismaStub = {
  team: { id: string; deletedAt: null } | null;
  membershipRole: 'owner' | 'manager' | 'member' | null;
  side: { id: string; teamId: string | null; sideKey: string; displayNameSnapshot: string } | null;
  board: Record<string, unknown> | null;
  /**
   * compare-and-swap 결과. 0 이면 "내가 읽은 뒤 다른 트랜잭션이 버전을 올렸다" —
   * 조건부 updateMany 의 WHERE 가 더 이상 맞지 않는 상태를 재현한다.
   */
  swapCount?: number;
};

/**
 * 가짜 DB. 서비스가 실제로 던지는 질의 모양(where 절)을 그대로 재현한다 — 특히
 * `v1GameSide.findFirst` 가 gameId **와** teamId 로 함께 좁히는지, 멤버십 조회가
 * 역할 필터를 거는지를 여기서 관찰할 수 있어야 권한 계약을 검증할 수 있다.
 */
function buildPrisma(stub: PrismaStub) {
  const calls: { sideWhere?: Record<string, unknown>; membershipWhere?: Record<string, unknown> } = {};
  const created: Array<Record<string, unknown>> = [];
  const swapArgs: Array<Record<string, unknown>> = [];
  const createdEntries: Array<never[]> = [];
  const prisma = {
    v1Team: {
      findFirst: jest.fn().mockResolvedValue(stub.team),
    },
    v1TeamMembership: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        calls.membershipWhere = where;
        const required = (where.role as { in?: string[] } | undefined)?.in;
        if (stub.membershipRole === null) return Promise.resolve(null);
        if (required && !required.includes(stub.membershipRole)) return Promise.resolve(null);
        return Promise.resolve({ id: 'membership-1' });
      }),
    },
    v1GameSide: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        calls.sideWhere = where;
        if (stub.side === null) return Promise.resolve(null);
        // 실제 Prisma 와 같게 where 를 존중한다 — 팀이 다르면 못 찾는다.
        if (where.teamId !== undefined && where.teamId !== stub.side.teamId) {
          return Promise.resolve(null);
        }
        return Promise.resolve(stub.side);
      }),
    },
    v1TeamTacticsBoard: {
      findUnique: jest.fn().mockResolvedValue(stub.board),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve({
          id: 'board-new',
          teamId: data.teamId,
          formation: data.formation ?? null,
          version: data.version ?? 0,
          updatedByUserId: data.updatedByUserId ?? null,
          updatedAt: new Date('2026-08-29T00:00:00.000Z'),
          entries: ((data.entries as { create?: unknown[] } | undefined)?.create ?? []) as never[],
        });
      }),
      // 조건부 갱신(compare-and-swap). count 0 = 그 사이 버전이 바뀌었다.
      updateMany: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        swapArgs.push(data);
        return Promise.resolve({ count: stub.swapCount ?? 1 });
      }),
      // CAS 성공 후 엔트리를 갈아끼운 최종 상태를 다시 읽는 호출.
      findUniqueOrThrow: jest.fn(() =>
        Promise.resolve({
          id: 'board-1',
          teamId: (stub.board as { teamId?: string } | null)?.teamId ?? TEAM_ID,
          formation: (swapArgs.at(-1)?.formation ?? null) as string | null,
          version: ((stub.board as { version?: number } | null)?.version ?? 0) + 1,
          updatedByUserId: (swapArgs.at(-1)?.updatedByUserId ?? null) as string | null,
          updatedAt: new Date('2026-08-29T00:00:00.000Z'),
          entries: createdEntries.at(-1) ?? [],
        }),
      ),
    },
    v1TeamTacticsBoardEntry: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn(({ data }: { data: unknown[] }) => {
        createdEntries.push(data as never[]);
        return Promise.resolve({ count: data.length });
      }),
    },
  };
  // `$transaction` 은 자기 자신(prisma)을 tx 로 넘겨야 해서 객체 리터럴 안에 둘 수 없다 —
  // 초기화 중 자기 참조라 타입이 any 로 무너진다. 만든 뒤에 붙인다.
  const withTransaction = Object.assign(prisma, {
    $transaction: jest.fn((fn: (tx: typeof prisma) => unknown) => fn(prisma)),
  });
  return { prisma: withTransaction, calls, created, swapArgs };
}

async function buildService(prisma: unknown) {
  const moduleRef = await Test.createTestingModule({
    providers: [TeamTacticsBoardService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: moduleRef.get(TeamTacticsBoardService), moduleRef };
}

const HOME_SIDE = {
  id: SIDE_ID,
  teamId: TEAM_ID,
  sideKey: 'HOME',
  displayNameSnapshot: '성수 FC',
};

function boardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'board-1',
    teamId: TEAM_ID,
    formation: '4-4-2',
    version: 3,
    updatedByUserId: 'user-9',
    updatedAt: new Date('2026-08-28T00:00:00.000Z'),
    entries: [
      {
        userId: 'user-1',
        displayName: '김선수',
        jerseyNumber: 7,
        position: 'FW',
        positionX: 50,
        positionY: 80,
        started: true,
        goalkeeper: false,
      },
    ],
    ...overrides,
  };
}

describe('TeamTacticsBoardService — 전술이 팀 밖으로 나가지 않는다', () => {
  it('보드의 팀과 사이드의 팀이 어긋나면 열지 않고 멈춘다 (엉뚱한 팀에 상대 전술이 보이는 경로)', async () => {
    // 보드가 만들어진 뒤 운영자가 이 사이드의 팀을 교체한 상태를 재현한다.
    // 이 검사가 없으면 새로 들어온 팀이 이전 팀의 배치를 그대로 본다.
    const { prisma } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'member',
      side: HOME_SIDE,
      board: boardRow({ teamId: 'team-someone-else' }),
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      await expect(service.get(USER, TEAM_ID, GAME_ID)).rejects.toMatchObject({
        response: { code: 'TACTICS_BOARD_TEAM_MISMATCH' },
      });
    } finally {
      await moduleRef.close();
    }
  });

  it('사이드를 gameId 와 teamId 로 함께 좁힌다 — 상대 사이드를 열 경로가 없다', async () => {
    const { prisma, calls } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'member',
      side: HOME_SIDE,
      board: null,
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      await service.get(USER, TEAM_ID, GAME_ID);
      expect(calls.sideWhere).toEqual({ gameId: GAME_ID, teamId: TEAM_ID });
    } finally {
      await moduleRef.close();
    }
  });

  it('그 경기에 없는 팀은 404 — 남의 경기 id 를 넣어도 보드가 생기지 않는다', async () => {
    const { prisma } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'owner',
      // 이 경기의 사이드는 상대 팀 것뿐이다.
      side: { ...HOME_SIDE, teamId: 'team-away' },
      board: null,
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      await expect(service.get(USER, TEAM_ID, GAME_ID)).rejects.toMatchObject({
        response: { code: 'TACTICS_BOARD_SIDE_NOT_FOUND' },
      });
    } finally {
      await moduleRef.close();
    }
  });

  it('팀원이 아니면 조회조차 403', async () => {
    const { prisma } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: null,
      side: HOME_SIDE,
      board: boardRow(),
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      await expect(service.get(USER, TEAM_ID, GAME_ID)).rejects.toMatchObject({
        response: { code: 'PERMISSION_DENIED' },
      });
    } finally {
      await moduleRef.close();
    }
  });
});

describe('TeamTacticsBoardService — 보는 권한과 고치는 권한이 다르다', () => {
  it('일반 팀원은 볼 수 있다 (자기가 어디서 뛰는지 알아야 한다)', async () => {
    const { prisma } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'member',
      side: HOME_SIDE,
      board: boardRow(),
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      const result = await service.get(USER, TEAM_ID, GAME_ID);
      expect(result).toMatchObject({ formation: '4-4-2', version: 3, starterCount: 1, benchCount: 0 });
      expect(result.entries[0]).toMatchObject({ displayName: '김선수', positionX: 50, positionY: 80 });
    } finally {
      await moduleRef.close();
    }
  });

  it('일반 팀원은 고칠 수 없다 — 저장은 운영진만', async () => {
    const { prisma } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'member',
      side: HOME_SIDE,
      board: null,
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      await expect(
        service.save(USER, TEAM_ID, GAME_ID, { entries: [] }),
      ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
      expect(prisma.v1TeamTacticsBoard.create).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });

  it('매니저는 고칠 수 있고, 저장되는 teamId 는 호출자가 준 값이 아니라 사이드의 값이다', async () => {
    const { prisma, created } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'manager',
      side: HOME_SIDE,
      board: null,
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      await service.save(USER, TEAM_ID, GAME_ID, {
        formation: '3-5-2',
        entries: [{ displayName: '박선수', started: true }],
      });
      expect(created).toHaveLength(1);
      // side.teamId 를 쓴다 — URL 의 teamId 를 그대로 쓰면 위 불일치 상태를 서비스가
      // 스스로 만들어낼 수 있다.
      expect(created[0]).toMatchObject({ teamId: HOME_SIDE.teamId, sideId: SIDE_ID, gameId: GAME_ID });
    } finally {
      await moduleRef.close();
    }
  });
});

describe('TeamTacticsBoardService — 저장 규칙', () => {
  it('아직 저장한 적 없으면 404 가 아니라 빈 판(version 0)을 돌려준다', async () => {
    const { prisma } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'member',
      side: HOME_SIDE,
      board: null,
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      const result = await service.get(USER, TEAM_ID, GAME_ID);
      expect(result).toMatchObject({ version: 0, formation: null, entries: [], updatedAt: null });
    } finally {
      await moduleRef.close();
    }
  });

  it('expectedVersion 이 현재와 다르면 엔트리를 건드리기 전에 409', async () => {
    const { prisma } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'owner',
      side: HOME_SIDE,
      board: boardRow({ version: 3 }),
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      await expect(
        service.save(USER, TEAM_ID, GAME_ID, { expectedVersion: 2, entries: [] }),
      ).rejects.toMatchObject({ response: { code: 'TACTICS_BOARD_VERSION_CONFLICT' } });
      expect(prisma.v1TeamTacticsBoard.updateMany).not.toHaveBeenCalled();
      expect(prisma.v1TeamTacticsBoardEntry.deleteMany).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });

  it('버전 검사를 통과한 뒤 그 사이 다른 저장이 끼어들면(CAS 실패) 엔트리를 지우지 않고 409', async () => {
    // 검사와 쓰기가 원자적이지 않으면 둘 다 통과한 뒤 나중 커밋이 앞 저장을 덮어쓴다.
    // 조건부 updateMany 가 0건을 돌려주는 상황 = 읽은 뒤 버전이 바뀐 상황이다.
    const { prisma } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'owner',
      side: HOME_SIDE,
      board: boardRow({ version: 3 }),
      swapCount: 0,
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      await expect(
        service.save(USER, TEAM_ID, GAME_ID, { expectedVersion: 3, entries: [] }),
      ).rejects.toMatchObject({ response: { code: 'TACTICS_BOARD_VERSION_CONFLICT' } });
      // 엔트리 삭제는 CAS 성공 뒤에만 일어나야 한다 — 진 쪽이 이긴 쪽 엔트리를 지우면 안 된다.
      expect(prisma.v1TeamTacticsBoardEntry.deleteMany).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });

  it('expectedVersion 을 안 보내도 동시 저장 보호는 꺼지지 않는다 (계약: 항상 CAS)', async () => {
    // optional 필드를 빠뜨리는 것만으로 동료의 배치가 조용히 덮어써지면 그건 옵션이
    // 아니라 함정이다. 값을 주는 것은 선제 검사일 뿐이고, 잠금은 언제나 걸린다.
    const { prisma } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'owner',
      side: HOME_SIDE,
      board: boardRow({ version: 3 }),
      swapCount: 0,
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      await expect(
        service.save(USER, TEAM_ID, GAME_ID, { entries: [] }),
      ).rejects.toMatchObject({ response: { code: 'TACTICS_BOARD_VERSION_CONFLICT' } });
      expect(prisma.v1TeamTacticsBoardEntry.deleteMany).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });

  it('조건부 갱신은 읽은 버전을 WHERE 에 걸고 version 을 1 올린다', async () => {
    const { prisma } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'owner',
      side: HOME_SIDE,
      board: boardRow({ version: 3 }),
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      const result = await service.save(USER, TEAM_ID, GAME_ID, { entries: [] });
      expect(prisma.v1TeamTacticsBoard.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'board-1', version: 3 },
          data: expect.objectContaining({ version: { increment: 1 } }),
        }),
      );
      expect(result.version).toBe(4);
      expect(prisma.v1TeamTacticsBoardEntry.deleteMany).toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });

  it('첫 저장은 version 1 로 시작한다 — 0 은 "아직 저장 안 됨" 전용이다', async () => {
    const { prisma, created } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'owner',
      side: HOME_SIDE,
      board: null,
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      const result = await service.save(USER, TEAM_ID, GAME_ID, { entries: [] });
      expect(created[0]).toMatchObject({ version: 1 });
      expect(result.version).toBe(1);
    } finally {
      await moduleRef.close();
    }
  });

  it('보드가 이미 있는데 expectedVersion 0(빈 판을 읽은 상태)으로 저장하면 409', async () => {
    const { prisma } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'owner',
      side: HOME_SIDE,
      board: boardRow({ version: 2 }),
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      await expect(
        service.save(USER, TEAM_ID, GAME_ID, { expectedVersion: 0, entries: [] }),
      ).rejects.toMatchObject({ response: { code: 'TACTICS_BOARD_VERSION_CONFLICT' } });
    } finally {
      await moduleRef.close();
    }
  });

  it('좌표는 X·Y 를 함께 주거나 함께 비워야 한다', async () => {
    const { prisma } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'owner',
      side: HOME_SIDE,
      board: null,
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      await expect(
        service.save(USER, TEAM_ID, GAME_ID, {
          entries: [{ displayName: '반쪽좌표', started: true, positionX: 50 }],
        }),
      ).rejects.toMatchObject({ response: { code: 'TACTICS_BOARD_INVALID_COORDINATE' } });
      expect(prisma.v1TeamTacticsBoard.create).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });

  it('빈 엔트리 저장은 "배치를 비운다"는 뜻으로 허용한다', async () => {
    const { prisma } = buildPrisma({
      team: { id: TEAM_ID, deletedAt: null },
      membershipRole: 'owner',
      side: HOME_SIDE,
      board: boardRow(),
    });
    const { service, moduleRef } = await buildService(prisma);
    try {
      const result = await service.save(USER, TEAM_ID, GAME_ID, { entries: [] });
      expect(result.entries).toEqual([]);
      expect(result.starterCount).toBe(0);
    } finally {
      await moduleRef.close();
    }
  });
});
