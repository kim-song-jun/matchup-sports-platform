import type { PrismaService } from '../../prisma/prisma.service';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

/**
 * 일정 카드 득점자 요약(`getSchedule` -> `PublicScheduleEntry.scorers`) 전용 스펙.
 * `public-tournament-records.service.spec.ts`와 같은 손수 구현 fake-Prisma 패턴을
 * 재사용하되, 그 스펙은 `getMatch`(findFirst 경로)만 다루므로 `getSchedule`이 쓰는
 * `findMany` 경로는 여기서 새로 흉내 낸다.
 */

const TOURNAMENT_ID = 'tournament-1';

type FakeFixture = {
  id: string;
  round: string;
  fixtureNumber: number;
  legNumber: number;
  groupId: null;
  scheduledAt: Date;
  venue: null;
  status: string;
  homeRegistrationId: string;
  awayRegistrationId: string;
  homeRegistration: { team: { id: string; name: string } };
  awayRegistration: { team: { id: string; name: string } };
  group: null;
  field: null;
  videos: never[];
  game: {
    id: string;
    state: string;
    visibilityPolicy: { mode: string; lineupAt: null };
    currentOfficialRevision: { state: string; supersedesId: null; officialAt: Date; score: unknown } | null;
    sides: { id: string; sideKey: 'HOME' | 'AWAY' }[];
    periods: never[];
    participants: { id: string; sideId: string; displayNameSnapshot: string; jerseyNumber: number | null }[];
  } | null;
};

type FakeGoalEvent = {
  id: string;
  gameId: string;
  sideId: string;
  participantId: string | null;
  clockMs: number;
  reversesEventId: string | null;
};

function buildFakePrisma(options: {
  fixtures: FakeFixture[];
  consentLinks: { participantId: string; linkId: string; userId: string }[];
  consentSnapshots: { linkId: string; state: 'GRANTED' | 'REVOKED'; effectiveAt: Date }[];
  goalEvents: FakeGoalEvent[];
}): PrismaService {
  const database = {
    v1Tournament: {
      async findUnique() {
        return {
          id: TOURNAMENT_ID,
          title: '테스트 대회',
          bracketPublishedAt: new Date('2026-01-01T00:00:00.000Z'),
          bracketPublishScheduledAt: null,
        };
      },
    },
    v1TournamentFixture: {
      async findMany(args: { where: { scheduledAt?: unknown } }) {
        // getSchedule은 scheduledAt이 있는 픽스처(paged)와 없는 픽스처(unscheduled)를
        // 서로 다른 where 절로 두 번 조회한다 -- null 여부로 호출을 구분한다.
        const wantsScheduled = args.where.scheduledAt !== null;
        return wantsScheduled ? options.fixtures : [];
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
        return options.consentLinks;
      },
    },
    v1ParticipantConsentSnapshot: {
      async findMany() {
        return options.consentSnapshots;
      },
    },
    v1GameEvent: {
      async findMany(args: { where: Record<string, unknown> }) {
        // loadScorers은 `where.type === 'GOAL'`(OR 없음)로, loadLiveScores는
        // `where.OR`로 조회한다 -- 이 스펙의 관심사는 loadScorers 경로뿐이다.
        if ('type' in args.where) return options.goalEvents;
        return []; // loadLiveScores 경로 -- 라이브 스코어는 이 스펙의 관심사가 아니다.
      },
    },
  };
  return database as unknown as PrismaService;
}

const ELIGIBLE = { id: 'participant-eligible', sideId: 'side-home', displayNameSnapshot: '김철수', jerseyNumber: 7 };
const INELIGIBLE = { id: 'participant-ineligible', sideId: 'side-away', displayNameSnapshot: '이영희', jerseyNumber: 10 };

function makeFixture(overrides: Partial<FakeFixture>): FakeFixture {
  return {
    id: 'fixture-1',
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
      id: 'game-1',
      state: 'LIVE',
      visibilityPolicy: { mode: 'LIVE', lineupAt: null },
      currentOfficialRevision: null,
      sides: [
        { id: 'side-home', sideKey: 'HOME' },
        { id: 'side-away', sideKey: 'AWAY' },
      ],
      periods: [],
      participants: [ELIGIBLE, INELIGIBLE],
    },
    ...overrides,
  };
}

