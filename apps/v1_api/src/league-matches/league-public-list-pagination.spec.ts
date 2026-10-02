/**
 * league-public-list-pagination.spec.ts
 *
 * 공개 리그 목록(league-match-public.service.ts list())이 쓰는 상태-우선순위 페이지네이션
 * 계약 테스트. alpha 실측(41건 중 draft 61%)에서 재현된 결함을 고정한다: 상태 필터가
 * 없으면 진행 중(active) 리그가 준비 중(draft)·종료(completed)보다 먼저 와야 하고,
 * 커서로 다음 페이지를 이어 받아도 행이 중복되거나 빠지면 안 된다.
 *
 * `paginateByStatePriority`는 Prisma 를 모르는 순수 함수라(league-lifecycle-rules.ts 주석
 * 참고) 이 파일도 `@prisma/client` 를 import 하지 않는다 -- 이 저장소의 공유 Prisma client
 * 가 schema.prisma 와 드리프트돼 있는 동안에도(v1League 모델이 생성된 클라이언트에 없음,
 * 2026-08-23 실측) 이 테스트는 영향받지 않고 로컬에서 그대로 통과해야 한다.
 */
import { LEAGUE_STATE_PRIORITY_ORDER, paginateByStatePriority, StatePriorityPageRow } from './league-lifecycle-rules';

interface FixtureLeague extends StatePriorityPageRow {
  createdAt: number;
}

/**
 * 실제 Prisma `findMany({ where: { state }, orderBy: [{createdAt:'desc'},{id:'desc'}],
 * cursor, skip: 1, take })` 호출을 흉내 내는 인메모리 페처. list() 가 fetchGroup 으로
 * 주입하는 것과 동일한 계약(상태로 필터 -> createdAt desc, id desc 정렬 -> cursorId 다음부터
 * -> take 개)을 지켜야 이 테스트가 실제 쿼리 동작을 검증하는 게 된다.
 */
function makeFetchGroup(fixtures: readonly FixtureLeague[]) {
  const byState = new Map<string, FixtureLeague[]>();
  for (const row of fixtures) {
    const sorted = byState.get(row.state) ?? [];
    sorted.push(row);
    byState.set(row.state, sorted);
  }
  for (const rows of byState.values()) {
    rows.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  }

  return async (state: string, page: { cursorId?: string; take: number }) => {
    const rows = byState.get(state) ?? [];
    const startIndex = page.cursorId ? rows.findIndex((row) => row.id === page.cursorId) + 1 : 0;
    return rows.slice(startIndex, startIndex + page.take);
  };
}

describe('LEAGUE_STATE_PRIORITY_ORDER', () => {
  it('진행 중 -> 준비 중 -> 종료 순서다 (listMine의 sortMyLeaguesByState와 동일 규칙)', () => {
    expect(LEAGUE_STATE_PRIORITY_ORDER).toEqual(['active', 'draft', 'completed']);
  });
});

