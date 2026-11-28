import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBracket, makeFixture, makeGroup, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import { installViewport } from '@/test/viewport';
import type { V1Tournament } from '@/types/api';
import { BracketToolsBar } from './bracket-tools-bar';
import { useBracketTools } from './use-bracket-tools';
import { useBracketViewControls } from './use-bracket-view-controls';

// 도구 줄·훅·api-client 는 진짜이고 네트워크만 MSW 다 — 메뉴 항목이 진행 중에 실제로 눌리지 않는지 본다.
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/tournaments/t-1/bracket', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminBracket: () => ({ data: bracketData, isPending: false, isError: false, error: null, refetch: vi.fn() }),
  useV1PublishTournamentBracket: () => ({ mutate: vi.fn(), isPending: false }),
  useV1UnpublishTournamentBracket: () => ({ mutate: vi.fn(), isPending: false }),
}));

const bracketData = makeBracket({
  groups: [makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter', sortOrder: 0 })],
  slots: [makeSlot({ id: 's1', label: '1번 자리' }), makeSlot({ id: 's2', label: '2번 자리' })],
  fixtures: [makeFixture({ id: 'q1', groupId: 'g-qf', fixtureNumber: 1, homeSlotId: 's1', awaySlotId: 's2' })],
});
const registrations = [makeRegistration({ id: 'r1', teamName: '서울FC' }), makeRegistration({ id: 'r2', teamName: '부산FC' })];
const registrationsState = { status: 'success', truncated: false, refetchFailed: false, error: null, onRetry: vi.fn() } as const;
const tournament = { id: 't-1', format: 'knockout', kind: 'regular_tournament', status: 'open', registrationDeadlineAt: null, bracketPublishedAt: null, bracketPublishScheduledAt: null, stagePlan: null } as unknown as V1Tournament;

let randomFillPosts = 0;
let resetPreviewGate: Promise<void> | null = null;
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: '2026-11-27T00:00:00Z' });
const server = setupServer(
  http.post('*/api/v1/logs/client-error', () => ok(null)),
  http.post('*/api/v1/admin/tournaments/:id/slots/random-fill', async () => {
    randomFillPosts += 1;
    await delay(150);
    return ok({ assignments: [{ slotId: 's1', registrationId: 'r1' }] });
  }),
  http.get('*/api/v1/admin/tournaments/:id/bracket/reset-preview', async () => {
    await resetPreviewGate;
    return ok({ snapshot: 'snap', fixtureCount: 1, groupCount: 1, canReset: true, blockedReason: null, stageBased: false, preservesPreliminaryGroups: false });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

let restore: (() => void) | null = null;
beforeEach(() => { randomFillPosts = 0; resetPreviewGate = null; restore = installViewport(1440); });
afterEach(() => { cleanup(); server.resetHandlers(); restore?.(); });

function Tools({ showToast }: { showToast: (message: string, variant?: 'success' | 'error') => void }) {
  const controls = useBracketViewControls();
  const tools = useBracketTools({ tournamentId: 't-1', tournament, registrations, registrationsState, canWrite: true, role: 'PLATFORM_OPS', showToast, controls, view: 'canvas', onAssignmentModeChange: vi.fn() });
  return <BracketToolsBar tools={tools} tournament={tournament} tournamentId="t-1" canWrite view="canvas" onViewChange={vi.fn()} controls={controls} showToast={showToast} />;
}
function show() {
  const showToast = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><Tools showToast={showToast} /></QueryClientProvider>);
  return showToast;
}
const openMenu = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('도구 줄 메뉴 — 진행 중에는 다시 눌리지 않는다', () => {
  it('빈 자리 무작위 채우기를 연달아 두 번 눌러도 요청은 한 번이고, 진행 중에는 항목이 이유와 함께 막힌다', async () => {
    const showToast = show();
    openMenu('팀 채우기');
    fireEvent.click(screen.getByRole('menuitem', { name: /빈 자리 무작위 채우기/ }));
    await waitFor(() => expect(randomFillPosts).toBe(1));

    openMenu('팀 채우기');
    const again = await screen.findByRole('menuitem', { name: /빈 자리 무작위 채우기/ });
    expect(again).toBeDisabled();
    expect(again).toHaveTextContent('채우는 중이에요.');
    fireEvent.click(again);

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('1개 자리를 채웠어요.', 'success'));
    expect(randomFillPosts).toBe(1);
  });

  it('끝나면 항목이 다시 열린다(대조군)', async () => {
    const showToast = show();
    openMenu('팀 채우기');
    fireEvent.click(screen.getByRole('menuitem', { name: /빈 자리 무작위 채우기/ }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('1개 자리를 채웠어요.', 'success'));
    openMenu('팀 채우기');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: /빈 자리 무작위 채우기/ })).toBeEnabled());
  });

  it('대진 초기화를 준비하는 동안에는 「대진 초기화」 항목이 막히고, 확인 창이 뜨면 다시 열린다', async () => {
    let release = () => {};
    resetPreviewGate = new Promise<void>((resolve) => { release = resolve; });
    show();
    openMenu('경기');
    fireEvent.click(screen.getByRole('menuitem', { name: /대진 초기화/ }));
    openMenu('경기');
    const reset = await screen.findByRole('menuitem', { name: /대진 초기화/ });
    expect(reset).toBeDisabled();
    expect(reset).toHaveTextContent('다른 작업이 끝나면 누를 수 있어요.');
    openMenu('경기');
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    release();
    const dialog = await screen.findByRole('dialog', { name: '대진 초기화' });
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    openMenu('경기');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: /대진 초기화/ })).toBeEnabled());
  });
});
