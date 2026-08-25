import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

/**
 * `getLeagueFixtureRecord` — 리그 대진(TEAM_MATCH 소스 게임)의 공개 경기 기록.
 * getMatch 의 프로젝션 규칙(visibility fail-closed·공식 스코어·몰수 사유·이벤트)은
 * 대회 스펙(public-tournament-records.service.spec.ts)이 이미 고정하고 있으므로,
 * 여기서는 **리그 게이트 고유 분기**만 판다: 리그/대진 소속 검증, 게임 없음 = 404,
 * 주차 라벨, 팀 실명(등록 개념 없음), 응답의 대회 전용 필드 고정값.
 * 같은 파일의 fake-Prisma 패턴을 그대로 따른다 — 실제 DB 없이 부분 집합만 흉내 낸다.
 */

const LEAGUE_ID = 'b1000000-0000-4000-8000-000000000001';
const TEAM_MATCH_ID = 'b1000000-0000-4000-8000-000000000002';
const GAME_ID = 'league-game-1';

type FakeTeamMatchRow = {
  id: string;
  leagueId: string;
  deletedAt: Date | null;
  startAt: Date;
  placeName: string;
  status: string;
  hostTeam: { id: string; name: string };
  approvedApplicantTeam: { id: string; name: string } | null;
  game: Record<string, unknown> | null;
};

function makeGame(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: GAME_ID,
    state: 'ENDED',
    visibilityPolicy: { mode: 'LIVE', lineupAt: null },
    sides: [
      { id: 'side-home', sideKey: 'HOME' },
      { id: 'side-away', sideKey: 'AWAY' },
    ],
    lineups: [],
    participants: [],
    currentOfficialRevision: {
      state: 'OFFICIAL',
      supersedesId: null,
      officialAt: new Date('2026-09-05T11:00:00.000Z'),
      score: { home: 2, away: 1 },
      goalEvents: null,
      mvpParticipantId: null,
      outcomeReason: 'NORMAL',
      outcomeNote: null,
    },
    periods: [],
    ...overrides,
  };
}

function makeFixtureRow(overrides: Partial<FakeTeamMatchRow> = {}): FakeTeamMatchRow {
  return {
    id: TEAM_MATCH_ID,
    leagueId: LEAGUE_ID,
    deletedAt: null,
    startAt: new Date('2026-09-12T10:00:00.000Z'),
    placeName: '검증장',
    status: 'matched',
    hostTeam: { id: 'team-home', name: '성수 FC' },
    approvedApplicantTeam: { id: 'team-away', name: '왕십리 유나이티드' },
    game: makeGame(),
    ...overrides,
  };
}

function buildService(options: {
  league?: { id: string; title: string } | null;
  fixture?: FakeTeamMatchRow | null;
  // 주차 파생용 리그 전체 대진의 킥오프 시각들.
  fixtureStartAts?: Date[];
  publicLive?: boolean;
  revisions?: Array<{ revision: number; state: string; officialAt: Date | null; reason: string | null; supersedesId: string | null }>;
}) {
  const fakePrisma = {
    v1League: {
      findUnique: async () => options.league === undefined ? { id: LEAGUE_ID, title: '가을 정규 리그' } : options.league,
    },
    v1TeamMatch: {
      findFirst: async () => options.fixture === undefined ? makeFixtureRow() : options.fixture,
      findMany: async () =>
        (options.fixtureStartAts ?? [new Date('2026-09-05T10:00:00.000Z'), new Date('2026-09-12T10:00:00.000Z')]).map(
          (startAt) => ({ startAt }),
        ),
    },
    v1GameOperationFlag: {
      findUnique: async () => ((options.publicLive ?? true) ? { value: 'on' } : null),
    },
    v1ParticipantIdentityLinkCurrent: { findMany: async () => [] },
    v1GameEvent: { findMany: async () => [] },
    v1GameResultRevision: { findMany: async () => options.revisions ?? [] },
  } as unknown as PrismaService;
  return new PublicTournamentRecordsService(fakePrisma, {} as TournamentStaffAccessService);
}

