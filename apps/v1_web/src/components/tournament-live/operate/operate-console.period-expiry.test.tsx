import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { transferableAbortController } from 'node:util';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentOpsRoleProvider } from '@/components/tournament-ops/role-context';
import { saveStoredV1Session } from '@/lib/session-storage';
import { v1Keys } from '@/lib/query-keys';
import { __resetOverlayHistoryForTests, waitForOverlayHistory } from '@/lib/overlay-history';
import { __resetNavigationHistoryForTests } from '@/lib/navigation-history';
import type { GameDetail } from '@/types/game-operations';
import { OperateConsole } from './operate-console';
import { createFixture } from './operate-console.period-expiry.fixtures';

const NOW = new Date('2026-10-16T00:01:00.000Z');
const server = setupServer();
let fixture: ReturnType<typeof createFixture>;
let queryClient: QueryClient;

// Keep the actual console, HTTP hooks, operation hook and clock. Only the
// transport is substituted, because no Socket.IO server runs in jsdom.
vi.mock('@/lib/v1-game-operations-socket', () => ({
  getV1GameOperationsSocket: () => fixture.socket,
  setGameOperationsAuthorizationSubjectVersion: () => {},
}));

function consoleTree(fixtureId = 'f-expiry') {
  return <QueryClientProvider client={queryClient}><TournamentOpsRoleProvider role="TOURNAMENT_DIRECTOR"><OperateConsole tournamentId="t-expiry" fixtureId={fixtureId} /></TournamentOpsRoleProvider></QueryClientProvider>;
}

async function openConsole(label = '정규 시간 종료') {
  const view = render(consoleTree());
  await waitFor(() => expect(screen.getByRole('button', { name: label })).toBeEnabled());
  return view;
}

