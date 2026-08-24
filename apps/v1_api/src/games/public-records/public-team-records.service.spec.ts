import type { PrismaService } from '../../prisma/prisma.service';
import { PublicTeamRecordsService } from './public-team-records.service';

describe('PublicTeamRecordsService', () => {
  it('orders, filters, and presents team records by the match date instead of correction time', async () => {
    const playedAt = new Date('2026-08-09T02:00:00.000Z');
    const officialAt = new Date('2026-08-20T11:00:00.000Z');
    const factFindMany = jest.fn().mockResolvedValue([
      {
        id: 'fact-1',
        revisionId: 'revision-2',
        gameId: 'game-1',
        opponentTeamId: 'team-2',
        tournamentId: 'tournament-1',
        result: 'WON',
        goalsFor: 2,
        goalsAgainst: 1,
        playedAt,
        resultRevision: {
          score: { home: 2, away: 1 },
          goalEvents: null,
          game: {
            currentOfficialRevisionId: 'revision-2',
            teamMatchId: null,
            sides: [
              { id: 'side-home', sideKey: 'HOME', teamId: 'team-1' },
              { id: 'side-away', sideKey: 'AWAY', teamId: 'team-2' },
            ],
            participants: [],
          },
        },
        officialAt,
      },
    ]);
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'fact-1', playedAt }])
      .mockResolvedValueOnce([
        { category: 'tournament', played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1 },
      ]);
    const prisma = {
      v1Team: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'team-1',
          name: '서울 유나이티드',
          profile: { logoUrl: '/team-1.png' },
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'team-2', name: '부산 FC', profile: { logoUrl: '/team-2.png' } },
        ]),
      },
      v1TeamRecordFact: { findMany: factFindMany },
      v1Tournament: {
        findMany: jest.fn().mockResolvedValue([{ id: 'tournament-1', title: '주말 리그' }]),
      },
      v1TeamMatch: { findMany: jest.fn().mockResolvedValue([]) },
      v1League: { findMany: jest.fn().mockResolvedValue([]) },
      v1GameEvent: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: queryRaw,
    } as unknown as PrismaService;

    const result = await new PublicTeamRecordsService(prisma).getRecords('team-1', {
      season: '2026',
    });

    expect(factFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['fact-1'] } },
      }),
    );
    const pageQuery = queryRaw.mock.calls[0]?.[0] as { strings?: readonly string[] };
    expect(pageQuery.strings?.join(' ')).toContain('ORDER BY trf.played_at DESC, trf.id DESC');
    expect(pageQuery.strings?.join(' ')).toContain('trf.played_at >=');
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        playedAt: playedAt.toISOString(),
        type: 'tournament',
        leagueId: null,
        leagueTitle: null,
      }),
    );
    expect(result.items[0]).not.toHaveProperty('officialAt');
    // 전체 요약 + 종류별 구간 집계가 한 그룹 쿼리 결과에서 함께 나온다 -- tournament
    // 카테고리 1건만 있었으니 league/friendly 는 0으로 채워져야 한다(값을 지어내지 않는다).
    expect(result.summary).toEqual({
      played: 1,
      won: 1,
      drawn: 0,
      lost: 0,
      goalsFor: 2,
      goalsAgainst: 1,
      byType: {
        tournament: { played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1 },
        league: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
        friendly: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      },
    });
  });

  it('classifies a league team-match fact and resolves its leagueId/leagueTitle through the team match', async () => {
    const playedAt = new Date('2026-08-09T02:00:00.000Z');
    const factFindMany = jest.fn().mockResolvedValue([
      {
        id: 'fact-league-1',
        revisionId: 'revision-9',
        gameId: 'game-9',
        opponentTeamId: 'team-2',
        tournamentId: null,
        result: 'LOST',
        goalsFor: 0,
        goalsAgainst: 3,
        playedAt,
        resultRevision: {
          score: { home: 0, away: 3 },
          goalEvents: null,
          game: {
            currentOfficialRevisionId: 'revision-9',
            teamMatchId: 'team-match-9',
            sides: [
              { id: 'side-home', sideKey: 'HOME', teamId: 'team-1' },
              { id: 'side-away', sideKey: 'AWAY', teamId: 'team-2' },
            ],
            participants: [],
          },
        },
      },
    ]);
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'fact-league-1', playedAt }])
      .mockResolvedValueOnce([
        { category: 'league', played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 0, goalsAgainst: 3 },
      ]);
    const teamMatchFindMany = jest.fn().mockResolvedValue([{ id: 'team-match-9', leagueId: 'league-1' }]);
    const leagueFindMany = jest.fn().mockResolvedValue([{ id: 'league-1', title: '2026 여름 정규 리그' }]);
    const prisma = {
      v1Team: {
        findUnique: jest.fn().mockResolvedValue({ id: 'team-1', name: '서울 유나이티드', profile: null }),
        findMany: jest.fn().mockResolvedValue([{ id: 'team-2', name: '부산 FC', profile: null }]),
      },
      v1TeamRecordFact: { findMany: factFindMany },
      v1Tournament: { findMany: jest.fn().mockResolvedValue([]) },
      v1TeamMatch: { findMany: teamMatchFindMany },
      v1League: { findMany: leagueFindMany },
      v1GameEvent: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: queryRaw,
    } as unknown as PrismaService;

    const result = await new PublicTeamRecordsService(prisma).getRecords('team-1', {});

    expect(teamMatchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['team-match-9'] } } }),
    );
    expect(leagueFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['league-1'] } } }));
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        type: 'league',
        leagueId: 'league-1',
        leagueTitle: '2026 여름 정규 리그',
        tournamentId: null,
        tournamentTitle: null,
      }),
    );
  });

  it('sends the type filter to the raw page query and skips league/tournament lookups when nothing needs them', async () => {
    const playedAt = new Date('2026-08-09T02:00:00.000Z');
    const factFindMany = jest.fn().mockResolvedValue([
      {
        id: 'fact-friendly-1',
        revisionId: 'revision-3',
        gameId: 'game-3',
        opponentTeamId: null,
        tournamentId: null,
        result: 'DRAWN',
        goalsFor: 1,
        goalsAgainst: 1,
        playedAt,
        resultRevision: {
          score: { home: 1, away: 1 },
          goalEvents: null,
          game: {
            currentOfficialRevisionId: 'revision-3',
            teamMatchId: 'team-match-3',
            sides: [
              { id: 'side-home', sideKey: 'HOME', teamId: 'team-1' },
              { id: 'side-away', sideKey: 'AWAY', teamId: null },
            ],
            participants: [],
          },
        },
      },
    ]);
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'fact-friendly-1', playedAt }])
      .mockResolvedValueOnce([
        { category: 'friendly', played: 1, won: 0, drawn: 1, lost: 0, goalsFor: 1, goalsAgainst: 1 },
      ]);
    const teamMatchFindMany = jest.fn().mockResolvedValue([{ id: 'team-match-3', leagueId: null }]);
    const leagueFindMany = jest.fn();
    const prisma = {
      v1Team: {
        findUnique: jest.fn().mockResolvedValue({ id: 'team-1', name: '서울 유나이티드', profile: null }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      v1TeamRecordFact: { findMany: factFindMany },
      v1Tournament: { findMany: jest.fn() },
      v1TeamMatch: { findMany: teamMatchFindMany },
      v1League: { findMany: leagueFindMany },
      v1GameEvent: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: queryRaw,
    } as unknown as PrismaService;

    const result = await new PublicTeamRecordsService(prisma).getRecords('team-1', { type: 'friendly' });

    const pageQuery = queryRaw.mock.calls[0]?.[0] as { strings?: readonly string[] };
    expect(pageQuery.strings?.join(' ')).toContain('trf.tournament_id IS NULL AND tm.league_id IS NULL');
    // leagueIds 는 전부 null 이었으니 v1League.findMany 는 아예 호출되지 않아야 한다
    // (N+1 방지 배치 조회가 빈 배열일 때 여전히 왕복을 만들지 않는지 확인).
    expect(leagueFindMany).not.toHaveBeenCalled();
    expect(result.items[0]).toEqual(expect.objectContaining({ type: 'friendly', leagueId: null }));
  });

  /**
   * 백필된 골은 `V1GameEvent` 행이 아니라 공식 리비전의 `goalEvents`(JSON)에만 있다.
   * consent 조회 대상을 이벤트 테이블에서만 모으면 그런 골의 참가자는 `consentMap` 에
   * 없어서 `profileHref` 가 영영 붙지 않는다(Copilot 리뷰 지적).
   *
   * 이름 게이팅에서는 이 구멍이 드러나지 않았다 — 정책 공개 기본값에서
   * `resolveParticipantNameEligible` 이 consent 를 보지 않고 항상 true 를 돌려주기
   * 때문이다. 프로필 링크가 처음으로 이 경로를 실제로 사용한다.
   */
  it('백필된 골(goalEvents JSON)의 참가자도 동의 조회 대상에 포함해 프로필 링크가 붙는다', async () => {
    const playedAt = new Date('2026-08-09T02:00:00.000Z');
    const officialAt = new Date('2026-08-10T02:00:00.000Z');
    const factFindMany = jest.fn().mockResolvedValue([
      {
        id: 'fact-1',
        revisionId: 'revision-1',
        gameId: 'game-1',
        opponentTeamId: 'team-2',
        tournamentId: 'tournament-1',
        result: 'WON',
        goalsFor: 1,
        goalsAgainst: 0,
        playedAt,
        resultRevision: {
          score: { home: 1, away: 0 },
          // 이 골은 V1GameEvent 에 없다 — 리비전 JSON 에만 존재한다.
          goalEvents: [
            { id: 'goal-1', sideId: 'side-home', participantId: 'participant-1', minute: 12, period: 1, ownGoal: false },
          ],
          game: {
            currentOfficialRevisionId: 'revision-1',
            teamMatchId: null,
            sides: [
              { id: 'side-home', sideKey: 'HOME', teamId: 'team-1' },
              { id: 'side-away', sideKey: 'AWAY', teamId: 'team-2' },
            ],
            participants: [
              { id: 'participant-1', sideId: 'side-home', userId: 'user-1', displayNameSnapshot: '김도윤', jerseyNumber: 7 },
            ],
          },
        },
        officialAt,
      },
    ]);
    const prisma = {
      v1Team: {
        findUnique: jest.fn().mockResolvedValue({ id: 'team-1', name: '서울 유나이티드', profile: null }),
        findMany: jest.fn().mockResolvedValue([{ id: 'team-2', name: '부산 FC', profile: null }]),
      },
      v1TeamRecordFact: { findMany: factFindMany },
      v1Tournament: { findMany: jest.fn().mockResolvedValue([{ id: 'tournament-1', title: '주말 리그' }]) },
      v1TeamMatch: { findMany: jest.fn().mockResolvedValue([]) },
      v1League: { findMany: jest.fn().mockResolvedValue([]) },
      // 이벤트 테이블은 비어 있다 — 골은 리비전 JSON 에만 있다.
      v1GameEvent: { findMany: jest.fn().mockResolvedValue([]) },
      v1ParticipantIdentityLinkCurrent: {
        findMany: jest.fn().mockResolvedValue([{ participantId: 'participant-1', linkId: 'link-1', userId: 'user-1' }]),
      },
      v1UserRecordConsent: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'user-1', state: 'GRANTED' }]),
      },
      v1ParticipantConsentSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      v1UserProfile: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'fact-1', playedAt }])
        .mockResolvedValueOnce([
          { category: 'tournament', played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 1, goalsAgainst: 0 },
        ]),
    } as unknown as PrismaService;

    const result = await new PublicTeamRecordsService(prisma).getRecords('team-1', {});

    expect(result.items[0].events[0]).toEqual(
      expect.objectContaining({ participantName: '김도윤', profileHref: '/users/user-1' }),
    );
  });
});