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
  it('SUBMITTED 상태의 리그 리비전을 OFFICIAL로 승인하고 결정/게임/아웃박스를 기록한다', async () => {
    const service = new GameResultLeagueAutoApproveService();
    const tx = fakeTx({ revisionRow: submittedLeagueRevision(), superseded: false, updateReturnsRevision: 3 });

    await expect(service.handler(claim('rev-1'), tx as never)).resolves.toBeUndefined();

    const executed = tx.$executeRaw.mock.calls.map(sqlOf);
    expect(executed).toHaveLength(3);
    expect(executed[0]).toContain('INSERT INTO v1_game_result_decisions');
    expect(executed[0]).toContain("'SYSTEM'");
    expect(executed[0]).toContain("'approve'");
    expect(executed[1]).toContain('UPDATE v1_games');
    expect(executed[1]).toContain('current_official_revision_id');
    expect(executed[2]).toContain('INSERT INTO v1_outbox_events');
    expect(executed[2]).toContain("'GAME_RESULT_OFFICIAL'");

    // 시스템 액터 값이 실제 v1_users id와 절대 겹치지 않는 고정 문자열이어야 한다
    // (NULL을 도입하지 않고 유니크 제약을 지키는 방식 -- 상수 doc comment 참고).
    expect(tx.$executeRaw.mock.calls[0]).toContain('system:league-result-auto-approve');
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
