import { useV1AdminTournamentPlayers } from '@/hooks/use-v1-api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw/server';
import { v1Keys } from '@/lib/query-keys';
import type { V1AdminTournamentPlayer } from '@/types/api';
import { AdminPlayerSettingsEditor } from './admin-player-settings-editor';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const showToast = vi.fn();
let player: V1AdminTournamentPlayer;
let writes: unknown[];
let failure: boolean;
const success = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: new Date().toISOString() });

function Harness({ canWrite = true }: { canWrite?: boolean }) {
  const roster = useV1AdminTournamentPlayers('reg-1');
  if (!roster.data) return null;
  const current = roster.data.players[0];
  return <>
    <span aria-label="저장된 등번호">{current.jerseyNumber ?? '미지정'}</span>
    <AdminPlayerSettingsEditor registrationId="reg-1" player={current} canWrite={canWrite} showToast={showToast} />
  </>;
}

function mount(canWrite = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}><Harness canWrite={canWrite} /></QueryClientProvider>), client };
}

beforeEach(() => {
  writes = [];
  failure = false;
  showToast.mockClear();
  player = {
    id: 'p-1', nickname: '홍길동', jerseyNumber: 7, goalkeeper: false, userId: 'u-1', realName: '홍길동',
    birthDateSnapshot: null, genderSnapshot: null, eligibilityStatus: 'non_pro', eligibilityNote: null,
    addedAt: '2026-10-20T00:00:00Z', removedAt: null, phone: null, isTeamCaptain: false,
  };
  server.use(
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
    http.get('*/api/v1/admin/registrations/reg-1/players', () => success({
      registrationId: 'reg-1', teamId: 'team-1', teamName: '팀', rosterLockedAt: null, belowMinimum: false, players: [player],
    })),
    http.patch('*/api/v1/admin/registrations/reg-1/players/p-1/settings', async ({ request }) => {
      const payload = await request.json() as { jerseyNumber: number | null; goalkeeper: boolean };
      writes.push(payload);
      if (failure) return HttpResponse.json({ status: 'error', code: 'ROSTER_DUPLICATE_JERSEY_NUMBER', message: '0번은 이미 다른 선수가 달고 있어요.' }, { status: 409 });
      player = { ...player, ...payload };
      return success(player);
    }),
  );
});

describe('admin player settings with real hooks and HTTP contract', () => {
  it('hydrates existing values, saves number 0 and GK atomically, and refreshes the roster', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: '홍길동 선수 설정 수정' }));
    const number = screen.getByRole('textbox', { name: '홍길동 등번호' });
    expect(number).toHaveValue('7');
    await user.clear(number);
    await user.type(number, '0');
    await user.click(screen.getByRole('checkbox', { name: '홍길동 GK' }));
    expect(writes).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '홍길동 선수 설정 저장' }));
    await screen.findByRole('button', { name: '홍길동 선수 설정 수정' });
    expect(writes).toEqual([{ jerseyNumber: 0, goalkeeper: true }]);
    expect(screen.getByLabelText('저장된 등번호')).toHaveTextContent('0');
    expect(screen.getByText('GK(골키퍼)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '홍길동 선수 설정 수정' }));
    expect(screen.getByRole('textbox', { name: '홍길동 등번호' })).toHaveValue('0');
    expect(screen.getByRole('checkbox', { name: '홍길동 GK' })).toBeChecked();
  });

  it('preserves an untouched GK when the roster refreshes during a number edit', async () => {
    const user = userEvent.setup();
    const { client } = mount();
    await user.click(await screen.findByRole('button', { name: '홍길동 선수 설정 수정' }));
    const number = screen.getByRole('textbox', { name: '홍길동 등번호' });
    await user.clear(number);
    await user.type(number, '8');
    player = { ...player, goalkeeper: true };
    await act(async () => { await client.invalidateQueries({ queryKey: v1Keys.adminTournamentRoster('reg-1') }); });
    await user.click(screen.getByRole('button', { name: '홍길동 선수 설정 저장' }));
    await screen.findByRole('button', { name: '홍길동 선수 설정 수정' });
    expect(writes).toEqual([{ jerseyNumber: 8 }]);
    expect(player.goalkeeper).toBe(true);
  });

  it('clears both fields, while cancel discards the draft without a request', async () => {
    const user = userEvent.setup();
    player.goalkeeper = true;
    mount();
    await user.click(await screen.findByRole('button', { name: '홍길동 선수 설정 수정' }));
    await user.clear(screen.getByRole('textbox', { name: '홍길동 등번호' }));
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(writes).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '홍길동 선수 설정 수정' }));
    expect(screen.getByRole('textbox', { name: '홍길동 등번호' })).toHaveValue('7');
    await user.clear(screen.getByRole('textbox', { name: '홍길동 등번호' }));
    await user.click(screen.getByRole('checkbox', { name: '홍길동 GK' }));
    await user.click(screen.getByRole('button', { name: '홍길동 선수 설정 저장' }));
    await waitFor(() => expect(writes).toEqual([{ jerseyNumber: null, goalkeeper: false }]));
    await screen.findByText('필드 선수');
    expect(screen.getByLabelText('저장된 등번호')).toHaveTextContent('미지정');
  });

  it('preserves draft and reports a failed save, then permits retry', async () => {
    failure = true;
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: '홍길동 선수 설정 수정' }));
    const number = screen.getByRole('textbox', { name: '홍길동 등번호' });
    await user.clear(number);
    await user.type(number, '0');
    await user.click(screen.getByRole('button', { name: '홍길동 선수 설정 저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('0번은 이미 다른 선수가 달고 있어요.');
    expect(number).toHaveValue('0');
    expect(showToast).not.toHaveBeenCalled();
    expect(screen.getByLabelText('저장된 등번호')).toHaveTextContent('7');
    failure = false;
    await user.click(screen.getByRole('button', { name: '홍길동 선수 설정 저장' }));
    await screen.findByRole('button', { name: '홍길동 선수 설정 수정' });
    expect(screen.getByLabelText('저장된 등번호')).toHaveTextContent('0');
  });

  it('rejects invalid input locally and never exposes an edit action to read-only admins', async () => {
    const user = userEvent.setup();
    const view = mount();
    await user.click(await screen.findByRole('button', { name: '홍길동 선수 설정 수정' }));
    const number = screen.getByRole('textbox', { name: '홍길동 등번호' });
    await user.clear(number);
    await user.type(number, '100');
    await user.click(screen.getByRole('button', { name: '홍길동 선수 설정 저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent('0에서 99');
    expect(writes).toHaveLength(0);
    view.unmount();
    mount(false);
    await screen.findByText('필드 선수');
    expect(screen.queryByRole('button', { name: /설정 수정/ })).not.toBeInTheDocument();
  });
});
