import type { PrismaService } from '../../prisma/prisma.service';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

/**
 * `getSchedule` 의 **정규 리그 갈래** — `/tournaments/:id/schedule`.
 *
 * ## 왜 이 스펙이 필요한가 (변이로 확인한 구멍)
 * 이 응답은 **선언된 타입이 없다.** 실제로 변이를 넣어 확인했다:
 * ```
 * 어댑터 인자 타입 변조     → tsc RED   (입력은 잡는다)
 * 상태 매핑에서 한 값 제거   → tsc RED   (exhaustive Record 가 잡는다)
 * 순위 행에서 groupName 제거 → tsc GREEN ← **응답 모양은 아무도 안 잡는다**
 * ```
 * 그 GREEN 이 이 파일이 존재하는 이유다. 필드를 하나 빠뜨리면 컴파일은 통과하고
 * 화면에만 `undefined 순위` 가 뜬다.
 *
 * ## 여기서 고정하는 것
 * 리그에 없는 대회 개념을 무엇으로 채웠는지, 그리고 **왜 그 값이어야 하는지**.
 * 값 자체보다 *"이 값이 화면에서 무엇으로 읽히는가"* 가 근거다.
 */

const LEAGUE_ID = 'c1000000-0000-4000-8000-000000000001';

function makeGame(id: string, score: { home: number; away: number } | null) {
  return {
    id,
    state: 'ENDED',
    visibilityPolicy: { mode: 'LIVE', lineupAt: null },
    sides: [],
    periods: [],
    participants: [],
    currentOfficialRevisionId: score === null ? null : `${id}-rev`,
    currentOfficialRevision:
      score === null
        ? null
        : {
            state: 'OFFICIAL',
            supersedesId: null,
            officialAt: new Date('2026-09-05T11:00:00.000Z'),
            score,
            goalEvents: null,
            outcomeReason: 'NORMAL',
            outcomeNote: null,
          },
  };
}

/** 같은 날(KST)이면 같은 주차, 다른 날이면 다음 주차가 되도록 기본 픽스처를 짠다. */
function makeTeamMatches() {
  return [
    {
      id: 'tm-1',
      startAt: new Date('2026-09-05T10:00:00.000Z'),
      placeName: '성수 풋살장',
      status: 'completed',
      hostTeamId: 'team-a',
      approvedApplicantTeamId: 'team-b',
      hostTeam: { id: 'team-a', name: '성수 FC' },
      approvedApplicantTeam: { id: 'team-b', name: '왕십리 유나이티드' },
      videos: [],
      game: makeGame('game-1', { home: 2, away: 1 }),
    },
    {
      id: 'tm-2',
      startAt: new Date('2026-09-12T10:00:00.000Z'),
      placeName: '왕십리 구장',
      status: 'matched',
      hostTeamId: 'team-b',
      approvedApplicantTeamId: null,
      hostTeam: { id: 'team-b', name: '왕십리 유나이티드' },
      approvedApplicantTeam: null,
      videos: [],
      game: makeGame('game-2', null),
    },
  ];
}

function buildService(options: {
  kind?: string;
  tier?: number | null;
  teamMatches?: ReturnType<typeof makeTeamMatches>;
  bracketPublishedAt?: Date | null;
} = {}) {
  const teamMatches = options.teamMatches ?? makeTeamMatches();
  const fakePrisma = {
    v1Tournament: {
      findFirst: async () => ({
        id: LEAGUE_ID,
        title: '가을 정규 리그',
        kind: options.kind ?? 'regular_league',
        status: 'in_progress',
        bracketPublishedAt: options.bracketPublishedAt ?? null,
        bracketPublishScheduledAt: null,
      }),
    },
    v1League: {
      findUnique: async () => ({
        tier: options.tier === undefined ? 1 : options.tier,
        tieBreakJson: {},
        teams: [
          { teamId: 'team-a', team: { name: '성수 FC', profile: { logoUrl: 'https://example.test/a.png' } } },
          { teamId: 'team-b', team: { name: '왕십리 유나이티드', profile: null } },
        ],
      }),
    },
    v1TeamMatch: { findMany: async () => teamMatches },
    v1GameOfficialFact: {
      findMany: async () => [{ gameId: 'game-1', homeScore: 2, awayScore: 1 }],
    },
    v1GameOperationFlag: { findUnique: async () => ({ value: 'on' }) },
    v1GameEvent: { findMany: async () => [] },
    v1ParticipantIdentityLinkCurrent: { findMany: async () => [] },
  } as unknown as PrismaService;
  return new PublicTournamentRecordsService(fakePrisma, {} as TournamentStaffAccessService);
}

