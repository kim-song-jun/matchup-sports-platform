import type { PrismaService } from '../../prisma/prisma.service';
import type { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import type { GroupStandingSummary } from '../../tournaments/slots/group-rank-preview';
import { loadGroupStandingSummaries } from '../../tournaments/slots/load-group-rank-preview';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

// 로더 자체는 load-group-rank-preview.spec.ts 가 본다 — 여기서는 일정 응답이 언제 부르고 순위 행에 어떻게 싣는지만 본다.
jest.mock('../../tournaments/slots/load-group-rank-preview', () => ({ loadGroupStandingSummaries: jest.fn() }));
const loadSummaries = loadGroupStandingSummaries as jest.MockedFunction<typeof loadGroupStandingSummaries>;

const TOURNAMENT_ID = 'tournament-1';
const UNUSED_ACCESS_SERVICE = {} as unknown as TournamentStaffAccessService;

const standingRow = (groupId: string, registrationId: string, position: number) => ({
  groupId,
  registrationId,
  points: 3,
  wins: 1,
  draws: 0,
  losses: 0,
  goalsFor: 1,
  goalsAgainst: 0,
  position,
  group: { name: groupId },
  registration: { team: { id: `team-${registrationId}`, name: `${registrationId}팀`, profile: null } },
});

function fakePrisma(options: { format: string; kind?: string; baselineGroups?: unknown[]; standingRows?: unknown[] }): PrismaService {
  return {
    v1Tournament: {
      async findFirst() {
        return {
          id: TOURNAMENT_ID,
          title: '테스트 대회',
          kind: options.kind ?? 'regular_tournament',
          format: options.format,
          status: 'closed',
          bracketPublishedAt: new Date('2026-01-01T00:00:00.000Z'),
          bracketPublishScheduledAt: null,
        };
      },
    },
    v1TournamentGroup: {
      async findMany() {
        return options.baselineGroups ?? [];
      },
    },
    v1TournamentMatchDetails: {
      async findMany() {
        return [];
      },
    },
    v1TournamentStanding: {
      async findMany() {
        return options.standingRows ?? [
          standingRow('g-tie', 'a', 1),
          standingRow('g-tie', 'b', 2),
          standingRow('g-tie', 'c', 3),
          standingRow('g-clean', 'd', 1),
          standingRow('g-clean', 'e', 2),
        ];
      },
    },
    v1GameOperationFlag: {
      async findUnique() {
        return { value: 'on' };
      },
    },
    v1ParticipantIdentityLinkCurrent: { async findMany() { return []; } },
    v1ParticipantConsentSnapshot: { async findMany() { return []; } },
    v1UserRecordConsent: { async findMany() { return []; } },
    v1UserProfile: { async findMany() { return []; } },
    v1GameEvent: { async findMany() { return []; } },
  } as unknown as PrismaService;
}

const summaries = new Map<string, GroupStandingSummary>([
  [
    'g-tie',
    {
      sharedRankByRegistrationId: new Map([['a', 1], ['b', 1], ['c', 1]]),
      qualification: { advancingRegistrationIds: [], undecided: true },
    },
  ],
]);

describe('PublicTournamentRecordsService.getSchedule -- 조별 순위 sharedRank', () => {
  beforeEach(() => loadSummaries.mockReset().mockResolvedValue(summaries));

  const schedule = (prisma: PrismaService) =>
    new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE).getSchedule(TOURNAMENT_ID, {});

  it('조별+결선 대회: 동률 조 순위 행엔 공동 순위, 동률 없는 조(대조)는 null', async () => {
    const result = await schedule(fakePrisma({ format: 'group_knockout' }));

    expect(loadSummaries).toHaveBeenCalledTimes(1);
    // 일정 탭은 진출 팀을 안 쓴다 — 결선 대진 조회를 건너뛰는 옵션으로 불러야 한다.
    expect(loadSummaries).toHaveBeenCalledWith(expect.anything(), TOURNAMENT_ID, { includeQualification: false });
    expect(result.standings.map((row) => [row.registrationId, row.sharedRank])).toEqual([
      ['a', 1], ['b', 1], ['c', 1], ['d', null], ['e', null],
    ]);
  });

  it('편성 기준선 행(순위 행이 아직 없는 조)은 sharedRank null', async () => {
    const baselineGroups = [
      {
        id: 'g-new',
        name: 'g-new',
        groupTeams: [{ registrationId: 'x', registration: { team: { id: 'team-x', name: 'x팀', profile: null } } }],
      },
    ];

    const result = await schedule(fakePrisma({ format: 'group_knockout', baselineGroups }));

    expect(result.standings.find((row) => row.registrationId === 'x')?.sharedRank).toBeNull();
  });

  it('순위 행이 하나도 없으면(기준선만 있는 대회) 로더를 부르지 않는다', async () => {
    const baselineGroups = [
      {
        id: 'g-new',
        name: 'g-new',
        groupTeams: [{ registrationId: 'x', registration: { team: { id: 'team-x', name: 'x팀', profile: null } } }],
      },
    ];

    const result = await schedule(fakePrisma({ format: 'group_knockout', baselineGroups, standingRows: [] }));

    expect(loadSummaries).not.toHaveBeenCalled();
    expect(result.standings.map((row) => [row.registrationId, row.sharedRank])).toEqual([['x', null]]);
  });

  it.each([['league'], ['knockout']])('%s 방식 대회는 로더를 부르지 않고 전부 null', async (format) => {
    const result = await schedule(fakePrisma({ format }));

    expect(loadSummaries).not.toHaveBeenCalled();
    expect(result.standings.every((row) => row.sharedRank === null)).toBe(true);
  });
});
