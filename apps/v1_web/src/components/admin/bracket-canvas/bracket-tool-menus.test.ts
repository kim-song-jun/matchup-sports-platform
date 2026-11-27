import { describe, expect, it } from 'vitest';
import { bracketCreateAction, buildBracketToolMenus, hasGroupRankSlots, type BracketToolContext } from './bracket-tool-menus';

const base: BracketToolContext = {
  format: 'knockout', hasStagePlan: false, isEmpty: false, canWrite: true, leagueGrid: false,
  hasGroupPhase: false, hasGroupRankSlots: false, randomFillBlockedReason: null, formatUnknownReason: null,
  unplacedTeamCount: 3, unscheduledCount: 4, unscheduledOnly: false,
};
const keys = (items: { key: string }[]) => items.map(item => item.key);
const menus = (overrides: Partial<BracketToolContext> = {}) => buildBracketToolMenus({ ...base, ...overrides });

describe('buildBracketToolMenus — 형식별 항목', () => {
  it('knockout·내용 있음', () => {
    const result = menus();
    expect(keys(result.teamFill)).toEqual(['random-fill', 'team-tray']);
    expect(keys(result.match)).toEqual(['add-fixture', 'link-fixtures', 'template', 'reset']);
    expect(keys(result.timeVenue)).toEqual(['time-assign', 'court-assign', 'unscheduled-only']);
  });

  it('group_knockout + 순위 자리 있음: 팀 채우기에 순위대로 채우기·결선 진출팀 직접 정하기가 더해진다', () => {
    const result = menus({ format: 'group_knockout', hasGroupPhase: true, hasGroupRankSlots: true });
    expect(keys(result.teamFill)).toEqual(['random-fill', 'standings-fill', 'finalists', 'team-tray']);
  });

  it('group_knockout 이라도 순위 자리가 없으면 순위대로 채우기가 없고, 조가 없으면 결선 진출팀 항목도 없다', () => {
    expect(keys(menus({ format: 'group_knockout', hasGroupPhase: true }).teamFill)).toEqual(['random-fill', 'finalists', 'team-tray']);
    expect(keys(menus({ format: 'group_knockout', hasGroupPhase: false }).teamFill)).toEqual(['random-fill', 'team-tray']);
  });

  it('knockout 은 조 순위가 있어도 결선 진출팀 항목이 없다(대조군)', () => {
    expect(keys(menus({ hasGroupPhase: true }).teamFill)).not.toContain('finalists');
  });

  it('league(leagueGrid): 경기 연결만 빠진다', () => {
    const result = menus({ format: 'league', leagueGrid: true });
    expect(keys(result.match)).toEqual(['add-fixture', 'template', 'reset']);
    expect(keys(result.teamFill)).toEqual(['random-fill', 'team-tray']);
  });

  it('템플릿이 없는 형식은 「템플릿으로 다시 만들기」가 없다', () => {
    expect(keys(menus({ format: undefined }).match)).toEqual(['add-fixture', 'link-fixtures', 'reset']);
  });

  it('stagePlan(league_knockouts): 팀 채우기는 단계·진출팀 관리뿐, 경기는 초기화뿐', () => {
    const result = menus({ format: 'league_knockouts', hasStagePlan: true });
    expect(keys(result.teamFill)).toEqual(['stage-teams']);
    expect(keys(result.match)).toEqual(['reset']);
    expect(keys(result.timeVenue)).toEqual(['time-assign', 'court-assign', 'unscheduled-only']);
  });

  it('옛 league_knockouts(단계 없음): 토너먼트별 진출팀 배정·배정 규칙 / 예선·토너먼트 대진 생성', () => {
    const result = menus({ format: 'league_knockouts' });
    expect(keys(result.teamFill)).toEqual(['multi-finals-assign', 'multi-finals-rules']);
    expect(keys(result.match)).toEqual(['multi-finals-create', 'reset']);
  });

  it.each([
    ['빈 대진', { isEmpty: true }],
    ['읽기 전용', { canWrite: false }],
    ['빈 대진 + 단계 관리', { isEmpty: true, hasStagePlan: true }],
  ])('%s: 세 배열이 모두 빈다(메뉴 자체가 사라진다)', (_name, overrides) => {
    expect(menus(overrides)).toEqual({ teamFill: [], match: [], timeVenue: [] });
  });
});

