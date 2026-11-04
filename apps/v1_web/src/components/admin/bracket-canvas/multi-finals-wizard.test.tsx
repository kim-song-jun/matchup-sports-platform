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