describe('PublicTournamentRecordsService.getSchedule -- 일정 카드 득점자 요약', () => {
  it('동의한 참가자의 골에는 홈/원정과 이름/등번호가 실리고, 미동의 참가자는 이름 없이 시간만 실린다', async () => {
    const prisma = buildFakePrisma({
      fixtures: [makeFixture({})],
      consentLinks: [{ participantId: ELIGIBLE.id, linkId: 'link-1', userId: 'user-1' }],
      consentSnapshots: [{ linkId: 'link-1', state: 'GRANTED', effectiveAt: new Date('2026-01-01T00:00:00.000Z') }],
      goalEvents: [
        { id: 'g1', gameId: 'game-1', sideId: 'side-home', participantId: ELIGIBLE.id, clockMs: 600_000, reversesEventId: null },
        { id: 'g2', gameId: 'game-1', sideId: 'side-away', participantId: INELIGIBLE.id, clockMs: 2_700_000, reversesEventId: null },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma);

    const result = await service.getSchedule(TOURNAMENT_ID, {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0].scorers).toEqual([
      { side: 'home', participantName: '김철수', jerseyNumber: 7, clockMs: 600_000 },
      { side: 'away', participantName: null, jerseyNumber: null, clockMs: 2_700_000 },
    ]);
  });

  it('취소된(reversesEventId로 되돌려진) 골은 요약에서 빠진다', async () => {
    const prisma = buildFakePrisma({
      fixtures: [makeFixture({})],
      consentLinks: [{ participantId: ELIGIBLE.id, linkId: 'link-1', userId: 'user-1' }],
      consentSnapshots: [{ linkId: 'link-1', state: 'GRANTED', effectiveAt: new Date('2026-01-01T00:00:00.000Z') }],
      goalEvents: [
        { id: 'g1', gameId: 'game-1', sideId: 'side-home', participantId: ELIGIBLE.id, clockMs: 600_000, reversesEventId: null },
        { id: 'g2-correction', gameId: 'game-1', sideId: 'side-home', participantId: ELIGIBLE.id, clockMs: 900_000, reversesEventId: 'g1' },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma);

    const result = await service.getSchedule(TOURNAMENT_ID, {});

    // g1은 g2-correction에 의해 되돌려졌으므로 요약에서 빠지고, 되돌린 이벤트
    // 자신(g2-correction)만 남는다 -- tallyLiveScore/loadLiveScores와 동일 규칙.
    expect(result.items[0].scorers).toEqual([
      { side: 'home', participantName: '김철수', jerseyNumber: 7, clockMs: 900_000 },
    ]);
  });

  it('status_only 모드 픽스처는 골이 있어도 요약이 비어 있다', async () => {
    const prisma = buildFakePrisma({
      fixtures: [
        makeFixture({
          game: {
            id: 'game-1',
            state: 'LIVE',
            visibilityPolicy: { mode: 'STATUS_ONLY', lineupAt: null },
            currentOfficialRevision: null,
            sides: [
              { id: 'side-home', sideKey: 'HOME' },
              { id: 'side-away', sideKey: 'AWAY' },
            ],
            periods: [],
            participants: [ELIGIBLE, INELIGIBLE],
          },
        }),
      ],
      consentLinks: [{ participantId: ELIGIBLE.id, linkId: 'link-1', userId: 'user-1' }],
      consentSnapshots: [{ linkId: 'link-1', state: 'GRANTED', effectiveAt: new Date('2026-01-01T00:00:00.000Z') }],
      goalEvents: [
        { id: 'g1', gameId: 'game-1', sideId: 'side-home', participantId: ELIGIBLE.id, clockMs: 600_000, reversesEventId: null },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma);

    const result = await service.getSchedule(TOURNAMENT_ID, {});

    expect(result.items[0].scorers).toEqual([]);
  });
});
