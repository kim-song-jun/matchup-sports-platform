import { appearedUserIdsBySide, type AppearanceGamePrismaLike } from './tournament-fixture-appearance';

function fixtureWith(
  game: { id: string; currentOfficialRevision: { id: string; state: string } | null } | null,
) {
  return { game };
}

describe('appearedUserIdsBySide', () => {
  it('OFFICIAL 리비전이 있으면 홈/원정 실출전 userId 집합을 반환한다', async () => {
    const prisma = {
      v1GameResultParticipant: {
        findMany: jest.fn().mockResolvedValue([{ participantId: 'p1' }, { participantId: 'p2' }]),
      },
      v1GameParticipant: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', userId: 'u1', sideId: 's-home' },
          { id: 'p2', userId: 'u2', sideId: 's-away' },
        ]),
      },
      v1GameSide: {
        findMany: jest.fn().mockResolvedValue([
          { id: 's-home', sideKey: 'HOME' },
          { id: 's-away', sideKey: 'AWAY' },
        ]),
      },
    } as unknown as AppearanceGamePrismaLike;

    const result = await appearedUserIdsBySide(
      prisma,
      fixtureWith({ id: 'g1', currentOfficialRevision: { id: 'rev1', state: 'OFFICIAL' } }),
    );

    expect(result).toEqual({ home: new Set(['u1']), away: new Set(['u2']) });
  });

  it('userId가 null인 참가자(게스트 라인업)는 집합에서 제외한다', async () => {
    const prisma = {
      v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue([{ participantId: 'p1' }]) },
      v1GameParticipant: {
        findMany: jest.fn().mockResolvedValue([{ id: 'p1', userId: null, sideId: 's-home' }]),
      },
      v1GameSide: { findMany: jest.fn().mockResolvedValue([{ id: 's-home', sideKey: 'HOME' }]) },
    } as unknown as AppearanceGamePrismaLike;

    const result = await appearedUserIdsBySide(
      prisma,
      fixtureWith({ id: 'g1', currentOfficialRevision: { id: 'rev1', state: 'OFFICIAL' } }),
    );

    expect(result).toEqual({ home: new Set(), away: new Set() });
  });

  // 아래 세 케이스가 null 을 돌려주는 것은 "출전자가 없다"가 아니라 "판정할 근거가 없다"는
  // 신호다. 호출부는 이 null 을 받아 §5.2 폴백(등록 로스터 전체)으로 넘어가야 하며,
  // 빈 Set 과 혼동하면 아무도 평가할 수 없게 된다.
  it('game이 없으면(Game 미연결) null을 반환한다 — 폴백 신호', async () => {
    const prisma = {} as AppearanceGamePrismaLike;
    expect(await appearedUserIdsBySide(prisma, fixtureWith(null))).toBeNull();
  });

  it('currentOfficialRevision이 없으면 null을 반환한다', async () => {
    const prisma = {} as AppearanceGamePrismaLike;
    expect(
      await appearedUserIdsBySide(prisma, fixtureWith({ id: 'g1', currentOfficialRevision: null })),
    ).toBeNull();
  });

  it('리비전 state가 OFFICIAL이 아니면(VOID 등) null을 반환한다', async () => {
    const prisma = {} as AppearanceGamePrismaLike;
    expect(
      await appearedUserIdsBySide(
        prisma,
        fixtureWith({ id: 'g1', currentOfficialRevision: { id: 'rev1', state: 'VOID' } }),
      ),
    ).toBeNull();
  });

  it('OFFICIAL 인데 결과 참가자 행이 하나도 없으면 빈 집합이다(null 아님)', async () => {
    const prisma = {
      v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      v1GameParticipant: { findMany: jest.fn() },
      v1GameSide: { findMany: jest.fn() },
    } as unknown as AppearanceGamePrismaLike;

    const result = await appearedUserIdsBySide(
      prisma,
      fixtureWith({ id: 'g1', currentOfficialRevision: { id: 'rev1', state: 'OFFICIAL' } }),
    );

    expect(result).toEqual({ home: new Set(), away: new Set() });
    // 결과가 비면 뒤 두 쿼리는 아예 나가지 않아야 한다.
    expect(prisma.v1GameParticipant.findMany).not.toHaveBeenCalled();
  });

  it('결과 참가자만 세고 라인업 전체를 세지 않는다 — 미출전 선수는 빠진다', async () => {
    const prisma = {
      // 라인업에는 p1,p2 가 있지만 공식 결과에는 p1 만 있다.
      v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue([{ participantId: 'p1' }]) },
      v1GameParticipant: {
        findMany: jest.fn().mockResolvedValue([{ id: 'p1', userId: 'u1', sideId: 's-home' }]),
      },
      v1GameSide: { findMany: jest.fn().mockResolvedValue([{ id: 's-home', sideKey: 'HOME' }]) },
    } as unknown as AppearanceGamePrismaLike;

    const result = await appearedUserIdsBySide(
      prisma,
      fixtureWith({ id: 'g1', currentOfficialRevision: { id: 'rev1', state: 'OFFICIAL' } }),
    );

    expect(result).toEqual({ home: new Set(['u1']), away: new Set() });
    // participant 조회는 결과에 실린 id 로만 좁혀야 한다(라인업 전체 조회 금지).
    expect(prisma.v1GameParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['p1'] } } }),
    );
  });
});
