import type { PrismaService } from '../../prisma/prisma.service';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

/**
 * 공개 경기 상세 `events[].assist` 계약.
 * - 도움 이름은 득점자와 같은 함수·같은 규칙으로 나간다(동의 게이팅 되돌림 스위치 포함).
 * - 종료 후 공식 스냅샷 골에는 도움이 없으므로 같은 id 의 `V1GameEvent` 에서 되찾는다.
 * - fake 는 Prisma 처럼 `select` 를 적용해 돌려준다 -- 안 그러면 서비스가 select 에서
 *   필드를 빼먹어도 fake 가 전부 돌려줘서 이 스펙이 통과해 버린다.
 */

const TOURNAMENT_ID = 'c1000000-0000-4000-8000-000000000001';
const FIXTURE_ID = 'c1000000-0000-4000-8000-000000000002';
const GAME_ID = 'game-assist-1';

type Participant = {
  id: string;
  sideId: string;
  lineupId: string;
  userId: string | null;
  displayNameSnapshot: string;
  jerseyNumber: number | null;
};

const SCORER: Participant = {
  id: 'p-scorer', sideId: 'side-home', lineupId: 'lineup-home', userId: 'user-scorer', displayNameSnapshot: '김득점', jerseyNumber: 9,
};
// 실명 표시 토글이 켜져 있고 공개 동의도 켠 선수.
const ASSISTER: Participant = {
  id: 'p-assister', sideId: 'side-home', lineupId: 'lineup-home', userId: 'user-assister', displayNameSnapshot: '이도움', jerseyNumber: 10,
};
const GUEST: Participant = {
  id: 'p-guest', sideId: 'side-home', lineupId: 'lineup-home', userId: null, displayNameSnapshot: '게스트선수', jerseyNumber: 3,
};

const PROFILES = [
  { userId: 'user-scorer', realName: '김득점', displayName: '김득점', nickname: '골잡이', tournamentRealNameVisible: false, deletedAt: null },
  { userId: 'user-assister', realName: '이도움', displayName: '이도움', nickname: '패스왕', tournamentRealNameVisible: true, deletedAt: null },
];

type FakeEvent = {
  id: string;
  type: 'GOAL' | 'OWN_GOAL' | 'CARD';
  sideId: string;
  participantId: string | null;
  assistParticipantId: string | null;
  period: number;
  clockMs: number;
  sequence: number;
  reversesEventId: string | null;
  payload: Record<string, unknown>;
};

function goal(id: string, participantId: string | null, assistParticipantId: string | null, clockMs: number): FakeEvent {
  return { id, type: 'GOAL', sideId: 'side-home', participantId, assistParticipantId, period: 1, clockMs, sequence: clockMs, reversesEventId: null, payload: {} };
}

function pick<T extends Record<string, unknown>>(row: T, select: Record<string, unknown> | undefined): Partial<T> {
  if (select === undefined) return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => select[key] === true)) as Partial<T>;
}

function buildFakePrisma(config: {
  events: readonly FakeEvent[];
  consentedUserIds: readonly string[];
  official?: { goalEvents: unknown[] };
}): PrismaService {
  const participants = [SCORER, ASSISTER, GUEST];
  const links = participants
    .filter((participant) => participant.userId !== null)
    .map((participant) => ({ participantId: participant.id, linkId: `link-${participant.id}`, userId: participant.userId as string }));
  const game = {
    id: GAME_ID,
    state: config.official ? 'ENDED' : 'LIVE',
    visibilityPolicy: { mode: 'LIVE', lineupAt: null },
    sides: [{ id: 'side-home', sideKey: 'HOME' }, { id: 'side-away', sideKey: 'AWAY' }],
    lineups: [{ id: 'lineup-home', sideId: 'side-home', revision: 1, state: 'LOCKED', invalidatedAt: null }],
    participants,
    resultRevisions: [],
    currentOfficialRevision: config.official
      ? {
          state: 'OFFICIAL', supersedesId: null, officialAt: new Date('2026-08-10T06:00:00.000Z'),
          score: { home: config.official.goalEvents.length, away: 0 }, goalEvents: config.official.goalEvents,
          mvpParticipantId: null, outcomeReason: 'NORMAL', outcomeNote: null, reason: null,
        }
      : null,
    periods: [],
  };
  const matchDetails = {
    teamMatchId: FIXTURE_ID, tournamentId: TOURNAMENT_ID, round: '결승', fixtureNumber: 1, legNumber: 1, groupId: null,
    homeRegistrationId: 'reg-home', awayRegistrationId: 'reg-away',
    homeRegistration: { team: { id: 'team-home', name: '홈팀' } },
    awayRegistration: { team: { id: 'team-away', name: '원정팀' } },
    group: null,
    teamMatch: { startAt: new Date('2026-08-10T04:00:00.000Z'), placeName: null, status: 'matched', fieldId: null, field: null, videos: [], game },
  };
  const database = {
    v1Tournament: {
      async findFirst() {
        return { id: TOURNAMENT_ID, title: '테스트 대회', status: 'closed', bracketPublishedAt: new Date('2026-01-01T00:00:00.000Z'), bracketPublishScheduledAt: null };
      },
    },
    v1TournamentGroup: { async findMany() { return []; } },
    v1TournamentMatchDetails: {
      async findFirst() { return matchDetails; },
      async findMany() { return [matchDetails]; },
    },
    v1TournamentStanding: { async findMany() { return []; } },
    v1GameOperationFlag: { async findUnique() { return { value: 'on' }; } },
    v1ParticipantIdentityLinkCurrent: { async findMany() { return links; } },
    v1UserRecordConsent: {
      async findMany() { return config.consentedUserIds.map((userId) => ({ userId, state: 'GRANTED' })); },
    },
    v1ParticipantConsentSnapshot: { async findMany() { return []; } },
    v1UserProfile: { async findMany() { return PROFILES; } },
    v1GameEvent: {
      async findMany(args: { where: Record<string, unknown>; orderBy?: unknown; select?: Record<string, unknown> }) {
        if ('OR' in args.where) return [];
        return [...config.events]
          .sort((a, b) => a.period - b.period || a.clockMs - b.clockMs || a.sequence - b.sequence)
          .map((event) => pick(event, args.select));
      },
    },
    v1GameResultRevision: { async findMany() { return []; } },
  };
  return database as unknown as PrismaService;
}

