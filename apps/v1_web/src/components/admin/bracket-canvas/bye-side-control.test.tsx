import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeFixture, makeGame, makeSlot } from '@/test/bracket-canvas-fixtures';
import { ByeSideControl } from './bye-side-control';

const server = setupServer(http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: {} })));
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => server.close());
const slot = makeSlot({ id: 'bye-2', kind: 'BYE', byeSortOrder: 2 });
const fixture = makeFixture({ id: 'q2', groupId: 'quarter', fixtureNumber: 6, homeSlotId: slot.id, game: makeGame(),
  bracketSources: [{ fixtureId: 'r2', side: 'AWAY', outcome: 'WINNER' }] });
function show(overrides: Partial<React.ComponentProps<typeof ByeSideControl>> = {}) {
  const props = { tournamentId: 't-1', fixture, slots: [slot], canWrite: true, showToast: vi.fn(), onSaved: vi.fn(), ...overrides };
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ByeSideControl {...props} /></QueryClientProvider>);
  return props;
}

describe('부전승 홈·어웨이 저장', () => {
  it('API에 원하는 위치와 현재 위치를 보내고 저장 성공 후 알린다', async () => {
    let payload: unknown;
    server.use(http.put('*/api/v1/admin/tournament-slots/bye-2/bye-side', async ({ request }) => {
      payload = await request.json();
      return HttpResponse.json({ status: 'success', data: { side: 'AWAY', sortOrder: 3, affectedTeamMatchIds: ['q2'] } });
    }));
    const props = show();
    fireEvent.change(screen.getByLabelText('부전승 위치'), { target: { value: 'AWAY' } });
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
    expect(payload).toEqual({ side: 'AWAY', expectedSide: 'HOME' });
    expect(props.showToast).toHaveBeenCalledWith(expect.any(String), 'success');
  });
  it('409이면 기존 위치를 유지하고 서버 원인을 표시한다', async () => {
    server.use(http.put('*/api/v1/admin/tournament-slots/bye-2/bye-side', () => HttpResponse.json(
      { status: 'error', statusCode: 409, code: 'SLOT_LOCKED', message: '후속 경기가 시작됐어요.' }, { status: 409 })));
    const props = show();
    fireEvent.change(screen.getByLabelText('부전승 위치'), { target: { value: 'AWAY' } });
    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith(expect.any(String), 'error'));
    expect(screen.getByLabelText('부전승 위치')).toHaveValue('HOME');
    expect(props.onSaved).not.toHaveBeenCalled();
  });
  it.each([false, true])('읽기 전용 또는 진행 중 경기는 선택을 막는다 (%s)', (started) => {
    show({ canWrite: started, fixture: { ...fixture, game: makeGame({ state: started ? 'LIVE' : 'SCHEDULED' }) } });
    expect(screen.getByLabelText('부전승 위치')).toBeDisabled();
  });
});