async function tick(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

async function requestManualEnd(label = '정규 시간 종료') {
  const sentBefore = fixture.commands.length;
  fireEvent.click(screen.getByRole('button', { name: label }));
  const dialog = await screen.findByRole('dialog', { name: label === '경기 종료' ? '경기를 종료할까요?' : `${label}할까요?` });
  const confirmButton = within(dialog).getByRole('button', { name: label });
  expect(confirmButton).toBeEnabled();
  await act(async () => {
    fireEvent.click(confirmButton);
    await waitForOverlayHistory();
  });
  await waitFor(() => expect(fixture.commands).toHaveLength(sentBefore + 1), { timeout: 2_000 });
}

async function holdWorkerRead(beforeResponse?: () => void) {
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  fixture.endPeriod();
  const held = fixture.delayNextRead(beforeResponse);
  await tick(5_000);
  await held.started;
  return held;
}

async function releaseRead(held: { readonly release: () => void; readonly responded: Promise<void> }) {
  await act(async () => { held.release(); await held.responded; });
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  // MSW uses Node Request; keep its real abort implementation in the same realm.
  const nativeAbort = transferableAbortController();
  vi.stubGlobal('AbortController', nativeAbort.constructor);
  vi.stubGlobal('AbortSignal', nativeAbort.signal.constructor);
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost');
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW);
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  window.history.replaceState({}, '', '/');
  window.localStorage.clear();
  saveStoredV1Session({ userId: 'operator-expiry' });
  fixture = createFixture(server);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(async () => {
  cleanup();
  await waitForOverlayHistory();
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  queryClient.clear();
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('OperateConsole — 서버가 확정하는 기간 시간 만료', () => {
  it.each(['after-push', 'with-response'] as const)('%s 지연된 v6 하프타임 조회가 더 최신 v7 후반 시작 뒤에 도착해도 시계를 되감거나 조회를 멈추지 않아요', async (timing) => {
    fixture.halves();
    await openConsole('전반 종료');
    const held = await holdWorkerRead(timing === 'with-response' ? () => fixture.startNextPeriod() : undefined);
    if (timing === 'after-push') act(() => fixture.startNextPeriod());
    await releaseRead(held);
    expect(screen.queryAllByText('하프타임', { selector: 'span' })).toHaveLength(0);
    expect(screen.getByLabelText(/경과 시간/)).toBeInTheDocument();
    await tick(5_000);
    expect(await screen.findByLabelText('후반 경과 시간 00:05')).toBeInTheDocument();
    expect(queryClient.getQueryData<GameDetail>(v1Keys.game('game-expiry'))?.version).toBe(7);
    expect(fixture.commands).toEqual([]);
  });

  it.each(['pause', 'game-change', 'unmount'] as const)('%s 뒤의 지연된 만료 응답은 이전 경기 상세 캐시를 쓰거나 조회를 다시 시작하지 않아요', async (change) => {
    fixture.halves();
    const view = await openConsole('전반 종료');
    const held = await holdWorkerRead();
    if (change === 'pause') {
      act(() => fixture.pauseAfterRevert());
      await screen.findByRole('button', { name: '재개' });
    } else if (change === 'game-change') {
      view.rerender(consoleTree('f-other'));
      await screen.findByRole('button', { name: '정규 시간 종료' });
    } else {
      view.unmount();
    }
    await releaseRead(held);
    expect(queryClient.getQueryData<GameDetail>(v1Keys.game('game-expiry'))?.periods[0]?.state).toBe('LIVE');
    expect(screen.queryAllByText('하프타임', { selector: 'span' })).toHaveLength(0);
    if (change === 'pause') await waitFor(() => expect(queryClient.getQueryData<GameDetail>(v1Keys.game('game-expiry'))?.version).toBe(8));
    const readsAfterRecovery = fixture.reads;
    await tick(10_000);
    expect(fixture.reads).toBe(readsAfterRecovery);
    expect(fixture.commands).toEqual([]);
  });

  it('새 기간의 최신 상세 조회가 먼저 완료됐다면 이전 만료 응답이 그 기간을 덮지 않아요', async () => {
    fixture.halves();
    await openConsole('전반 종료');
    const held = await holdWorkerRead();
    act(() => fixture.startNextPeriod());
    await act(async () => { await queryClient.refetchQueries({ queryKey: v1Keys.game('game-expiry'), exact: true }, { cancelRefetch: true }); });
    expect(await screen.findByLabelText('후반 경과 시간 00:00')).toBeInTheDocument();
    await releaseRead(held);
    expect(screen.getByLabelText('후반 경과 시간 00:00')).toBeInTheDocument();
    expect(screen.queryAllByText('하프타임', { selector: 'span' })).toHaveLength(0);
    expect(queryClient.getQueryData<GameDetail>(v1Keys.game('game-expiry'))?.version).toBe(7);
    expect(fixture.commands).toEqual([]);
  });

  it('기존 metadata 조회가 최신 만료 확인 뒤에 도착해도 과거 하프타임을 확정하거나 재확인을 멈추지 않아요', async () => {
    fixture.halves();
    await openConsole('전반 종료');
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    fixture.endPeriod();
    const held = fixture.delayNextRead();
    const metadataRead = queryClient.refetchQueries({ queryKey: v1Keys.game('game-expiry'), exact: true });
    await held.started;
    act(() => fixture.startNextPeriod());
    try {
      await tick(5_000);
      expect(await screen.findByLabelText('후반 경과 시간 00:05')).toBeInTheDocument();
    } finally {
      await releaseRead(held);
      await act(async () => { await metadataRead; });
    }
    expect(screen.queryAllByText('하프타임', { selector: 'span' })).toHaveLength(0);
    expect(await screen.findByLabelText('후반 경과 시간 00:05')).toBeInTheDocument();
    expect(queryClient.getQueryData<GameDetail>(v1Keys.game('game-expiry'))?.version).toBe(7);
    expect(fixture.commands).toEqual([]);
  });

  it('만료 안내 중에도 기존 수동 기간 종료와 확인을 거쳐 서버 응답을 반영해요', async () => {
    await openConsole();
    expect(await screen.findByText(/설정된 시간이 끝났어요/)).toBeInTheDocument();
    expect(screen.getByText(/서버.*종료.*확인/)).toBeInTheDocument();
    expect(fixture.commands).toEqual([]);
    await requestManualEnd();
    expect(await screen.findByText('정규 시간이 끝났어요. 기록을 확인한 뒤 ‘경기 종료’를 눌러주세요.')).toBeInTheDocument();
    expect(fixture.commands.map(({ command }) => command)).toEqual(['end-period']);
    expect(screen.queryByLabelText(/경과 시간/)).toBeNull();
  });

  it('worker가 마지막 기간을 끝내면 화면이 갱신되고 결과 제출은 운영자에게 남겨요', async () => {
    await openConsole();
    fixture.endPeriod();
    await tick(5_000);
    expect(await screen.findByText('정규 시간이 끝났어요. 기록을 확인한 뒤 ‘경기 종료’를 눌러주세요.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/경과 시간/)).toBeNull();
    expect(screen.getByRole('button', { name: '경기 종료' })).toBeEnabled();
    expect(screen.queryByText('결과 확정')).toBeNull();
    expect(fixture.commands).toEqual([]);
    const readsAfterEnd = fixture.reads;
    await tick(15_000);
    expect(fixture.reads).toBe(readsAfterEnd);
    await requestManualEnd('경기 종료');
    expect(fixture.commands[0]?.body).toMatchObject({ expectedVersion: 6 });
    expect(fixture.commands.map(({ command }) => command)).toEqual(['end']);
    expect(await screen.findByRole('region', { name: '결과 확정' })).toBeInTheDocument();
    expect(queryClient.getQueryData<GameDetail>(v1Keys.game('game-expiry'))).toMatchObject({ state: 'ENDED', version: 7, currentOfficialRevisionId: null });
    expect(fixture.resultRevisions).toMatchObject([{ state: 'SUBMITTED', officialAt: null }]);
  });

  it('초기 소켓 구독 뒤 worker가 끝낸 최신 상세를 받으면 수동 종료도 그 버전으로 보내요', async () => {
    const held = fixture.delayNextRead(undefined, { captureAfterRelease: true });
    render(consoleTree());
    await waitFor(async () => { await held.started; await fixture.subscribed; });
    expect(await screen.findByLabelText(/경과 시간/)).toBeInTheDocument();
    expect(await screen.findByText(/설정된 시간이 끝났어요/)).toBeInTheDocument();
    // Keep the initial GET held while both recovery and expiry reads capture v5.
    await waitFor(() => fixture.waitForReads(3));
    fixture.endPeriod();
    await releaseRead(held);
    expect(await screen.findByText('정규 시간이 끝났어요. 기록을 확인한 뒤 ‘경기 종료’를 눌러주세요.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/경과 시간/)).toBeNull();
    expect(fixture.commands).toEqual([]);
    expect(fixture.resultRevisions).toEqual([]);
    await requestManualEnd('경기 종료');
    expect(fixture.commands[0]?.body).toMatchObject({ expectedVersion: 6 });
    expect(fixture.commands.map(({ command }) => command)).toEqual(['end']);
    expect(await screen.findByRole('region', { name: '결과 확정' })).toBeInTheDocument();
    expect(queryClient.getQueryData<GameDetail>(v1Keys.game('game-expiry'))).toMatchObject({ state: 'ENDED', version: 7, currentOfficialRevisionId: null });
    expect(fixture.resultRevisions).toMatchObject([{ state: 'SUBMITTED', officialAt: null }]);
  });

  it('열려 있는 일시정지 구간은 플레이 시간이나 만료 확인 요청을 늘리지 않아요', async () => {
    fixture.pause();
    render(consoleTree());
    expect(await screen.findByLabelText(/경과 시간 00:50/)).toBeInTheDocument();
    const initialReads = fixture.reads;
    await tick(15_000);
    expect(screen.queryByText(/설정된 시간이 끝났어요/)).toBeNull();
    expect(screen.getByLabelText(/경과 시간 00:50/)).toBeInTheDocument();
    expect(fixture.reads).toBe(initialReads);
    expect(fixture.commands).toEqual([]);
  });

  it('상태 조회 실패를 알리고 수동 재조회로 서버가 끝낸 기간을 복구해요', async () => {
    await openConsole();
    fixture.setReadError(true);
    await tick(5_000);
    expect(await screen.findByText(/서버 종료 상태를 읽지 못했어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '정규 시간 종료' })).toBeEnabled();
    fixture.setReadError(false);
    fixture.endPeriod();
    fireEvent.click(screen.getByRole('button', { name: '종료 상태 다시 확인' }));
    expect(await screen.findByText('정규 시간이 끝났어요. 기록을 확인한 뒤 ‘경기 종료’를 눌러주세요.')).toBeInTheDocument();
    expect(fixture.commands).toEqual([]);
  });

  it('수동 종료 응답이 실패하면 같은 요청 재시도로 확정할 때까지 성공을 표시하지 않아요', async () => {
    await openConsole();
    expect(await screen.findByText(/설정된 시간이 끝났어요/)).toBeInTheDocument();
    fixture.setCommandError(true);
    await requestManualEnd();
    const retry = await screen.findByRole('button', { name: '같은 요청 재시도' });
    expect(screen.getByText(/서버 응답을 받지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText('정규 시간이 끝났어요. 기록을 확인한 뒤 ‘경기 종료’를 눌러주세요.')).toBeNull();
    fixture.setCommandError(false);
    fireEvent.click(retry);
    expect(await screen.findByText('정규 시간이 끝났어요. 기록을 확인한 뒤 ‘경기 종료’를 눌러주세요.')).toBeInTheDocument();
    expect(fixture.commands.map(({ command }) => command)).toEqual(['end-period', 'end-period']);
    expect(fixture.commands[1]?.body).toEqual(fixture.commands[0]?.body);
  });
});
