import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { GenerateLeagueFixturesDto } from './dto/admin-league.dto';
import {
  assertLeagueGenerationAllowed,
  buildLeagueFixtureRows,
  bulkFixtureDeleteBlockers,
  LeagueFixtureGeneratorService,
  restrictedFixtureDeleteBlockers,
  type BlockedLeagueFixture,
  type LeagueFixtureReplaceImpact,
} from './league-fixture-generator.service';

/** 아무것도 매달려 있지 않은 대진의 `_count`. 테스트마다 필요한 것만 덮어쓴다. */
const NO_ATTACHMENTS = {
  operationAudits: 0,
  staffScopes: 0,
  videos: 0,
  childFixtures: 0,
  advancementSources: 0,
  advancementTargets: 0,
};

describe('canonical match replacement blockers', () => {
  // 단건 삭제와 일괄 교체가 서로 다른 하한선을 쓰는 것이 의도된 설계다. 단건은 대진 하나를
  // 지목해 확인까지 받으므로 영상 cascade 계약을 유지하고, 일괄은 운영자가 어느 대진에
  // 영상·진출 연결이 걸렸는지 볼 수 없으므로 그것까지 막는다. 두 함수가 같아지면 한쪽이
  // 조용히 콘텐츠를 지우거나(일괄) 지울 수 있는 것을 막는다(단건).
  const withVideosOnly = { game: null, _count: { ...NO_ATTACHMENTS, videos: 2 } };

  it('DB 가 거부하는 사유(게임·감사·스태프 배정)는 두 경로가 똑같이 막는다', () => {
    const fixture = { game: { id: 'g-1' }, _count: { ...NO_ATTACHMENTS, operationAudits: 1, staffScopes: 1 } };
    expect(restrictedFixtureDeleteBlockers(fixture)).toEqual(['game', 'operation_audit', 'staff_scope']);
    expect(bulkFixtureDeleteBlockers(fixture)).toEqual(['game', 'operation_audit', 'staff_scope']);
  });

  it('cascade 로 사라질 콘텐츠는 일괄 교체만 막는다', () => {
    expect(restrictedFixtureDeleteBlockers(withVideosOnly)).toEqual([]);
    expect(bulkFixtureDeleteBlockers(withVideosOnly)).toEqual(['video']);
  });

  it('진출 연결은 source·target 어느 쪽이든 일괄 교체를 막는다', () => {
    expect(
      bulkFixtureDeleteBlockers({ game: null, _count: { ...NO_ATTACHMENTS, advancementTargets: 1 } }),
    ).toEqual(['advancement_edge']);
  });
});

