import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PublicUserRecordsService } from './public-user-records.service';

const OWNER_ID = 'user-owner';

/**
 * `loadParticipantConsentEligibility`(public-consent.ts)가 내부적으로
 * `v1ParticipantIdentityLinkCurrent.findMany`을 `where.userId` 아닌
 * `where.participantId`로 다시 호출한다 -- 그래서 이 mock은 두 형태를 args로 구분한다
 * (loadEligibleRows 자신의 `where: { userId }` 조회와 겹치지 않게).
 */
function createFakePrisma(config: {
  links: ReadonlyArray<{ participantId: string; linkId: string; userId: string }>;
  userConsents: ReadonlyArray<{ userId: string; state: 'GRANTED' | 'REVOKED' }>;
  snapshots: ReadonlyArray<{ linkId: string; state: 'GRANTED' | 'REVOKED' }>;
  resultRows: unknown[];
  tournamentAwards?: unknown[];
  viewerConsentState?: 'GRANTED' | 'REVOKED' | null;
  sides?: ReadonlyArray<{
    id: string;
    gameId: string;
    sideKey: 'HOME' | 'AWAY';
    teamId: string | null;
    displayNameSnapshot: string | null;
  }>;
  teamMatches?: ReadonlyArray<{ id: string; leagueId: string | null }>;
  leagues?: ReadonlyArray<{ id: string; title: string }>;
  fixtures?: ReadonlyArray<{ id: string; tournamentId: string; round: string }>;
  tournaments?: ReadonlyArray<{ id: string; title: string }>;
}) {
  /** 서비스가 `where: { id: { in: [...] } }` 로만 조회하므로(N+1 금지 계약) 그 형태를 그대로 흉내낸다. */
  const findManyByIds = <T extends { id: string }>(rows: ReadonlyArray<T>) =>
    jest.fn().mockImplementation((args: { where: { id: { in: readonly string[] } } }) =>
      Promise.resolve(rows.filter((row) => args.where.id.in.includes(row.id))),
    );
  const linkFindMany = jest.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
    if ('userId' in args.where) {
      return Promise.resolve(
        config.links.filter((link) => link.userId === args.where.userId).map((link) => ({ participantId: link.participantId })),
      );
    }
    return Promise.resolve(config.links.map((link) => ({ participantId: link.participantId, linkId: link.linkId, userId: link.userId })));
  });

  return {
    v1User: {
      findFirst: jest.fn().mockResolvedValue({ id: OWNER_ID, profile: { nickname: '테스트유저' } }),
    },
    v1UserRecordConsent: {
      findMany: jest.fn().mockResolvedValue(config.userConsents),
      findUnique: jest.fn().mockResolvedValue(
        config.viewerConsentState === undefined
          ? (config.userConsents.find((consent) => consent.userId === OWNER_ID) ?? null)
          : config.viewerConsentState === null
            ? null
            : { state: config.viewerConsentState },
      ),
    },
    v1ParticipantIdentityLinkCurrent: { findMany: linkFindMany },
    v1ParticipantConsentSnapshot: { findMany: jest.fn().mockResolvedValue(config.snapshots) },
    v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue(config.resultRows) },
    v1TournamentAward: { findMany: jest.fn().mockResolvedValue(config.tournamentAwards ?? []) },
    v1GameSide: {
      findMany: jest.fn().mockResolvedValue(
        config.sides ?? [
          { id: 'side-1', gameId: 'game-1', sideKey: 'HOME', teamId: null, displayNameSnapshot: '우리팀' },
        ],
      ),
    },
    v1TournamentFixture: { findMany: findManyByIds(config.fixtures ?? []) },
    v1Team: { findMany: jest.fn().mockResolvedValue([]) },
    // BE-5: 대회 제목과 리그 제목을 같은 테이블에서 읽는다 — `kind` 로 갈린다.
    v1Tournament: {
      findMany: jest.fn(async (args: { where: { kind?: string } }) =>
        args.where.kind === 'regular_league'
          ? findManyByIds(config.leagues ?? [])(args)
          : findManyByIds(config.tournaments ?? [])(args),
      ),
    },
    v1TeamMatch: { findMany: findManyByIds(config.teamMatches ?? []) },
  } as unknown as PrismaService;
}

