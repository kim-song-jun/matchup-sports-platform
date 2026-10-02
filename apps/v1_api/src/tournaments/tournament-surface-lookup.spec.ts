import { NotFoundException } from '@nestjs/common';
import { Prisma, V1CompetitionKind } from '@prisma/client';
import {
  findTournamentOnSurface,
  findTournamentOnSurfaceOrThrow,
  LEAGUE_KINDS,
  TOURNAMENT_KINDS,
  tournamentKindCondition,
  type TournamentSurfaceClient,
} from './tournament-surface-lookup';

/**
 * **이 스펙이 잡아야 하는 버그 세 가지** — 전부 조용히 통과하는 종류다:
 * 1. `kind: null`(R1 이전 행)을 빠뜨려 **옛 대회가 화면에서 통째로 사라진다**
 * 2. 그 null 을 리그 쪽에도 붙여 **옛 대회가 리그 규칙에 걸린다**(반대 방향 회귀)
 * 3. 호출부 `where` 를 펴 넣어(`...`) **호출부의 `OR` 이 종류 조건에 덮여 사라진다**
 */

/** 마지막으로 받은 인자를 붙잡는 가짜 클라이언트. 실제 쿼리가 아니라 **넘긴 where** 를 본다. */
function captureClient(returns: unknown = { id: 't1' }) {
  const calls: Prisma.V1TournamentFindFirstArgs[] = [];
  const client: TournamentSurfaceClient = {
    v1Tournament: {
      findFirst: ((args: Prisma.V1TournamentFindFirstArgs) => {
        calls.push(args);
        return Promise.resolve(returns);
      }) as TournamentSurfaceClient['v1Tournament']['findFirst'],
    },
  };
  return { client, calls };
}

describe('tournamentKindCondition', () => {
  it('대회를 허용하면 kind=null(R1 이전 행)도 함께 통과시킨다', () => {
    // 빠뜨리면 마이그레이션 전에 만들어진 대회가 사용자 목록·상세에서 통째로 사라진다.
    expect(tournamentKindCondition(TOURNAMENT_KINDS)).toEqual({
      OR: [{ kind: V1CompetitionKind.regular_tournament }, { kind: null }],
    });
  });

  it('리그만 허용할 때는 kind=null 을 붙이지 않는다', () => {
    // 붙이면 **옛 대회가 리그 규칙에 걸린다** — 1번을 고치다 만드는 반대 방향 회귀다.
    expect(tournamentKindCondition(LEAGUE_KINDS)).toEqual({
      OR: [{ kind: V1CompetitionKind.regular_league }],
    });
  });

  it('빈 배열은 "전부 허용"이 아니라 오류다', () => {
    // 빈 배열을 관대하게 처리하면 게이트가 조용히 열린다(fail-open).
    expect(() => tournamentKindCondition([])).toThrow(/allowedKinds/);
  });
});

describe('findTournamentOnSurface', () => {
  it('호출부 where 를 AND 로 감싼다 — 펴 넣으면 호출부의 OR 이 사라진다', async () => {
    const { client, calls } = captureClient();
    // 호출부가 이미 OR 을 쓰는 상황을 그대로 만든다. `{ ...kindCond, ...where }` 로
    // 구현하면 이 OR 이 종류 조건에 덮여 **조건이 통째로 없어진 채 통과**한다.
    await findTournamentOnSurface(client, TOURNAMENT_KINDS, {
      where: { id: 't1', OR: [{ status: 'open' }, { status: 'closed' }] },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].where).toEqual({
      AND: [
        { OR: [{ kind: V1CompetitionKind.regular_tournament }, { kind: null }] },
        { id: 't1', OR: [{ status: 'open' }, { status: 'closed' }] },
      ],
    });
  });

  it('select·include 는 그대로 전달한다', async () => {
    const { client, calls } = captureClient();
    await findTournamentOnSurface(client, TOURNAMENT_KINDS, {
      where: { id: 't1' },
      select: { id: true, title: true },
    });
    expect(calls[0].select).toEqual({ id: true, title: true });
  });

  it('where 가 없어도 종류 조건은 붙는다', async () => {
    const { client, calls } = captureClient();
    await findTournamentOnSurface(client, LEAGUE_KINDS, {});
    expect(calls[0].where).toEqual({
      AND: [{ OR: [{ kind: V1CompetitionKind.regular_league }] }, {}],
    });
  });

  it('$transaction 클라이언트에서도 쓸 수 있다', async () => {
    // 트랜잭션 안에서 못 쓰면 그 지점만 조건 없이 남는데(등록 제출의 TOCTOU 재검증이
    // 그 모양이다), **남았다는 사실이 밖에서 드러나지 않는다** — 트랜잭션 밖 조회는
    // 막혀 있어 겉보기엔 닫힌 것처럼 보이기 때문이다.
    const { client, calls } = captureClient();
    const runInTransaction = async (fn: (tx: TournamentSurfaceClient) => Promise<unknown>) =>
      fn(client);

    await runInTransaction((tx) =>
      findTournamentOnSurface(tx, TOURNAMENT_KINDS, { where: { id: 't1' } }),
    );
    expect(calls).toHaveLength(1);
  });
});

describe('findTournamentOnSurfaceOrThrow', () => {
  it('없으면 404 TOURNAMENT_NOT_FOUND — 새 코드를 만들지 않는다', async () => {
    const { client } = captureClient(null);
    await expect(
      findTournamentOnSurfaceOrThrow(client, TOURNAMENT_KINDS, { where: { id: 'none' } }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'TOURNAMENT_NOT_FOUND' },
    });
  });

  it('있으면 행을 그대로 준다', async () => {
    const { client } = captureClient({ id: 't1', title: '대회' });
    await expect(
      findTournamentOnSurfaceOrThrow(client, TOURNAMENT_KINDS, { where: { id: 't1' } }),
    ).resolves.toEqual({ id: 't1', title: '대회' });
  });

  it('던지는 예외는 NotFoundException 이다', async () => {
    const { client } = captureClient(null);
    await expect(
      findTournamentOnSurfaceOrThrow(client, TOURNAMENT_KINDS, { where: { id: 'none' } }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
