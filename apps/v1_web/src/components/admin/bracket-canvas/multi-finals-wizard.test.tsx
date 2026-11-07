import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MultiFinalsWizard } from './multi-finals-wizard';
import type { MultiFinalView } from '@/hooks/use-multi-finals';

const base = '*/api/v1/admin/tournaments/t-1/bracket/multi-finals';
const success = (data: unknown) => HttpResponse.json({ status: 'success', data });
const registrations = ['가팀', '나팀', '다팀', '라팀'].map((name, i) => ({ id: `reg-${i}`, team: { id: `team-${i}`, name } }));
const savedView = (): MultiFinalView => ({ revision: 1, groups: [{ id: 'g-1', name: 'A조', capacity: 4, legs: 1 }], generated: false, registrations,
  groupStandings: [{ groupId: 'g-1', name: 'A조', complete: true, rows: registrations.map((reg, i) => ({ registrationId: reg.id, teamName: reg.team.name, position: i + 1, points: 9 - i * 3, wins: 3 - i, draws: 0, losses: i, goalsFor: 3 - i, goalsAgainst: i, tiedRegistrationIds: [] })) }],
  finals: [{ id: 'final-0', colorIndex: 0, name: '챔피언', thirdPlace: false, rules: [{ groupId: 'g-1', rank: 1 }, { groupId: 'g-1', rank: 2 }], registrationIds: null, manual: false, suggestedRegistrationIds: ['reg-0', 'reg-1'], unresolved: [] }] });
const server = setupServer(http.post('*/api/v1/logs/client-error', () => success({})));
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => server.close());
function show(mode: 'create' | 'rules' | 'assign' = 'assign') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onApplied = vi.fn(), onClose = vi.fn();
  render(<QueryClientProvider client={client}><MultiFinalsWizard tournamentId="t-1" mode={mode} open onClose={onClose} onApplied={onApplied} /></QueryClientProvider>);
  return { onApplied, onClose };
}