function gameResultRow(mvpParticipantId: string | null = null) {
  return {
    id: 'result-1',
    resultRevisionId: 'revision-1',
    participantId: 'participant-1',
    sideId: 'side-1',
    started: true,
    minutesPlayed: 90,
    goals: 1,
    assists: 0,
    cards: { yellow: 0, red: 0 },
    goalkeeper: false,
    resultRevision: {
      id: 'revision-1',
      gameId: 'game-1',
      officialAt: new Date('2026-08-10T00:00:00Z'),
      mvpParticipantId,
      score: { home: 1, away: 0 },
      game: {
        sourceType: 'TEAM_MATCH',
        tournamentFixtureId: null,
        teamMatchId: null,
        currentOfficialRevisionId: 'revision-1',
      },
    },
  };
}

/**
 * F6 -- 리그/친선/대회를 한 응답에 섞어 넣기 위한 팩토리. `gameResultRow`가 단일 행
 * 고정 id를 쓰고 있어 여러 행을 만들 수 없어서 별도로 둔다.
 */
function sourcedResultRow(input: {
  suffix: string;
  participantId: string;
  teamMatchId?: string | null;
  tournamentFixtureId?: string | null;
}) {
  const isTournament = (input.tournamentFixtureId ?? null) !== null;
  return {
    id: `result-${input.suffix}`,
    resultRevisionId: `revision-${input.suffix}`,
    participantId: input.participantId,
    sideId: `side-${input.suffix}`,
    started: true,
    minutesPlayed: 90,
    goals: 0,
    assists: 0,
    cards: { yellow: 0, red: 0 },
    goalkeeper: false,
    resultRevision: {
      id: `revision-${input.suffix}`,
      gameId: `game-${input.suffix}`,
      officialAt: new Date('2026-08-10T00:00:00Z'),
      mvpParticipantId: null,
      score: { home: 1, away: 0 },
      game: {
        sourceType: isTournament ? 'TOURNAMENT_FIXTURE' : 'TEAM_MATCH',
        tournamentFixtureId: input.tournamentFixtureId ?? null,
        teamMatchId: input.teamMatchId ?? null,
        currentOfficialRevisionId: `revision-${input.suffix}`,
      },
    },
  };
}

function tournamentAwardRow() {
  return {
    id: 'award-1',
    tournamentId: 'tournament-1',
    awardType: 'best_playmaker',
    awardLabel: '베스트 플레이메이커',
    iconKey: 'star',
    teamName: '우리팀',
    note: '결승전 2도움',
    createdAt: new Date('2026-08-10T00:00:00Z'),
    sortOrder: 0,
    tournament: {
      title: '2026 여름 챔피언십',
      scheduledEndAt: new Date('2026-08-10T00:00:00Z'),
      updatedAt: new Date('2026-08-10T01:00:00Z'),
    },
  };
}

