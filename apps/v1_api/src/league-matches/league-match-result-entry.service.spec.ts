import { ConflictException } from '@nestjs/common';
import { LeagueMatchResultEntryService } from './league-match-result-entry.service';

// LeagueMatchResultEntryService 의 상태전이·멱등 계약은 통합 스펙
// (test/league-matches/league-match-result-entry.integration-spec.ts)이 실 DB 로 검증한다 —
// 여기서는 실 DB 없이도 재현할 수 있는 두 가지만 좁게 본다
// (league-match-dispute.service.spec.ts 와 같은 관례: prisma 전체 jest.fn() mock).
//
//  1. 득점자 선택 목록이 어떤 참가자 행을 고르고, 옛 리비전 행의 기록을 어디에 붙이는가.
//     · 옛 라인업 리비전 행까지 그대로 실으면 같은 선수가 드롭다운에 2~3번 뜬다(알파 실측
//       14→21→28명). 운영자는 어느 쪽이 최신 명단인지 알 수 없다.
//     · 반대로 현재 공식 기록이 있는 선수를 빼면 정정 모달의 프리필이 그 행을 조용히 버려
//       (league-result-entry-modal.tsx `if (found === undefined) return []`) 정정 한 번에
//       개인 기록이 사라진다(#748 사고).
//  2. 득점 스냅샷 쓰기가 낙관적 락 밖이라 생기는 경합에서 500 이 아니라 409 가 나오는가.

function makePrisma() {
  return {
    v1TeamMatch: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'tm-1',
        status: 'matched',
        approvedApplicantTeamId: 'team-away',
        game: { id: 'game-1', version: 3 },
      }),
    },
    v1GameSide: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'side-home', sideKey: 'HOME', displayNameSnapshot: '홈팀' },
        { id: 'side-away', sideKey: 'AWAY', displayNameSnapshot: '원정팀' },
      ]),
    },
    v1GameParticipant: { findMany: jest.fn() },
    v1GameLineup: {
      findMany: jest.fn().mockResolvedValue([
        // 홈: 대진 생성이 만든 자동 로스터(1) 위에 팀이 두 번 저장(2, 3).
        { id: 'lineup-home-1', sideId: 'side-home', revision: 1 },
        { id: 'lineup-home-2', sideId: 'side-home', revision: 2 },
        { id: 'lineup-home-3', sideId: 'side-home', revision: 3 },
        // 원정: 자동 로스터뿐.
        { id: 'lineup-away-1', sideId: 'side-away', revision: 1 },
      ]),
    },
    v1Game: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    v1GameEvent: { count: jest.fn().mockResolvedValue(0) },
    v1GameResultParticipant: { findMany: jest.fn().mockResolvedValue([]) },
    v1GameResultRevision: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
  } as any;
}

function makeGames() {
  return {
    officializeTeamMatchResultCorrection: jest
      .fn()
      .mockResolvedValue({ revisionId: 'rev-draft', revisionState: 'OFFICIAL', version: 5 }),
  } as any;
}

function makeService(prisma: any, games: any = makeGames()) {
  const adminContext = {
    getActiveAdmin: jest.fn().mockResolvedValue({ id: 'admin-row-1' }),
    getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin-row-1' }),
    logAdminAction: jest.fn().mockResolvedValue(undefined),
  } as any;
  return { service: new LeagueMatchResultEntryService(prisma, adminContext, games), adminContext, games };
}

const actor = { id: 'admin-user-1', email: null, accountStatus: 'active', onboardingStatus: 'completed' } as any;

/** 같은 사람("김선수", u-1)이 라인업 리비전 1·2·3 에 각각 별도 행으로 쌓여 있는 상태. */
const homeParticipants = [
  { id: 'p-home-r1', sideId: 'side-home', lineupId: 'lineup-home-1', displayNameSnapshot: '김선수', userId: 'u-1' },
  { id: 'p-home-r2', sideId: 'side-home', lineupId: 'lineup-home-2', displayNameSnapshot: '김선수', userId: 'u-1' },
  { id: 'p-home-r3', sideId: 'side-home', lineupId: 'lineup-home-3', displayNameSnapshot: '김선수', userId: 'u-1' },
];
const awayParticipants = [
  { id: 'p-away-r1', sideId: 'side-away', lineupId: 'lineup-away-1', displayNameSnapshot: '박선수', userId: 'u-2' },
];

