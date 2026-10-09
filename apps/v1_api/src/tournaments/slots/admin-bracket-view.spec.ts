import { serializeAdminBracketGame, serializeAdminBracketSlot } from './admin-bracket-view';

describe('serializeAdminBracketSlot', () => {
  const row = (overrides: Record<string, unknown>) => ({
    id: 'slot-1', tournamentId: 't-1', kind: 'ENTRY', groupId: 'g-a', position: 2, sourceGroupId: null, registrationId: null,
    createdAt: new Date(), updatedAt: new Date(),
    group: { name: 'A조', phase: 'group' }, sourceGroup: null, registration: null, ...overrides,
  }) as never;

  it('배정된 자리는 팀 이름과 등록 id 를, 빈 자리는 둘 다 null 을 낸다', () => {
    expect(serializeAdminBracketSlot(row({ registrationId: 'reg-1', registration: { team: { name: '서울 FC' } } }))).toEqual({
      id: 'slot-1', kind: 'ENTRY', groupId: 'g-a', sourceGroupId: null, position: 2, label: 'A조 2번', registrationId: 'reg-1', teamName: '서울 FC',
    });
    expect(serializeAdminBracketSlot(row({}))).toMatchObject({ registrationId: null, teamName: null });
  });

  it('순위 자리는 원천 조 이름으로 라벨을 만든다', () => {
    expect(
      serializeAdminBracketSlot(row({ kind: 'GROUP_RANK', groupId: 'g-f', sourceGroupId: 'g-a', position: 1, group: { name: '4강', phase: 'semi' }, sourceGroup: { name: 'A조' } })),
    ).toMatchObject({ kind: 'GROUP_RANK', sourceGroupId: 'g-a', label: 'A조 1위' });
  });
});

describe('serializeAdminBracketGame', () => {
  const game = (overrides: Record<string, unknown> = {}) => ({
    id: 'game-1', state: 'SCHEDULED', version: 3, _count: { events: 0 }, resultRevisions: [], ...overrides,
  }) as never;
  const revision = (overrides: Record<string, unknown> = {}) => ({
    id: 'rev-1', state: 'OFFICIAL', score: { home: 2, away: 1 }, reason: null, supersedesId: null, ...overrides,
  });

  it('리비전이 없으면 latestRevision 이 null 이고 이벤트가 없으면 hasLiveRecords 는 false', () => {
    expect(serializeAdminBracketGame(game())).toEqual({ id: 'game-1', state: 'SCHEDULED', version: 3, hasLiveRecords: false, latestRevision: null });
  });

  it('게임 이벤트가 하나라도 있으면 hasLiveRecords (빠른 결과가 막히는 조건과 같은 기준)', () => {
    expect(serializeAdminBracketGame(game({ _count: { events: 1 } })).hasLiveRecords).toBe(true);
  });

  it('입력 방식: quick 마커 / 대체한 리비전 / 콘솔 첫 초안', () => {
    const entry = (rev: Record<string, unknown>) => serializeAdminBracketGame(game({ resultRevisions: [revision(rev)] })).latestRevision?.entryMethod;
    expect(entry({ reason: '[quick-result]' })).toBe('quick');
    expect(entry({ reason: '운영자 결과 정정', supersedesId: 'rev-0' })).toBe('correction');
    expect(entry({})).toBe('console');
  });

  it('승부차기 점수를 penalties 로 내고, 읽을 수 없는 score 는 null 로 둔다', () => {
    const score = (value: unknown) => serializeAdminBracketGame(game({ resultRevisions: [revision({ state: 'DRAFT', score: value })] })).latestRevision?.score;
    expect(score({ home: 1, away: 1, penalties: { home: 4, away: 3 } })).toEqual({ home: 1, away: 1, penalties: { home: 4, away: 3 } });
    expect(score({ home: 2, away: 0 })).toEqual({ home: 2, away: 0 });
    expect(score({ garbage: true })).toBeNull();
  });

  it('최신 리비전(첫 원소)의 상태를 그대로 싣는다 — 무효된 결과는 VOID 로 보인다', () => {
    expect(serializeAdminBracketGame(game({ state: 'ENDED', resultRevisions: [revision({ state: 'VOID' })] })).latestRevision).toMatchObject({ id: 'rev-1', state: 'VOID' });
  });
});
