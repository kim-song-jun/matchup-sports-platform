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
  finals: [{ name: '챔피언', thirdPlace: false, rules: [{ groupId: 'g-1', rank: 1 }, { groupId: 'g-1', rank: 2 }], registrationIds: null, manual: false, suggestedRegistrationIds: ['reg-0', 'reg-1'], unresolved: [] }] });
const server = setupServer(http.post('*/api/v1/logs/client-error', () => success({})));
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => server.close());
function show(mode: 'create' | 'assign' = 'assign') {
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
    fireEvent.click(screen.getByRole('button', { name: '대진 미리보기' }));
    await screen.findByText('상위 토너먼트 · 2자리 · 진출팀 미정');
    expect(screen.queryByRole('checkbox', { name: '가팀' })).not.toBeInTheDocument();
    expect(setupInput).toEqual(expect.objectContaining({ finals: [expect.objectContaining({ registrationIds: null, rules: [{ groupId: '0', rank: 1 }, { groupId: '1', rank: 1 }] })] }));
    fireEvent.click(screen.getByRole('button', { name: '확인하고 결선 생성' }));
    await waitFor(() => expect(props.onApplied).toHaveBeenCalledOnce());
    expect(generateInput).toEqual(expect.objectContaining({ expectedRevision: 1, previewHash: 'pending' }));
  });
  it('조별 공식 순위 반영 전에는 배정 화면에서 결과를 확정하거나 팀을 선택하지 않는다', async () => {
    const view = savedView(); view.groupStandings![0].complete = false;
    view.finals[0].suggestedRegistrationIds = [];
    server.use(http.get(base, () => success(view)));
    show(); await screen.findByText('조별 전체 순위');
    expect(screen.getByRole('button', { name: '순위대로 자동 선택' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '명단 저장 후 미리보기' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '가팀' })).toBeDisabled();
  });
  it('전체 순위와 동률 후보를 보여주고 자동 선택 후 동률 팀을 수동 선택해 저장한다', async () => {
    const view = savedView();
    view.finals[0].suggestedRegistrationIds = ['reg-0'];
    view.finals[0].unresolved = [{ groupId: 'g-1', rank: 2, state: 'tied', tiedRegistrationIds: ['reg-1', 'reg-2'] }];
    view.groupStandings![0].rows[1].tiedRegistrationIds = ['reg-1', 'reg-2'];
    view.groupStandings![0].rows[2].tiedRegistrationIds = ['reg-1', 'reg-2'];
    let submitted: unknown;
    server.use(http.get(base, () => success(view)), http.put(`${base}/selection`, async ({ request }) => { submitted = await request.json(); return success(view); }),
      http.post(`${base}/preview`, () => success({ revision: 1, previewHash: 'tied-picked', finals: [{ ...view.finals[0], registrationIds: ['reg-0', 'reg-2'] }], counts: { tournaments: 1, fixtures: 1, byes: 0 } })));
    show(); await screen.findByText('조별 전체 순위');
    expect(screen.getByRole('table', { name: 'A조 · 확정 순위표' })).toBeInTheDocument();
    expect(screen.getByText('A조 · 나팀: 동률 — 나팀, 다팀')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '순위대로 자동 선택' }));
    expect(screen.getByRole('checkbox', { name: '가팀' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: '다팀' }));
    fireEvent.click(screen.getByRole('button', { name: '명단 저장 후 미리보기' }));
    await screen.findByText('결선 대진 미리보기');
    expect(submitted).toEqual(expect.objectContaining({ finals: [expect.objectContaining({ registrationIds: ['reg-0', 'reg-2'] })] }));
  });
  it('순위 제안의 팀을 제외하고 순위 밖 팀을 추가한 최종 명단으로 미리보기·생성을 요청한다', async () => {
    let view = savedView(); const selections: unknown[] = []; let generated: unknown;
    server.use(http.get(base, () => success(view)), http.put(`${base}/selection`, async ({ request }) => {
      const body = await request.json() as { finals: MultiFinalView['finals'] }; selections.push(body);
      view = { ...view, revision: view.revision + 1, finals: body.finals.map(f => ({ ...f, manual: f.registrationIds != null, suggestedRegistrationIds: ['reg-0', 'reg-1'], unresolved: [] })) }; return success(view);
    }), http.post(`${base}/preview`, () => success({ revision: view.revision, previewHash: 'reviewed', counts: { tournaments: 1, fixtures: 1, byes: 0 }, finals: view.finals })),
    http.post(`${base}/generate`, async ({ request }) => { generated = await request.json(); return success({ revision: view.revision + 1 }); }));
    const props = show();
    const group = await screen.findByRole('group', { name: /챔피언 · 2팀/ });
    fireEvent.click(within(group).getByRole('checkbox', { name: '가팀' }));
    fireEvent.click(within(group).getByRole('checkbox', { name: '다팀' }));
    fireEvent.click(screen.getByRole('button', { name: '명단 저장 후 미리보기' }));
    await screen.findByText('결선 대진 미리보기');
    expect(selections[0]).toEqual(expect.objectContaining({ finals: [expect.objectContaining({ registrationIds: ['reg-1', 'reg-2'] })] }));
    expect(screen.getByText('1번 시드 · 나팀')).toBeInTheDocument();
    expect(screen.getByText('2번 시드 · 다팀')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '확인하고 진출팀 배정' }));
    await waitFor(() => expect(props.onApplied).toHaveBeenCalledOnce());
    expect(generated).toEqual(expect.objectContaining({ expectedRevision: 2, previewHash: 'reviewed', requestId: expect.any(String) }));
  });
  it('조회 실패를 빈 성공으로 숨기지 않고 재시도할 수 있다', async () => {
    let fail = true; server.use(http.get(base, () => fail ? HttpResponse.json({ message: '일시 오류' }, { status: 503 }) : success(savedView())));
    show('create'); await screen.findByText('설정을 불러오지 못했어요.');
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    fail = false; fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByText('예선 조 편성');
  });
  it('대진 생성 API 실패는 성공 콜백 없이 원인을 표시하고 미리보기를 유지한다', async () => {
    const view = savedView(); view.finals[0].registrationIds = ['reg-2', 'reg-3']; view.finals[0].manual = true;
    server.use(http.get(base, () => success(view)), http.put(`${base}/selection`, () => success(view)),
      http.post(`${base}/preview`, () => success({ revision: 1, previewHash: 'old', counts: { tournaments: 1, fixtures: 1, byes: 0 }, finals: view.finals })),
      http.post(`${base}/generate`, () => HttpResponse.json({ message: '대회 상태가 바뀌었어요.' }, { status: 409 })));
    const props = show();
    await screen.findByRole('button', { name: '명단 저장 후 미리보기' });
    fireEvent.click(screen.getByRole('button', { name: '명단 저장 후 미리보기' }));
    await screen.findByText('결선 대진 미리보기'); fireEvent.click(screen.getByRole('button', { name: '확인하고 진출팀 배정' }));
    await screen.findByText('대회 상태가 바뀌었어요.'); expect(props.onApplied).not.toHaveBeenCalled(); expect(props.onClose).not.toHaveBeenCalled();
  });
});

