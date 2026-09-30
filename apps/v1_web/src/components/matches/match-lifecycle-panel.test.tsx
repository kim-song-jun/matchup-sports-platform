import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { getV1ApiBaseUrl, v1Get } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import { MatchLifecyclePanel } from './match-lifecycle-panel';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
const server = setupServer(http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: null })));
const api = getV1ApiBaseUrl();
let status = 'on_hold';
const lifecycle = { canEdit: true, canDelete: false, canConfirmProceed: true, onHoldReason: 'UNDER_CAPACITY' as const };
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: new Date().toISOString() });

function Preview({ canDelete = false }: { canDelete?: boolean }) {
  const query = useQuery({ queryKey: v1Keys.match('test'), queryFn: () => v1Get<{ status: string }>('/matches/test') });
  return query.data ? <MatchLifecyclePanel id="test" domain="matches" status={query.data.status} lifecycle={{ ...lifecycle, canDelete, canConfirmProceed: query.data.status === 'on_hold' }} canManage current={3} capacity={10} /> : null;
}
function mount(element = <Preview />) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{element}</QueryClientProvider>);
}
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => { cleanup(); server.resetHandlers(); vi.clearAllMocks(); });
beforeEach(() => {
  status = 'on_hold';
  server.use(http.get(`${api}/matches/test`, () => ok({ status })));
});

describe('match lifecycle actions', () => {
  it('requires explicit confirmation and then displays server-confirmed status after refetch', async () => {
    server.use(http.post(`${api}/matches/test/confirm-proceed`, () => { status = 'scheduled'; return ok({ status }); }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: '현재 인원으로 진행' }));
    expect(status).toBe('on_hold');
    expect(screen.getByText('현재 3/10명으로 진행할까요? 확정 참가자에게 알려요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByRole('heading', { name: '진행 확정' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '현재 인원으로 진행' })).not.toBeInTheDocument();
  });

  it('server rejection keeps the match on hold and exposes the failure', async () => {
    server.use(http.post(`${api}/matches/test/confirm-proceed`, () => HttpResponse.json({ status: 'error', statusCode: 409, code: 'STATE_CONFLICT', message: '확정 참가자가 없어 진행할 수 없어요.' }, { status: 409 })));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: '현재 인원으로 진행' }));
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('확정 참가자가 없어 진행할 수 없어요.');
    expect(screen.getByRole('heading', { name: '보류 · 진행 결정 대기' })).toBeInTheDocument();
  });

  it('no-participant and guest surfaces never expose proceeding', () => {
    mount(<MatchLifecyclePanel id="test" domain="matches" status="on_hold" lifecycle={{ ...lifecycle, canConfirmProceed: false, onHoldReason: 'NO_PARTICIPANTS' }} canManage={false} current={1} capacity={10} />);
    expect(screen.getByText(/주최자 외 확정 참가자가 없어/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('deletion waits for server success before navigating to the list', async () => {
    let deleted = false;
    let reads = 0;
    server.use(
      http.get(`${api}/matches/test`, () => { reads++; return deleted ? HttpResponse.json({ statusCode: 404, code: 'NOT_FOUND_OR_ARCHIVED', message: '삭제된 매치' }, { status: 404 }) : ok({ status }); }),
      http.delete(`${api}/matches/test`, () => { deleted = true; return ok({ deleted: true }); }),
    );
    mount(<Preview canDelete />);
    fireEvent.click(await screen.findByRole('button', { name: '매치 삭제' }));
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/matches'));
    expect(deleted).toBe(true);
    expect(reads).toBe(1);
  });
});
