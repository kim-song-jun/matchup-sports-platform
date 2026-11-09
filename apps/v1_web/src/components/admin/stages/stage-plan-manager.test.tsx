import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StagePlanManager } from './stage-plan-manager';
import type { StagePlanView } from '@/types/stage-plan';
vi.mock('@/components/v1-ui/confirm-modal', () => ({ useConfirm: () => ({ confirm: async () => true, ConfirmModal: null }) }));
const base = '*/api/v1/admin/tournaments/staged/stages';
const success = (data: unknown) => HttpResponse.json({ status: 'success', data });
const server = setupServer(http.get('*/api/v1/admin/tournaments/staged/bracket', () => success({ groups: [], fixtures: [], standings: [], slots: [] })), http.post('*/api/v1/logs/client-error', () => success({})));
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => { cleanup(); server.resetHandlers(); });
function data(): StagePlanView {
  const pool = { key: 'league', name: '본선 리그', capacity: 2, format: 'league' as const, legs: 1 as const, sources: [] };
  return { revision: 1, config: { version: 1, stages: [{ key: 'main', name: '본선', pools: [pool] }] },
    registrations: [{ id: 'r1', team: { name: '가팀' } }, { id: 'r2', team: { name: '나팀' } }], pools: [{ ...pool, stageKey: 'main', stageName: '본선', stageIndex: 0, generated: true, assigned: false, complete: false, stale: false, started: false, candidates: [], sourceVersion: 'source-v1', registrationIds: [null, null], fixtureIds: [], standings: [], slots: [{ id: 's1', position: 1, registrationId: null }, { id: 's2', position: 2, registrationId: null }] }] };
}
function show(canWrite = true) { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); render(<QueryClientProvider client={client}><StagePlanManager tournamentId="staged" canWrite={canWrite} /></QueryClientProvider>); }
describe('단계별 참가팀 확정', () => {
  it('실제 선택·확정 payload를 보내고 서버의 확정 배정으로 갱신한다', async () => {
    let view = data(), payload: unknown;
    server.use(http.get(base, () => success(view)), http.put(`${base}/assignment`, async ({ request }) => {
      payload = await request.json(); view = { ...view, revision: 2, pools: view.pools.map(p => ({ ...p, assigned: true, registrationIds: ['r1', 'r2'] })) }; return success(view);
    })); show();
    fireEvent.change(await screen.findByRole('combobox', { name: '1번 자리' }), { target: { value: 'r1' } });
    fireEvent.change(screen.getByRole('combobox', { name: '2번 자리' }), { target: { value: 'r2' } });
    fireEvent.click(screen.getByRole('button', { name: '이 편성 참가팀 확정' }));
    await waitFor(() => expect(payload).toMatchObject({ expectedRevision: 1, poolKey: 'league', sourceVersion: 'source-v1', registrationIds: ['r1', 'r2'] }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '1번 자리' })).toHaveValue('r1'));
  });
  it('시작한 편성은 참가팀 변경을 막고 서버 실패를 성공으로 표시하지 않는다', async () => {
    const view = data(); view.pools[0].started = true;
    server.use(http.get(base, () => success(view))); show();
    expect(await screen.findByRole('combobox', { name: '1번 자리' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이 편성 참가팀 확정' })).toBeDisabled();
  });
  it('확정 실패의 실제 원인을 노출한다', async () => {
    server.use(http.get(base, () => success(data())), http.put(`${base}/assignment`, () => HttpResponse.json({ status: 'error', statusCode: 409, code: 'STAGE_PLAN_STALE', message: '공식 결과가 바뀌었어요.' }, { status: 409 }))); show();
    fireEvent.change(await screen.findByRole('combobox', { name: '1번 자리' }), { target: { value: 'r1' } });
    fireEvent.change(screen.getByRole('combobox', { name: '2번 자리' }), { target: { value: 'r2' } });
    fireEvent.click(screen.getByRole('button', { name: '이 편성 참가팀 확정' }));
    expect(await screen.findByText('공식 결과가 바뀌었어요.')).toBeInTheDocument();
    expect(screen.queryByText('참가팀을 확정했어요.')).not.toBeInTheDocument();
  });
});