it('참가 확정이 해제된 저장 팀을 명시적으로 제외하고 명단 편집을 계속할 수 있다', async () => {
  const view = savedView(); view.generated = false;
  view.finals[0].manual = true; view.finals[0].registrationIds = ['reg-0', 'withdrawn-team'];
  let submitted: unknown;
  server.use(http.get(base, () => success(view)), http.put(`${base}/selection`, async ({ request }) => {
    const body = await request.json() as { finals: MultiFinalView['finals'] }; submitted = body;
    return success({ ...view, revision: 2, finals: body.finals.map(f => ({ ...f, manual: true, suggestedRegistrationIds: [], unresolved: [] })) });
  }), http.post(`${base}/preview`, () => success({ revision: 2, previewHash: 'ready', counts: { tournaments: 1, fixtures: 1, byes: 0 }, finals: view.finals })));
  show(); await screen.findByRole('button', { name: '확정 명단에 없는 팀 제외' });
  fireEvent.click(screen.getByRole('button', { name: '확정 명단에 없는 팀 제외' }));
  fireEvent.click(screen.getByRole('checkbox', { name: '나팀' }));
  fireEvent.click(screen.getByRole('button', { name: '명단 저장 후 미리보기' }));
  await screen.findByText('결선 대진 미리보기');
  expect(submitted).toEqual(expect.objectContaining({ finals: [expect.objectContaining({ registrationIds: ['reg-0', 'reg-1'] })] }));
});
