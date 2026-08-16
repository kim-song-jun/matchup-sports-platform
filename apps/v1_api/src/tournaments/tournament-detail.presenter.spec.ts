import { isBracketPublished, presentTournamentDetail } from './tournament-detail.presenter';
import type { TournamentDetailRow } from './tournaments-read.query';

// 대진표 공개 판정은 스케줄러 없이 조회 시점에 이뤄진다. 경계(예약 시각 정각)와
// 즉시/예약의 우선순위가 틀리면 비공개 대진표가 노출되거나 예약이 영원히 안 열린다.
describe('isBracketPublished', () => {
  const now = new Date('2026-08-01T09:00:00.000Z');

  it('공개도 예약도 없으면 비공개', () => {
    expect(isBracketPublished(null, null, now)).toBe(false);
  });

  it('undefined 가 들어와도 던지지 않고 비공개로 떨어진다', () => {
    // 부분 select 나 구식 fixture 로 컬럼이 빠지면 undefined 가 들어온다. 여기서 던지면
    // 대회 상세 조회 전체가 500 이 되므로 반드시 안전하게 false 여야 한다.
    expect(isBracketPublished(undefined, undefined, now)).toBe(false);
    expect(isBracketPublished(null, undefined, now)).toBe(false);
    expect(isBracketPublished(undefined, new Date('2026-07-01T00:00:00.000Z'), now)).toBe(true);
  });

  it('즉시 공개된 대회는 예약과 무관하게 공개', () => {
    const publishedAt = new Date('2026-07-30T00:00:00.000Z');
    expect(isBracketPublished(publishedAt, null, now)).toBe(true);
    // 미래 예약이 남아 있어도 이미 공개된 사실이 우선한다.
    expect(isBracketPublished(publishedAt, new Date('2026-08-05T00:00:00.000Z'), now)).toBe(true);
  });

  it('예약 시각이 아직 오지 않았으면 비공개', () => {
    expect(isBracketPublished(null, new Date('2026-08-01T09:00:00.001Z'), now)).toBe(false);
  });

  it('예약 시각 정각이면 공개 — 경계 포함', () => {
    expect(isBracketPublished(null, new Date('2026-08-01T09:00:00.000Z'), now)).toBe(true);
  });

  it('예약 시각이 지났으면 공개 — 별도 스케줄러 실행 없이 전환된다', () => {
    expect(isBracketPublished(null, new Date('2026-07-31T09:00:00.000Z'), now)).toBe(true);
  });
});

