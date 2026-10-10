import { LeagueCompletionProjectionService } from './league-completion-projection.service';

type FixtureRow = { status: string; game: { currentOfficialRevision: { state: string } | null } | null };

const confirmed: FixtureRow = { status: 'completed', game: { currentOfficialRevision: { state: 'OFFICIAL' } } };
const pending: FixtureRow = { status: 'scheduled', game: { currentOfficialRevision: null } };

/** 호출 순서를 기록하는 tx. findMany 는 부를 때마다 다음 스냅샷을 돌려준다(잠금 사이에 커밋된 추가를 흉내). */
function fakeTx(snapshots: FixtureRow[][]) {
  const calls: string[] = [];
  let scan = 0;
  const tx = {
    v1Tournament: {
      findFirst: jest.fn(async () => { calls.push('league.read'); return { status: 'in_progress' }; }),
      updateMany: jest.fn(async () => { calls.push('league.complete'); return { count: 1 }; }),
    },
    v1TeamMatch: {
      findMany: jest.fn(async () => { calls.push('fixtures.scan'); return snapshots[Math.min(scan++, snapshots.length - 1)]; }),
    },
    $queryRaw: jest.fn(async () => { calls.push('league.lock'); return []; }),
    v1StatusChangeLog: { create: jest.fn(async () => { calls.push('log'); return {}; }) },
  };
  return { tx, calls };
}

describe('LeagueCompletionProjectionService.settle — 수동 경기 추가와의 경합', () => {
  const service = new LeagueCompletionProjectionService();

  it('완료 판정이 참이면 리그 행을 잠근 뒤 다시 세고, 그대로면 완료한다', async () => {
    const { tx, calls } = fakeTx([[confirmed, confirmed]]);
    await expect(service.settle(tx as never, 'league-1', 'all_fixtures_confirmed')).resolves.toBe(true);
    expect(calls).toEqual(['league.read', 'fixtures.scan', 'league.lock', 'fixtures.scan', 'league.complete', 'log']);
  });

  it('잠그는 사이 수동 추가가 커밋돼 미확정 경기가 생기면 완료하지 않는다', async () => {
    const { tx, calls } = fakeTx([[confirmed, confirmed], [confirmed, confirmed, pending]]);
    await expect(service.settle(tx as never, 'league-1', 'all_fixtures_confirmed')).resolves.toBe(false);
    expect(calls).not.toContain('league.complete');
  });

  // 대조군: 결과 확정마다 리그 행을 잠그지 않는다 — 완료 판정이 거짓이면 잠금 없이 끝난다.
  it('미확정 경기가 남아 있으면 리그 행을 잠그지 않고 끝난다', async () => {
    const { tx, calls } = fakeTx([[confirmed, pending]]);
    await expect(service.settle(tx as never, 'league-1', 'all_fixtures_confirmed')).resolves.toBe(false);
    expect(calls).toEqual(['league.read', 'fixtures.scan']);
  });
});