describe('assertLeagueGenerationAllowed', () => {
  const base = {
    format: 'league' as const,
    groupPhase: 'group' as const,
    teamCount: 4,
    existingFixtureCount: 0,
    fixturesWithResultCount: 0,
    blockedFixtures: [] as BlockedLeagueFixture[],
    minMatchesPerTeam: null as number | null,
    legs: 1,
    replaceExisting: false,
  };

  function blocked(fixtureNumber: number, reasons: BlockedLeagueFixture['reasons']): BlockedLeagueFixture {
    return { round: 'league_r1', fixtureNumber, legNumber: 1, reasons };
  }

  /** 예외 본문에서 `details` 만 뽑는다 — 클라이언트가 실제로 받는 부분이 여기뿐이다. */
  function detailsOf(run: () => void): Record<string, unknown> {
    try {
      run();
    } catch (error) {
      const response = (error as ConflictException).getResponse() as { details?: unknown };
      return (response.details ?? {}) as Record<string, unknown>;
    }
    throw new Error('should have thrown');
  }

  function responseOf(run: () => void): { code: string; message: string } {
    try {
      run();
    } catch (error) {
      return (error as ConflictException).getResponse() as { code: string; message: string };
    }
    throw new Error('should have thrown');
  }

  it('아무것도 매달려 있지 않은 대진만 있으면 교체를 허용한다', () => {
    expect(() =>
      assertLeagueGenerationAllowed({ ...base, replaceExisting: true, existingFixtureCount: 28 }),
    ).not.toThrow();
  });

  // 거절할 때는 "무엇이 막고 있는지"를 반드시 말해야 한다. 예전 문구("해당 경기를 먼저
  // 정리해주세요")는 정리할 방법이 없는 상태를 가리켰다.
  it('지울 수 없는 대진이 있으면 어느 대진이 왜 막혔는지 지목하고 거부한다', () => {
    const response = responseOf(() =>
      assertLeagueGenerationAllowed({
        ...base,
        replaceExisting: true,
        existingFixtureCount: 6,
        blockedFixtures: [blocked(3, ['game', 'operation_audit'])],
      }),
    );
    expect(response.code).toBe('LEAGUE_FIXTURES_NOT_DELETABLE');
    expect(response.message).toContain('league_r1 3번');
    expect(response.message).toContain('경기 기록');
    expect(response.message).toContain('운영 감사 기록');
  });

  it('막힌 대진이 많으면 앞의 다섯 건만 지목하고 나머지는 개수로 말한다', () => {
    const response = responseOf(() =>
      assertLeagueGenerationAllowed({
        ...base,
        replaceExisting: true,
        existingFixtureCount: 28,
        blockedFixtures: Array.from({ length: 28 }, (_, index) => blocked(index + 1, ['game'])),
      }),
    );
    expect(response.message).toContain('league_r1 5번');
    expect(response.message).not.toContain('league_r1 6번');
    expect(response.message).toContain('외 23개');
  });

  it('NOT_DELETABLE 은 409 이고 details 로 막힌 대진 수를 함께 준다', () => {
    const details = detailsOf(() =>
      assertLeagueGenerationAllowed({
        ...base,
        replaceExisting: true,
        existingFixtureCount: 6,
        blockedFixtures: [blocked(1, ['game']), blocked(2, ['staff_scope'])],
      }),
    );
    expect(details.blockedFixtureCount).toBe(2);
    expect(details.blockedFixtures).toEqual([blocked(1, ['game']), blocked(2, ['staff_scope'])]);
  });

  // 어드민이 "교체할까요?" 를 누르기 전에 무엇이 사라지는지 보여주려면 사전 영향이 응답에
  // 실려야 한다. 최상위 필드는 `AllExceptionsFilter` 가 버리므로 details 아래여야 한다
  // (파일은 common/filters/http-exception.filter.ts — 파일명과 클래스명이 다르다).
  it('ALREADY_EXIST 는 교체 시 무엇이 삭제되는지 details 로 함께 준다', () => {
    const details = detailsOf(() =>
      assertLeagueGenerationAllowed({ ...base, existingFixtureCount: 28 }),
    ) as unknown as LeagueFixtureReplaceImpact;
    expect(details).toEqual({
      existingFixtureCount: 28,
      fixturesWithResultCount: 0,
      blockedFixtureCount: 0,
      deletableFixtureCount: 28,
      blockedFixtures: [],
      replaceable: true,
    });
  });

  it('ALREADY_EXIST 의 replaceable 은 지울 수 없는 대진이 있으면 false 다', () => {
    const details = detailsOf(() =>
      assertLeagueGenerationAllowed({
        ...base,
        existingFixtureCount: 28,
        fixturesWithResultCount: 2,
        blockedFixtures: [blocked(1, ['game'])],
      }),
    ) as unknown as LeagueFixtureReplaceImpact;
    expect(details.replaceable).toBe(false);
    expect(details.deletableFixtureCount).toBe(27);
  });

  it('순수 토너먼트 대회면 거부한다 — 브래킷 대진은 조 순위에서 뽑아야 한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, format: 'knockout' }))
      .toThrow(UnprocessableEntityException);
  });

  // 조별리그+토너먼트의 조 단계는 리그와 대진 규칙이 같은데도 format 검사에서 먼저 막혀
  // 8팀 조 28경기를 손으로 넣어야 했다.
  it('조별리그+토너먼트 대회의 조 단계는 허용한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, format: 'group_knockout' })).not.toThrow();
  });

  // 다만 결선 조는 여전히 막는다 — 진출팀 결정은 이 생성기가 할 일이 아니다.
  it('조별리그+토너먼트라도 결선 조에서는 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, format: 'group_knockout', groupPhase: 'semi' }))
      .toThrow(UnprocessableEntityException);
  });

  it('조 phase가 group이 아니면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, groupPhase: 'knockout' }))
      .toThrow(UnprocessableEntityException);
  });

  it('팀이 2팀 미만이면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, teamCount: 1 }))
      .toThrow(UnprocessableEntityException);
  });

  it('replaceExisting=false인데 fixture가 이미 있으면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, existingFixtureCount: 3 }))
      .toThrow(ConflictException);
  });

  // 결과 확정은 "지울 수 없다" 중에서도 가장 구체적인 사실이라 일반 거절보다 먼저 나가야
  // 한다 — 두 조건을 동시에 만족하는 조에서 운영자가 받는 문구가 뒤바뀌면 안 된다.
  it('replaceExisting=true여도 결과가 확정된 fixture가 있으면 그 이유를 먼저 알려준다', () => {
    const response = responseOf(() =>
      assertLeagueGenerationAllowed({
        ...base,
        replaceExisting: true,
        existingFixtureCount: 3,
        fixturesWithResultCount: 1,
        blockedFixtures: [blocked(1, ['game'])],
      }),
    );
    expect(response.code).toBe('LEAGUE_FIXTURES_HAVE_RESULTS');
  });

  it('최소 경기 수에 미달하면 거부하고 필요한 legs를 details 로 알려준다', () => {
    const details = detailsOf(() =>
      assertLeagueGenerationAllowed({ ...base, teamCount: 4, legs: 1, minMatchesPerTeam: 5 }),
    );
    expect(details).toEqual({ requiredLegs: 2, currentMatchesPerTeam: 3 });
  });

  it('조건을 모두 만족하면 통과한다', () => {
    expect(() => assertLeagueGenerationAllowed(base)).not.toThrow();
  });
});