describe('PublicTournamentRecordsService.getLeagueFixtureRecord', () => {
  it('리그가 없으면 404 (LEAGUE_FIXTURE_NOT_FOUND)', async () => {
    const service = buildService({ league: null });
    await expect(service.getLeagueFixtureRecord(LEAGUE_ID, TEAM_MATCH_ID)).rejects.toThrow(NotFoundException);
  });

  it('이 리그 소속이 아닌 대진은 404 — 존재 여부를 캐는 오라클을 만들지 않는다', async () => {
    const service = buildService({ fixture: null });
    await expect(service.getLeagueFixtureRecord(LEAGUE_ID, TEAM_MATCH_ID)).rejects.toThrow(NotFoundException);
  });

  it('게임이 없는 대진(정책 없음)은 hidden 으로 접혀 404 — fail-closed', async () => {
    const service = buildService({ fixture: makeFixtureRow({ game: null }) });
    await expect(service.getLeagueFixtureRecord(LEAGUE_ID, TEAM_MATCH_ID)).rejects.toThrow(NotFoundException);
  });

  it('공식 결과: 스코어·팀 실명·주차가 실리고 대회 전용 필드는 리그 값으로 고정된다', async () => {
    const service = buildService({
      revisions: [{ revision: 1, state: 'OFFICIAL', officialAt: new Date('2026-09-05T11:00:00.000Z'), reason: null, supersedesId: null }],
    });
    const result = await service.getLeagueFixtureRecord(LEAGUE_ID, TEAM_MATCH_ID);

    expect(result.tournamentId).toBe(LEAGUE_ID);
    expect(result.tournamentTitle).toBe('가을 정규 리그');
    expect(result.home).toEqual({ registrationId: 'team-home', teamId: 'team-home', teamName: '성수 FC' });
    expect(result.away).toEqual({ registrationId: 'team-away', teamId: 'team-away', teamName: '왕십리 유나이티드' });
    expect(result.status).toBe('ended');
    expect(result.scoreStatus).toBe('official');
    expect(result.score).toEqual({ home: 2, away: 1, penalties: null });
    // 대진 킥오프가 9/5·9/12 두 날(KST)이고 이 경기는 9/12 — 2주차.
    // round 는 PublicMatchDetail 계약(string)이라 라벨 문자열로 내린다.
    expect(result.round).toBe('2주차');
    expect(result.groupName).toBeNull();
    // 리그에 없는 대회 전용 개념은 고정값 — 프론트 MatchDetailContent 계약 유지용.
    expect(result.videos).toEqual([]);
    expect(result.nextMatch).toBeNull();
    expect(result.fieldName).toBeNull();
    expect(result.history).toEqual([
      { revision: 1, state: 'OFFICIAL', officialAt: '2026-09-05T11:00:00.000Z', reason: null, isCorrection: false },
    ]);
  });

  it('몰수로 확정된 결과는 outcome 사유가 실린다 — 실제 1:0 승리와 구분', async () => {
    const service = buildService({
      fixture: makeFixtureRow({
        game: makeGame({
          currentOfficialRevision: {
            state: 'OFFICIAL',
            supersedesId: null,
            officialAt: new Date('2026-09-05T11:00:00.000Z'),
            score: { home: 1, away: 0 },
            goalEvents: null,
            mvpParticipantId: null,
            outcomeReason: 'FORFEIT',
            outcomeNote: '상대팀 불참',
          },
        }),
      }),
    });
    const result = await service.getLeagueFixtureRecord(LEAGUE_ID, TEAM_MATCH_ID);
    expect(result.outcome).toEqual({ reason: 'FORFEIT', note: '상대팀 불참' });
  });

  it('STATUS_ONLY 정책: 스코어·이벤트·라인업이 가려지고 상태만 공개된다', async () => {
    const service = buildService({
      fixture: makeFixtureRow({ game: makeGame({ visibilityPolicy: { mode: 'STATUS_ONLY', lineupAt: null } }) }),
    });
    const result = await service.getLeagueFixtureRecord(LEAGUE_ID, TEAM_MATCH_ID);
    expect(result.visibilityMode).toBe('status_only');
    expect(result.score).toBeNull();
    expect(result.events).toEqual([]);
    expect(result.lineup).toBeNull();
  });
});