describe('getSchedule — 정규 리그 갈래', () => {
  it('리그도 일정을 돌려준다 — 이 갈래가 없으면 404 라 /schedule 과 /bracket 이 함께 죽는다', async () => {
    const result = await buildService().getSchedule(LEAGUE_ID, {});
    expect(result.items).toHaveLength(2);
    expect(result.tournamentTitle).toBe('가을 정규 리그');
  });

  /**
   * `false` 를 주면 화면이 *"대진표가 아직 공개되지 않았어요"* 를 **영원히** 그린다
   * (`schedule-content.tsx:725`). 리그엔 대진표 공개 개념이 없으므로 `true` 의 뜻은
   * *"이 게이트는 리그에 해당 없다"* 다.
   *
   * 아래 대조군이 중요하다 — **대회는 같은 조건(미공개)에서 여전히 막힌다.** 그게 없으면
   * 이 테스트는 "게이트를 통째로 없앴다" 와 구분되지 않는다.
   */
  it('bracketPublished 는 true — 대진표 미공개여도 막지 않는다', async () => {
    const result = await buildService({ bracketPublishedAt: null }).getSchedule(LEAGUE_ID, {});
    expect(result.bracketPublished).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('대조군: 대회는 대진표 미공개면 그대로 막힌다 — 게이트를 없앤 게 아니다', async () => {
    const result = await buildService({ kind: 'regular_tournament', bracketPublishedAt: null }).getSchedule(
      LEAGUE_ID,
      {},
    );
    expect(result.bracketPublished).toBe(false);
    expect(result.items).toEqual([]);
  });

  /**
   * `round` 는 **비울 수 없다** — `schedule-grouping.ts` 가 `round.startsWith('조별')` 로
   * 단계를 가르고 null 이면 던진다. 그리고 `groupName` 이 없으면 이 값이 **그룹 제목으로
   * 보인다.** 규약('N주차')은 `getLeagueFixtureRecord` 가 이미 쓰던 것이다.
   */
  it('round 는 KST 경기일 기준 N주차 — 날짜가 다르면 주차가 올라간다', async () => {
    const result = await buildService().getSchedule(LEAGUE_ID, {});
    expect(result.items.map((item) => item.round)).toEqual(['1주차', '2주차']);
  });

  it('같은 날 경기는 같은 주차다 — 주차는 시각이 아니라 날짜로 센다', async () => {
    const sameDay = makeTeamMatches();
    sameDay[1].startAt = new Date('2026-09-05T13:00:00.000Z');
    const result = await buildService({ teamMatches: sameDay }).getSchedule(LEAGUE_ID, {});
    expect(result.items.map((item) => item.round)).toEqual(['1주차', '1주차']);
  });

  /**
   * 화면(`schedule-content.tsx:736`)이 팀명 null 을 보고 *"팀명이 가려졌다"* 배너를 띄운다.
   * 대회의 null 은 **가림**, 리그의 null 은 **미정** 인데 화면이 둘을 구분하지 못한다.
   * 상대 미정 대진은 팀명이 null 인 side 가 아니라 **side 자체가 null** 이어야 한다.
   */
  it('팀명을 null 로 두지 않는다 — 리그에 잘못된 "가려졌다" 배너가 뜬다', async () => {
    const result = await buildService().getSchedule(LEAGUE_ID, {});
    expect(result.items[0].home?.teamName).toBe('성수 FC');
    expect(result.items[0].away?.teamName).toBe('왕십리 유나이티드');
    // 상대 미정: teamName 이 null 인 side 가 아니라 side 자체가 없다.
    expect(result.items[1].away).toBeNull();
    expect(result.items[1].home?.teamName).toBe('왕십리 유나이티드');
  });

  it('home/away 의 registrationId 는 teamId 다 — 리그엔 참가 등록이 없다', async () => {
    const result = await buildService().getSchedule(LEAGUE_ID, {});
    expect(result.items[0].home).toMatchObject({ registrationId: 'team-a', teamId: 'team-a' });
  });

  it('unscheduled 는 항상 비어 있다 — startAt 이 non-null 이라 "시간 미정" 이 없는 개념이다', async () => {
    const result = await buildService().getSchedule(LEAGUE_ID, {});
    expect(result.unscheduled).toEqual([]);
  });

  describe('순위 — 응답 모양을 타입이 안 잡으므로 여기서 고정한다', () => {
    it('groupName 은 티어 라벨(1부) — 순위표 섹션 제목이 된다', async () => {
      const result = await buildService({ tier: 2 }).getSchedule(LEAGUE_ID, {});
      expect(result.standings.length).toBeGreaterThan(0);
      expect(result.standings.every((row) => row.groupName === '2부')).toBe(true);
    });

    it('티어가 없는 단발 리그는 "리그 순위" 로 떨어진다 — 빈 제목을 만들지 않는다', async () => {
      const result = await buildService({ tier: null }).getSchedule(LEAGUE_ID, {});
      expect(result.standings.every((row) => row.groupName === '리그 순위')).toBe(true);
    });

    it('groupId 는 채워져 있다 — 화면이 이 값을 Map 키로 조 를 묶는다', async () => {
      const result = await buildService().getSchedule(LEAGUE_ID, {});
      expect(result.standings.every((row) => typeof row.groupId === 'string' && row.groupId.length > 0)).toBe(true);
    });

    it('행에 teamId·teamName 이 실린다 — registrationId 는 싣지 않는다(리그엔 등록이 없다)', async () => {
      const result = await buildService().getSchedule(LEAGUE_ID, {});
      const row = result.standings.find((entry) => entry.teamId === 'team-a');
      expect(row).toBeDefined();
      expect(row?.teamName).toBe('성수 FC');
      expect(row).not.toHaveProperty('registrationId');
    });

    it('확정된 경기만 순위에 센다 — 2:1 승리가 승점 3 으로 잡힌다', async () => {
      const result = await buildService().getSchedule(LEAGUE_ID, {});
      const winner = result.standings.find((entry) => entry.teamId === 'team-a');
      expect(winner?.points).toBe(3);
      expect(winner?.goalsFor).toBe(2);
      expect(winner?.goalsAgainst).toBe(1);
    });
  });
});
