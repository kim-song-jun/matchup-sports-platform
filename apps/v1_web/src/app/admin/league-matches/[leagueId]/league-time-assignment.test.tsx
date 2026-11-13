import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeagueTimeAssignment } from './league-time-assignment';
import { RegisteredFixtureTimePicker } from '@/components/admin/bracket-canvas/fixture-time-picker';
import type { V1LeagueFixture } from '@/types/league-match';
import { useState } from 'react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), replace: vi.fn() }) }));
const viewport = vi.hoisted(() => ({ wide: true }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => viewport.wide }));
const stamp = '2026-11-21T01:00:00.000Z';
let items: { id: string; scheduledAt: string }[];
let fixture: V1LeagueFixture;
let patches: unknown[];
let fail: boolean;
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data });
const server = setupServer(
  http.post('*/api/v1/logs/client-error', () => ok({})),
  http.get('*/api/v1/admin/league-matches/l1/schedule-times', () => ok({ items })),
  http.post('*/api/v1/admin/league-matches/l1/schedule-times', async ({ request }) => {
    const input = await request.json() as { scheduledAt: string };
    const item = { id: 'new', ...input }; items.push(item); return ok({ item });
  }),
  http.patch('*/api/v1/admin/league-matches/l1/fixtures/f1', async ({ request }) => {
    const body = await request.json() as { startsAt: string }; patches.push(body);
    if (fail) return HttpResponse.json({ status: 'error', statusCode: 409, code: 'CONFLICT', message: '일정을 다시 확인해 주세요.' }, { status: 409 });
    fixture = { ...fixture, startAt: body.startsAt }; return ok({ teamMatchId: 'f1' });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => { cleanup(); server.resetHandlers(); });
beforeEach(() => {
  viewport.wide = true;
  items = [{ id: 'preset', scheduledAt: stamp }]; patches = []; fail = false;
  fixture = { teamMatchId: 'f1', title: '개막전', startAt: '2026-11-20T01:00:00.000Z', placeName: 'A구장', fieldId: 'court1', homeTeamId: 'home', awayTeamId: 'away', status: 'matched' };
});
function show(canWrite = true, refreshFail = false, additional: V1LeagueFixture[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Page() {
    const [fixtures, setFixtures] = useState([fixture, ...additional]);
    return <LeagueTimeAssignment leagueId="l1" fixtures={fixtures} canWrite={canWrite} fixtureName={f => f.title}
      refresh={async () => { setFixtures([fixture]); return { isError: refreshFail }; }} showToast={vi.fn()} />;
  }
  render(<QueryClientProvider client={client}><Page /></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: '시간 배정' }));
}
describe('league time assignment through the league API', () => {
  it('registers a KST time and moves a game using only startsAt, preserving court and teams', async () => {
    show();
    const input = await screen.findByLabelText('시간 추가 (한국 시간)');
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: '2026-11-22T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    await waitFor(() => expect(items).toHaveLength(2));
    expect(items[1].scheduledAt).toBe('2026-11-22T01:00:00.000Z');
    await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(3));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'f1' } });
    await waitFor(() => expect(patches).toEqual([{ startsAt: stamp }]));
    expect(fixture).toMatchObject({ startAt: stamp, fieldId: 'court1', placeName: 'A구장', homeTeamId: 'home', awayTeamId: 'away' });
    await waitFor(() => expect(screen.getByText('개막전 · A구장')).toBeInTheDocument());
  });
  it('keeps the original schedule and displays a server failure', async () => {
    fail = true; show();
    await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(2));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'f1' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('일정을 다시 확인해 주세요.');
    expect(fixture.startAt).toBe('2026-11-20T01:00:00.000Z');
  });
  it('exposes only read access for support', async () => {
    show(false);
    expect(await screen.findByText('개막전 · A구장')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('시간 추가 (한국 시간)')).not.toBeInTheDocument();
  });
  it('hides the selection controls when a time is collapsed and retains the count', async () => {
    show();
    await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(2));
    const summary = screen.getByText(/1경기/, { selector: 'summary' });
    fireEvent.click(summary);
    expect(summary.closest('details')).not.toHaveAttribute('open');
    expect(screen.queryByText('개막전 · A구장')).not.toBeInTheDocument();
    expect(summary).toHaveTextContent('1경기');
    fireEvent.click(summary);
    expect(screen.getByText('개막전 · A구장')).toBeInTheDocument();
  });
  it('reports saved-but-refresh-failed separately from a rejected save', async () => {
    show(true, true);
    await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(2));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'f1' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('배정은 저장됐지만 최신 대진을 불러오지 못했어요.');
    expect(fixture.startAt).toBe(stamp);
  });
  it('uses the shared bottom sheet below the desktop breakpoint', async () => {
    viewport.wide = false;
    show();
    const dialog = await screen.findByRole('dialog', { name: '시간 배정' });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector('.tm-filter-sheet-handle')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '시간 배정 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it.each([false, true])('warns only for actual courts, not unset placeholders (actual court: %s)', async actualCourt => {
    if (!actualCourt) fixture = { ...fixture, fieldId: null, placeName: '장소 미정' };
    show(true, false, [{ ...fixture, teamMatchId: 'f2', title: '두번째 경기' }]);
    await screen.findByText('두번째 경기 · ' + fixture.placeName);
    const warning = screen.queryByText('같은 시간·구장에 여러 경기가 있어요. 일정을 확인해 주세요.');
    if (actualCourt) expect(warning).toBeInTheDocument();
    else expect(warning).not.toBeInTheDocument();
  });
  it('uses league presets in the shared selector without offering an unset start time', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onChange = vi.fn();
    render(<QueryClientProvider client={client}><RegisteredFixtureTimePicker tournamentId="l1" surface="league-matches" allowUnset={false}
      fixtures={[{ scheduledAt: fixture.startAt }]} value="2026-11-20T10:00" onChange={onChange} disabled={false} /></QueryClientProvider>);
    const select = screen.getByLabelText('등록된 시간에서 선택');
    await waitFor(() => expect(select).toBeEnabled());
    expect(screen.getByRole('option', { name: '등록된 시간을 선택해 주세요' })).toBeDisabled();
    fireEvent.change(select, { target: { value: stamp } });
    expect(onChange).toHaveBeenCalledWith('2026-11-21T10:00');
  });
});
