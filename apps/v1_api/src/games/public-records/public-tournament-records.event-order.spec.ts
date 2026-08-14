import type { PrismaService } from '../../prisma/prisma.service';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

/**
 * 알파 실측 회귀: 공개 경기 기록(getMatch 타임라인)과 일정 카드 득점자 요약
 * (getSchedule)이 이벤트를 "경기 시각순"이 아니라 "서버가 받은(append) 순서"인
 * `sequence` 로 정렬해 내보냈다. 알파 7경기 중 2경기에서 CARD 4건 뒤에 더 이른
 * 시각의 GOAL 이 붙어 나오는 순서 역전이 실측됐다.
 *
 * 이 스펙은 진짜 Postgres `orderBy` 를 흉내 내는 fake -- 인자로 받은 `orderBy`
 * 스펙(단일 객체 또는 배열)을 그대로 적용해 정렬한다. 서비스가 실수로 다시
 * `orderBy: { sequence: 'asc' }` 로 되돌리면, sequence 오름차순으로 저장했지만
 * clockMs 는 뒤죽박죽인 아래 픽스처 데이터에서 이 스펙이 반드시 실패한다.
 */

const TOURNAMENT_ID = 'b1000000-0000-4000-8000-000000000001';
const FIXTURE_ID = 'b1000000-0000-4000-8000-000000000002';
const GAME_ID = 'game-order-1';

const HOME_SCORER = {
  id: 'participant-home',
  sideId: 'side-home',
  lineupId: 'lineup-home-1',
  displayNameSnapshot: '김철수',
  jerseyNumber: 7,
  position: 'FW',
};

type OrderSpec = Record<string, 'asc' | 'desc'>;

type FakeEvent = {
  id: string;
  gameId: string;
  type: 'GOAL' | 'CARD' | 'FOUL' | 'SUBSTITUTION' | 'CORRECTION';
  sideId: string;
  participantId: string | null;
  period: number;
  clockMs: number;
  sequence: number;
  reversesEventId: string | null;
};

