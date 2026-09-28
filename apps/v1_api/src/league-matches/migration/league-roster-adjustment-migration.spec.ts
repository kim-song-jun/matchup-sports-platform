import { planLeagueSideMigration, resolveLineupSaver } from './league-roster-adjustment-migration';

describe('planLeagueSideMigration — 팀장 저장본을 조정으로 옮기는 계획', () => {
  const base = ['u-1', 'u-2', 'u-3', 'u-4'];

  it('기준 명단에 있는데 저장본에 없는 사람만 EXCLUDE 로 옮기고, 저장본에 있는 사람은 그대로 둔다', () => {
    const plan = planLeagueSideMigration({
      baseUserIds: base,
      saved: [{ userId: 'u-1' }, { userId: 'u-3' }],
      activeExcludedUserIds: new Set(),
    });
    expect(plan).toEqual({ excludeUserIds: ['u-2', 'u-4'], unrepresentableRows: 0 });
  });

  it('저장본이 기준 명단과 같으면 옮길 것이 없다 (회귀 방향)', () => {
    const plan = planLeagueSideMigration({
      baseUserIds: base,
      saved: base.map((userId) => ({ userId })),
      activeExcludedUserIds: new Set(),
    });
    expect(plan).toEqual({ excludeUserIds: [], unrepresentableRows: 0 });
  });

  it('게스트(계정 없음)와 기준 명단 밖 계정은 조정으로 표현할 수 없어 세기만 한다', () => {
    const plan = planLeagueSideMigration({
      baseUserIds: base,
      saved: [{ userId: 'u-1' }, { userId: null }, { userId: null }, { userId: 'outsider' }, { userId: 'u-2' }],
      activeExcludedUserIds: new Set(),
    });
    expect(plan).toEqual({ excludeUserIds: ['u-3', 'u-4'], unrepresentableRows: 3 });
  });

  it('이미 활성 EXCLUDE 가 있는 사람은 다시 만들지 않는다', () => {
    const plan = planLeagueSideMigration({
      baseUserIds: base,
      saved: [{ userId: 'u-1' }],
      activeExcludedUserIds: new Set(['u-2']),
    });
    expect(plan.excludeUserIds).toEqual(['u-3', 'u-4']);
  });
});

describe('resolveLineupSaver — 저장본을 만든 팀장', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 8, 1, 0, minute));
  const records = [
    { actorUserId: 'home-manager-old', responseBody: { sideId: 'side-home', revision: 2 }, createdAt: at(1) },
    { actorUserId: 'home-manager-new', responseBody: { sideId: 'side-home', revision: 3 }, createdAt: at(2) },
    { actorUserId: 'away-manager', responseBody: { sideId: 'side-away', revision: 4 }, createdAt: at(3) },
  ];

  it('그 사이드의 현재 리비전 이하 저장 중 가장 최근 것을 고른다', () => {
    expect(resolveLineupSaver(records, 'side-home', 3)).toBe('home-manager-new');
    expect(resolveLineupSaver(records, 'side-home', 2)).toBe('home-manager-old');
  });

  it('상대 사이드의 저장은 섞이지 않는다 — 정정 요청 복사본도 그 사이드를 저장한 팀장에게 돌아간다', () => {
    expect(resolveLineupSaver(records, 'side-away', 5)).toBe('away-manager');
    expect(resolveLineupSaver(records, 'side-home', 5)).toBe('home-manager-new');
  });

  it('찾을 수 없으면 null — 작성자를 지어내지 않는다', () => {
    expect(resolveLineupSaver(records, 'side-home', 1)).toBeNull();
    expect(resolveLineupSaver([{ actorUserId: 'x', responseBody: null, createdAt: at(0) }], 'side-home', 9)).toBeNull();
  });
});
