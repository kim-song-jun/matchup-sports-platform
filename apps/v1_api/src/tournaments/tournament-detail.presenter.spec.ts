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

// R3 §4-3단계: 공개 상세의 fixtures[].result가 레거시 legacy result row 대신
// V1Game.currentOfficialRevision(신규 경로)에서 채워지는지 검증한다.
// docs/ops/legacy-game-result-r3-removal-inventory.md §1-2 참고.
describe('presentTournamentDetail — fixtures[].result (신규 경로)', () => {
  type FixtureSeed = {
    id: string;
    groupId: string | null;
    round: string;
    fixtureNumber: number;
    legNumber: number;
    parentFixtureId?: string | null;
    scheduledAt: Date | null;
    venue: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    fieldId?: string | null;
    status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
    homeRegistrationId: string | null;
    awayRegistrationId: string | null;
    homeRegistration: { team: { id: string; name: string; profile: null } } | null;
    awayRegistration: { team: { id: string; name: string; profile: null } } | null;
    competitionConfigVersionId?: string | null;
    result?: null;
    game: (Record<string, unknown> & {
      visibilityPolicy?: { mode: string } | null;
    }) | null;
    videos?: readonly Record<string, unknown>[];
  };

  type RowOverrides = Omit<Partial<TournamentDetailRow>, 'tournamentMatchDetails'> & {
    detailSeeds?: readonly FixtureSeed[];
    tournamentMatchDetails?: TournamentDetailRow['tournamentMatchDetails'];
  };

  function baseRow(overrides: RowOverrides = {}): TournamentDetailRow {
    const { detailSeeds: detailSeedRows = [], tournamentMatchDetails, ...rowOverrides } = overrides;
    const canonicalDetails = detailSeedRows.map((fixture) => ({
      tournamentId: 'tournament-1',
      teamMatchId: fixture.id,
      groupId: fixture.groupId ?? null,
      round: fixture.round,
      fixtureNumber: fixture.fixtureNumber,
      legNumber: fixture.legNumber,
      parentTeamMatchId: fixture.parentFixtureId ?? null,
      homeRegistrationId: fixture.homeRegistrationId ?? null,
      awayRegistrationId: fixture.awayRegistrationId ?? null,
      homeRegistration: fixture.homeRegistration,
      awayRegistration: fixture.awayRegistration,
      createdAt: fixture.createdAt ?? new Date('2026-06-01T00:00:00Z'),
      updatedAt: fixture.updatedAt ?? new Date('2026-06-01T00:00:00Z'),
      teamMatch: {
        startAt: fixture.scheduledAt ?? null,
        fieldId: fixture.fieldId ?? null,
        placeName: fixture.venue ?? null,
        status: fixture.status ?? 'completed',
        competitionConfigVersionId: fixture.competitionConfigVersionId ?? 'config-1',
          game: fixture.game === null
          ? null
          : { ...fixture.game, visibilityPolicy: fixture.game.visibilityPolicy ?? { mode: 'LIVE' } },
        videos: fixture.videos ?? [],
      },
    }));
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
      announcements: [],
      sponsors: [],
      createdAt: new Date('2026-06-01T00:00:00Z'),
      updatedAt: new Date('2026-06-01T00:00:00Z'),
      reviews: [],
      awards: [],
      ...rowOverrides,
      tournamentMatchDetails: tournamentMatchDetails ?? canonicalDetails,
    } as unknown as TournamentDetailRow;
  }

  function fixtureRow(
    game: Record<string, unknown> | null,
    status: FixtureSeed['status'] = 'completed',
  ): FixtureSeed {
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
    };
  }

  it('OFFICIAL 리비전(신규 경로)에서 homeScore/awayScore/goals가 채워진다', () => {
    const row = baseRow({
      detailSeeds: [
        fixtureRow({
          // `state`는 공개 상세가 픽스처의 라이브 여부를 판정하는 유일한 authoritative
          // 신호다(`stored match status`는 in_progress로 전이하지 않는다).
          // OFFICIAL 리비전이 존재하는 이 시나리오의 경기는 이미 끝난 상태다.
          state: 'ENDED',
          sides: [
            { id: 'side-home', sideKey: 'HOME' },
            { id: 'side-away', sideKey: 'AWAY' },
          ],
          participants: [{ id: 'participant-1', sideId: 'side-home', userId: null, displayNameSnapshot: '김선수' }],
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
            outcomeReason: 'NORMAL',
            outcomeNote: null,
            score: { regulation: { home: 3, away: 1 }, penalty: null, goals: [], incomplete: false },
            goalEvents: null,
            officialAt: new Date('2026-06-15T10:00:00Z'),
            createdAt: new Date('2026-06-15T10:00:00Z'),
            updatedAt: new Date('2026-06-15T10:00:00Z'),
            tournamentResultLineages: [],
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

  it('공개 상세는 HIDDEN fixture를 제거하지만 staff view는 유지한다', () => {
    const row = baseRow({
      detailSeeds: [
        fixtureRow({
          state: 'ENDED',
          visibilityPolicy: { mode: 'HIDDEN' },
          sides: [],
          participants: [],
          events: [],
          currentOfficialRevision: null,
        }),
      ],
    } as never);

    expect(presentTournamentDetail(row).fixtures).toEqual([]);
    expect(presentTournamentDetail(row, new Date(), true).fixtures).toHaveLength(1);
  });

  it('공개 STATUS_ONLY fixture는 lifecycle은 남기고 결과를 숨긴다', () => {
    const row = baseRow({
      detailSeeds: [
        fixtureRow({
          state: 'ENDED',
          visibilityPolicy: { mode: 'STATUS_ONLY' },
          sides: [],
          participants: [],
          events: [],
          currentOfficialRevision: {
            id: 'revision-status-only',
            state: 'OFFICIAL',
            outcomeReason: 'NORMAL',
            outcomeNote: null,
            score: { home: 2, away: 1 },
            goalEvents: null,
            officialAt: new Date('2026-06-15T10:00:00Z'),
            createdAt: new Date('2026-06-15T10:00:00Z'),
            updatedAt: new Date('2026-06-15T10:00:00Z'),
            tournamentResultLineages: [],
          },
        }),
      ],
    } as never);

    const presented = presentTournamentDetail(row);
    expect(presented.fixtures).toHaveLength(1);
    expect(presented.fixtures[0].result).toBeNull();
  });

  it('공개 결과는 취소된 계정의 raw user id를 내보내지 않지만 활동 이름과 participant id는 보존한다', () => {
    const row = baseRow({
      detailSeeds: [
        fixtureRow({
          state: 'ENDED',
          visibilityPolicy: { mode: 'LIVE' },
          sides: [{ id: 'side-home', sideKey: 'HOME' }],
          participants: [{ id: 'participant-revoked', sideId: 'side-home', userId: 'revoked-user', displayNameSnapshot: '활동 선수' }],
          events: [{ id: 'goal-revoked', type: 'GOAL', sideId: 'side-home', participantId: 'participant-revoked', clockMs: 60000, payload: null, reversesEventId: null }],
          currentOfficialRevision: {
            id: 'revision-revoked',
            state: 'OFFICIAL',
            outcomeReason: 'NORMAL',
            outcomeNote: null,
            score: { home: 1, away: 0 },
            goalEvents: null,
            officialAt: new Date('2026-06-15T10:00:00Z'),
            createdAt: new Date('2026-06-15T10:00:00Z'),
            updatedAt: new Date('2026-06-15T10:00:00Z'),
            tournamentResultLineages: [],
          },
        }),
      ],
    } as never);

    expect(presentTournamentDetail(row).fixtures[0].result?.goals[0]).toMatchObject({
      playerId: 'participant-revoked',
      playerName: '활동 선수',
      playerUserId: null,
    });
    expect(presentTournamentDetail(row, new Date(), true).fixtures[0].result?.goals[0]?.playerUserId).toBeNull();
  });

  it('정정(CORRECTION)으로 취소된 골은 goals[]에서 빠진다', () => {
    const row = baseRow({
      detailSeeds: [
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
            outcomeReason: 'NORMAL',
            outcomeNote: null,
            score: { home: 0, away: 0 },
            goalEvents: null,
            officialAt: new Date('2026-06-15T10:00:00Z'),
            createdAt: new Date('2026-06-15T10:00:00Z'),
            updatedAt: new Date('2026-06-15T10:00:00Z'),
            tournamentResultLineages: [],
          },
        }),
      ],
    } as never);

    const presented = presentTournamentDetail(row);

    expect(presented.fixtures[0].result?.goals).toEqual([]);
  });

  it('canonical game이 없으면 public fixture를 내보내지 않는다', () => {
    const row = baseRow({ detailSeeds: [fixtureRow(null)] } as never);
    const presented = presentTournamentDetail(row);
    expect(presented.fixtures).toEqual([]);
  });

  it('VOID로 무효화된 결과는 result가 null(레거시의 "결과 없음"과 동등)', () => {
    const row = baseRow({
      detailSeeds: [
        fixtureRow({
          state: 'ENDED',
          sides: [],
          participants: [],
          events: [],
          currentOfficialRevision: {
            id: 'revision-void',
            state: 'VOID',
            outcomeReason: 'NORMAL',
            outcomeNote: null,
            score: { home: 3, away: 1 },
            goalEvents: null,
            officialAt: null,
            createdAt: new Date('2026-06-15T10:00:00Z'),
            updatedAt: new Date('2026-06-15T10:00:00Z'),
            tournamentResultLineages: [],
          },
        }),
      ],
    } as never);

    const presented = presentTournamentDetail(row);
    expect(presented.fixtures[0].result).toBeNull();
  });

  /**
   * 이 두 케이스가 프로덕션에서 실제로 깨져 있던 조합이다. `stored match status`는
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
      detailSeeds: [
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

  it('canonical game이 없으면 public fixture를 내보내지 않는다', () => {
    const row = baseRow({ detailSeeds: [fixtureRow(null, 'scheduled')] });

    const presented = presentTournamentDetail(row);
    expect(presented.fixtures).toEqual([]);
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
        detailSeeds: [
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
      if (gameState === null) {
        expect(presentTournamentDetail(row).fixtures).toEqual([]);
      } else {
        expect(presentTournamentDetail(row).fixtures[0].liveStatus).toBe(expected);
      }
    },
  );

  it('원본 status 컬럼이 무엇이든 두 레인의 진행 상태는 게임에서만 나온다', () => {
    // 컬럼이 completed 인데 경기가 다시 LIVE 인 조합(결과 정정 중 재개 등)에서도
    // 두 레인이 갈리면 안 된다 — 상세 레인이 컬럼으로 되돌아가면 여기서 깨진다.
    expect(publicFixtureStatus({ gameState: 'LIVE', fixtureStatus: 'completed' })).toBe('live');

    const row = baseRow({
      detailSeeds: [
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
      tournamentMatchDetails: [],
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

  it('정규 리그 상세는 tier/seasonNo/seriesId를 보존하고 일반 대회에는 추가하지 않는다', () => {
    const league = presentTournamentDetail({
      ...rowWith('regular_league', 'group_knockout'),
      tier: 2,
      seasonNo: 4,
      seriesId: 'series-1',
    });
    const tournament = presentTournamentDetail({
      ...rowWith('regular_tournament', 'league'),
      tier: 2,
      seasonNo: 4,
      seriesId: 'series-1',
    });

    expect(league).toMatchObject({ tier: 2, seasonNo: 4, seriesId: 'series-1' });
    expect(tournament).not.toHaveProperty('tier');
    expect(tournament).not.toHaveProperty('seasonNo');
    expect(tournament).not.toHaveProperty('seriesId');
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

  it('league fixture identity masking preserves assigned-vs-TBD slot state', () => {
    const presented = presentTournamentDetail(
      rowWith('regular_league', 'group_knockout'),
      new Date(),
      false,
      [
        {
          teamMatchId: 'tm-1',
          title: '1주차',
          homeTeamId: null,
          awayTeamId: null,
          homeAssigned: true,
          awayAssigned: false,
          startAt: new Date('2026-09-01T10:00:00Z'),
          placeName: '경기장',
          status: 'matched',
          homeScore: null,
          awayScore: null,
          isForfeit: false,
        },
      ],
    );

    expect(presented.leagueFixtures[0]).toMatchObject({
      homeTeamId: null,
      awayTeamId: null,
      homeAssigned: true,
      awayAssigned: false,
    });
  });
});

/**
 * **공개 명단 (사용자 A안, 2026-09-06 확정).**
 *
 * 정본 §3: 명단 공개는 **등번호·이름(닉네임)** 이다. 기존 명단 응답은 `realName`·생년월일·
 * 성별·자격판정까지 싣는데 그건 **자격 가드에만 쓰라고 받은 값**이라, 공개 화면에 그대로
 * 내보내면 PII 유출이다. 그래서 공개 전용 직렬화를 따로 뒀다.
 */
describe('presentTournamentDetail — 공개 명단', () => {
  function rowWithRoster(overrides: Record<string, unknown> = {}) {
    return {
      id: 'tournament-1',
      sportId: 'sport-1',
      sport: { code: 'football', name: '축구' },
      title: '테스트 대회',
      status: 'in_progress',
      format: 'group_knockout',
      registrationDeadlineAt: null,
      rosterDeadlineAt: null,
      bracketPublishedAt: new Date('2026-06-01T00:00:00Z'),
      bracketPublishScheduledAt: null,
      scheduledAt: null,
      scheduledEndAt: null,
      venue: null,
      promoListTeamsText: null,
      promoListLocationText: null,
      promoListPrizeText: null,
      promoListPriority: 0,
      campaign: null,
      _count: { registrations: 1, reviews: 0 },
      registrations: [
        {
          id: 'reg-1',
          status: 'confirmed',
          confirmedAt: new Date('2026-06-02T00:00:00Z'),
          team: { id: 'team-1', name: 'A팀', profile: null, region: null },
          // **`players` 를 여기 두지 않는다.** 기본 조회의 include 에서 뺐기 때문이다 —
          // row 에 남겨 두면 presenter 가 그걸 읽는지 명단 맵을 읽는지 구분되지 않아,
          // 소비처를 안 고쳐도 통과하는 vacuous 스펙이 된다.
        },
      ],
      groups: [],
      tournamentMatchDetails: [],
      announcements: [],
      sponsors: [],
      createdAt: new Date('2026-06-01T00:00:00Z'),
      updatedAt: new Date('2026-06-01T00:00:00Z'),
      reviews: [],
      awards: [],
      ...overrides,
    } as unknown as Parameters<typeof presentTournamentDetail>[0];
  }

  /**
   * 호출부(`tournaments-read.service.ts`)가 넘기는 **명단 맵**. 실명·생년월일 같은 값은
   * 애초에 이 자리에 담기지 않는다 — `readPublicRostersForRegistrations` 가 `nickname` 만
   * SELECT 하기 때문이다. 그래서 이 스펙의 PII 훑기는 **"presenter 가 다른 자리에서
   * 끌어오지 않는가"** 를 보는 것이 된다.
   */
  const rosterMap = (jerseyOfPlayer1: number | null = 7) =>
    new Map([
      [
        'reg-1',
        [
          { id: 'player-1', jerseyNumber: jerseyOfPlayer1, nickname: '길동이' },
          // 번호를 안 단 선수 — 명단에서 사라지면 안 된다.
          { id: 'player-2', jerseyNumber: null, nickname: null },
        ],
      ],
    ]);

  it('등번호와 닉네임만 내보낸다 — 실명·생년월일·성별·자격판정은 응답에 없다', () => {
    const result = presentTournamentDetail(
      rowWithRoster(),
      new Date('2026-06-10T00:00:00Z'),
      false,
      [],
      rosterMap(),
    );

    const players = result.participantTeams[0]?.players;
    expect(players).toEqual([
      { id: 'player-1', jerseyNumber: 7, nickname: '길동이' },
      // 번호를 안 단 선수는 `null` — 0 으로 채우면 아무도 안 단 번호가 전원 0번이 된다.
      { id: 'player-2', jerseyNumber: null, nickname: null },
    ]);

    // **응답 전체를 문자열로 훑는다.** 필드 이름을 바꿔 우회하거나 다른 자리에 실려도 잡는다.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('홍길동');
    expect(serialized).not.toContain('김철수');
    expect(serialized).not.toContain('1995-03-15');
    // **`displayName` 값도 훑는다** — 폴백이 되살아나면 여기서 잡힌다.
    expect(serialized).not.toContain('홍길동(실명)');
    expect(serialized).not.toContain('김철수(실명)');
    expect(serialized).not.toContain('genderSnapshot');
    expect(serialized).not.toContain('eligibilityStatus');
  });

  it('닉네임이 없으면 null 이다 — 실명으로 떨어뜨리지 않는다', () => {
    const result = presentTournamentDetail(
      rowWithRoster(),
      new Date('2026-06-10T00:00:00Z'),
      false,
      [],
      rosterMap(),
    );

    // 화면이 이 `null` 을 보고 "(탈퇴한 선수)" 자리표시자를 그린다. 여기서 실명으로
    // 폴백하면 정본 위반이 조용히 살아난다.
    expect(result.participantTeams[0]?.players[1]?.nickname).toBeNull();
  });

  it('모집 중에는 명단도 안 보인다 — 팀 식별정보와 같은 게이트를 탄다', () => {
    const result = presentTournamentDetail(
      rowWithRoster({ status: 'open' }),
      new Date('2026-06-10T00:00:00Z'),
      false,
      [],
      rosterMap(),
    );

    // 팀 자체가 안 나오므로 명단도 함께 사라진다. 명단만 따로 게이트를 두면
    // "팀명은 가렸는데 선수는 보인다" 가 가능해진다.
    expect(result.participantTeams).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('길동이');
  });

  it('운영자는 모집 중에도 본다 — staffBypass 는 기존 정책 그대로', () => {
    const result = presentTournamentDetail(
      rowWithRoster({ status: 'open' }),
      new Date('2026-06-10T00:00:00Z'),
      true,
      [],
      rosterMap(),
    );

    expect(result.participantTeams[0]?.players[0]?.nickname).toBe('길동이');
  });

  it('명단은 **넘겨받은 맵**에서 온다 — row 에서 읽으면 include 를 빼는 순간 조용히 빈다', () => {
    // 이 스펙의 핵심 방어다. presenter 가 `registration.players` 를 읽던 시절에는
    // include 에서 조인을 빼도 `?? []` 가 삼켜 **명단이 빈 배열**이 되는데 tsc·lint 가
    // 못 잡았다. 맵을 비우면 명단도 비고, 맵에 넣으면 그대로 나오는지를 양쪽으로 본다.
    const withRoster = presentTournamentDetail(
      rowWithRoster(),
      new Date('2026-06-10T00:00:00Z'),
      false,
      [],
      rosterMap(),
    );
    expect(withRoster.participantTeams[0]?.players).toHaveLength(2);

    const withoutRoster = presentTournamentDetail(
      rowWithRoster(),
      new Date('2026-06-10T00:00:00Z'),
      false,
      [],
      new Map(),
    );
    expect(withoutRoster.participantTeams[0]?.players).toEqual([]);
  });

  it('등번호를 안 단 선수도 명단에 남는다 — 거르면 통째로 사라진다', () => {
    // 조회 쪽에서 `jersey_number IS NOT NULL` 을 걸면 이 선수가 사라진다. presenter 는
    // 맵을 그대로 내보내야 하고, 번호 없음은 `null` 로 표현된다(0 이 아니다).
    const result = presentTournamentDetail(
      rowWithRoster(),
      new Date('2026-06-10T00:00:00Z'),
      false,
      [],
      rosterMap(null),
    );
    expect(result.participantTeams[0]?.players).toEqual([
      { id: 'player-1', jerseyNumber: null, nickname: '길동이' },
      { id: 'player-2', jerseyNumber: null, nickname: null },
    ]);
  });
});