describe('N개 토너먼트 단계형 설정과 실제 API payload', () => {
  it('예선 팀을 직접 선택하고 빈 자리를 남긴 payload로 조별리그를 저장한다', async () => {
    let view: MultiFinalView = { revision: 0, groups: [], finals: [], registrations, generated: false };
    let submitted: { groups: Array<{ registrationIds: string[] }> } | undefined;
    server.use(http.get(base, () => success(view)), http.post(`${base}/setup`, async ({ request }) => {
      submitted = await request.json() as typeof submitted;
      view = savedView(); return success(view);
    }), http.post(`${base}/preview`, () => success({ revision: 1, previewHash: 'manual', finals: view.finals, counts: { tournaments: 1, fixtures: 1, byes: 0 } })));
    show('create');
    fireEvent.change(await screen.findByRole('combobox', { name: 'A조 1번 팀' }), { target: { value: 'reg-0' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'B조 2번 팀' }), { target: { value: 'reg-1' } });
    expect(within(screen.getByRole('combobox', { name: 'B조 1번 팀' })).getByRole('option', { name: '가팀' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(await screen.findByRole('button', { name: '대진 미리보기' }));
    await screen.findByText('결선 대진 미리보기');
    expect(submitted?.groups.map(g => g.registrationIds)).toEqual([['reg-0'], ['reg-1']]);
  });
  it('자동 배정은 확정 팀을 중복 없이 채우며 남은 자리는 미정으로 둔다', async () => {
    server.use(http.get(base, () => success({ revision: 0, groups: [], finals: [], registrations, generated: false })));
    show('create');
    fireEvent.click(await screen.findByRole('button', { name: '참가팀 자동 배정' }));
    const ids = screen.getAllByRole('combobox').map(node => (node as HTMLSelectElement).value).filter(id => id.startsWith('reg-'));
    expect(ids).toHaveLength(4); expect(new Set(ids).size).toBe(4);
    expect(ids.sort()).toEqual(registrations.map(reg => reg.id));
  });
  it('대진이 있는 읽기 전용 예선의 과거 참가팀 이탈은 결선 규칙 확인을 막지 않는다', async () => {
    const view = { ...savedView(), preliminaryFixtureCount: 6 };
    view.groups[0].registrationIds = ['withdrawn-team'];
    server.use(http.get(base, () => success(view)));
    show('create');
    await screen.findByRole('button', { name: '대진 초기화' });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByRole('textbox', { name: '토너먼트 1 이름' });
  });
  it('조 밖에 수동 추가한 대진이 남아 있으면 편집을 잠그되 초기화는 허용한다', async () => {
    server.use(http.get(base, () => success({ ...savedView(), fixtureCount: 1, preliminaryFixtureCount: 0 })));
    show('create');
    expect(await screen.findByRole('button', { name: '대진 초기화' })).toBeEnabled();
    expect(screen.queryByRole('spinbutton', { name: '1번째 조 팀 수' })).not.toBeInTheDocument();
  });
  it('독립 초기화 후 설정을 hydrate하고 별도 예선 저장으로 새 조 ID에 규칙을 연결한다', async () => {
    let view = { ...savedView(), preliminaryFixtureCount: 6, generated: true };
    view.groups[0].registrationIds = ['reg-0', 'reg-1'];
    let resetInput: unknown; let updateInput: unknown;
    server.use(http.get(base, () => success(view)), http.post(`${base}/reset`, async ({ request }) => {
      resetInput = await request.json(); view = { ...view, revision: 2, preliminaryFixtureCount: 0, generated: false }; return success(view);
    }), http.put(`${base}/preliminary`, async ({ request }) => {
      updateInput = await request.json(); view = { ...view, revision: 3, preliminaryFixtureCount: 3 }; return success(view);
    }), http.post(`${base}/preview`, () => success({ revision: 3, previewHash: 'edited', finals: view.finals, counts: { tournaments: 1, fixtures: 1, byes: 0 } })));
    const props = show('create');
    fireEvent.click(await screen.findByRole('button', { name: '대진 초기화' }));
    const confirmation = await screen.findByRole('dialog', { name: '대진 초기화' });
    fireEvent.click(within(confirmation).getByRole('button', { name: '대진 초기화' }));
    const capacity = await screen.findByRole('spinbutton', { name: '1번째 조 팀 수' });
    expect(resetInput).toEqual({ expectedRevision: 1 }); expect(updateInput).toBeUndefined(); expect(props.onApplied).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'A조 1번 팀' })).toHaveValue('reg-0');
    fireEvent.change(capacity, { target: { value: '3' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'A조 1번 팀' }), { target: { value: 'reg-2' } });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(await screen.findByRole('button', { name: '대진 미리보기' }));
    await screen.findByText('결선 대진 미리보기');
    expect(updateInput).toEqual(expect.objectContaining({ expectedRevision: 2, groups: [expect.objectContaining({ capacity: 3, registrationIds: ['reg-2'] })], finals: [expect.objectContaining({ rules: [{ groupId: '0', rank: 1 }, { groupId: '0', rank: 2 }] })] }));
  });
  it('초기화 API가 거절하면 오류를 표시하고 저장된 편성을 잠근 채 유지한다', async () => {
    server.use(http.get(base, () => success({ ...savedView(), preliminaryFixtureCount: 6 })), http.post(`${base}/reset`, () => HttpResponse.json({ status: 'error', statusCode: 409, code: 'BRACKET_LOCKED', message: '결과가 있는 경기는 초기화할 수 없어요.' }, { status: 409 })));
    show('create'); fireEvent.click(await screen.findByRole('button', { name: '대진 초기화' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: '대진 초기화' })).getByRole('button', { name: '대진 초기화' }));
    await screen.findByText('결과가 있는 경기는 초기화할 수 없어요.');
    expect(screen.queryByRole('spinbutton', { name: '1번째 조 팀 수' })).not.toBeInTheDocument();
    expect(screen.getByText('A조 · 4팀 · 1회전')).toBeInTheDocument();
  });
  it('최초 예선 편성에서 다음으로 이동하고 팀 선택 없이 결선 대진을 생성한다', async () => {
    let view: MultiFinalView = { revision: 0, groups: [], finals: [], registrations, generated: false, groupStandings: [] };
    let setupInput: unknown; let generateInput: unknown;
    server.use(http.get(base, () => success(view)), http.post(`${base}/setup`, async ({ request }) => {
      const body = await request.json() as { groups: MultiFinalView['groups']; finals: MultiFinalView['finals'] };
      setupInput = body;
      view = { ...view, revision: 1, groups: body.groups.map((group, i) => ({ ...group, id: `saved-${i}` })),
        finals: body.finals.map(f => ({ ...f, rules: f.rules.map(rule => ({ ...rule, groupId: `saved-${rule.groupId}` })), manual: false, suggestedRegistrationIds: [], unresolved: f.rules.map(rule => ({ ...rule, state: 'group_incomplete', tiedRegistrationIds: [] })) })) };
      return success(view);
    }), http.post(`${base}/preview`, () => success({ revision: 1, previewHash: 'pending', finals: view.finals,
      counts: { tournaments: 1, fixtures: 1, byes: 0 } })), http.post(`${base}/generate`, async ({ request }) => { generateInput = await request.json(); return success({ revision: 2 }); }));
    const props = show('create');
    await screen.findByRole('spinbutton', { name: '1번째 조 팀 수' });
    const content = screen.getByText('예선 조 편성').closest('.overflow-y-auto') as HTMLElement;
    content.scrollTop = 500;
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByRole('textbox', { name: '토너먼트 1 이름' });
    expect(content.scrollTop).toBe(0);
    expect(screen.getByRole('spinbutton', { name: '토너먼트 1 자리 수' })).toHaveValue(2);
    expect(screen.queryByRole('combobox', { name: 'A조 1위 진출 토너먼트' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '대진 미리보기' }));
    await screen.findByText('상위 토너먼트 · 2자리 · 진출팀 미정');
    expect(screen.queryByRole('checkbox', { name: '가팀' })).not.toBeInTheDocument();
    expect(setupInput).toEqual(expect.objectContaining({ finals: [expect.objectContaining({ capacity: 2, registrationIds: null, rules: [] })] }));
    fireEvent.click(screen.getByRole('button', { name: '확인하고 결선 생성' }));
    await waitFor(() => expect(props.onApplied).toHaveBeenCalledOnce());
    expect(generateInput).toEqual(expect.objectContaining({ expectedRevision: 1, previewHash: 'pending' }));
  });
  it('조회 실패를 빈 성공으로 숨기지 않고 재시도할 수 있다', async () => {
    let fail = true; server.use(http.get(base, () => fail ? HttpResponse.json({ message: '일시 오류' }, { status: 503 }) : success(savedView())));
    show('create'); await screen.findByText('설정을 불러오지 못했어요.');
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    fail = false; fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByText('예선 조 편성');
  });
});

