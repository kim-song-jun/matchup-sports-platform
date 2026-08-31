import {
  backfillLeagueTeamsAsRegistrations,
  LeagueTeamBackfillBlockedError,
} from './league-team-registration-backfill';

function leagueTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lt-1',
    leagueId: 'league-1',
    teamId: 'team-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

/**
 * 가드가 **없었다면 실제로 성공했을** 만큼 채운 fake — 대회 행·owner·id 여유가 모두 있다.
 * 각 테스트는 여기서 **한 조각만** 무너뜨려 그 가드가 실제로 잡는지를 본다. 빈 fake 로
 * 음성만 확인하면 "아무것도 안 해서 통과"와 구분이 안 된다.
 */
function fakePrisma(opts: {
  leagueTeams?: unknown[];
  tournaments?: Array<{ id: string; kind: string | null }>;
  owners?: Array<{ teamId: string; userId: string }>;
  existing?: Array<{ id: string; tournamentId: string }>;
}) {
  const create = jest.fn((args: unknown) => args);
  const transaction = jest.fn((ops: unknown[]) => Promise.resolve(ops));
  return {
    create,
    transaction,
    prisma: {
      v1LeagueTeam: {
        findMany: jest.fn().mockResolvedValue(opts.leagueTeams ?? [leagueTeam()]),
      },
      v1Tournament: {
        findMany: jest
          .fn()
          .mockResolvedValue(opts.tournaments ?? [{ id: 'league-1', kind: 'regular_league' }]),
      },
      v1TeamMembership: {
        findMany: jest.fn().mockResolvedValue(opts.owners ?? [{ teamId: 'team-1', userId: 'u-1' }]),
      },
      v1TournamentRegistration: {
        findMany: jest.fn().mockResolvedValue(opts.existing ?? []),
        create,
      },
      $transaction: transaction,
    } as never,
  };
}

describe('backfillLeagueTeamsAsRegistrations', () => {
  // ─── 가드 1 — "행이 없다" 와 "종류가 다르다" 는 다른 사건이다 ────────────────
  // 운영자의 조치가 정반대라서 갈라야 한다: 없으면 리그 시즌 백필을 먼저 돌리고,
  // 종류가 다르면 **그 id 가 우리 것이 아니므로 멈추고 조사**한다.

  it('가드 1: 대회 행이 아예 없으면 missingTournaments 로 막는다', async () => {
    const { prisma, transaction } = fakePrisma({ tournaments: [] });

    const error = await backfillLeagueTeamsAsRegistrations(prisma, { dryRun: false }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(LeagueTeamBackfillBlockedError);
    const detail = (error as LeagueTeamBackfillBlockedError).detail;
    expect(detail.missingTournaments).toEqual([{ leagueId: 'league-1' }]);
    expect(detail.kindMismatches).toEqual([]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('가드 1: id 는 있는데 종류가 리그가 아니면 missingTournaments 가 아니라 kindMismatches 다', async () => {
    const { prisma, transaction } = fakePrisma({
      tournaments: [{ id: 'league-1', kind: 'regular_tournament' }],
    });

    const error = await backfillLeagueTeamsAsRegistrations(prisma, { dryRun: false }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(LeagueTeamBackfillBlockedError);
    const detail = (error as LeagueTeamBackfillBlockedError).detail;
    // 이 두 줄이 회귀의 핵심이다 — 종류로 걸러 읽으면 이 행이 "없음" 통에 들어가고,
    // 운영자는 "리그 백필을 먼저 돌리자"는 **틀린 조치**로 간다.
    expect(detail.kindMismatches).toEqual([{ leagueId: 'league-1', kind: 'regular_tournament' }]);
    expect(detail.missingTournaments).toEqual([]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('가드 2: owner 가 없는 팀이 있으면 막는다', async () => {
    const { prisma, transaction } = fakePrisma({ owners: [] });

    const error = await backfillLeagueTeamsAsRegistrations(prisma, { dryRun: false }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(LeagueTeamBackfillBlockedError);
    expect((error as LeagueTeamBackfillBlockedError).detail.teamsWithoutOwner).toEqual([
      { leagueId: 'league-1', teamId: 'team-1' },
    ]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('가드 3: 같은 id 가 다른 대회의 등록이면 막는다 — 우리 행이면 재실행이라 통과', async () => {
    const blocked = fakePrisma({ existing: [{ id: 'lt-1', tournamentId: 'other-tournament' }] });
    const error = await backfillLeagueTeamsAsRegistrations(blocked.prisma, {
      dryRun: false,
    }).catch((e: unknown) => e);
    expect((error as LeagueTeamBackfillBlockedError).detail.idConflicts).toEqual([
      { leagueTeamId: 'lt-1', existingTournamentId: 'other-tournament' },
    ]);

    // 같은 리그의 등록이면 재실행이므로 막지 않고 이미 있는 것으로 센다.
    const rerun = fakePrisma({ existing: [{ id: 'lt-1', tournamentId: 'league-1' }] });
    const result = await backfillLeagueTeamsAsRegistrations(rerun.prisma, { dryRun: false });
    expect(result).toMatchObject({ scanned: 1, created: 0, alreadyPresent: 1 });
    expect(rerun.transaction).not.toHaveBeenCalled();
  });

  // ─── dry-run 이 읽기 전용이라는 주장의 증명 ─────────────────────────────────
  // 음성(dry-run 은 안 쓴다)만 두면 "아무 경로도 안 탔다"와 구분이 안 되므로
  // **같은 입력의 양성**(--apply 는 쓴다)을 짝으로 붙인다.

  it('dry-run 은 쓰지 않는다 — 같은 입력에 --apply 면 쓴다', async () => {
    const dry = fakePrisma({});
    const dryResult = await backfillLeagueTeamsAsRegistrations(dry.prisma, { dryRun: true });
    expect(dry.transaction).not.toHaveBeenCalled();
    expect(dryResult).toMatchObject({ scanned: 1, created: 0, dryRun: true });

    const applied = fakePrisma({});
    const applyResult = await backfillLeagueTeamsAsRegistrations(applied.prisma, { dryRun: false });
    expect(applied.transaction).toHaveBeenCalledTimes(1);
    expect(applyResult).toMatchObject({ scanned: 1, created: 1, dryRun: false });
    expect(applied.create).toHaveBeenCalledWith({
      data: {
        id: 'lt-1',
        tournamentId: 'league-1',
        teamId: 'team-1',
        appliedByUserId: 'u-1',
        status: 'confirmed',
        entrySource: 'seeded',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
  });
});