describe('LeagueMatchResultEntryService.listFixtureParticipants', () => {
  it('사이드별 최신 라인업 리비전의 참가자만 돌려준다 (누적된 옛 리비전 행 제외)', async () => {
    const prisma = makePrisma();
    prisma.v1GameParticipant.findMany.mockResolvedValue([...homeParticipants, ...awayParticipants]);
    prisma.v1Game.findUnique.mockResolvedValue({ currentOfficialRevisionId: null });

    const result = await makeService(prisma).service.listFixtureParticipants(actor, 'league-1', 'tm-1');

    expect(result.home.players).toEqual([{ participantId: 'p-home-r3', name: '김선수' }]);
    expect(result.away.players).toEqual([{ participantId: 'p-away-r1', name: '박선수' }]);
    // 현재 공식 결과가 없으면 개인 기록 조회 자체를 하지 않는다.
    expect(prisma.v1GameResultParticipant.findMany).not.toHaveBeenCalled();
  });

  it('옛 리비전 행에 달린 기록은 같은 사람의 최신 행으로 옮겨 실어 이름이 두 번 뜨지 않는다', async () => {
    const prisma = makePrisma();
    prisma.v1GameParticipant.findMany.mockResolvedValue([...homeParticipants, ...awayParticipants]);
    prisma.v1Game.findUnique.mockResolvedValue({ currentOfficialRevisionId: 'rev-9' });
    // 리비전 2 행(p-home-r2)으로 기록된 득점이 이미 공식 결과에 들어가 있다.
    prisma.v1GameResultParticipant.findMany.mockResolvedValue([
      { participantId: 'p-home-r2', goals: 1, assists: 0 },
    ]);

    const result = await makeService(prisma).service.listFixtureParticipants(actor, 'league-1', 'tm-1');

    // 드롭다운은 '김선수' 한 줄. 기록은 최신 행 id 로 프리필돼 소실되지 않는다.
    expect(result.home.players).toEqual([{ participantId: 'p-home-r3', name: '김선수' }]);
    expect(result.currentStats).toEqual([{ participantId: 'p-home-r3', goals: 1, assists: 0 }]);
  });

  it('같은 사람의 옛 행과 최신 행에 기록이 나뉘어 있으면 최신 행 하나로 합쳐 프리필한다', async () => {
    const prisma = makePrisma();
    prisma.v1GameParticipant.findMany.mockResolvedValue([...homeParticipants, ...awayParticipants]);
    prisma.v1Game.findUnique.mockResolvedValue({ currentOfficialRevisionId: 'rev-9' });
    prisma.v1GameResultParticipant.findMany.mockResolvedValue([
      { participantId: 'p-home-r2', goals: 1, assists: 1 },
      { participantId: 'p-home-r3', goals: 2, assists: 0 },
    ]);

    const result = await makeService(prisma).service.listFixtureParticipants(actor, 'league-1', 'tm-1');

    expect(result.currentStats).toEqual([{ participantId: 'p-home-r3', goals: 3, assists: 1 }]);
    expect(result.home.players).toEqual([{ participantId: 'p-home-r3', name: '김선수' }]);
  });

  it('최신 명단으로 옮길 수 없는 기록(게스트)은 남기되 이름으로 구분할 수 있게 한다', async () => {
    const prisma = makePrisma();
    // userId 가 없는 게스트라 최신 행과 동일인이라고 판정할 근거가 없다 — 접지 않는다.
    const guestRow = {
      id: 'p-home-guest',
      sideId: 'side-home',
      lineupId: 'lineup-home-2',
      displayNameSnapshot: '김선수',
      userId: null,
    };
    prisma.v1GameParticipant.findMany.mockResolvedValue([...homeParticipants, guestRow, ...awayParticipants]);
    prisma.v1Game.findUnique.mockResolvedValue({ currentOfficialRevisionId: 'rev-9' });
    prisma.v1GameResultParticipant.findMany.mockResolvedValue([
      { participantId: 'p-home-guest', goals: 1, assists: 0 },
    ]);

    const result = await makeService(prisma).service.listFixtureParticipants(actor, 'league-1', 'tm-1');

    expect(result.home.players).toEqual([
      { participantId: 'p-home-r3', name: '김선수' },
      { participantId: 'p-home-guest', name: '김선수 (이전 명단)' },
    ]);
    expect(result.currentStats).toEqual([{ participantId: 'p-home-guest', goals: 1, assists: 0 }]);
  });
});