describe('buildLeagueFixtureRows', () => {
  it('라운드 번호를 round 문자열로, leg를 legNumber로 매핑한다', () => {
    const rows = buildLeagueFixtureRows({
      groupId: 'g1',
      registrationIds: ['r1', 'r2'],
      legs: 2,
      balanceHome: true,
      schedule: null,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].legNumber).toBe(1);
    expect(rows[1].legNumber).toBe(2);
    expect(rows[0].round).toBe('league_r1');
    expect(rows[0].startAt).toBeNull();
  });

  it('fixtureNumber가 1부터 연속으로 매겨진다', () => {
    const rows = buildLeagueFixtureRows({
      groupId: 'g1',
      registrationIds: ['r1', 'r2', 'r3', 'r4'],
      legs: 1, balanceHome: true, schedule: null,
    });
    expect(rows.map((r) => r.fixtureNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('fixtureNumberOffset을 주면 그만큼 밀려서 매겨진다 (F3)', () => {
    const rows = buildLeagueFixtureRows({
      groupId: 'g2',
      registrationIds: ['r3', 'r4'],
      legs: 1, balanceHome: true, schedule: null,
      fixtureNumberOffset: 6,
    });
    expect(rows.map((r) => r.fixtureNumber)).toEqual([7]);
  });

  it('schedule이 있으면 라운드별 startAt을 주차로 채운다', () => {
    const rows = buildLeagueFixtureRows({
      groupId: 'g1',
      registrationIds: ['r1', 'r2', 'r3', 'r4'],
      legs: 1, balanceHome: true,
      schedule: { startsOn: new Date('2026-09-01T00:00:00.000Z'), template: { dayOfWeek: 6, time: '20:00' } },
    });
    const round1 = rows.filter((r) => r.round === 'league_r1');
    const round2 = rows.filter((r) => r.round === 'league_r2');
    expect(round1[0].startAt).not.toBeNull();
    expect(round2[0].startAt!.getTime() - round1[0].startAt!.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});


describe('LeagueFixtureGeneratorService.generate', () => {
  const user: V1AuthUser = {
    id: 'user-1',
    email: 'user-1@teameet.test',
    accountStatus: 'active',
    onboardingStatus: 'completed',
  };
  const admin = { id: 'admin-1', userId: 'user-1', adminRole: 'ops' as const, status: 'active' as const };

  /** 쓰기 계열 호출을 일어난 순서대로 기록한다 — "삭제가 새 생성보다 먼저인가" 를 본다. */
  let writeLog: string[] = [];

  const prisma = {
    v1Tournament: { findFirst: jest.fn() },
    v1TournamentGroup: { findFirst: jest.fn() },
    v1TournamentRegistration: { findMany: jest.fn() },
    v1TournamentPlayer: { findMany: jest.fn() },
    v1IdempotencyRecord: { findFirst: jest.fn() },
    v1TournamentMatchDetails: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    v1GameResultRevision: { findUnique: jest.fn() },
    v1TeamMatch: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    v1TeamSchedule: { create: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    v1GameSide: { update: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };
  const adminContext = { getMutationAdmin: jest.fn(), logAdminAction: jest.fn() };
  const games = { createFromSourceInTransaction: jest.fn() };

  let service: LeagueFixtureGeneratorService;

  /**
   * 조에 배정된 registrationId 들을 전부 confirmed 로 돌려주는 기본 응답.
   *
   * **프로필을 함께 싣는다.** 참가자 이름은 닉네임이 먼저이고(`participantDisplayName`),
   * 조회가 프로필을 안 실으면 규칙이 폴백으로 떨어져 이 스펙이 무엇을 재는지 흐려진다 —
   * 여기서 재려는 건 "리그 대진 생성이 등록 명단을 참가자로 잇는가" 이고, 이름이 그 증거다.
   */
  function confirmedRegistrations({ where }: { where: { id: { in: string[] } } }) {
    return Promise.resolve(
      where.id.in.map((registrationId) => ({
        id: registrationId,
        status: 'confirmed',
        teamId: `team-${registrationId}`,
        team: { id: `team-${registrationId}`, name: `${registrationId} 팀` },
        players: [
          {
            id: `player-${registrationId}`,
            userId: `user-${registrationId}`,
            realName: `${registrationId} 선수`,
            user: { profile: { nickname: `${registrationId} 닉`, displayName: null } },
          },
        ],
      })),
    );
  }

  /** 프로필이 없는 명단 행 — 폴백이 실제로 `'팀원'` 인지 같은 스펙이 잠근다. */
  function confirmedRegistrationsWithoutProfile({ where }: { where: { id: { in: string[] } } }) {
    return Promise.resolve(
      where.id.in.map((registrationId) => ({
        id: registrationId,
        status: 'confirmed',
        teamId: `team-${registrationId}`,
        team: { id: `team-${registrationId}`, name: `${registrationId} 팀` },
        players: [
          {
            id: `player-${registrationId}`,
            userId: `user-${registrationId}`,
            realName: `${registrationId} 선수`,
            user: { profile: null },
          },
        ],
      })),
    );
  }

  function groupOf(id: string, registrationIds: string[]) {
    return {
      id,
      name: `${id} 조`,
      phase: 'group',
      groupTeams: registrationIds.map((registrationId, index) => ({ registrationId, sortOrder: index })),
    };
  }

  /**
   * 기존 canonical 대진 한 행. 서비스가 실제로 읽는 모양(`round`/`fixtureNumber`/`legNumber` + `teamMatch.game` +
   * 관계별 `_count`) 그대로 만든다 — 모양이 어긋나면 "조정 가능한가" 판정이
   * 스펙에서만 통하는 거짓이 된다.
   */
  function existingFixture(
    id: string,
    game: { id: string; officialState?: string | null } | null,
    extra: {
      result?: { id: string } | null;
      counts?: Partial<typeof NO_ATTACHMENTS>;
      round?: string;
      fixtureNumber?: number;
      startAt?: Date | null;
    } = {},
  ) {
    const homeRegistrationId = 'r1';
    const awayRegistrationId = 'r2';
    const homeTeamId = 'team-r1';
    const awayTeamId = 'team-r2';
    return {
      teamMatchId: id,
      homeRegistrationId,
      awayRegistrationId,
      round: extra.round ?? 'league_r1',
      fixtureNumber: extra.fixtureNumber ?? 1,
      legNumber: 1,
      parentTeamMatchId: null,
      groupId: 'group-a',
      teamMatch: {
        id,
        hostTeamId: homeTeamId,
        approvedApplicantTeamId: awayTeamId,
        startAt: extra.startAt ?? null,
        endAt: null,
        placeName: null,
        status: 'matched',
        competitionConfigVersionId: 'ccv-1',
        game: game
          ? {
              id: game.id,
              state: 'SCHEDULED',
              sourceType: 'TEAM_MATCH',
              teamMatchId: id,
              competitionConfigVersionId: 'ccv-1',
              sides: [
                { id: `${game.id}-home`, sideKey: 'HOME', teamId: homeTeamId },
                { id: `${game.id}-away`, sideKey: 'AWAY', teamId: awayTeamId },
              ],
              currentOfficialRevision: game.officialState ? { state: game.officialState } : null,
            }
          : null,
        _count: {
          operationAudits: extra.counts?.operationAudits ?? 0,
          staffScopes: extra.counts?.staffScopes ?? 0,
          videos: extra.counts?.videos ?? 0,
        },
      },
      _count: {
        childTeamMatches: extra.counts?.childFixtures ?? 0,
        advancementSources: extra.counts?.advancementSources ?? 0,
        advancementTargets: extra.counts?.advancementTargets ?? 0,
      },
    };
  }

  /** create 로 실제 저장된 fixture 행들(호출 순서대로). */
  function createdFixtureRows() {
    return prisma.v1TournamentMatchDetails.create.mock.calls.map((call) => call[0].data as Record<string, unknown>);
  }

  /** games.createFromSourceInTransaction 에 넘어간 (input, context) 쌍들. */
  function gameCreations() {
    return games.createFromSourceInTransaction.mock.calls.map((call) => ({
      input: call[1] as {
        sourceType: string;
        sourceId: string;
        competitionConfigVersionId: string;
        sides: Array<{ sideKey: string; teamId: string | null; displayNameSnapshot: string }>;
        participants: Array<{ sourceParticipantId: string; userId?: string; sideKey: string; displayNameSnapshot: string }>;
      },
      context: call[2] as { durableCommandId: string; payloadHash: string; expectedVersion: number },
    }));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    writeLog = [];
    prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma));
    adminContext.getMutationAdmin.mockResolvedValue(admin);
    adminContext.logAdminAction.mockResolvedValue({ actionLogId: 'log-1', statusChangeLogId: null });
    prisma.v1Tournament.findFirst.mockResolvedValue({
      id: 't1',
      format: 'league',
      minMatchesPerTeam: null,
      competitionConfigVersionId: 'ccv-1',
    });
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([]);
    prisma.v1TournamentMatchDetails.findUniqueOrThrow.mockImplementation(({ where }: { where: { teamMatchId: string } }) =>
      Promise.resolve(existingFixture(where.teamMatchId, { id: `game-${where.teamMatchId}` })),
    );
    prisma.v1TournamentMatchDetails.findFirst.mockResolvedValue({ teamMatchId: 'parent' });
    prisma.v1IdempotencyRecord.findFirst.mockResolvedValue(null);
    prisma.v1GameResultRevision.findUnique.mockResolvedValue(null);
    prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      const id = String(values[0] ?? '');
      const query = strings.join(' ');
      if (query.includes('FROM v1_games')) {
        return Promise.resolve([{ id: `game-${id}`, state: 'SCHEDULED', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: null }]);
      }
      if (query.includes('FROM v1_team_matches')) {
        return Promise.resolve([{ id, deletedAt: null }]);
      }
      return Promise.resolve([]);
    });
    prisma.v1TournamentMatchDetails.update.mockResolvedValue({});
    prisma.v1TournamentMatchDetails.aggregate.mockResolvedValue({ _max: { fixtureNumber: null } });
    prisma.v1TournamentMatchDetails.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      writeLog.push('fixture.create');
      return Promise.resolve({ teamMatchId: String(data.teamMatchId), ...data });
    });
    prisma.v1TeamMatch.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: data.id, tournamentId: data.tournamentId, ...data }),
    );
    prisma.v1TeamMatch.update.mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      Promise.resolve({ id: where.id, tournamentId: 't1', title: 'updated', startAt: data.startAt ?? null, placeName: data.placeName ?? null, status: 'matched', createdAt: new Date(), updatedAt: new Date() }),
    );
    prisma.v1TeamMatch.findUnique.mockResolvedValue(null);
    prisma.v1TeamMatch.findUniqueOrThrow.mockResolvedValue({ hostTeamId: 'team-r1', approvedApplicantTeamId: 'team-r2' });
    prisma.v1TeamSchedule.create.mockResolvedValue({});
    prisma.v1TeamSchedule.updateMany.mockResolvedValue({ count: 0 });
    prisma.v1TeamSchedule.count = jest.fn().mockResolvedValue(0);
    prisma.v1GameSide.update.mockResolvedValue({});
    prisma.v1TournamentRegistration.findMany.mockImplementation(confirmedRegistrations);
    prisma.v1TournamentPlayer.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(where.id.in.map((id) => ({
        id,
        registrationId: id.replace(/^player-/, ''),
        userId: id.replace(/^player-/, 'user-'),
        removedAt: null,
      }))),
    );
    games.createFromSourceInTransaction.mockResolvedValue({ gameId: 'game-1' });
    service = new LeagueFixtureGeneratorService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminContext as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      games as any,
    );
  });

  function dto(overrides: Partial<GenerateLeagueFixturesDto> = {}): GenerateLeagueFixturesDto {
    return { groupId: 'group-a', legs: 1, ...overrides } as GenerateLeagueFixturesDto;
  }

  // C1: 생성기가 fixture 행만 만들고 게임을 만들지 않아, 만들어진 경기가 공개 일정
  // (presentScheduleEntry 가 game 없는 fixture 를 hidden 으로 접는다)·경기 상세(404)·
  // canonical TeamMatch/Game가 생성되지 않으면 공개 일정과 경기 상세가 끊긴다.
  it('C1: 만든 대진마다 그 fixture 를 가리키는 게임을 함께 만든다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2', 'r3', 'r4']));

    const result = await service.generate(user, 't1', dto());

    expect(result.created).toBe(6);
    const fixtureIds = createdFixtureRows().map((row) => String(row.teamMatchId));
    expect(fixtureIds).toHaveLength(6);
    const creations = gameCreations();
    // 대진 하나당 게임 하나 — 개수가 아니라 "어느 fixture 를 가리키는가"까지 본다.
    expect(creations.map((creation) => creation.input.sourceId)).toEqual(fixtureIds);
    expect(creations.map((creation) => creation.input.sourceType)).toEqual(Array(6).fill('TEAM_MATCH'));
    expect(creations.map((creation) => creation.input.competitionConfigVersionId)).toEqual(Array(6).fill('ccv-1'));
  });

  // C1: fixture 행의 competitionConfigVersionId 가 비어 있으면 나중에 fixture-game-backfill
  // CLI 조차 CONFIG_MISSING 으로 격리해 버려서 복구 수단이 사라진다.
  it('C1: fixture 행마다 대회가 못 박은 경기 규칙 버전을 함께 저장한다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2', 'r3', 'r4']));

    await service.generate(user, 't1', dto());

    const creations = gameCreations();
    expect(creations).toHaveLength(6);
    expect(creations.map((creation) => creation.input.competitionConfigVersionId)).toEqual(Array(6).fill('ccv-1'));
  });

  // D1: 커맨드 키는 "이 루프 안의 중복 생성" 을 막지 않는다(멱등 조회가 fixture.id 로
  // 스코프된다). 좌표별로 다른 키를 쓰는 실제 이유는 경로 간 멱등성 — 같은 대진을 수동 폼으로
  // 다시 만들면 같은 키·같은 payloadHash 가 나와 중복 생성 대신 재생으로 처리된다. 따라서
  // "건마다 고유하면서 재실행에는 동일" 이 지켜야 할 성질이다.
  it('D1: 대진마다 다른 커맨드 키를 쓰되, 같은 대진을 다시 만들면 같은 키를 쓴다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2', 'r3', 'r4']));

    await service.generate(user, 't1', dto());
    const first = gameCreations().map((creation) => creation.context);

    games.createFromSourceInTransaction.mockClear();
    prisma.v1TournamentMatchDetails.create.mockClear();
    await service.generate(user, 't1', dto());
    const second = gameCreations().map((creation) => creation.context);

    expect(new Set(first.map((context) => context.durableCommandId)).size).toBe(6);
    expect(new Set(first.map((context) => context.payloadHash)).size).toBe(6);
    expect(second.map((context) => context.durableCommandId)).toEqual(
      first.map((context) => context.durableCommandId),
    );
    expect(second.map((context) => context.payloadHash)).toEqual(first.map((context) => context.payloadHash));
  });

  // C1: 라인업 화면은 게임 참가자를 등록 명단(V1TournamentPlayer)의 그 사람과 이어야 한다 —
  // userId 없이 이름만 실으면 동명이인을 구분할 수 없다(createFixture 와 같은 이유).
  it('C1: 게임에 양 팀과 등록 명단을 스냅샷으로 싣는다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));

    await service.generate(user, 't1', dto());

    const row = createdFixtureRows()[0];
    const home = row.homeRegistrationId as string;
    const away = row.awayRegistrationId as string;
    const { input } = gameCreations()[0];
    expect(input.sides).toEqual([
      { sideKey: 'HOME', teamId: `team-${home}`, displayNameSnapshot: `${home} 팀` },
      { sideKey: 'AWAY', teamId: `team-${away}`, displayNameSnapshot: `${away} 팀` },
    ]);
    expect(input.participants).toEqual([
      {
        sourceParticipantId: `player-${home}`,
        userId: `user-${home}`,
        sideKey: 'HOME',
        // **실명이 아니라 닉네임이다.** 실명(`… 선수`)이 나오면 규칙이 안 걸린 것이다.
        displayNameSnapshot: `${home} 닉`,
      },
      {
        sourceParticipantId: `player-${away}`,
        userId: `user-${away}`,
        sideKey: 'AWAY',
        displayNameSnapshot: `${away} 닉`,
      },
    ]);
  });

  /**
   * **폴백은 실명이 아니라 `'팀원'` 이다.** 프로필 행이 없을 때만 닿는 자리인데, 그때
   * 실명으로 떨어지면 이 경로가 **사용자가 고르지 않은 쪽 이름**을 스냅샷에 남긴다.
   * 위 케이스와 짝이라 갈리는 것이 "프로필 유무" 하나로 좁혀진다.
   */
  it('C1-b: 프로필이 없는 명단 행은 팀원으로 스냅샷된다 — 실명이 아니다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));
    prisma.v1TournamentRegistration.findMany.mockImplementation(confirmedRegistrationsWithoutProfile);

    await service.generate(user, 't1', dto());

    const row = createdFixtureRows()[0];
    const home = row.homeRegistrationId as string;
    const away = row.awayRegistrationId as string;
    const names = gameCreations()[0].input.participants.map((participant) => participant.displayNameSnapshot);
    expect(names).toEqual(['팀원', '팀원']);
    expect(names).not.toContain(`${home} 선수`);
    expect(names).not.toContain(`${away} 선수`);
  });

  // C1: 규칙 버전이 없으면 게임을 만들 수 없다 — 그런데도 fixture 만 만들어 두면 그게 바로
  // "공개 일정에서 사라지는" 그 행이 된다. 기존 대진을 건드리기 전에 거부해야 한다.
  it('C1: 대회에 활성 경기 규칙 버전이 없으면 기존 대진을 건드리지 않고 거부한다', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({
      id: 't1',
      format: 'league',
      minMatchesPerTeam: null,
      competitionConfigVersionId: null,
    });
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([existingFixture('fx-old', null)]);

    await expect(
      service.generate(user, 't1', dto({ replaceExisting: true })),
    ).rejects.toMatchObject({ response: { code: 'COMPETITION_CONFIG_REQUIRED' } });

    expect(writeLog).toEqual([]);
    expect(games.createFromSourceInTransaction).not.toHaveBeenCalled();
  });

  // ── D1: 교체는 canonical TeamMatch를 좌표 그대로 조정한다 ────────────────
  // 결과·감사·스태프 범위가 연결된 TeamMatch를 삭제하지 않고, 동일 좌표의
  // SCHEDULED 경기만 updateTournamentMatchInTx로 조정한다.
  it('D1: 교체는 canonical 대진을 삭제하지 않고 좌표를 보존해 조정한다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      existingFixture('fx-old-1', { id: 'game-fx-old-1' }, { fixtureNumber: 1, startAt: new Date('2026-09-01T20:00:00.000Z') }),
    ]);

    const result = await service.generate(user, 't1', dto({ replaceExisting: true }));

    expect(writeLog).toEqual([]);
    expect(prisma.v1TournamentMatchDetails.create).not.toHaveBeenCalled();
    expect(prisma.v1TeamMatch.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'fx-old-1' } }));
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: 'tournament.league.fixtures.reconcile' }),
      expect.anything(),
    );
    expect(result.deleted).toBe(0);
    expect(result.created).toBe(0);
  });

  // 취소 표식(tombstone)이 되살아나면 진행률·매직넘버·카드 정지가 다시 오염된다.
  it('D1: 교체는 대진이나 게임을 취소 상태로 바꾸지 않는다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      existingFixture('fx-old-1', { id: 'game-fx-old-1' }, { startAt: new Date('2026-09-01T20:00:00.000Z') }),
    ]);

    await service.generate(user, 't1', dto({ replaceExisting: true }));

    expect(writeLog).toEqual([]);
    for (const call of prisma.v1TournamentMatchDetails.create.mock.calls) {
      expect(call[0].data).not.toHaveProperty('status');
    }
  });

  it('D1: 기존 canonical 좌표와 계획이 다르면 삭제 대신 명시적으로 재조정이 필요하다고 거부한다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      existingFixture('fx-old-1', null, { fixtureNumber: 1 }),
      existingFixture('fx-old-2', null, { fixtureNumber: 2 }),
    ]);
    await expect(
      service.generate(user, 't1', dto({ replaceExisting: true })),
    ).rejects.toMatchObject({ response: { code: 'LEAGUE_FIXTURES_RECONCILIATION_REQUIRED' } });

    expect(writeLog).toEqual([]);
    expect(games.createFromSourceInTransaction).not.toHaveBeenCalled();
  });

  it('D1: canonical 정본 Game이 사라진 대진은 도메인 오류로 반환한다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      existingFixture('fx-old-1', { id: 'game-fx-old-1' }, { startAt: new Date('2026-09-01T20:00:00.000Z') }),
    ]);
    prisma.v1TournamentMatchDetails.findUniqueOrThrow.mockResolvedValueOnce(existingFixture('fx-old-1', null));
    await expect(
      service.generate(user, 't1', dto({ replaceExisting: true })),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_MATCH_GAME_MISSING' } });
  });

  it('D1: 삭제는 어드민 액션 로그로 남는다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      existingFixture('fx-old-1', { id: 'game-fx-old-1' }, { startAt: new Date('2026-09-01T20:00:00.000Z') }),
    ]);

    await service.generate(user, 't1', dto({ replaceExisting: true }));

    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        action: 'tournament.league.fixtures.reconcile',
        targetId: 'group-a',
        afterJson: expect.objectContaining({ fixtureIds: ['fx-old-1'], fixtureCount: 1 }),
      }),
      expect.anything(),
    );
  });

  it.each([
    ['정본 Game이 붙은', { game: { id: 'g-1' }, counts: {}, rejects: false }],
    ['운영 감사 기록이 남은', { game: { id: 'g-1' }, counts: { operationAudits: 1 }, rejects: false }],
    ['스태프가 배정된', { game: { id: 'g-1' }, counts: { staffScopes: 1 }, rejects: false }],
    ['영상이 붙은', { game: { id: 'g-1' }, counts: { videos: 1 }, rejects: true }],
    ['진출 연결이 걸린', { game: { id: 'g-1' }, counts: { advancementSources: 1 }, rejects: true }],
  ])('D1: %s canonical 연결의 교체 정책을 적용한다', async (_label, { game, counts, rejects }) => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      existingFixture('fx-1', game, { counts, startAt: new Date('2026-09-01T20:00:00.000Z') }),
    ]);

    if (rejects) {
      await expect(
        service.generate(user, 't1', dto({ replaceExisting: true })),
      ).rejects.toMatchObject({ response: { code: 'LEAGUE_FIXTURES_NOT_DELETABLE' } });
      expect(writeLog).toEqual([]);
      expect(games.createFromSourceInTransaction).not.toHaveBeenCalled();
    } else {
      const result = await service.generate(user, 't1', dto({ replaceExisting: true }));
      expect(result.created).toBe(0);
      expect(result.deleted).toBe(0);
      expect(games.createFromSourceInTransaction).not.toHaveBeenCalled();
    }
  });

  it('D1: canonical Details에 Game이 없으면 쓰기 전에 정본 누락 오류를 반환한다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));
    prisma.v1TournamentMatchDetails.findMany
      .mockResolvedValueOnce([existingFixture('fx-1', null, { startAt: new Date('2026-09-01T20:00:00.000Z') })])
      .mockResolvedValueOnce([existingFixture('fx-1', { id: 'g-1' })]);

    await expect(
      service.generate(user, 't1', dto({ replaceExisting: true })),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_MATCH_GAME_MISSING' } });

    expect(writeLog).toEqual([]);
  });

  // ── D4: 앱 상한이 프록시 상한보다 낮아야 한다 ─────────────────────────────
  // 예전 값(120초)은 앞단 ALB idle_timeout 60초보다 커서, 운영자가 504 를 받고 "실패했다"고
  // 믿는 동안 백엔드는 계속 돌아 그대로 커밋했다. 그 조는 방금 만들어진 게임 때문에 교체도
  // 안 돼 영영 잠긴다. 상수 자체가 아니라 **부등식**을 못박는다.
  it('D4: 트랜잭션 상한은 앞단 프록시(ALB idle 60초)보다 낮다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));

    await service.generate(user, 't1', dto());

    const options = prisma.$transaction.mock.calls[0][1] as { timeout: number; maxWait: number };
    expect(options.timeout + options.maxWait).toBeLessThan(60_000);
  });

  it('D4: 시간 초과로 트랜잭션이 만료되면 무엇도 저장되지 않았음을 알려준다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2', 'r3', 'r4']));
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction.',
        { code: 'P2028', clientVersion: 'test' },
      ),
    );

    const error = await service
      .generate(user, 't1', dto({ legs: 2 }))
      .then(() => null)
      .catch((err: UnprocessableEntityException) => err);
    const response = error!.getResponse() as {
      code: string;
      message: string;
      details: { plannedFixtureCount: number };
    };

    expect(response.code).toBe('LEAGUE_FIXTURES_GENERATION_TIMEOUT');
    // 4팀 2회전 = 12대진. 운영자가 "얼마나 크길래" 를 알 수 있어야 조를 나눌 판단이 선다.
    expect(response.details.plannedFixtureCount).toBe(12);
    expect(response.message).toContain('저장된 대진은 하나도 없으니');
  });

  // 같은 P2028 이라도 "커넥션 풀이 없어 트랜잭션을 시작조차 못 함"은 잠시 뒤 재시도로 풀린다.
  // 전역 필터가 503 으로 번역하도록 그대로 흘려보내야 한다 — 여기서 삼키면 "조를 작게
  // 나누세요" 라는 엉뚱한 안내를 하게 된다.
  it('D4: 커넥션 풀 포화로 트랜잭션을 시작 못 한 경우는 가로채지 않는다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Transaction API error: Unable to start a transaction in the given time.',
        { code: 'P2028', clientVersion: 'test' },
      ),
    );

    await expect(service.generate(user, 't1', dto())).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  // C1: 게임의 사이드는 등록의 팀에서 나온다 — 확정되지 않은(취소된) 신청이 섞이면 팀 없는
  // 게임이 만들어져 또 다른 유령 경기가 된다. createFixture 의 REGISTRATION_INVALID 계약과 동치.
  it('C1: 조에 확정 상태가 아닌 신청이 있으면 아무 대진도 만들지 않는다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { id: 'r1', status: 'confirmed', teamId: 'team-r1', team: { id: 'team-r1', name: 'r1 팀' }, players: [] },
    ]);

    await expect(service.generate(user, 't1', dto())).rejects.toMatchObject({
      response: { code: 'LEAGUE_REGISTRATION_NOT_CONFIRMED' },
    });
    expect(writeLog).toEqual([]);
    expect(games.createFromSourceInTransaction).not.toHaveBeenCalled();
  });

  // D1: 8팀 조에서 "확정이 아닌 신청이 있어요" 만 받으면 운영자는 신청 목록을 한 줄씩
  // 대조해야 한다 — 어드민 대진표에는 조 팀별 신청 상태 표시가 없다.
  it('D1: 확정이 아닌 팀을 이름과 상태까지 지목한다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2', 'r3', 'r4']));
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      { id: 'r1', status: 'confirmed', teamId: 'team-r1', team: { id: 'team-r1', name: '강남FC' }, players: [] },
      { id: 'r2', status: 'cancelled', teamId: 'team-r2', team: { id: 'team-r2', name: '서초유나이티드' }, players: [] },
      { id: 'r3', status: 'confirmed', teamId: 'team-r3', team: { id: 'team-r3', name: '송파스포츠' }, players: [] },
      { id: 'r4', status: 'cancel_requested', teamId: 'team-r4', team: { id: 'team-r4', name: '마포클럽' }, players: [] },
    ]);

    const error = await service
      .generate(user, 't1', dto())
      .then(() => null)
      .catch((err: UnprocessableEntityException) => err);
    const response = error!.getResponse() as {
      code: string;
      message: string;
      details: { registrations: Array<{ registrationId: string; teamName: string | null; status: string | null }> };
    };

    expect(response.code).toBe('LEAGUE_REGISTRATION_NOT_CONFIRMED');
    expect(response.details.registrations).toEqual([
      { registrationId: 'r2', teamName: '서초유나이티드', status: 'cancelled' },
      { registrationId: 'r4', teamName: '마포클럽', status: 'cancel_requested' },
    ]);
    // 메시지만 읽는 화면(토스트)에서도 어느 팀인지 보여야 한다.
    expect(response.message).toContain('서초유나이티드');
    expect(response.message).toContain('마포클럽');
    expect(response.message).not.toContain('강남FC');
  });

  // F3: 조가 2개면 대진 생성이 실패한다 — fixtureNumber가 대회 전체에서 겹치지 않는지 증명.
  it('F3: 조 2개에 각각 대진을 생성해도 fixtureNumber가 겹치지 않는다', async () => {
    // A조: 2팀 → 1경기. 대회에 기존 fixture 없음(max=null).
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));
    prisma.v1TournamentMatchDetails.aggregate.mockResolvedValueOnce({ _max: { fixtureNumber: null } });

    await service.generate(user, 't1', dto({ groupId: 'group-a' }));
    const groupARows = createdFixtureRows() as Array<{ round: string; fixtureNumber: number; legNumber: number }>;
    expect(groupARows.map((row) => row.fixtureNumber)).toEqual([1]);

    // B조: 3팀 → 3경기. B조 생성 시점엔 A조가 이미 fixtureNumber=1을 썼으므로 max=1.
    prisma.v1TournamentMatchDetails.create.mockClear();
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-b', ['r3', 'r4', 'r5']));
    prisma.v1TournamentMatchDetails.aggregate.mockResolvedValueOnce({ _max: { fixtureNumber: 1 } });

    await service.generate(user, 't1', dto({ groupId: 'group-b' }));
    const groupBRows = createdFixtureRows() as Array<{ round: string; fixtureNumber: number; legNumber: number }>;

    // 수정 전이었다면 B조도 round='league_r1', fixtureNumber=1, legNumber=1로 시작해서
    // A조의 (tournamentId, round, fixtureNumber, legNumber) unique 제약을 위반했을 것이다.
    expect(groupBRows.map((row) => row.fixtureNumber)).toEqual([2, 3, 4]);

    const combined = [...groupARows, ...groupBRows];
    const uniqueKeys = new Set(combined.map((row) => `${row.round}:${row.fixtureNumber}:${row.legNumber}`));
    expect(uniqueKeys.size).toBe(combined.length);
  });

  // F2-1: VOID 등 비공식 리비전은 "결과 있음"으로 오판하면 안 된다. 그래도 게임이 붙어 있는
  // 이상 그 대진은 지울 수 없으므로 교체는 막힌다 — 다만 이유가 "결과 확정"이 아니라
  // "지울 수 없음"이어야 운영자가 결과 삭제를 시도하는 헛수고를 하지 않는다.
  it('F2: VOID 리비전만 있는 fixture는 "결과 확정"이 아니라 "지울 수 없음"으로 막힌다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      existingFixture('fx-1', { id: 'g-1', officialState: 'VOID' }, { startAt: new Date('2026-09-01T20:00:00.000Z') }),
    ]);

    await expect(
      service.generate(user, 't1', dto({ groupId: 'group-a', replaceExisting: true })),
    ).rejects.toMatchObject({ response: { code: 'LEAGUE_FIXTURES_NOT_DELETABLE' } });

    expect(writeLog).toEqual([]);
  });

  // F2-2: canonical Details에 정본 Game이 없으면 부분 재생성을 하지 않는다.
  it('F2: canonical Details에 정본 Game이 없으면 재생성을 막는다', async () => {
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupOf('group-a', ['r1', 'r2']));
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      existingFixture('fx-1', { id: 'game-fx-1' }, { startAt: new Date('2026-09-01T20:00:00.000Z') }),
    ]);
    prisma.v1TournamentMatchDetails.findUniqueOrThrow.mockResolvedValueOnce(existingFixture('fx-1', null));

    await expect(
      service.generate(user, 't1', dto({ groupId: 'group-a', replaceExisting: true })),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_MATCH_GAME_MISSING' } });
    expect(writeLog).toEqual([]);
    expect(writeLog).toEqual([]);
  });

  // F1: groupTeams 조회 순서(DB 반환 순서)가 달라도 sortOrder 기준 정렬로 결정적이어야 한다.
  it('F1: groupTeams 배열 순서가 달라도 sortOrder 기준 정렬로 동일한 대진이 나온다', async () => {
    const teamsInSortOrder = [
      { registrationId: 'r1', sortOrder: 0 },
      { registrationId: 'r2', sortOrder: 1 },
      { registrationId: 'r3', sortOrder: 2 },
      { registrationId: 'r4', sortOrder: 3 },
    ];
    // 같은 sortOrder 값이지만 DB가 다른 배열 순서로 반환한 상황을 흉내낸다.
    const teamsShuffled = [teamsInSortOrder[2], teamsInSortOrder[0], teamsInSortOrder[3], teamsInSortOrder[1]];

    prisma.v1TournamentGroup.findFirst.mockResolvedValueOnce({
      id: 'group-a',
      name: 'A조',
      phase: 'group',
      groupTeams: teamsInSortOrder,
    });
    await service.generate(user, 't1', dto({ groupId: 'group-a', balanceHome: true }));
    const firstRows = createdFixtureRows();

    prisma.v1TournamentMatchDetails.create.mockClear();
    prisma.v1TournamentGroup.findFirst.mockResolvedValueOnce({
      id: 'group-a',
      name: 'A조',
      phase: 'group',
      groupTeams: teamsShuffled,
    });
    await service.generate(user, 't1', dto({ groupId: 'group-a', balanceHome: true }));
    const secondRows = createdFixtureRows();

    expect(secondRows).toEqual(firstRows);
  });
});