// R3 §4-3단계: 공개 상세의 fixtures[].result가 레거시 V1TournamentFixtureResult 대신
// V1Game.currentOfficialRevision(신규 경로)에서 채워지는지 검증한다.
// docs/ops/legacy-game-result-r3-removal-inventory.md §1-2 참고.
describe('presentTournamentDetail — fixtures[].result (신규 경로)', () => {
  function baseRow(overrides: Partial<TournamentDetailRow> = {}): TournamentDetailRow {
    return {
      id: 'tournament-1',
      sportId: 'sport-1',
      sport: { code: 'football', name: '축구' },
      title: '테스트 대회',
      status: 'completed',
      format: 'group_knockout',
      registrationDeadlineAt: null,
      rosterDeadlineAt: null,
      bracketPublishedAt: new Date('2026-06-01T00:00:00Z'),
      bracketPublishScheduledAt: null,
      scheduledAt: null,
      scheduledEndAt: null,
      venue: null,
      parkingInfo: null,
      latitude: null,
      longitude: null,
      coverImageUrl: null,
      teamCount: 8,
      minPlayers: 6,
      maxPlayers: 10,
      genderCategory: 'mixed',
      genderMinMale: null,
      genderMaxMale: null,
      genderMinFemale: null,
      genderMaxFemale: null,
      entryFee: 0,
      rulesText: null,
      refundPolicyText: null,
      prizePool: null,
      prizeSummary: null,
      prizeBreakdown: null,
      promoHomeEnabled: false,
      promoHomeTitle: null,
      promoHomeSubtitle: null,
      promoHomeImageUrl: null,
      promoHomeBadgeText: null,
      promoHomeDateText: null,
      promoHomeTeamsText: null,
      promoHomeLocationText: null,
      promoHomePrizeText: null,
      promoHomePriority: 0,
      promoListEnabled: false,
      promoListTitle: null,
      promoListSubtitle: null,
      promoListImageUrl: null,
      promoListBadgeText: null,
      promoListDateText: null,
      promoListTeamsText: null,
      promoListLocationText: null,
      promoListPrizeText: null,
      promoListPriority: 0,
      campaign: null,
      _count: { registrations: 0 },
      registrations: [],
      groups: [],
      fixtures: [],
      announcements: [],
      sponsors: [],
      createdAt: new Date('2026-06-01T00:00:00Z'),
      updatedAt: new Date('2026-06-01T00:00:00Z'),
      reviews: [],
      awards: [],
      ...overrides,
    } as unknown as TournamentDetailRow;
  }

  function fixtureRow(
    game: TournamentDetailRow['fixtures'][number]['game'],
  ): TournamentDetailRow['fixtures'][number] {
    return {
      id: 'fixture-1',
      groupId: null,
      round: 'group_a',
      fixtureNumber: 1,
      legNumber: 1,
      scheduledAt: null,
      venue: null,
      status: 'completed',
      homeRegistrationId: 'reg-1',
      homeRegistration: { team: { id: 'team-1', name: '서울 FC', profile: null } },
      awayRegistrationId: 'reg-2',
      awayRegistration: { team: { id: 'team-2', name: '부산 SC', profile: null } },
      result: null,
      videos: [],
      game,
    } as unknown as TournamentDetailRow['fixtures'][number];
  }

  it('OFFICIAL 리비전(신규 경로)에서 homeScore/awayScore/goals가 채워진다', () => {
    const row = baseRow({
      fixtures: [
        fixtureRow({
          sides: [
            { id: 'side-home', sideKey: 'HOME' },
            { id: 'side-away', sideKey: 'AWAY' },
          ],
          participants: [{ id: 'participant-1', displayNameSnapshot: '김선수' }],
          events: [
            {
              id: 'event-goal-1',
              type: 'GOAL',
              sideId: 'side-home',
              participantId: 'participant-1',
              clockMs: 300_000,
              // 라이브 기록 골 -- 백필의 `minuteKnown` 표식이 없는 평범한 payload.
              payload: null,
              reversesEventId: null,
            },
          ],
          currentOfficialRevision: {
            id: 'revision-1',
            state: 'OFFICIAL',
            score: { regulation: { home: 3, away: 1 }, penalty: null, goals: [], incomplete: false },
            officialAt: new Date('2026-06-15T10:00:00Z'),
            createdAt: new Date('2026-06-15T10:00:00Z'),
            updatedAt: new Date('2026-06-15T10:00:00Z'),
          },
        }),
      ],
    } as never);

    const presented = presentTournamentDetail(row);

    expect(presented.fixtures[0].result).toMatchObject({
      homeScore: 3,
      awayScore: 1,
      hasPenalty: false,
      note: null,
      recordedAt: '2026-06-15T10:00:00.000Z',
    });
    expect(presented.fixtures[0].result?.goals).toEqual([
      expect.objectContaining({
        id: 'event-goal-1',
        team: 'home',
        playerId: 'participant-1',
        playerName: '김선수',
      }),
    ]);
  });

  it('정정(CORRECTION)으로 취소된 골은 goals[]에서 빠진다', () => {
    const row = baseRow({
      fixtures: [
        fixtureRow({
          sides: [
            { id: 'side-home', sideKey: 'HOME' },
            { id: 'side-away', sideKey: 'AWAY' },
          ],
          participants: [],
          events: [
            {
              id: 'event-goal-cancelled',
              type: 'GOAL',
              sideId: 'side-home',
              participantId: null,
              clockMs: 60_000,
              payload: null,
              reversesEventId: null,
            },
            {
              id: 'event-correction',
              type: 'CORRECTION',
              sideId: 'side-home',
              participantId: null,
              clockMs: 65_000,
              payload: null,
              reversesEventId: 'event-goal-cancelled',
            },
          ],
          currentOfficialRevision: {
            id: 'revision-2',
            state: 'OFFICIAL',
            score: { home: 0, away: 0 },
            officialAt: new Date('2026-06-15T10:00:00Z'),
            createdAt: new Date('2026-06-15T10:00:00Z'),
            updatedAt: new Date('2026-06-15T10:00:00Z'),
          },
        }),
      ],
    } as never);

    const presented = presentTournamentDetail(row);

    expect(presented.fixtures[0].result?.goals).toEqual([]);
  });

  it('게임/공식 리비전이 없으면 result는 null', () => {
    const row = baseRow({ fixtures: [fixtureRow(null)] } as never);
    const presented = presentTournamentDetail(row);
    expect(presented.fixtures[0].result).toBeNull();
  });

  it('VOID로 무효화된 결과는 result가 null(레거시의 "결과 없음"과 동등)', () => {
    const row = baseRow({
      fixtures: [
        fixtureRow({
          sides: [],
          participants: [],
          events: [],
          currentOfficialRevision: {
            id: 'revision-void',
            state: 'VOID',
            score: { home: 3, away: 1 },
            officialAt: null,
            createdAt: new Date('2026-06-15T10:00:00Z'),
            updatedAt: new Date('2026-06-15T10:00:00Z'),
          },
        }),
      ],
    } as never);

    const presented = presentTournamentDetail(row);
    expect(presented.fixtures[0].result).toBeNull();
  });
});
