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
  videos: Array<{ id: string; title: string | null; url: string }>;
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
    videos: [],
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
    // BE-5: 리그 제목 조회가 통합 축으로 옮겨졌다.
    v1Tournament: {
      findFirst: async () => (options.league === undefined ? { id: LEAGUE_ID, title: '가을 정규 리그' } : options.league),
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

  it('결과 이력의 감사용 코드 마커([LEAGUE_RESULT_ENTRY] 등)는 관전자 화면에서 벗긴다', async () => {
    const service = buildService({
      revisions: [
        { revision: 1, state: 'OFFICIAL', officialAt: new Date('2026-09-05T11:00:00.000Z'), reason: '[LEAGUE_RESULT_ENTRY] 운영자 직접 입력', supersedesId: null },
      ],
    });
    const result = await service.getLeagueFixtureRecord(LEAGUE_ID, TEAM_MATCH_ID);
    expect(result.history[0].reason).toBe('운영자 직접 입력');
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

  it('등록된 리그 영상(V1TeamMatchVideo)이 기록 응답에 실린다', async () => {
    const service = buildService({
      fixture: makeFixtureRow({
        videos: [{ id: 'video-1', title: '전반 하이라이트', url: 'https://youtu.be/x' }],
      }),
    });
    const result = await service.getLeagueFixtureRecord(LEAGUE_ID, TEAM_MATCH_ID);
    expect(result.videos).toEqual([{ id: 'video-1', title: '전반 하이라이트', url: 'https://youtu.be/x' }]);
  });

  // L-F-forfeit-public-exposure: 이 테스트는 원래 대회 경로(getMatch)의 계약을 그대로
  // 복제해 `note: '상대팀 불참'` 이 그대로 실린다고 단언하고 있었다 — 즉 리그 몰수의
  // outcomeNote(운영자가 쓴 내부 메모 원문)가 공개 API 에 그대로 나가는 걸 "정상 동작"
  // 으로 박제하고 있었다. 대회의 outcomeReason/outcomeNote 는 애초에 공개용으로 설계된
  // 채널이지만(verifierContext), 리그의 이 컬럼을 채우는 유일한 writer(league-match-
  // forfeit.service)는 명시적으로 "boolean 만 만들고 문자열은 버려야 한다"는 반대
  // 계약을 갖는다 — 이름과 단언 모두 그 계약에 맞게 다시 쓴다.
  it('몰수로 확정된 결과는 boolean 만 실린다 — outcomeNote 의 운영자 메모 원문은 새지 않는다', async () => {
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
    expect(result.outcome).toEqual({ reason: 'FORFEIT', note: null });
  });

  // L-F-forfeit-public-exposure: 실제 league-match-forfeit.service 경로는 outcomeReason
  // 컬럼을 채우지 않는다 — `[LEAGUE_FORFEIT]` 마커를 reason 컬럼에 붙일 뿐이다. 위 테스트는
  // (미사용) 가상의 outcomeReason='FORFEIT' 경로만 고정하고 있었고, 그 사이 실제 경로는
  // 두 방향으로 다 틀렸다: 사유 원문이 history 로 새고, outcome 표기는 아예 안 떴다.
  it('실제 몰수 경로(outcomeReason=NORMAL, reason 마커만): outcome 은 boolean 만 실리고 사유 원문은 history 에서 새지 않는다', async () => {
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
            outcomeReason: 'NORMAL',
            outcomeNote: null,
            reason: '[LEAGUE_FORFEIT] 원정팀 상습 노쇼 — 팀장 연락 두절, 다음 시즌 참가 제한 검토',
          },
        }),
      }),
      revisions: [
        {
          revision: 1,
          state: 'OFFICIAL',
          officialAt: new Date('2026-09-05T11:00:00.000Z'),
          reason: '[LEAGUE_FORFEIT] 원정팀 상습 노쇼 — 팀장 연락 두절, 다음 시즌 참가 제한 검토',
          supersedesId: null,
        },
      ],
    });
    const result = await service.getLeagueFixtureRecord(LEAGUE_ID, TEAM_MATCH_ID);
    // 몰수 사실(boolean)은 스코어 옆에 뜬다 — 정상 1:0 승리로 오인되지 않는다.
    expect(result.outcome).toEqual({ reason: 'FORFEIT', note: null });
    // 운영자가 쓴 내부 메모 원문은 어디에도 없다 — history 항목의 사유가 null.
    expect(result.history).toEqual([
      { revision: 1, state: 'OFFICIAL', officialAt: '2026-09-05T11:00:00.000Z', reason: null, isCorrection: false },
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('노쇼');
    expect(serialized).not.toContain('LEAGUE_FORFEIT');
  });

  it('정정된 몰수(마커가 앞이 아님): 몰수 표식은 유지되고 운영자가 쓴 사유는 history 에서도 감춰진다', async () => {
    const service = buildService({
      fixture: makeFixtureRow({
        game: makeGame({
          currentOfficialRevision: {
            state: 'OFFICIAL',
            supersedesId: 'prev-revision-id',
            officialAt: new Date('2026-09-05T11:00:00.000Z'),
            score: { home: 1, away: 0 },
            goalEvents: null,
            mvpParticipantId: null,
            outcomeReason: 'NORMAL',
            outcomeNote: null,
            reason: '[LEAGUE_RESULT_CORRECTION] [LEAGUE_FORFEIT] 스코어 오기재 정정',
          },
        }),
      }),
      revisions: [
        {
          revision: 2,
          state: 'OFFICIAL',
          officialAt: new Date('2026-09-05T11:00:00.000Z'),
          reason: '[LEAGUE_RESULT_CORRECTION] [LEAGUE_FORFEIT] 스코어 오기재 정정',
          supersedesId: 'prev-revision-id',
        },
      ],
    });
    const result = await service.getLeagueFixtureRecord(LEAGUE_ID, TEAM_MATCH_ID);
    // 정정을 거쳐도 몰수 표식은 사라지지 않는다(league-match-public.service.ts의
    // isForfeit 배지와 동일한 `.includes` 판정).
    expect(result.outcome).toEqual({ reason: 'FORFEIT', note: null });
    // 꼬리 텍스트는 '정정 사유'가 아니라 **몰수 사유 그 자체**다. correctResultOnce 는
    // 같은 `dto.reason` 을 outcomeNote 로도, persistedReason 의 꼬리로도 쓴다
    // (league-match-result-entry.service.ts): 
    //   note: dto.reason.trim()
    //   persistedReason: `[LEAGUE_RESULT_CORRECTION] [LEAGUE_FORFEIT] ${dto.reason.trim()}`
    // 즉 outcome.note 를 일부러 null 로 가려 놓고 history 에서 같은 문자열을 내보내면
    // 가린 의미가 없다. 이 테스트는 원래 그 노출을 '공개 유지'로 박제하고 있었다.
    expect(result.history).toEqual([
      { revision: 2, state: 'OFFICIAL', officialAt: '2026-09-05T11:00:00.000Z', reason: null, isCorrection: true },
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('스코어 오기재 정정');
    expect(serialized).not.toContain('LEAGUE_FORFEIT');
  });

  // 위 테스트의 짝. 몰수 사유를 감추는 규칙이 "정정 사유는 전부 감춘다"로 번지면
  // 관전자는 결과가 왜 바뀌었는지 알 수 없게 된다 — 두 경계를 함께 고정한다.
  it('몰수가 아닌 정정: 사유는 공개하되 감사용 마커만 벗긴다', async () => {
    const service = buildService({
      fixture: makeFixtureRow({
        game: makeGame({
          currentOfficialRevision: {
            state: 'OFFICIAL',
            supersedesId: 'prev-revision-id',
            officialAt: new Date('2026-09-05T11:00:00.000Z'),
            score: { home: 2, away: 1 },
            goalEvents: null,
            mvpParticipantId: null,
            outcomeReason: 'NORMAL',
            outcomeNote: null,
            reason: '[LEAGUE_RESULT_CORRECTION] 스코어 오기재 정정',
          },
        }),
      }),
      revisions: [
        {
          revision: 2,
          state: 'OFFICIAL',
          officialAt: new Date('2026-09-05T11:00:00.000Z'),
          reason: '[LEAGUE_RESULT_CORRECTION] 스코어 오기재 정정',
          supersedesId: 'prev-revision-id',
        },
      ],
    });
    const result = await service.getLeagueFixtureRecord(LEAGUE_ID, TEAM_MATCH_ID);
    // 몰수가 아니면 outcome 자체가 null 이다(배지를 띄울 근거가 없다).
    expect(result.outcome).toBeNull();
    expect(result.history).toEqual([
      {
        revision: 2,
        state: 'OFFICIAL',
        officialAt: '2026-09-05T11:00:00.000Z',
        reason: '스코어 오기재 정정',
        isCorrection: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('LEAGUE_RESULT_CORRECTION');
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
