import { overallStandingsInput, recalculateAndUpsertOverallStandings } from './tournament-overall-standings';
import type { StandingsSourceGroup } from './tournament-group-standings';
import { FOOTBALL_V1_CONFIG } from './competition-config/competition-config';

function group(id: string, regIds: string[], fixtures: Array<[string, string, number, number]>): StandingsSourceGroup {
  return {
    id,
    groupTeams: regIds.map((registrationId) => ({ registrationId })),
    fixtures: fixtures.map(([home, away, hs, as]) => ({
      homeRegistrationId: home,
      awayRegistrationId: away,
      game: { currentOfficialRevision: { state: 'OFFICIAL', score: { home: hs, away: as } } },
    })),
  };
}

describe('overallStandingsInput', () => {
  it('모든 조의 참가팀과 경기를 하나로 합친다', () => {
    const input = overallStandingsInput([
      group('A', ['r1', 'r2'], [['r1', 'r2', 2, 0]]),
      group('B', ['r3', 'r4'], [['r3', 'r4', 1, 1]]),
    ]);
    expect(input.registrationIds.sort()).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(input.fixtures).toHaveLength(2);
  });

  it('같은 팀이 두 조에 중복 배정돼도 registrationId를 한 번만 넣는다', () => {
    const input = overallStandingsInput([
      group('A', ['r1', 'r2'], []),
      group('B', ['r2', 'r3'], []),
    ]);
    expect(input.registrationIds.sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('조가 없으면 빈 입력을 만든다', () => {
    const input = overallStandingsInput([]);
    expect(input.registrationIds).toEqual([]);
    expect(input.fixtures).toEqual([]);
  });
});

/**
 * F4: 통합 순위 유령 행 회귀 테스트.
 *
 * `recalculateAndUpsertOverallStandings()`가 upsert 전에 계산 대상에서 빠진
 * registration의 기존 `V1TournamentOverallStanding` 행을 지우는지 — 조 배정 해제·
 * 조 삭제로 더 이상 어느 조에도 속하지 않는 팀이 통합 순위 공개 API에 유령으로
 * 계속 노출되던 버그(F4)의 회귀 방지.
 */
describe('recalculateAndUpsertOverallStandings (F4: 유령 행 정리)', () => {
  function makeTx() {
    return {
      v1TournamentOverallStanding: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it('조가 하나 이상 있으면 계산 대상 registrationId를 notIn으로 제외하고 나머지를 지운다', async () => {
    const tx = makeTx();
    const groups: StandingsSourceGroup[] = [
      {
        id: 'group-1',
        groupTeams: [{ registrationId: 'reg-1' }, { registrationId: 'reg-2' }],
        fixtures: [],
      },
    ];

    await recalculateAndUpsertOverallStandings(
      tx,
      { tournamentId: 't-1', configVersionId: 'cfg-1', config: FOOTBALL_V1_CONFIG, groups },
      new Date('2026-08-17T00:00:00Z'),
    );

    expect(tx.v1TournamentOverallStanding.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.v1TournamentOverallStanding.deleteMany).toHaveBeenCalledWith({
      where: { tournamentId: 't-1', registrationId: { notIn: ['reg-1', 'reg-2'] } },
    });
  });

  it('조가 하나도 없으면 (계산 대상 0명) notIn: []이 아니라 대회 전체를 지운다', async () => {
    const tx = makeTx();

    await recalculateAndUpsertOverallStandings(
      tx,
      { tournamentId: 't-1', configVersionId: 'cfg-1', config: FOOTBALL_V1_CONFIG, groups: [] },
      new Date('2026-08-17T00:00:00Z'),
    );

    expect(tx.v1TournamentOverallStanding.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.v1TournamentOverallStanding.deleteMany).toHaveBeenCalledWith({
      where: { tournamentId: 't-1' },
    });
    // 빈 배열 분기라 registrationId 필터 자체가 없어야 한다(notIn: []을 쓰지 않는다).
    const call = tx.v1TournamentOverallStanding.deleteMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty('registrationId');
  });

  it('delete가 upsert보다 먼저 호출된다', async () => {
    const tx = makeTx();
    const callOrder: string[] = [];
    tx.v1TournamentOverallStanding.deleteMany.mockImplementation(() => {
      callOrder.push('deleteMany');
      return Promise.resolve({ count: 0 });
    });
    tx.v1TournamentOverallStanding.upsert.mockImplementation(() => {
      callOrder.push('upsert');
      return Promise.resolve({});
    });
    const groups: StandingsSourceGroup[] = [
      { id: 'group-1', groupTeams: [{ registrationId: 'reg-1' }], fixtures: [] },
    ];

    await recalculateAndUpsertOverallStandings(
      tx,
      { tournamentId: 't-1', configVersionId: 'cfg-1', config: FOOTBALL_V1_CONFIG, groups },
      new Date('2026-08-17T00:00:00Z'),
    );

    expect(callOrder[0]).toBe('deleteMany');
    expect(callOrder).toContain('upsert');
  });
});

/**
 * F5: fairPlayByRegistration이 실제로 upsert되는 fairPlayPoints까지 이어지는지 —
 * calculateCompetitionStandings() 자체(competition-standings.spec.ts)는 이미 검증돼
 * 있으므로, 여기서는 recalculateAndUpsertOverallStandings()의 persist 경로에서
 * 끊기지 않는지만 확인한다.
 */
describe('recalculateAndUpsertOverallStandings (F5: fairPlayPoints가 upsert payload에 반영된다)', () => {
  it('동점 상황에서 fairPlayByRegistration이 낮은 팀이 상위(position 1)로 upsert된다', async () => {
    const tx = {
      v1TournamentOverallStanding: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const groups: StandingsSourceGroup[] = [
      {
        id: 'group-1',
        groupTeams: [{ registrationId: 'clean' }, { registrationId: 'dirty' }],
        fixtures: [
          {
            homeRegistrationId: 'clean',
            awayRegistrationId: 'dirty',
            game: { currentOfficialRevision: { state: 'OFFICIAL', score: { home: 1, away: 1 } } },
          },
        ],
      },
    ];

    const standings = await recalculateAndUpsertOverallStandings(
      tx,
      {
        tournamentId: 't-1',
        configVersionId: 'cfg-1',
        config: FOOTBALL_V1_CONFIG,
        groups,
        fairPlayByRegistration: new Map([
          ['clean', 1],
          ['dirty', 7],
        ]),
      },
      new Date('2026-08-17T00:00:00Z'),
    );

    expect(standings.find((s) => s.registrationId === 'clean')?.position).toBe(1);
    const calls = (tx.v1TournamentOverallStanding.upsert as jest.Mock).mock.calls;
    const cleanCall = calls.find((c) => c[0].create.registrationId === 'clean')?.[0];
    expect(cleanCall.create.fairPlayPoints).toBe(1);
    expect(cleanCall.update.fairPlayPoints).toBe(1);
  });
});