const NO_ASSIGNMENTS_ACCESS = new TournamentStaffAccessService({
  v1AdminUser: { async findUnique() { return null; } },
  v1TournamentStaffAssignment: { async findMany() { return []; } },
} as unknown as PrismaService);

async function getEvents(prisma: PrismaService) {
  const service = new PublicTournamentRecordsService(prisma, NO_ASSIGNMENTS_ACCESS);
  return (await service.getMatch(TOURNAMENT_ID, FIXTURE_ID, undefined)).events;
}

describe('PublicTournamentRecordsService -- 이벤트의 도움(assist)', () => {
  afterEach(() => {
    delete process.env.V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE;
  });

  it('라이브 골의 도움은 득점자와 같은 이름 규칙(닉네임 기본, 실명 토글)과 프로필 링크 규칙을 따른다', async () => {
    const events = await getEvents(
      buildFakePrisma({
        events: [goal('g1', SCORER.id, ASSISTER.id, 60_000), goal('g2', SCORER.id, GUEST.id, 120_000), goal('g3', SCORER.id, null, 180_000)],
        consentedUserIds: ['user-assister'],
      }),
    );

    // 득점자는 토글 OFF -> 닉네임, 도움은 토글 ON -> 실명. 서로 다른 답이어야 "같은 함수"를 증명한다.
    expect(events[0]).toMatchObject({ participantName: '골잡이', profileHref: null });
    expect(events[0].assist).toEqual({ participantName: '이도움', jerseyNumber: 10, profileHref: '/users/user-assister' });
    // 계정 없는 참가자는 라인업 스냅샷 이름, 링크 없음.
    expect(events[1].assist).toEqual({ participantName: '게스트선수', jerseyNumber: 3, profileHref: null });
    // 도움 미기입은 null -- "가림"({participantName: null})과 구분된다.
    expect(events[2].assist).toBeNull();
  });

  it('CARD 와 자책골 줄에는 도움이 없다', async () => {
    const card: FakeEvent = { ...goal('c1', SCORER.id, ASSISTER.id, 30_000), type: 'CARD', payload: { card: 'YELLOW' } };
    const ownGoal: FakeEvent = { ...goal('o1', SCORER.id, ASSISTER.id, 90_000), type: 'OWN_GOAL' };
    const events = await getEvents(buildFakePrisma({ events: [card, ownGoal], consentedUserIds: [] }));

    expect(events.map((event) => [event.type, event.assist])).toEqual([['CARD', null], ['OWN_GOAL', null]]);
  });

  it('동의 게이팅을 되돌리면 도움 이름도 그 선수 자신의 동의로 가려진다 -- 득점자로 나올 때와 같은 답', async () => {
    process.env.V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE = 'true';
    const events = await getEvents(
      buildFakePrisma({
        // 동의한 이도움과 동의 안 한 김득점이 득점자·도움 자리를 맞바꾼 두 골.
        events: [goal('g1', SCORER.id, ASSISTER.id, 60_000), goal('g2', ASSISTER.id, SCORER.id, 120_000)],
        consentedUserIds: ['user-assister'],
      }),
    );

    // 김득점(미동의): 득점자일 때도 도움일 때도 가려진다.
    expect(events[0].participantName).toBeNull();
    expect(events[1].assist).toEqual({ participantName: null, jerseyNumber: null, profileHref: null });
    // 이도움(동의): 득점자일 때도 도움일 때도 보인다.
    expect(events[1].participantName).toBe('이도움');
    expect(events[0].assist).toEqual({ participantName: '이도움', jerseyNumber: 10, profileHref: '/users/user-assister' });
  });

  it('공식 스냅샷 골의 도움은 같은 id 의 이벤트에서 되찾고, 짝이 없는 스냅샷 골(운영자 입력)은 도움이 없다', async () => {
    const snapshotGoal = (id: string, participantId: string, ownGoal = false) => ({
      id, sideId: 'side-home', participantId, minute: 1, period: 1, ownGoal,
    });
    const events = await getEvents(
      buildFakePrisma({
        events: [goal('g1', SCORER.id, ASSISTER.id, 60_000)],
        consentedUserIds: ['user-assister'],
        official: {
          goalEvents: [snapshotGoal('g1', SCORER.id), snapshotGoal(`${SCORER.id}:2`, SCORER.id), snapshotGoal('g1', SCORER.id, true)],
        },
      }),
    );

    const [withAssist, operatorEntered, ownGoal] = events;
    expect(withAssist.assist).toEqual({ participantName: '이도움', jerseyNumber: 10, profileHref: '/users/user-assister' });
    expect(operatorEntered.assist).toBeNull();
    expect(ownGoal.assist).toBeNull();
  });
});