describe('LeagueMatchResultEntryService 득점 스냅샷 경합', () => {
  /**
   * 직전 시도가 create(DRAFT) 직후 끊긴 정정을 재개하는 경로. 이 경로의 스냅샷 쓰기는
   * GamesService.withCommand 의 낙관적 락 밖이라, 동시 요청이 그 사이 리비전을 OFFICIAL 로
   * 만들면 DB 트리거가 SQLSTATE 55000 을 던진다.
   */
  function arrangeDanglingCorrection(prisma: any) {
    prisma.v1GameResultRevision.findFirst.mockResolvedValue({
      id: 'rev-draft',
      revision: 2,
      state: 'DRAFT',
      reason: '[LEAGUE_RESULT_CORRECTION] 오기입 정정',
      score: { home: 1, away: 0 },
    });
    prisma.v1Game.findUniqueOrThrow.mockResolvedValue({ version: 4 });
    prisma.v1GameResultRevision.findUniqueOrThrow.mockResolvedValue({
      score: { home: 1, away: 0 },
      reason: '[LEAGUE_RESULT_CORRECTION] 오기입 정정',
    });
    // 스냅샷을 실제로 쓰게 만들려면 득점이 하나라도 있어야 한다.
    prisma.v1GameResultParticipant.findMany.mockResolvedValue([
      { participantId: 'p-home-r3', sideId: 'side-home', goals: 1 },
    ]);
  }

  const dto = { homeScore: 1, awayScore: 0, reason: '오기입 정정' } as any;

  it('그 사이 다른 요청이 확정해 스냅샷 갱신이 0건이면 500 이 아니라 409 로 끝난다', async () => {
    const prisma = makePrisma();
    arrangeDanglingCorrection(prisma);
    prisma.v1GameResultRevision.updateMany.mockResolvedValue({ count: 0 });
    const { service, games } = makeService(prisma);

    const error = await service.correctResult(actor, 'league-1', 'tm-1', dto).catch((caught) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'LEAGUE_FIXTURE_RESULT_REVISION_FINALIZED',
    });
    // 이미 확정된 리비전을 다시 확정하려 들지 않는다.
    expect(games.officializeTeamMatchResultCorrection).not.toHaveBeenCalled();
  });

  it('트리거가 SQLSTATE 55000 을 던져도 raw 에러를 흘리지 않고 409 로 옮긴다', async () => {
    const prisma = makePrisma();
    arrangeDanglingCorrection(prisma);
    prisma.v1GameResultRevision.updateMany.mockRejectedValue(
      new Error(
        'Invalid `prisma.v1GameResultRevision.updateMany()` invocation: Raw query failed. ' +
          'Code: `55000`. Message: `db error: ERROR: terminal result revisions are immutable`',
      ),
    );
    const { service, games } = makeService(prisma);

    const error = await service.correctResult(actor, 'league-1', 'tm-1', dto).catch((caught) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'LEAGUE_FIXTURE_RESULT_REVISION_FINALIZED',
    });
    expect(games.officializeTeamMatchResultCorrection).not.toHaveBeenCalled();
  });

  it('아직 DRAFT 라면 스냅샷을 쓰고 정정을 이어서 확정한다', async () => {
    const prisma = makePrisma();
    arrangeDanglingCorrection(prisma);
    prisma.v1GameResultRevision.updateMany.mockResolvedValue({ count: 1 });
    const { service, games } = makeService(prisma);

    const result = await service.correctResult(actor, 'league-1', 'tm-1', dto);

    expect(result).toMatchObject({ resultRevisionId: 'rev-draft', alreadyProcessed: false });
    // 스냅샷은 terminal 상태를 배제한 조건부 갱신으로만 나간다.
    expect(prisma.v1GameResultRevision.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rev-draft', state: { in: ['DRAFT', 'SUBMITTED'] } } }),
    );
    expect(games.officializeTeamMatchResultCorrection).toHaveBeenCalledTimes(1);
  });

  it('이 경기에 이벤트 행이 있으면 스냅샷을 아예 쓰지 않는다 (분·전후반 있는 이벤트 레인을 덮지 않는다)', async () => {
    const prisma = makePrisma();
    arrangeDanglingCorrection(prisma);
    prisma.v1GameEvent.count.mockResolvedValue(2);
    const { service, games } = makeService(prisma);

    await service.correctResult(actor, 'league-1', 'tm-1', dto);

    expect(prisma.v1GameResultRevision.updateMany).not.toHaveBeenCalled();
    expect(games.officializeTeamMatchResultCorrection).toHaveBeenCalledTimes(1);
  });
});

