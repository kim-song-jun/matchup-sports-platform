import { publicFixtureStatus } from '../games/public-records/public-visibility';
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
      _count: { registrations: 0, reviews: 0 },
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
    status: TournamentDetailRow['fixtures'][number]['status'] = 'completed',
  ): TournamentDetailRow['fixtures'][number] {
    return {
      id: 'fixture-1',
      groupId: null,
      round: 'group_a',
      fixtureNumber: 1,
      legNumber: 1,
      scheduledAt: null,
      venue: null,
      status,
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
          // `state`는 공개 상세가 픽스처의 라이브 여부를 판정하는 유일한 authoritative
          // 신호다(`V1TournamentFixture.status`는 in_progress로 전이하지 않는다).
          // OFFICIAL 리비전이 존재하는 이 시나리오의 경기는 이미 끝난 상태다.
          state: 'ENDED',
          sides: [
            { id: 'side-home', sideKey: 'HOME' },
            { id: 'side-away', sideKey: 'AWAY' },
          ],
          participants: [{ id: 'participant-1', sideId: 'side-home', displayNameSnapshot: '김선수' }],
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
            goalEvents: null,
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
          state: 'ENDED',
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
            goalEvents: null,
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
          state: 'ENDED',
          sides: [],
          participants: [],
          events: [],
          currentOfficialRevision: {
            id: 'revision-void',
            state: 'VOID',
            score: { home: 3, away: 1 },
            goalEvents: null,
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

  /**
   * 이 두 케이스가 프로덕션에서 실제로 깨져 있던 조합이다. `V1TournamentFixture.status`는
   * 생성 시 `scheduled`로 박히고 결과 확정 때 곧장 `completed`로 가며, `in_progress`로
   * 전이시키는 writer가 코드베이스에 존재하지 않는다. 그래서 "경기가 뛰고 있는 중"을
   * `status`만으로 판별하려던 소비자(`/tournaments/:id/bracket`의 라이브 폴링 게이트)는
   * 조건이 영원히 false여서 대진표·순위표를 한 번도 갱신하지 않았다.
   *
   * 아래 첫 케이스는 그 정확한 상태(경기는 LIVE인데 fixture.status는 아직 scheduled)를
   * 재현한다 — `liveStatus`가 없거나 `status`에서 파생되면 실패한다.
   */
  it('경기가 LIVE면 fixture.status가 scheduled여도 liveStatus는 live다', () => {
    const row = baseRow({
      fixtures: [
        fixtureRow(
          {
            state: 'LIVE',
            sides: [],
            participants: [],
            events: [],
            currentOfficialRevision: null,
          } as never,
          'scheduled',
        ),
      ],
    } as never);

    const presented = presentTournamentDetail(row);
    // 원본 컬럼은 손대지 않는다 — 어드민 화면이 이 어휘에 의존한다.
    expect(presented.fixtures[0].status).toBe('scheduled');
    expect(presented.fixtures[0].liveStatus).toBe('live');
  });

  it('game이 아직 없으면 liveStatus는 fixture.status에서 파생된다', () => {
    const row = baseRow({ fixtures: [fixtureRow(null as never, 'scheduled')] } as never);

    const presented = presentTournamentDetail(row);
    expect(presented.fixtures[0].liveStatus).toBe('scheduled');
  });

  /**
   * 두 공개 레인의 진행 상태 일치 계약.
   *
   * 같은 픽스처를 두 API 가 읽는다 — `GET /tournaments/:id`(대진표·순위가 쓰는 상세)와
   * `GET /tournaments/:id/schedule`(일정이 쓰는 공개 기록). 원래 이 둘은 서로 다른
   * 소스를 봤다: 일정 레인은 `publicFixtureStatus()`로 `V1Game.state` 를 파생했고,
   * 상세 레인은 원본 `status` 컬럼을 그대로 노출했다. 그 컬럼은 경기가 진행 중이어도
   * `scheduled` 에 머무르므로, 진행 중인 경기를 두 API 가 `live` 와 `scheduled` 로
   * 서로 다르게 말하는 상태가 프로덕션에서 실제로 관측됐다.
   *
   * 그래서 여기서는 두 레인을 서로 비교하지 않는다 — 지금은 둘 다 같은 헬퍼를 타므로
   * 서로 대조하면 순환 논리가 되고, 둘이 함께 틀려도 통과한다. 대신 **기대값을 표에
   * 직접 적어두고 두 레인을 각각 그 표에 대조**한다. 어느 한쪽이 파생 방식을 바꾸면
   * 그쪽 단언이 깨진다.
   */
  const PROGRESS_MATRIX: ReadonlyArray<{
    readonly gameState: 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED' | 'CANCELLED' | null;
    readonly expected: string;
  }> = [
    { gameState: null, expected: 'scheduled' },
    { gameState: 'SCHEDULED', expected: 'scheduled' },
    { gameState: 'LIVE', expected: 'live' },
    { gameState: 'PAUSED', expected: 'live' },
    { gameState: 'ENDED', expected: 'ended' },
    { gameState: 'CANCELLED', expected: 'cancelled' },
  ];

  it.each(PROGRESS_MATRIX)(
    '게임 상태 $gameState 는 두 공개 레인 모두에서 $expected 로 보인다',
    ({ gameState, expected }) => {
      // 일정 레인(`public-tournament-records.service.ts` 의 두 호출 지점이 쓰는 헬퍼).
      expect(publicFixtureStatus({ gameState, fixtureStatus: 'scheduled' })).toBe(expected);

      // 상세 레인(대진표·순위가 읽는 응답).
      const row = baseRow({
        fixtures: [
          fixtureRow(
            gameState === null
              ? null
              : ({
                  state: gameState,
                  sides: [],
                  participants: [],
                  events: [],
                  currentOfficialRevision: null,
                } as never),
            'scheduled',
          ),
        ],
      } as never);
      expect(presentTournamentDetail(row).fixtures[0].liveStatus).toBe(expected);
    },
  );

  it('원본 status 컬럼이 무엇이든 두 레인의 진행 상태는 게임에서만 나온다', () => {
    // 컬럼이 completed 인데 경기가 다시 LIVE 인 조합(결과 정정 중 재개 등)에서도
    // 두 레인이 갈리면 안 된다 — 상세 레인이 컬럼으로 되돌아가면 여기서 깨진다.
    expect(publicFixtureStatus({ gameState: 'LIVE', fixtureStatus: 'completed' })).toBe('live');

    const row = baseRow({
      fixtures: [
        fixtureRow(
          {
            state: 'LIVE',
            sides: [],
            participants: [],
            events: [],
            currentOfficialRevision: null,
          } as never,
          'completed',
        ),
      ],
    } as never);
    expect(presentTournamentDetail(row).fixtures[0].liveStatus).toBe('live');
  });

  it('공개 대회 수상에는 관리자용 recipientUserId 계정 연결을 노출하지 않는다', () => {
    const row = baseRow({
      awards: [
        {
          id: 'award-1',
          awardType: 'mvp',
          awardLabel: 'MVP',
          iconKey: 'crown',
          recipientName: '김선수',
          recipientUserId: 'user-private-link',
          teamName: '서울 FC',
          note: null,
        },
      ],
    } as never);

    const presented = presentTournamentDetail(row);

    expect(presented.awards[0]).toMatchObject({ awardLabel: 'MVP', recipientName: '김선수' });
    expect(presented.awards[0]).not.toHaveProperty('recipientUserId');
  });

  // 위 테스트는 award.recipient 자체가 없는(as never로 타입만 우회한) 픽스처를 쓰기 때문에
  // profileByUserId 맵이 항상 비어 resolveParticipantDisplayName이 profile===undefined
  // 분기(옛 스냅샷 폴백)만 타고, 2026-08-18에 추가된 닉네임/실명 토글·탈퇴회원 분기는 전혀
  // 실행되지 않는다. 여기서는 실제 조회 형태(recipient: { profile: {...} })를 채운 픽스처로
  // 세 분기를 각각 실행한다.
  it('수상자 프로필의 tournamentRealNameVisible이 꺼져 있으면 닉네임을 표시한다', () => {
    const row = baseRow({
      awards: [
        {
          id: 'award-1',
          awardType: 'mvp',
          awardLabel: 'MVP',
          iconKey: 'crown',
          recipientName: '스냅샷실명',
          recipientUserId: 'user-1',
          recipient: {
            profile: {
              realName: '홍길동',
              displayName: '홍길동',
              nickname: '골넣는홍길동',
              tournamentRealNameVisible: false,
              deletedAt: null,
            },
          },
          teamName: '서울 FC',
          note: null,
        },
      ],
    } as never);

    const presented = presentTournamentDetail(row);

    expect(presented.awards[0].recipientName).toBe('골넣는홍길동');
  });

  it('수상자 프로필의 tournamentRealNameVisible이 켜져 있으면 실명을 표시한다', () => {
    const row = baseRow({
      awards: [
        {
          id: 'award-1',
          awardType: 'mvp',
          awardLabel: 'MVP',
          iconKey: 'crown',
          recipientName: '스냅샷실명',
          recipientUserId: 'user-1',
          recipient: {
            profile: {
              realName: '홍길동',
              displayName: '홍길동',
              nickname: '골넣는홍길동',
              tournamentRealNameVisible: true,
              deletedAt: null,
            },
          },
          teamName: '서울 FC',
          note: null,
        },
      ],
    } as never);

    const presented = presentTournamentDetail(row);

    expect(presented.awards[0].recipientName).toBe('홍길동');
  });

  it('탈퇴한 수상자는 닉네임 대신 탈퇴 표시 문구를 사용한다', () => {
    const row = baseRow({
      awards: [
        {
          id: 'award-1',
          awardType: 'mvp',
          awardLabel: 'MVP',
          iconKey: 'crown',
          recipientName: '스냅샷실명',
          recipientUserId: 'user-1',
          recipient: {
            profile: {
              // 탈퇴 처리(admin.service.ts)는 nickname을 deleted_<8자> 내부 식별자로
              // 덮어쓰므로, 여기서 nickname을 쓰면 화면에 그 식별자가 그대로 노출된다.
              realName: null,
              displayName: '탈퇴 회원',
              nickname: 'deleted_a1b2c3d4',
              tournamentRealNameVisible: false,
              deletedAt: new Date('2026-07-01T00:00:00Z'),
            },
          },
          teamName: '서울 FC',
          note: null,
        },
      ],
    } as never);

    const presented = presentTournamentDetail(row);

    expect(presented.awards[0].recipientName).toBe('탈퇴 회원');
  });

  // 감사 evidence: `reviews` 배열은 조회 시 take:30으로 잘린다. 시상 화면의 개수
  // 배지가 그 잘린 배열의 length 를 쓰면 31건째부터 실제 후기 수보다 작은 숫자를
  // 계속 보여준다 — reviewsTotalCount 는 반드시 잘리지 않은 _count.reviews 를 그대로
  // 내보내야 하고, 절대 reviews.length 로 재계산되면 안 된다.
  it('reviewsTotalCount는 잘린 reviews 배열 길이가 아니라 _count.reviews 전체 카운트를 그대로 노출한다', () => {
    const row = baseRow({
      // take:30으로 잘려 들어온 상황을 흉내: 배열엔 2건만 있지만 전체는 45건.
      reviews: [
        {
          id: 'review-1',
          authorUserId: 'user-1',
          author: { profile: { nickname: '팀장A', profileImageUrl: null } },
          teamName: '서울 FC',
          rating: 5,
          comment: '좋았어요',
          photoUrls: [],
          createdAt: new Date('2026-06-01T00:00:00Z'),
        },
        {
          id: 'review-2',
          authorUserId: 'user-2',
          author: { profile: { nickname: '팀장B', profileImageUrl: null } },
          teamName: '부산 SC',
          rating: 4,
          comment: null,
          photoUrls: [],
          createdAt: new Date('2026-06-02T00:00:00Z'),
        },
      ],
      _count: { registrations: 0, reviews: 45 },
    } as never);

    const presented = presentTournamentDetail(row);

    expect(presented.reviews).toHaveLength(2);
    expect(presented.reviewsTotalCount).toBe(45);
  });
});


// `kind` 는 프론트가 정규 리그와 단발 대회를 가르는 **유일한** 필드다. 노출이 끊기면
// 소비처는 조용히 `format` 을 집는데(그게 유일하게 종류처럼 보이는 필드다) 그건 다른
// 질문에 답한다 — 아래 두 번째 케이스가 그 차이를 박는다.
describe('presentTournamentDetail — kind(종류)와 format(방식)은 독립이다', () => {
  function rowWith(kind: unknown, format: string): TournamentDetailRow {
    return {
      id: 't-1',
      sportId: 's-1',
      sport: { code: 'football', name: '축구' },
      title: '대회',
      status: 'open',
      format,
      kind,
      registrationDeadlineAt: null,
      rosterDeadlineAt: null,
      bracketPublishedAt: null,
      bracketPublishScheduledAt: null,
      scheduledAt: null,
      scheduledEndAt: null,
      groups: [],
      fixtures: [],
      announcements: [],
      sponsors: [],
      registrations: [],
      reviews: [],
      awards: [],
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      _count: { registrations: 0, reviews: 0 },
    } as unknown as TournamentDetailRow;
  }

  it('정규 리그 시즌은 kind=regular_league 로 내려간다', () => {
    expect(presentTournamentDetail(rowWith('regular_league', 'league')).kind).toBe('regular_league');
  });

  // ⭐ 이 케이스가 이 파일의 이유다. alpha 실측 7건이 정확히 이 모양이고(리그 방식으로
  //    치르는 진짜 대회), `format === 'league'` 로 종류를 가르면 이 7건이 신청·참가등록을
  //    잃는다. 두 필드가 **함께 실려야** 소비처가 구분할 수 있다.
  it('리그 방식으로 치르는 대회는 format=league 이지만 kind 는 regular_tournament 다', () => {
    const presented = presentTournamentDetail(rowWith('regular_tournament', 'league'));

    expect(presented.format).toBe('league');
    expect(presented.kind).toBe('regular_tournament');
  });

  // DB 가 아직 nullable 이라(R5 에서 NOT NULL 승격) null 이 실제로 도달할 수 있다.
  // 대회로 메우지 않고 null 그대로 넘긴다 — 메우면 리그가 대회로 그려진다.
  it('kind 가 null 인 행은 regular_tournament 로 메우지 않고 null 로 내려간다', () => {
    expect(presentTournamentDetail(rowWith(null, 'group_knockout')).kind).toBeNull();
  });
});