describe('paginateByStatePriority — 공개 리그 목록 상태 우선순위 정렬', () => {
  const fixtures: FixtureLeague[] = [
    // alpha 실측과 같은 모양: draft 가 수적으로 많지만(createdAt 이 가장 최근이라
    // 옛 정렬이면 맨 위) active 가 먼저 와야 한다.
    { id: 'draft-1', state: 'draft', createdAt: 500 },
    { id: 'draft-2', state: 'draft', createdAt: 400 },
    { id: 'draft-3', state: 'draft', createdAt: 300 },
    { id: 'active-1', state: 'active', createdAt: 200 },
    { id: 'active-2', state: 'active', createdAt: 100 },
    { id: 'completed-1', state: 'completed', createdAt: 50 },
  ];

  it('상태 필터가 없으면 진행 중 리그가 준비 중·종료보다 먼저 온다', async () => {
    const result = await paginateByStatePriority({
      stateGroups: LEAGUE_STATE_PRIORITY_ORDER,
      limit: 20,
      fetchGroup: makeFetchGroup(fixtures),
    });

    expect(result.items.map((row) => row.id)).toEqual([
      'active-1',
      'active-2',
      'draft-1',
      'draft-2',
      'draft-3',
      'completed-1',
    ]);
    expect(result.hasNext).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('같은 상태 안에서는 createdAt desc 를 유지한다', async () => {
    const result = await paginateByStatePriority({
      stateGroups: LEAGUE_STATE_PRIORITY_ORDER,
      limit: 20,
      fetchGroup: makeFetchGroup(fixtures),
    });
    const draftIds = result.items.filter((row) => row.state === 'draft').map((row) => row.id);
    expect(draftIds).toEqual(['draft-1', 'draft-2', 'draft-3']);
  });

  it('query.state 필터가 있으면 그 상태 하나만 순회한다 (기존 단일 쿼리 동작으로 축소)', async () => {
    const result = await paginateByStatePriority({
      stateGroups: ['draft'],
      limit: 20,
      fetchGroup: makeFetchGroup(fixtures),
    });
    expect(result.items.map((row) => row.id)).toEqual(['draft-1', 'draft-2', 'draft-3']);
  });

  it('커서로 이어 받아도 페이지 경계에서 행이 중복되거나 빠지지 않는다', async () => {
    // limit=2 로 전체를 강제로 여러 페이지에 걸치게 만들고, hasNext 가 꺼질 때까지
    // 커서를 계속 넘겨 완주한다 -- 그룹 경계를 넘나드는 페이지(예: active 2건을 다
    // 쓰고 draft 로 넘어가는 페이지)가 실제로 발생하는지까지 검증한다.
    const fetchGroup = makeFetchGroup(fixtures);
    const collectedIds: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page = await paginateByStatePriority({
        stateGroups: LEAGUE_STATE_PRIORITY_ORDER,
        limit: 2,
        cursor,
        fetchGroup,
      });
      collectedIds.push(...page.items.map((row) => row.id));
      pages += 1;
      if (!page.hasNext) break;
      cursor = page.nextCursor ?? undefined;
      // 무한 루프 방지 -- fixtures 는 6건이라 limit=2면 3페이지를 넘을 수 없다.
      if (pages > 10) throw new Error('paginateByStatePriority 가 종료되지 않는다');
    }

    expect(collectedIds).toEqual([
      'active-1',
      'active-2',
      'draft-1',
      'draft-2',
      'draft-3',
      'completed-1',
    ]);
    // 중복·누락 없음을 개수로도 재확인한다 (순서 검증과 별개 불변식).
    expect(new Set(collectedIds).size).toBe(fixtures.length);
    expect(pages).toBeGreaterThan(1);
  });

  it('그룹 경계에서 재개하는 페이지는 이전 그룹을 다시 훑지 않는다', async () => {
    // 1페이지(limit=2)로 active 2건을 다 받은 뒤, nextCursor 는 "active:active-2" 다.
    // 이 커서로 이어 받으면 draft 그룹부터 시작해야지 active 를 다시 반환하면 안 된다.
    const fetchGroup = makeFetchGroup(fixtures);
    const first = await paginateByStatePriority({
      stateGroups: LEAGUE_STATE_PRIORITY_ORDER,
      limit: 2,
      fetchGroup,
    });
    expect(first.nextCursor).toBe('active:active-2');

    const second = await paginateByStatePriority({
      stateGroups: LEAGUE_STATE_PRIORITY_ORDER,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
      fetchGroup,
    });
    expect(second.items.map((row) => row.id)).toEqual(['draft-1', 'draft-2']);
  });

  it('형식이 깨진 커서(콜론 없음)는 처음부터 다시 훑는다', async () => {
    const result = await paginateByStatePriority({
      stateGroups: LEAGUE_STATE_PRIORITY_ORDER,
      limit: 2,
      cursor: 'not-a-valid-cursor',
      fetchGroup: makeFetchGroup(fixtures),
    });
    expect(result.items.map((row) => row.id)).toEqual(['active-1', 'active-2']);
  });
});
