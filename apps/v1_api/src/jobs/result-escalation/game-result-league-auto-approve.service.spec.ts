import { GameResultLeagueAutoApproveService } from './game-result-league-auto-approve.service';
import type { GameOperationClaim } from '../v1-game-operations-worker.service';

// D2 (E2): 24시간 무응답 시 리그 팀매치 결과 자동 승인. 이웃 파일
// game-result-submitted-escalation.service.spec.ts와 같은 fakeTx 패턴 -- $queryRaw는
// SQL 문자열의 특징적인 부분 문자열로 분기한다(호출 순서에 의존하지 않기 위함).

type RevisionRow = {
  revisionId: string;
  gameId: string;
  state: string;
  leagueId: string | null;
};

function sqlOf(call: unknown[]): string {
  return (call[0] as readonly string[]).join('');
}

function claim(revisionId: string): GameOperationClaim {
  return {
    id: 'outbox-1',
    businessKey: `result-review:${revisionId}:auto-approve`,
    aggregateType: 'GAME',
    aggregateId: 'g1',
    revisionId,
    type: 'GAME_RESULT_LEAGUE_AUTO_APPROVE',
    payload: { revisionId },
    attempts: 0,
    retryGeneration: 0,
    version: 0,
    leaseOwner: 'owner-1',
    leaseUntil: new Date(),
  };
}

function submittedLeagueRevision(overrides: Partial<RevisionRow> = {}): RevisionRow {
  return {
    revisionId: 'rev-1',
    gameId: 'g1',
    state: 'SUBMITTED',
    leagueId: 'lg1',
    ...overrides,
  };
}

function fakeTx(opts: {
  revisionRow: RevisionRow | undefined;
  superseded: boolean;
  updateReturnsRevision?: number;
}) {
  const queryRaw = jest.fn((strings: readonly string[]) => {
    const sql = strings.join('');
    if (sql.includes('FOR UPDATE OF revision')) {
      return Promise.resolve(opts.revisionRow ? [opts.revisionRow] : []);
    }
    if (sql.includes('WHERE supersedes_id')) {
      return Promise.resolve(opts.superseded ? [{ id: 'successor-1' }] : []);
    }
    if (sql.includes("SET state = 'OFFICIAL'")) {
      return Promise.resolve(opts.updateReturnsRevision === undefined ? [] : [{ revision: opts.updateReturnsRevision }]);
    }
    throw new Error(`Unmocked $queryRaw call: ${sql.slice(0, 120)}`);
  });
  const executeRaw = jest.fn().mockResolvedValue(1);
  return { $queryRaw: queryRaw, $executeRaw: executeRaw };
}

describe('GameResultLeagueAutoApproveService', () => {
  /**
   * **옛 계약을 여기 박아 두고 있었다.** 이 테스트는 "리그 리비전을 24시간 뒤 OFFICIAL 로
   * 승격한다" 를 고정하고 있었는데, 그건 정본 §4("결과 보내기 → **어드민 확인** 한 단계")가
   * 없앤 단계다 — 자동 승인은 그 확인을 통째로 건너뛴다. **지우지 않고 새 계약으로 다시 적는다.**
   */
  it('리그 리비전을 자동 승인하지 않는다 — 어드민 확인을 건너뛰면 안 된다 (A-3)', async () => {
    const service = new GameResultLeagueAutoApproveService();
    const tx = fakeTx({ revisionRow: submittedLeagueRevision(), superseded: false, updateReturnsRevision: 3 });

    await expect(service.handler(claim('rev-1'), tx as never)).resolves.toBeUndefined();

    // **한 줄도 나가면 안 된다** — 결정 행도, 게임의 공식 리비전 포인터도, OFFICIAL 아웃박스도.
    // 이 게이트가 막는 것은 **되돌리기 어려운 행위**다(어드민 확인 없이 공식 결과가 박힌다).
    expect(tx.$executeRaw.mock.calls.map(sqlOf)).toHaveLength(0);
  });

  it('배포 전에 이미 예약된 잡이 발화해도 확정하지 않는다 (A-3 이중 방어)', async () => {
    // 에스컬레이션 핸들러의 게이트는 **앞으로 예약이 안 생기게** 한다. 그런데 배포 시점에
    // **이미 큐에 있던** 리그 예약은 그대로 발화한다 — 그때 확정되면 안 된다. 그래서 두
    // 게이트가 필요하고, 둘은 서로 다른 것을 막는다.
    const service = new GameResultLeagueAutoApproveService();
    const tx = fakeTx({
      revisionRow: submittedLeagueRevision({ revisionId: 'rev-queued-before-deploy' }),
      superseded: false,
      updateReturnsRevision: 3,
    });

    await service.handler(claim('rev-queued-before-deploy'), tx as never);

    expect(tx.$executeRaw.mock.calls.map(sqlOf)).toHaveLength(0);
  });

  it('사람이 이미 승인/정정요청해 SUBMITTED 가 아니면 조용히 아무것도 하지 않는다(멱등)', async () => {
    const service = new GameResultLeagueAutoApproveService();
    const tx = fakeTx({ revisionRow: submittedLeagueRevision({ state: 'OFFICIAL' }), superseded: false });

    await expect(service.handler(claim('rev-1'), tx as never)).resolves.toBeUndefined();

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('리그 팀매치가 아니면(leagueId=null) 아무것도 하지 않는다', async () => {
    const service = new GameResultLeagueAutoApproveService();
    const tx = fakeTx({ revisionRow: submittedLeagueRevision({ leagueId: null }), superseded: false });

    await expect(service.handler(claim('rev-1'), tx as never)).resolves.toBeUndefined();

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('ASSIST_SYNC 로 superseded 된 리비전(state는 SUBMITTED로 남음)은 자동 승인하지 않는다', async () => {
    const service = new GameResultLeagueAutoApproveService();
    const tx = fakeTx({ revisionRow: submittedLeagueRevision(), superseded: true });

    await expect(service.handler(claim('rev-1'), tx as never)).resolves.toBeUndefined();

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