/** 실제 Prisma orderBy(단일 객체 또는 배열)를 그대로 흉내 낸다. */
function applyOrderBy<T extends Record<string, unknown>>(rows: readonly T[], orderBy: unknown): T[] {
  const specs: OrderSpec[] = Array.isArray(orderBy) ? (orderBy as OrderSpec[]) : [orderBy as OrderSpec];
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      const [field, direction] = Object.entries(spec)[0] as [string, 'asc' | 'desc'];
      const av = a[field] as number;
      const bv = b[field] as number;
      if (av < bv) return direction === 'asc' ? -1 : 1;
      if (av > bv) return direction === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

// 알파 실측 그대로: sequence(입력 순서)는 1..5 로 오름차순이지만, clockMs 는
// 뒤죽박죽이다 -- 시간상 가장 이른 이벤트(id: goal-early, clockMs 645_886)가
// 맨 마지막에 입력됐다(sequence:5).
const ALPHA_SHAPED_EVENTS: FakeEvent[] = [
  { id: 'card-1', gameId: GAME_ID, type: 'CARD', sideId: 'side-home', participantId: HOME_SCORER.id, period: 1, clockMs: 649_891, sequence: 1, reversesEventId: null },
  { id: 'card-2', gameId: GAME_ID, type: 'CARD', sideId: 'side-home', participantId: HOME_SCORER.id, period: 1, clockMs: 652_602, sequence: 2, reversesEventId: null },
  { id: 'card-3', gameId: GAME_ID, type: 'CARD', sideId: 'side-home', participantId: HOME_SCORER.id, period: 1, clockMs: 655_603, sequence: 3, reversesEventId: null },
  { id: 'card-4', gameId: GAME_ID, type: 'CARD', sideId: 'side-home', participantId: HOME_SCORER.id, period: 1, clockMs: 657_938, sequence: 4, reversesEventId: null },
  { id: 'goal-early', gameId: GAME_ID, type: 'GOAL', sideId: 'side-home', participantId: HOME_SCORER.id, period: 1, clockMs: 645_886, sequence: 5, reversesEventId: null },
];

// period 2 의 clockMs 가 period 1 보다 작아도(하프타임 클록 리셋), period 오름차순이
// 우선이라 period 1 뒤에 와야 한다.
const MULTI_PERIOD_EVENTS: FakeEvent[] = [
  { id: 'p2-goal', gameId: GAME_ID, type: 'GOAL', sideId: 'side-home', participantId: HOME_SCORER.id, period: 2, clockMs: 60_000, sequence: 1, reversesEventId: null },
  { id: 'p1-goal', gameId: GAME_ID, type: 'GOAL', sideId: 'side-home', participantId: HOME_SCORER.id, period: 1, clockMs: 2_400_000, sequence: 2, reversesEventId: null },
];

function buildFakePrisma(events: readonly FakeEvent[]): PrismaService {
  const database = {
    v1Tournament: {
      async findUnique() {
        return {
          id: TOURNAMENT_ID,
          title: '테스트 대회',
          status: 'closed',
          bracketPublishedAt: new Date('2026-01-01T00:00:00.000Z'),
          bracketPublishScheduledAt: null,
        };
      },
    },
    v1TournamentGroup: {
      async findMany() {
        return [];
      },
    },
    v1TournamentFixture: {
      async findFirst(args: { select: Record<string, unknown> }) {
        if (!('game' in args.select)) return null;
        return {
          id: FIXTURE_ID,
          tournamentId: TOURNAMENT_ID,
          round: '결승',
          fixtureNumber: 1,
          legNumber: 1,
          groupId: null,
          scheduledAt: new Date('2026-08-10T04:00:00.000Z'),
          venue: null,
          status: 'in_progress',
          homeRegistrationId: 'reg-home',
          awayRegistrationId: 'reg-away',
          homeRegistration: { team: { id: 'team-home', name: '홈팀' } },
          awayRegistration: { team: { id: 'team-away', name: '원정팀' } },
          group: null,
          fieldId: null,
          field: null,
          videos: [],
          game: {
            id: GAME_ID,
            state: 'LIVE',
            visibilityPolicy: { mode: 'LIVE', lineupAt: null },
            sides: [
              { id: 'side-home', sideKey: 'HOME' },
              { id: 'side-away', sideKey: 'AWAY' },
            ],
            lineups: [{ id: 'lineup-home-1', sideId: 'side-home', revision: 1 }],
            participants: [HOME_SCORER],
            currentOfficialRevision: null,
            periods: [],
          },
        };
      },
      async findMany(args: { where: { scheduledAt?: unknown } }) {
        const wantsScheduled = args.where.scheduledAt !== null;
        if (!wantsScheduled) return [];
        return [
          {
            id: FIXTURE_ID,
            round: '결승',
            fixtureNumber: 1,
            legNumber: 1,
            groupId: null,
            scheduledAt: new Date('2026-08-10T04:00:00.000Z'),
            venue: null,
            status: 'in_progress',
            homeRegistrationId: 'reg-home',
            awayRegistrationId: 'reg-away',
            homeRegistration: { team: { id: 'team-home', name: '홈팀' } },
            awayRegistration: { team: { id: 'team-away', name: '원정팀' } },
            group: null,
            field: null,
            videos: [],
            game: {
              id: GAME_ID,
              state: 'LIVE',
              visibilityPolicy: { mode: 'LIVE', lineupAt: null },
              currentOfficialRevision: null,
              sides: [
                { id: 'side-home', sideKey: 'HOME' },
                { id: 'side-away', sideKey: 'AWAY' },
              ],
              lineups: [{ id: 'lineup-home-1', sideId: 'side-home', revision: 1 }],
              periods: [],
              participants: [HOME_SCORER],
            },
          },
        ];
      },
    },
    v1TournamentStanding: {
      async findMany() {
        return [];
      },
    },
    v1GameOperationFlag: {
      async findUnique() {
        return { value: 'on' };
      },
    },
    v1ParticipantIdentityLinkCurrent: {
      async findMany() {
        return [];
      },
    },
    v1ParticipantConsentSnapshot: {
      async findMany() {
        return [];
      },
    },
    v1GameEvent: {
      // 실제 Postgres orderBy 를 흉내 낸다 -- 서비스가 넘긴 orderBy(단일/배열)를
      // 그대로 적용해 정렬한다. 이게 없으면 fake 가 항상 삽입 순서로 응답해서
      // 이 스펙이 정렬 회귀를 절대 못 잡는다.
      async findMany(args: { where: Record<string, unknown>; orderBy: unknown }) {
        // computeLiveScore(loadLiveScores) 경로 -- 이 스펙의 관심사가 아니다.
        if ('OR' in args.where) return [];
        const gameIdFilter = args.where.gameId;
        const matches =
          typeof gameIdFilter === 'string'
            ? events.filter((event) => event.gameId === gameIdFilter)
            : events.filter((event) =>
                gameIdFilter && typeof gameIdFilter === 'object' && 'in' in (gameIdFilter as Record<string, unknown>)
                  ? ((gameIdFilter as { in: string[] }).in.includes(event.gameId))
                  : true,
              );
        return applyOrderBy(matches, args.orderBy);
      },
    },
    v1GameResultRevision: {
      async findMany() {
        return [];
      },
    },
  };
  return database as unknown as PrismaService;
}

const NO_ASSIGNMENTS_ACCESS = new TournamentStaffAccessService({
  v1AdminUser: { async findUnique() { return null; } },
  v1TournamentStaffAssignment: { async findMany() { return []; } },
} as unknown as PrismaService);

describe('PublicTournamentRecordsService -- 이벤트는 경기 시각순(sequence 아님)', () => {
  it('getMatch 타임라인은 clockMs 오름차순이다 (알파 실측 회귀: CARD 4건 뒤 더 이른 GOAL)', async () => {
    const prisma = buildFakePrisma(ALPHA_SHAPED_EVENTS);
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    // sequence 로 정렬하면 이 배열은 [card-1..4, goal-early] 순으로 나와야 한다 --
    // 아래 기대값은 그것과 다르다. sequence 로 되돌리면 이 assertion 이 실패한다.
    expect(result.events.map((event) => event.clockMs)).toEqual([
      645_886, 649_891, 652_602, 655_603, 657_938,
    ]);
  });

  it('getMatch 타임라인은 period 오름차순을 clockMs 보다 우선한다 (전/후반 클록 리셋)', async () => {
    const prisma = buildFakePrisma(MULTI_PERIOD_EVENTS);
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined);

    // period 2 의 clockMs(60_000)가 period 1 의 clockMs(2_400_000)보다 작지만,
    // period 가 우선이라 period 1 이벤트가 먼저 나와야 한다. sequence 순이면
    // p2-goal(sequence:1)이 먼저 나와 이 assertion 이 실패한다.
    expect(result.events.map((event) => [event.period, event.clockMs])).toEqual([
      [1, 2_400_000],
      [2, 60_000],
    ]);
  });

  it('일정 카드 득점자 요약(getSchedule)도 clockMs 오름차순이다', async () => {
    const prisma = buildFakePrisma(ALPHA_SHAPED_EVENTS);
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getSchedule(TOURNAMENT_ID, {});

    // ALPHA_SHAPED_EVENTS 의 유일한 GOAL 은 goal-early(clockMs 645_886) 하나뿐이라
    // 이 자체로는 순서를 못 가른다 -- 아래 별도 다득점 케이스가 진짜 검증이다.
    expect(result.items[0].scorers.map((scorer) => scorer.clockMs)).toEqual([645_886]);
  });

  it('일정 카드 득점자 요약은 여러 골이 있을 때 입력 순서가 아니라 clockMs 순서로 나온다', async () => {
    const events: FakeEvent[] = [
      { id: 'goal-late', gameId: GAME_ID, type: 'GOAL', sideId: 'side-home', participantId: HOME_SCORER.id, period: 1, clockMs: 2_700_000, sequence: 1, reversesEventId: null },
      { id: 'goal-early', gameId: GAME_ID, type: 'GOAL', sideId: 'side-home', participantId: HOME_SCORER.id, period: 1, clockMs: 600_000, sequence: 2, reversesEventId: null },
    ];
    const prisma = buildFakePrisma(events);
    const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);

    const result = await service.getSchedule(TOURNAMENT_ID, {});

    // 입력 순서(sequence)는 goal-late 가 먼저지만, 시간순으로는 goal-early(600_000)가
    // 먼저다. sequence 로 되돌리면 [2_700_000, 600_000] 이 나와 이 assertion 이 실패한다.
    expect(result.items[0].scorers.map((scorer) => scorer.clockMs)).toEqual([600_000, 2_700_000]);
  });
});