describe('buildBracketToolMenus — 항목 모양', () => {
  const find = (key: string, overrides: Partial<BracketToolContext> = {}) => {
    const result = menus(overrides);
    return [...result.teamFill, ...result.match, ...result.timeVenue].find(item => item.key === key)!;
  };

  it('reset 은 destructive 이고 「되돌릴 수 없는 작업」 묶음이다', () => {
    expect(find('reset')).toMatchObject({ label: '대진 초기화', destructive: true, groupLabel: '되돌릴 수 없는 작업' });
    expect(menus().match.filter(item => item.destructive)).toHaveLength(1);
  });

  it('disabledReason 이 그대로 실린다: random-fill=randomFillBlockedReason, add·link=formatUnknownReason', () => {
    const blocked = { randomFillBlockedReason: '비어 있는 자리가 없어요.', formatUnknownReason: '대회 방식을 아직 확인하지 못했어요.' };
    expect(find('random-fill', blocked).disabledReason).toBe('비어 있는 자리가 없어요.');
    expect(find('add-fixture', blocked).disabledReason).toBe('대회 방식을 아직 확인하지 못했어요.');
    expect(find('link-fixtures', blocked).disabledReason).toBe('대회 방식을 아직 확인하지 못했어요.');
    expect(find('random-fill').disabledReason ?? null).toBeNull();
    expect(find('add-fixture').disabledReason ?? null).toBeNull();
  });

  it('unscheduled-only: 0건이면 「모든 경기에 시간이 있어요.」로 비활성, 있으면 건수, 켜져 있으면 「모든 경기 보기」', () => {
    expect(find('unscheduled-only', { unscheduledCount: 0 })).toMatchObject({ label: '시간 미정 경기만 보기', disabledReason: '모든 경기에 시간이 있어요.' });
    expect(find('unscheduled-only')).toMatchObject({ label: '시간 미정 경기만 보기', description: '4경기가 아직 시간 미정이에요' });
    expect(find('unscheduled-only').disabledReason ?? null).toBeNull();
    const on = find('unscheduled-only', { unscheduledOnly: true });
    expect(on.label).toBe('모든 경기 보기');
    expect(on.disabledReason ?? null).toBeNull();
    // 켠 채로 모든 경기에 시간이 들어가도 끌 수는 있어야 한다.
    expect(find('unscheduled-only', { unscheduledOnly: true, unscheduledCount: 0 }).disabledReason ?? null).toBeNull();
  });

  it('참가팀 목록 열기는 자리 없는 팀 수를 설명에 싣는다', () => {
    expect(find('team-tray')).toMatchObject({ label: '참가팀 목록 열기', description: '팀을 골라 자리에 넣어요 · 자리 없는 팀 3' });
  });

  it('화면 문구에 금지어(어웨이·경기장·필드·정정)가 없다', () => {
    const all = Object.values(menus({ format: 'group_knockout', hasGroupPhase: true, hasGroupRankSlots: true })).flat();
    for (const item of all) expect(`${item.label} ${item.description}`).not.toMatch(/어웨이|경기장|필드|정정/);
  });
});

describe('bracketCreateAction', () => {
  it.each([
    ['knockout', { format: 'knockout', hasStagePlan: false, canWrite: true }, { key: 'template', label: '템플릿으로 대진 만들기' }],
    ['league', { format: 'league', hasStagePlan: false, canWrite: true }, { key: 'template', label: '템플릿으로 대진 만들기' }],
    ['group_knockout', { format: 'group_knockout', hasStagePlan: false, canWrite: true }, { key: 'template', label: '템플릿으로 대진 만들기' }],
    ['단계 관리', { format: 'league_knockouts', hasStagePlan: true, canWrite: true }, { key: 'stage', label: '단계대로 대진 만들기' }],
    ['옛 league_knockouts', { format: 'league_knockouts', hasStagePlan: false, canWrite: true }, { key: 'multi-finals-create', label: '예선·토너먼트 대진 생성' }],
    ['읽기 전용', { format: 'knockout', hasStagePlan: false, canWrite: false }, null],
    ['형식 모름', { format: undefined, hasStagePlan: false, canWrite: true }, null],
  ] as const)('%s', (_name, ctx, expected) => {
    expect(bracketCreateAction(ctx)).toEqual(expected);
  });
});

describe('hasGroupRankSlots', () => {
  it('sourceGroupId 가 있는 GROUP_RANK 가 하나라도 있을 때만 true', () => {
    expect(hasGroupRankSlots([{ kind: 'GROUP_RANK', sourceGroupId: 'g1' }])).toBe(true);
    expect(hasGroupRankSlots([{ kind: 'ENTRY' }, { kind: 'GROUP_RANK', sourceGroupId: 'g1' }])).toBe(true);
    expect(hasGroupRankSlots([{ kind: 'GROUP_RANK', sourceGroupId: null }])).toBe(false);
    expect(hasGroupRankSlots([{ kind: 'GROUP_RANK' }])).toBe(false);
    expect(hasGroupRankSlots([{ kind: 'ENTRY', sourceGroupId: 'g1' }])).toBe(false);
    expect(hasGroupRankSlots([])).toBe(false);
  });
});