it('토너먼트 배정 규칙은 예선 편성 단계 없이 독립 진입한다', async () => {
  server.use(http.get(base, () => success({ ...savedView(), generated: true, fixtureCount: 7 })));
  show('rules');
  expect(await screen.findByText('챔피언 · 2자리 · 2개 순위 연결')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'A조 1위 진출 토너먼트' })).toHaveValue('0');
  expect(screen.queryByRole('textbox', { name: '토너먼트 1 이름' })).not.toBeInTheDocument();
  expect(screen.queryByText('예선 조 편성')).not.toBeInTheDocument();
});

it('순위 목적지 수정은 확정 명단을 비우지 않고 규칙만 저장한다', async () => {
  const view = savedView(); view.generated = true; view.fixtureCount = 8;
  view.finals[0].id = 'd0cca905-ff8d-4598-91c5-13c8e3ee612a';
  view.finals[0].registrationIds = ['reg-0', 'reg-1']; view.finals[0].manual = true;
  view.finals.push({ ...view.finals[0], name: '챌린지', rules: [{ groupId: 'g-1', rank: 3 }, { groupId: 'g-1', rank: 4 }], registrationIds: ['reg-2', 'reg-3'] });
  let submitted: { finals: MultiFinalView['finals'] } | undefined;
  server.use(http.get(base, () => success(view)), http.put(`${base}/selection`, async ({ request }) => {
    submitted = await request.json() as typeof submitted; return success({ ...view, revision: 2 });
  }), http.post(`${base}/preview`, () => success({ revision: 2, previewHash: 'rules-only', counts: { tournaments: 2, fixtures: 2, byes: 0 }, finals: view.finals })));
  show('rules');
  fireEvent.change(await screen.findByRole('combobox', { name: 'A조 1위 진출 토너먼트' }), { target: { value: '1' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'A조 3위 진출 토너먼트' }), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: '배정 규칙 저장' }));
  const confirmation = await screen.findByRole('dialog', { name: '진출 규칙 변경' });
  fireEvent.click(within(confirmation).getByRole('button', { name: '규칙 저장' }));
  await waitFor(() => expect(submitted).toBeDefined());
  expect(screen.queryByText('결선 대진 미리보기')).not.toBeInTheDocument();
  expect(submitted?.finals.map(final => final.registrationIds)).toEqual([['reg-0', 'reg-1'], ['reg-2', 'reg-3']]);
  expect(submitted?.finals[0].rules).toEqual([{ groupId: 'g-1', rank: 2 }, { groupId: 'g-1', rank: 3 }]);
  expect(submitted?.finals[0].capacity).toBe(2);
  expect(submitted?.finals[0].id).toBe(view.finals[0].id);
});

