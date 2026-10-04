import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { TeamMatchDetailPageView } from './team-matches-page';
import { getTeamMatchDetailViewModel } from './team-matches.view-model';
import type { TeamMatchDetailViewModel } from './team-matches.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/team-matches/hero-message-fixture',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const SHARED = '링크를 복사했어요';
const FAILED = '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
const APPLIED = '신청을 완료했어요.';
const queryClients: QueryClient[] = [];
const heroTimeoutIds = new Set<number>();
const scheduledHeroTimeoutIds: number[] = [];

type HeroAction = () => void | Promise<unknown>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

// 실제 view/model을 사용하고 액션의 외부 성공·실패 결과만 주입한다.
// Query 캐시 GC는 timer 관측에서 제외한다. HTTP/API·CSS·브라우저 검증은 아니다.
function renderDetail(action: HeroAction = () => undefined, extra: Partial<TeamMatchDetailViewModel> = {}) {
  const base = getTeamMatchDetailViewModel('default');
  const model: TeamMatchDetailViewModel = {
    ...base,
    ...extra,
    onShare: action,
    match: {
      ...base.match,
      id: 'hero-message-fixture',
      title: '합성 안내 수명 팀매치',
      hostTeam: '합성 홈팀',
      imageUrl: null,
      listImageUrl: null,
      applicantTeams: [],
    },
  };
  const queryClient = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity },
    mutations: { gcTime: Infinity },
  } });
  queryClients.push(queryClient);
  return render(<QueryClientProvider client={queryClient}><TeamMatchDetailPageView model={model} /></QueryClientProvider>);
}

async function share() {
  // 모바일/desktop 버튼이 jsdom에서는 함께 존재한다. 같은 실제 handler의 첫 버튼을 누른다.
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: '공유' })[0]!);
  });
}

async function advance(milliseconds: number) {
  await act(async () => {
    vi.advanceTimersByTime(milliseconds);
  });
}

function picker(submit: NonNullable<TeamMatchDetailViewModel['applyTeamPicker']>['submit']) {
  return {
    defaultTeamId: 'timer-applicant',
    teams: [{ teamId: 'timer-applicant', name: '합성 신청팀', roleLabel: '팀장', eligible: true, reason: null }],
    submit,
  };
}

async function submitFromActualPicker() {
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: '신청하기' })[0]!);
  });
  const sheet = screen.getByRole('dialog', { name: '어느 팀으로 신청할까요?' });
  expect(within(sheet).getByRole('radio', { name: /합성 신청팀/ })).toBeChecked();
  await act(async () => {
    fireEvent.click(within(sheet).getByRole('button', { name: '합성 신청팀으로 신청하기' }));
  });
}

beforeEach(() => {
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  window.history.replaceState(null, '', '/team-matches/hero-message-fixture');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  heroTimeoutIds.clear();
  scheduledHeroTimeoutIds.length = 0;
  // 테스트의 전역 window는 Node overload도 교차한다. 실제 DOM timer 계약으로 좁힌다.
  const browserWindow: Window = window;
  const setTimeout = browserWindow.setTimeout.bind(browserWindow);
  const clearTimeout = browserWindow.clearTimeout.bind(browserWindow);
  // 실제 fake timer를 그대로 실행한다. 안내 TTL(2000ms)만 관측하여 React/native,
  // 시트 focus/history, chat notice 등의 별도 timer를 cleanup 증거에 섞지 않는다.
  vi.spyOn(browserWindow, 'setTimeout').mockImplementation((handler, timeout, ...args) => {
    if (timeout !== 2000 || typeof handler !== 'function') return setTimeout(handler, timeout, ...args);
    let timeoutId = 0;
    timeoutId = setTimeout((...callbackArgs: unknown[]) => {
      heroTimeoutIds.delete(timeoutId);
      handler.apply(window, callbackArgs);
    }, timeout, ...args);
    heroTimeoutIds.add(timeoutId);
    scheduledHeroTimeoutIds.push(timeoutId);
    return timeoutId;
  });
  vi.spyOn(browserWindow, 'clearTimeout').mockImplementation((timeoutId) => {
    if (timeoutId !== undefined) heroTimeoutIds.delete(timeoutId);
    clearTimeout(timeoutId);
  });
});