// 감사 L-E finding 4: 몰수(FORFEIT) 결과를 정정하면 새 리비전의 reason이 정정 마커로만
// 채워져 [LEAGUE_FORFEIT] 접두어가 사라졌다 -- isForfeit 판정(league-match-public.service.ts)의
// 유일한 근거가 그 마커라, 정정을 한 번 거치면 "몰수" 사실 자체가 공개 화면에서 영구히
// 사라진다(순위·승패는 정확하지만 표식만 소실, 재몰수도 불가능해진다). base 리비전이
// 몰수였다면 정정 리비전의 reason에도 그 마커를 이어 붙인다.
describe('LeagueMatchResultEntryService.correctResult 몰수 표식 보존', () => {
  it('base 리비전이 몰수였으면 새 정정 리비전의 reason에도 [LEAGUE_FORFEIT] 마커를 이어 붙인다', async () => {
    const prisma = makePrisma();
    prisma.v1GameResultRevision.findFirst.mockResolvedValue({
      id: 'rev-1',
      revision: 1,
      state: 'OFFICIAL',
      reason: '[LEAGUE_FORFEIT] 원정팀 불참',
      score: { home: 3, away: 0 },
    });
    prisma.v1Game.findUniqueOrThrow.mockResolvedValue({
      competitionConfig: { lineup: { positions: [], formations: [] } },
    });
    prisma.v1GameParticipant.findMany.mockResolvedValue([...homeParticipants, ...awayParticipants]);
    const games = {
      ...makeGames(),
      createTeamMatchResultCorrection: jest.fn().mockResolvedValue({ revisionId: 'rev-2', version: 5 }),
    };
    const { service } = makeService(prisma, games);

    await service.correctResult(actor, 'league-1', 'tm-1', {
      homeScore: 0,
      awayScore: 0,
      reason: '몰수팀 재확인 후 스코어 정정',
      participants: [],
    } as any);

    expect(games.createTeamMatchResultCorrection).toHaveBeenCalledTimes(1);
    const payload = games.createTeamMatchResultCorrection.mock.calls[0][3];
    expect(payload.reason).toBe('[LEAGUE_RESULT_CORRECTION] [LEAGUE_FORFEIT] 몰수팀 재확인 후 스코어 정정');
  });

  it('base 리비전이 몰수가 아니었으면 정정 마커만 붙는다 (기존 계약 유지)', async () => {
    const prisma = makePrisma();
    prisma.v1GameResultRevision.findFirst.mockResolvedValue({
      id: 'rev-1',
      revision: 1,
      state: 'OFFICIAL',
      reason: '[LEAGUE_RESULT_ENTRY] 정상 입력',
      score: { home: 2, away: 1 },
    });
    prisma.v1Game.findUniqueOrThrow.mockResolvedValue({
      competitionConfig: { lineup: { positions: [], formations: [] } },
    });
    prisma.v1GameParticipant.findMany.mockResolvedValue([...homeParticipants, ...awayParticipants]);
    const games = {
      ...makeGames(),
      createTeamMatchResultCorrection: jest.fn().mockResolvedValue({ revisionId: 'rev-2', version: 5 }),
    };
    const { service } = makeService(prisma, games);

    await service.correctResult(actor, 'league-1', 'tm-1', {
      homeScore: 3,
      awayScore: 1,
      reason: '오기입 정정',
      participants: [],
    } as any);

    const payload = games.createTeamMatchResultCorrection.mock.calls[0][3];
    expect(payload.reason).toBe('[LEAGUE_RESULT_CORRECTION] 오기입 정정');
  });
});