describe('규칙 화면의 시드 번호', () => {
  const caption = '저장하면 순위가 높은 팀부터 시드를 받아요. 같은 순위끼리는 조 순서대로예요(임시 기본값). 진출팀 배정 화면에서 바꿀 수 있어요.';
  const groupNames = ['A', 'B', 'C', 'D'];
  const viewWith = (groupCount: number, capacity: number): MultiFinalView => ({
    revision: 1, generated: true, fixtureCount: 3, registrations,
    groups: groupNames.slice(0, groupCount).map(name => ({ id: `g-${name}`, name: `${name}조`, capacity: 5, legs: 1 as const })),
    finals: [{ id: 'final-0', colorIndex: 0, name: '본선', capacity, thirdPlace: false, rules: [], registrationIds: null, manual: false, suggestedRegistrationIds: [], unresolved: [] }],
  });
  const seedBadges = () => screen.getAllByText(/^시드 \d+$/).map(node => node.textContent);
  const rowOf = (groupName: string, rank: number) => screen.getByLabelText(`${groupName}조 ${rank}위 진출 토너먼트`).closest('label') as HTMLElement;
  async function chooseGroupByGroup(groupCount: number, ranks: number[]) {
    await screen.findByRole('combobox', { name: 'A조 1위 진출 토너먼트' });
    // The default walk through the screen: every rank of one group before the next group.
    for (const name of groupNames.slice(0, groupCount)) for (const rank of ranks) fireEvent.change(screen.getByLabelText(`${name}조 ${rank}위 진출 토너먼트`), { target: { value: '0' } });
  }

  it('조 단위로 6자리 규칙을 눌러도 시드는 순위 먼저 매겨지고 부전승은 조 1위 둘이다', async () => {
    server.use(http.get(base, () => success(viewWith(2, 6))));
    show('rules');
    await chooseGroupByGroup(2, [1, 2, 3]);
    expect(seedBadges()).toEqual(['시드 1', '시드 3', '시드 5', '시드 2', '시드 4', '시드 6']);
    for (const [group, rank, bye] of [['A', 1, true], ['B', 1, true], ['A', 2, false], ['B', 2, false], ['A', 3, false], ['B', 3, false]] as const) {
      const row = within(rowOf(group, rank));
      expect(row.queryByText('부전승') !== null, `${group}${rank}`).toBe(bye);
    }
    expect(screen.getByText(caption)).toBeInTheDocument();
    expect(screen.getByText('본선 · 6자리 · 6개 순위 연결')).toBeInTheDocument();
  }, 20_000);
  it('4개 조×3위 12자리는 조 1위 4팀이 시드 1~4와 부전승을 받는다', async () => {
    server.use(http.get(base, () => success(viewWith(4, 12))));
    show('rules');
    await chooseGroupByGroup(4, [1, 2, 3]);
    expect(seedBadges()).toEqual(['시드 1', '시드 5', '시드 9', '시드 2', '시드 6', '시드 10', '시드 3', '시드 7', '시드 11', '시드 4', '시드 8', '시드 12']);
    expect(screen.getAllByText('부전승')).toHaveLength(4);
    for (const group of groupNames) expect(within(rowOf(group, 1)).getByText('부전승')).toBeInTheDocument();
  }, 20_000);
  it('순위가 이미 앞선 순서로 저장된 2자리 규칙은 부전승 없이 시드 1·2 그대로이고 연결 없는 칸에는 시드가 없다', async () => {
    server.use(http.get(base, () => success({ ...savedView(), generated: true, fixtureCount: 7 })));
    show('rules');
    await screen.findByText('챔피언 · 2자리 · 2개 순위 연결');
    expect(seedBadges()).toEqual(['시드 1', '시드 2']);
    expect(screen.queryByText('부전승')).not.toBeInTheDocument();
    expect(within(rowOf('A', 3)).queryByText(/시드/)).not.toBeInTheDocument();
  });
  it('목적지를 바꾸면 시드 번호가 바로 다시 매겨진다', async () => {
    server.use(http.get(base, () => success({ ...viewWith(2, 6), finals: [{ ...viewWith(2, 6).finals[0], rules: [{ groupId: 'g-A', rank: 1 }, { groupId: 'g-B', rank: 1 }, { groupId: 'g-A', rank: 2 }] }] })));
    show('rules');
    await screen.findByRole('combobox', { name: 'A조 1위 진출 토너먼트' });
    expect(seedBadges()).toEqual(['시드 1', '시드 3', '시드 2']);
    fireEvent.change(screen.getByRole('combobox', { name: 'B조 2위 진출 토너먼트' }), { target: { value: '0' } });
    expect(seedBadges()).toEqual(['시드 1', '시드 3', '시드 2', '시드 4']);
    fireEvent.change(screen.getByRole('combobox', { name: 'A조 1위 진출 토너먼트' }), { target: { value: '-1' } });
    expect(seedBadges()).toEqual(['시드 2', '시드 1', '시드 3']);
  });
});
