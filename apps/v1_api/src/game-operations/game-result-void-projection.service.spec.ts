/**
 * game-result-void-projection.service.spec.ts
 *
 * `GameResultVoidProjectionService` 에는 아직 전용 스펙이 없었다. 형제 경로
 * (`GameResultOfficialProjectionService.handler`)는 OFFICIAL 로 전환될 때
 * `GameResultStandingsProjectionService.project()` 를 불러 조 순위표를 재계산하는데,
 * 이 서비스도 대칭으로 무효(VOID) 전환 시 같은 재계산을 불러야 한다 -- 안 부르면
 * 이의 수락으로 무효 처리된 경기의 승점·득실이 공개 순위표에 영구히 남는다
 * (`game-result-void-projection.service.ts` 파일 상단 주석에 적힌 감사 지적).
 *
 * `$queryRaw`/`$executeRaw` 는 태그드 템플릿이라 실제 SQL을 파싱하지 않고,
 * `game-result-bracket-projection.service.spec.ts` 와 같은 패턴으로 이 서비스가
 * 실제로 호출하는 순서(lockVoidRevision -> hidePublicCache -> [tournamentFixtureId
 * 있으면 standingsShapedRevision] -> writeWatermarks -> settleLeagueIfNeeded)대로
 * `mockResolvedValueOnce` 를 체이닝한다. `standings.project` 자체는 이 서비스가
 * `new GameResultStandingsProjectionService()` 로 필드에서 직접 만드는 의존 없는
 * 순수 클래스라 DI 로 갈아끼울 수 없다 -- 대신 프로토타입 메서드를 스파이한다.
 */
import { GameResultStandingsProjectionService } from './game-result-standings-projection.service';
import { GameResultVoidProjectionService } from './game-result-void-projection.service';
import type { GameOperationClaim } from '../jobs/v1-game-operations-worker.service';

const REVISION_ID = 'revision-void-1';
const GAME_ID = 'game-1';
const TOURNAMENT_ID = 'tournament-1';
const FIXTURE_ID = 'fixture-1';
const HOME_TEAM_ID = 'team-home';
const AWAY_TEAM_ID = 'team-away';

/** `lockVoidRevision` 의 `$queryRaw` 반환 행 -- 실제 프로덕션에서 무효화가 생성하는 형태:
 * `currentOfficialRevisionId` 포인터가 이 VOID 리비전 자신을 가리키게 되므로
 * `state`는 항상 `'VOID'`다. */
function lockedVoidRevisionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    revisionId: REVISION_ID,
    gameId: GAME_ID,
    revision: 2,
    state: 'VOID',
    eventsHash: 'hash-void-1',
    supersedesId: null,
    sourceType: 'TOURNAMENT_FIXTURE',
    tournamentId: TOURNAMENT_ID,
    tournamentFixtureId: FIXTURE_ID,
    homeTeamId: HOME_TEAM_ID,
    awayTeamId: AWAY_TEAM_ID,
    ...overrides,
  };
}

function claim(): GameOperationClaim {
  return {
    id: 'claim-1',
    businessKey: `game_result_voided:${REVISION_ID}`,
    aggregateType: 'GAME',
    aggregateId: GAME_ID,
    revisionId: REVISION_ID,
    type: 'GAME_RESULT_VOIDED',
    payload: { revisionId: REVISION_ID },
    attempts: 0,
    retryGeneration: 0,
    version: 1,
    leaseOwner: 'test-worker',
    leaseUntil: new Date('2026-01-01T00:10:00.000Z'),
  };
}

describe('GameResultVoidProjectionService.handler -- 순위표 재계산 대칭', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('대회 픽스처 경기가 무효 처리되면 official 경로와 대칭으로 standings.project()가 이 VOID 리비전으로 호출된다', async () => {
    const queryRaw = jest
      .fn()
      // 1) lockVoidRevision
      .mockResolvedValueOnce([lockedVoidRevisionRow()])
      // 2) standingsShapedRevision (officialRevisionRowSelect 공유 SELECT)
      .mockResolvedValueOnce([
        {
          revisionId: REVISION_ID,
          gameId: GAME_ID,
          revision: 2,
          score: { home: 1, away: 2 },
          sourceHash: 'hash-void-1',
          playedAt: new Date('2026-07-31T09:00:00Z'),
          officialAt: new Date('2026-08-01T00:00:00Z'),
          reason: 'DISPUTE_UPHELD',
          sourceType: 'TOURNAMENT_FIXTURE',
          currentOfficialRevisionId: REVISION_ID,
          tournamentId: TOURNAMENT_ID,
          tournamentFixtureId: FIXTURE_ID,
          homeTeamId: HOME_TEAM_ID,
          awayTeamId: AWAY_TEAM_ID,
          visibility: 'LIVE',
        },
      ]);
    const executeRaw = jest.fn().mockResolvedValue(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw } as any;

    const projectSpy = jest
      .spyOn(GameResultStandingsProjectionService.prototype, 'project')
      .mockResolvedValue(undefined);

    const service = new GameResultVoidProjectionService();
    await service.handler(claim(), tx);

    // 핵심 계약: official 프로젝션(game-result-official-projection.service.ts:66)이
    // standings.project()를 부르는 것과 대칭으로, void 프로젝션도 이 VOID 리비전
    // 자신을 넘겨 순위표를 재계산해야 한다.
    expect(projectSpy).toHaveBeenCalledTimes(1);
    expect(projectSpy).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ revisionId: REVISION_ID, tournamentFixtureId: FIXTURE_ID }),
    );
  });

  it('대회 픽스처가 아닌 팀매치 무효화는 조 순위표가 없으므로 standings.project()를 부르지 않는다', async () => {
    const queryRaw = jest
      .fn()
      // 1) lockVoidRevision -- tournamentFixtureId 없음(팀매치)
      .mockResolvedValueOnce([
        lockedVoidRevisionRow({
          sourceType: 'TEAM_MATCH',
          tournamentId: null,
          tournamentFixtureId: null,
        }),
      ])
      // 2) settleLeagueIfNeeded -- 이 게임이 속한 리그가 없음
      .mockResolvedValueOnce([{ leagueId: null }]);
    const executeRaw = jest.fn().mockResolvedValue(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw } as any;

    const projectSpy = jest
      .spyOn(GameResultStandingsProjectionService.prototype, 'project')
      .mockResolvedValue(undefined);

    const service = new GameResultVoidProjectionService();
    await service.handler(claim(), tx);

    expect(projectSpy).not.toHaveBeenCalled();
  });
});