afterEach(() => {
  cleanup();
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  for (const queryClient of queryClients.splice(0)) queryClient.clear();
  // RED에서 남은 timer도 환경 teardown까지 넘기지 않는다. 아래 cleanup 단언과 별개다.
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('TeamMatchDetailPageView — hero 안내 TTL과 unmount', () => {
  it.each([
    ['성공', () => Promise.resolve(), SHARED],
    ['실패', () => Promise.reject(new Error('합성 공유 실패')), FAILED],
  ] as const)('%s 안내는 전체 2초 뒤에 사라진다', async (_name, action, expected) => {
    renderDetail(action);
    await share();
    expect(screen.getByRole('status')).toHaveTextContent(expected);
    expect(heroTimeoutIds.size).toBe(1);
    expect(scheduledHeroTimeoutIds).toHaveLength(1);
    await advance(1999);
    expect(screen.getByRole('status')).toHaveTextContent(expected);
    await advance(1);
    expect(screen.queryByText(expected)).not.toBeInTheDocument();
    expect(heroTimeoutIds.size).toBe(0);
  });

  it.each([
    ['성공 → 성공', false, false, SHARED],
    ['성공 → 실패', false, true, FAILED],
    ['실패 → 성공', true, false, SHARED],
  ] as const)('%s 연속 안내에서 이전 timer가 최신 안내를 일찍 지우지 않는다', async (_name, firstFails, secondFails, expected) => {
    const action = vi.fn<HeroAction>()
      .mockImplementationOnce(() => firstFails ? Promise.reject(new Error('첫 실패')) : Promise.resolve())
      .mockImplementationOnce(() => secondFails ? Promise.reject(new Error('둘째 실패')) : Promise.resolve());
    renderDetail(action);
    await share();
    await advance(1500);
    await share();
    expect(action).toHaveBeenCalledTimes(2);
    expect(scheduledHeroTimeoutIds).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent(expected);
    await advance(500); // 이전 안내의 만료 시각. 최신 안내에는 1500ms가 남는다.
    expect(screen.getByRole('status')).toHaveTextContent(expected);
    await advance(1499);
    expect(screen.getByRole('status')).toHaveTextContent(expected);
    await advance(1);
    expect(screen.queryByText(expected)).not.toBeInTheDocument();
    expect(heroTimeoutIds.size).toBe(0);
  });

  it.each([
    ['성공', () => Promise.resolve(), SHARED],
    ['실패', () => Promise.reject(new Error('합성 실패')), FAILED],
  ] as const)('%s 안내가 보인 채 unmount하면 실제 timer를 취소한다', async (_name, action, expected) => {
    const view = renderDetail(action);
    await share();
    expect(screen.getByRole('status')).toHaveTextContent(expected);
    expect(heroTimeoutIds.size).toBe(1);
    view.unmount();
    expect(heroTimeoutIds.size).toBe(0);
    await advance(2000);
    expect(screen.queryByText(expected)).not.toBeInTheDocument();
  });

  it.each(['resolve', 'reject'] as const)('action이 unmount 뒤 %s되어도 안내 timer를 새로 예약하지 않는다', async (outcome) => {
    const pending = deferred<unknown>();
    const action = vi.fn(() => pending.promise);
    const view = renderDetail(action);
    await share();
    expect(action).toHaveBeenCalledTimes(1);
    expect(heroTimeoutIds.size).toBe(0);
    expect(scheduledHeroTimeoutIds).toHaveLength(0);
    view.unmount();
    await act(async () => {
      if (outcome === 'resolve') pending.resolve(undefined);
      else pending.reject(new Error('이동 뒤 합성 실패'));
    });
    expect(heroTimeoutIds.size).toBe(0);
    expect(scheduledHeroTimeoutIds).toHaveLength(0);
    expect(screen.queryByText(SHARED)).not.toBeInTheDocument();
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
  });

  it('실제 팀 선택 신청 성공의 안내도 unmount에서 timer를 취소한다', async () => {
    const submit = vi.fn(async () => ({ status: 'requested' }));
    const view = renderDetail(undefined, { applyLabel: '신청하기', applyTeamPicker: picker(submit) });
    await submitFromActualPicker();
    expect(submit).toHaveBeenCalledWith('timer-applicant', null);
    expect(screen.queryByRole('dialog', { name: '어느 팀으로 신청할까요?' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(APPLIED);
    expect(heroTimeoutIds.size).toBe(1);
    view.unmount();
    expect(heroTimeoutIds.size).toBe(0);
  });

  it('팀 선택 신청이 unmount 뒤 완료되어도 부모 안내 timer를 만들지 않는다', async () => {
    const pending = deferred<unknown>();
    const submit = vi.fn(() => pending.promise);
    const view = renderDetail(undefined, { applyLabel: '신청하기', applyTeamPicker: picker(submit) });
    await submitFromActualPicker();
    expect(submit).toHaveBeenCalledWith('timer-applicant', null);
    view.unmount();
    expect(heroTimeoutIds.size).toBe(0);
    expect(scheduledHeroTimeoutIds).toHaveLength(0);
    await act(async () => pending.resolve({ status: 'requested' }));
    expect(heroTimeoutIds.size).toBe(0);
    expect(scheduledHeroTimeoutIds).toHaveLength(0);
    expect(screen.queryByText(APPLIED)).not.toBeInTheDocument();
  });

  it('신청 결과가 없는 이동 액션에는 성공 안내와 timer를 만들지 않는다', async () => {
    const onApply = vi.fn(async () => undefined);
    renderDetail(undefined, { applyLabel: '합성 로그인 이동', onApply });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: '합성 로그인 이동' })[0]!);
    });
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(APPLIED)).not.toBeInTheDocument();
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
    expect(heroTimeoutIds.size).toBe(0);
    expect(scheduledHeroTimeoutIds).toHaveLength(0);
  });
});
