import type { PrismaService } from '../../prisma/prisma.service';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

/**
 * 이 스펙 전까지 `public-tournament-records.service.ts` 에는 전용 스펙이 없었다
 * (task9 계열 스펙은 result-projection 워커를 다룰 뿐 이 서비스를 건드리지 않는다).
 * `games.task8-snapshot.spec.ts` 가 쓰는 손수 구현한 fake-Prisma 패턴을 그대로
 * 재사용한다 -- 실제 DB 커넥션 없이 `PrismaService` 의 부분 집합만 흉내 낸다.
 */

type FakeParticipant = {
  id: string;
  sideId: string;
  displayNameSnapshot: string;
  jerseyNumber: number | null;
  position: string | null;
};

type FakeGoalEvent = {
  id: string;
  gameId: string;
  type: 'GOAL';
  sideId: string;
  participantId: string | null;
  period: number;
  clockMs: number;
  reversesEventId: string | null;
};

type FakeConsentLink = { participantId: string; linkId: string; userId: string };
type FakeConsentSnapshot = { linkId: string; state: 'GRANTED' | 'REVOKED'; effectiveAt: Date };

const TOURNAMENT_ID = 'tournament-1';
const FIXTURE_ID = 'fixture-1';
const GAME_ID = 'game-1';

const ELIGIBLE_PARTICIPANT: FakeParticipant = {
  id: 'participant-eligible',
  sideId: 'side-home',
  displayNameSnapshot: '김철수',
  jerseyNumber: 7,
  position: 'FW',
};

const INELIGIBLE_PARTICIPANT: FakeParticipant = {
  id: 'participant-ineligible',
  sideId: 'side-away',
  displayNameSnapshot: '이영희',
  jerseyNumber: 10,
  position: 'MF',
};

function buildFakePrisma(options: {
  scheduledAt: Date;
  consentLinks: FakeConsentLink[];
  consentSnapshots: FakeConsentSnapshot[];
  events: FakeGoalEvent[];
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
      // getMatch 의 본 조회(select 에 game 포함)와 findNextMatch 의 다음 경기
      // 조회(select 에 game 미포함)가 같은 모델을 두 번 다른 select 로 호출한다 --
      // select 형태로 어느 호출인지 구분한다.
      async findFirst(args: { select: Record<string, unknown> }) {
        if (!('game' in args.select)) return null; // 다음 경기 없음 -- 이 스펙의 관심사가 아니다.
        return {
          id: FIXTURE_ID,
          tournamentId: TOURNAMENT_ID,
          round: '결승',
          fixtureNumber: 1,
          legNumber: 1,
          groupId: null,
          scheduledAt: options.scheduledAt,
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
            sides: [
              { id: 'side-home', sideKey: 'HOME' },
              { id: 'side-away', sideKey: 'AWAY' },
            ],
            participants: [ELIGIBLE_PARTICIPANT, INELIGIBLE_PARTICIPANT],
            currentOfficialRevision: null,
            periods: [],
          },
        };
      },
    },
    v1GameOperationFlag: {
      async findUnique() {
        return { value: 'on' }; // PUBLIC_LIVE 켜짐 -- LIVE 정책이 'live' 모드로 승격된다.
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
      // computeLiveScore(select 에 participantId 없음)와 buildEvents(select 에
      // participantId 있음) 가 같은 모델을 다른 select 로 두 번 조회한다.
      async findMany(args: { select: Record<string, unknown> }) {
        return 'participantId' in args.select ? options.events : options.events;
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

describe('PublicTournamentRecordsService.getMatch -- event participant identity (골/카드 이름·등번호)', () => {
  it('동의한 참가자의 골 이벤트에 participantName/jerseyNumber 가 실린다', async () => {
    const now = new Date();
    const prisma = buildFakePrisma({
      scheduledAt: new Date(now.getTime() + 90 * 60 * 1000), // 킥오프 90분 전 -- 라인업 미공개 구간
      consentLinks: [{ participantId: ELIGIBLE_PARTICIPANT.id, linkId: 'link-1', userId: 'user-1' }],
      consentSnapshots: [{ linkId: 'link-1', state: 'GRANTED', effectiveAt: new Date('2026-01-01T00:00:00.000Z') }],
      events: [
        {
          id: 'event-goal-1',
          gameId: GAME_ID,
          type: 'GOAL',
          sideId: 'side-home',
          participantId: ELIGIBLE_PARTICIPANT.id,
          period: 1,
          clockMs: 600_000,
          reversesEventId: null,
        },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID);

    expect(result.events).toEqual([
      expect.objectContaining({
        participantId: ELIGIBLE_PARTICIPANT.id,
        participantName: '김철수',
        jerseyNumber: 7,
      }),
    ]);
  });

  it('동의하지 않은(자격 없는) 참가자면 participantId 와 participantName 이 둘 다 null 이다', async () => {
    const now = new Date();
    const prisma = buildFakePrisma({
      scheduledAt: new Date(now.getTime() + 90 * 60 * 1000),
      consentLinks: [], // 링크 자체가 없음 -- unlinked, 절대 eligible 아님
      consentSnapshots: [],
      events: [
        {
          id: 'event-goal-2',
          gameId: GAME_ID,
          type: 'GOAL',
          sideId: 'side-away',
          participantId: INELIGIBLE_PARTICIPANT.id,
          period: 1,
          clockMs: 900_000,
          reversesEventId: null,
        },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID);

    expect(result.events).toEqual([
      expect.objectContaining({
        participantId: null,
        participantName: null,
        jerseyNumber: null,
      }),
    ]);
  });

  it('라인업이 null(킥오프 60분 전, 미공개)인 상황에서도 이벤트의 participantName 은 나온다', async () => {
    const now = new Date();
    const prisma = buildFakePrisma({
      // 킥오프 90분 전으로 예약 -- isLineupPublished 는 킥오프 60분 전부터 true 이므로
      // 지금은 false 여야 한다 (derivedLineupAt = scheduledAt - 60m > now).
      scheduledAt: new Date(now.getTime() + 90 * 60 * 1000),
      consentLinks: [{ participantId: ELIGIBLE_PARTICIPANT.id, linkId: 'link-1', userId: 'user-1' }],
      consentSnapshots: [{ linkId: 'link-1', state: 'GRANTED', effectiveAt: new Date('2026-01-01T00:00:00.000Z') }],
      events: [
        {
          id: 'event-goal-3',
          gameId: GAME_ID,
          type: 'GOAL',
          sideId: 'side-home',
          participantId: ELIGIBLE_PARTICIPANT.id,
          period: 1,
          clockMs: 600_000,
          reversesEventId: null,
        },
      ],
    });
    const service = new PublicTournamentRecordsService(prisma);

    const result = await service.getMatch(TOURNAMENT_ID, FIXTURE_ID);

    // 핵심 계약: 라인업 게이트(lineupAt)와 이벤트 이름 노출은 서로 독립이다.
    expect(result.lineup).toBeNull();
    expect(result.events).toEqual([
      expect.objectContaining({ participantName: '김철수', jerseyNumber: 7 }),
    ]);
  });
});