describe('PublicUserRecordsService', () => {
  it('본인 기록에서 매치 MVP와 대회별 실제 수상명을 별도로 집계한다', async () => {
    const prisma = createFakePrisma({
      links: [{ participantId: 'participant-1', linkId: 'link-1', userId: OWNER_ID }],
      userConsents: [],
      snapshots: [],
      resultRows: [gameResultRow('participant-1')],
      tournamentAwards: [tournamentAwardRow()],
      viewerConsentState: null,
    });
    const service = new PublicUserRecordsService(prisma);

    const result = await service.getRecords(OWNER_ID, {}, OWNER_ID);

    expect(result.summary).toMatchObject({
      appearances: 1,
      goals: 1,
      mvpCount: 1,
      matchMvpCount: 1,
      tournamentAwardCount: 1,
    });
    expect(result.tournamentAwards).toEqual([
      expect.objectContaining({
        awardLabel: '베스트 플레이메이커',
        tournamentTitle: '2026 여름 챔피언십',
        teamName: '우리팀',
      }),
    ]);
  });

  it('존재하지 않는 사용자는 404를 던진다', async () => {
    const prisma = createFakePrisma({ links: [], userConsents: [], snapshots: [], resultRows: [] });
    (prisma.v1User.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new PublicUserRecordsService(prisma);

    await expect(service.getRecords('missing-user', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('탈퇴한 계정(deletedAt/accountStatus != active)은 404를 던져 내부 삭제 식별자가 공개 응답에 노출되지 않는다', async () => {
    // admin.service.ts deleteUser가 profile.nickname을 `deleted_xxxxxxxx`(내부 식별자)로
    // 덮어쓰는데, 계정 상태 게이트가 없으면 이 값이 그대로 응답에 실려 SEO 인덱싱되는
    // 페이지 제목에 노출된다(감사 finding #39). v1User.findFirst 는 `deletedAt: null,
    // accountStatus: 'active'` where 조건에 걸리면 null 을 반환하므로, 여기서는 그
    // 실제 동작을 모사해 서비스가 계정 상태를 실제로 조회 조건에 반영하는지를 검증한다.
    const prisma = createFakePrisma({ links: [], userConsents: [], snapshots: [], resultRows: [] });
    (prisma.v1User.findFirst as jest.Mock).mockImplementation((args: { where: { deletedAt?: unknown; accountStatus?: unknown } }) =>
      Promise.resolve(args.where.deletedAt === null && args.where.accountStatus === 'active' ? null : { id: OWNER_ID }),
    );
    const service = new PublicUserRecordsService(prisma);

    await expect(service.getRecords(OWNER_ID, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.v1User.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: OWNER_ID, deletedAt: null, accountStatus: 'active' }) }),
    );
  });

  it('본인 조회는 사용자 단위 동의(GRANTED)가 없어도 신원 연결된 자신의 기록을 볼 수 있다', async () => {
    const prisma = createFakePrisma({
      links: [{ participantId: 'participant-1', linkId: 'link-1', userId: OWNER_ID }],
      userConsents: [], // 동의 행 자체가 없음 -- REVOKED도 아니고 그냥 "응답한 적 없음"
      snapshots: [], // participant 단위 개별 숨김 없음
      resultRows: [gameResultRow()],
      viewerConsentState: null,
    });
    const service = new PublicUserRecordsService(prisma);

    const result = await service.getRecords(OWNER_ID, {}, OWNER_ID);

    expect(result.viewerIsOwner).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('isCorrected');
    // 본인 조회이므로 consentGranted가 최상위에 채워진다 -- 동의 행이 없으므로 false.
    expect(result.consentGranted).toBe(false);
  });

  it('본인이어도 participant 단위로 REVOKED 스냅샷을 건 기록은 여전히 숨는다', async () => {
    const prisma = createFakePrisma({
      links: [{ participantId: 'participant-1', linkId: 'link-1', userId: OWNER_ID }],
      userConsents: [{ userId: OWNER_ID, state: 'GRANTED' }], // 사용자 단위 동의는 켜져 있어도
      snapshots: [{ linkId: 'link-1', state: 'REVOKED' }], // 이 참가 기록 하나만 명시적으로 숨김
      resultRows: [gameResultRow()],
      viewerConsentState: 'GRANTED',
    });
    const service = new PublicUserRecordsService(prisma);

    const result = await service.getRecords(OWNER_ID, {}, OWNER_ID);

    expect(result.viewerIsOwner).toBe(true);
    expect(result.items).toHaveLength(0);
    expect(result.consentGranted).toBe(true);
  });

  it('타인이 조회하면 사용자 단위 동의가 없는 한 항상 숨고, 응답에 consentGranted가 실리지 않는다', async () => {
    const prisma = createFakePrisma({
      links: [{ participantId: 'participant-1', linkId: 'link-1', userId: OWNER_ID }],
      userConsents: [], // 동의 없음
      snapshots: [],
      resultRows: [gameResultRow()],
      tournamentAwards: [tournamentAwardRow()],
    });
    const service = new PublicUserRecordsService(prisma);

    const result = await service.getRecords(OWNER_ID, {}, 'someone-else');

    expect(result.viewerIsOwner).toBe(false);
    expect(result.items).toHaveLength(0);
    expect(result.tournamentAwards).toHaveLength(0);
    expect(result.summary.tournamentAwardCount).toBe(0);
    expect('consentGranted' in result).toBe(false);
  });

  it('비로그인 방문자(viewerId undefined)도 타인 취급되어 동의 없는 기록은 숨는다', async () => {
    const prisma = createFakePrisma({
      links: [{ participantId: 'participant-1', linkId: 'link-1', userId: OWNER_ID }],
      userConsents: [],
      snapshots: [],
      resultRows: [gameResultRow()],
    });
    const service = new PublicUserRecordsService(prisma);

    const result = await service.getRecords(OWNER_ID, {}, undefined);

    expect(result.viewerIsOwner).toBe(false);
    expect(result.items).toHaveLength(0);
    expect('consentGranted' in result).toBe(false);
  });

  it('타인이 조회할 때 사용자 단위 동의가 GRANTED고 개별 숨김도 없으면 기록이 보인다', async () => {
    const prisma = createFakePrisma({
      links: [{ participantId: 'participant-1', linkId: 'link-1', userId: OWNER_ID }],
      userConsents: [{ userId: OWNER_ID, state: 'GRANTED' }],
      snapshots: [],
      resultRows: [gameResultRow()],
      tournamentAwards: [tournamentAwardRow()],
    });
    const service = new PublicUserRecordsService(prisma);

    const result = await service.getRecords(OWNER_ID, {}, 'someone-else');

    expect(result.viewerIsOwner).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.tournamentAwards).toHaveLength(1);
    expect(result.summary.tournamentAwardCount).toBe(1);
    expect('consentGranted' in result).toBe(false);
  });

  it('리그 대진 행에는 리그 제목이 붙고, 리그가 아닌 친선 팀매치 행에는 붙지 않는다', async () => {
    const prisma = createFakePrisma({
      links: [
        { participantId: 'participant-league', linkId: 'link-league', userId: OWNER_ID },
        { participantId: 'participant-friendly', linkId: 'link-friendly', userId: OWNER_ID },
        { participantId: 'participant-tournament', linkId: 'link-tournament', userId: OWNER_ID },
      ],
      userConsents: [{ userId: OWNER_ID, state: 'GRANTED' }],
      snapshots: [],
      resultRows: [
        sourcedResultRow({ suffix: 'league', participantId: 'participant-league', teamMatchId: 'team-match-league' }),
        sourcedResultRow({
          suffix: 'friendly',
          participantId: 'participant-friendly',
          teamMatchId: 'team-match-friendly',
        }),
        sourcedResultRow({
          suffix: 'tournament',
          participantId: 'participant-tournament',
          tournamentFixtureId: 'fixture-1',
        }),
      ],
      // 친선 팀매치도 팀매치 행 자체는 존재한다 -- 다른 점은 `leagueId`가 null이라는 것뿐이다.
      teamMatches: [
        { id: 'team-match-league', leagueId: 'league-1' },
        { id: 'team-match-friendly', leagueId: null },
      ],
      leagues: [{ id: 'league-1', title: '2026 가을 정규 리그' }],
      fixtures: [{ id: 'fixture-1', tournamentId: 'tournament-1', round: '결승' }],
      tournaments: [{ id: 'tournament-1', title: '2026 여름 챔피언십' }],
      viewerConsentState: 'GRANTED',
    });
    const service = new PublicUserRecordsService(prisma);

    const result = await service.getRecords(OWNER_ID, {}, 'someone-else');

    const byGameId = new Map(result.items.map((item) => [item.gameId, item]));
    expect(byGameId.get('game-league')).toMatchObject({
      type: 'league',
      leagueId: 'league-1',
      leagueTitle: '2026 가을 정규 리그',
      tournamentId: null,
      tournamentTitle: null,
    });
    // 회귀 금지: 리그가 아닌 팀매치는 예전과 똑같이 아무 맥락도 붙지 않는다.
    expect(byGameId.get('game-friendly')).toMatchObject({
      type: 'friendly',
      leagueId: null,
      leagueTitle: null,
      tournamentId: null,
      tournamentTitle: null,
    });
    // 회귀 금지: 대회 경기는 그대로 대회명을 유지한다.
    expect(byGameId.get('game-tournament')).toMatchObject({
      type: 'tournament',
      leagueId: null,
      leagueTitle: null,
      tournamentId: 'tournament-1',
      tournamentTitle: '2026 여름 챔피언십',
    });

    // N+1 금지: 팀매치·리그 모두 행 수와 무관하게 단일 IN 조회 1회씩이다.
    expect((prisma.v1TeamMatch.findMany as jest.Mock).mock.calls).toHaveLength(1);
    // BE-5: 대회 제목과 리그 제목이 같은 테이블에서 오므로 이 mock 은 둘을 함께 센다.
    // 재려던 것은 "각각 단일 IN 조회 1회" 이므로 갈래별로 나눠 센다 — 합계만 보면 한쪽이
    // 행마다 도는 회귀를 다른 쪽이 가려 준다.
    const tournamentCalls = (prisma.v1Tournament.findMany as jest.Mock).mock.calls.filter(
      ([args]) => args.where.kind !== 'regular_league',
    );
    const leagueCalls = (prisma.v1Tournament.findMany as jest.Mock).mock.calls.filter(
      ([args]) => args.where.kind === 'regular_league',
    );
    expect(tournamentCalls).toHaveLength(1);
    expect(leagueCalls).toHaveLength(1);
  });
});
