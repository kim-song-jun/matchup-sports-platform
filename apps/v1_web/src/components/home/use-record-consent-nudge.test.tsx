import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Get, v1Put } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type { PublicUserRecordsResponse } from '@/components/public-game-records/types';
import { useRecordConsentNudge } from './use-record-consent-nudge';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Get: vi.fn(), v1Put: vi.fn() };
});

const v1GetMock = vi.mocked(v1Get);
const v1PutMock = vi.mocked(v1Put);

const USER = 'user-a';

function consentResponse(overrides: Record<string, unknown> = {}) {
  return { granted: false, effectiveAt: null, hasResponded: false, pendingRecordCount: 1, ...overrides };
}

function recordsResponse(): PublicUserRecordsResponse {
  const zero = { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, mvpCount: 0 };
  return {
    userId: USER,
    nickname: '골잡이',
    viewerIsOwner: true,
    consentGranted: false,
    summary: {
      appearances: 1, goals: 1, assists: 1, yellowCards: 0, redCards: 0, mvpCount: 0, matchMvpCount: 0, tournamentAwardCount: 0,
      byType: { league: { ...zero, appearances: 1, goals: 1, assists: 1 }, tournament: zero, friendly: zero },
    },
    tournamentAwards: [],
    items: [
      {
        id: 'record-1', gameId: 'game-1', teamMatchId: 'match-1', type: 'league', matchType: 'team_match', tournamentId: null,
        tournamentTitle: null, leagueId: 'league-1', leagueTitle: '마포 주말 리그', round: null, teamId: 'team-1', teamName: '마포 FC',
        opponentTeamId: 'team-2', opponentTeamName: '합정 유나이티드', result: 'WON', goals: 1, assists: 1, cards: { yellow: 0, red: 0 },
        minutesPlayed: 90, started: true, goalkeeper: false, mvp: false, officialAt: '2026-09-30T01:10:00.000Z',
      },
    ],
    nextCursor: null,
  };
}

/** 기본: 동의 응답 한 번(고정) + 내 기록 한 번. 테스트가 필요하면 함수로 바꿔 끼운다. */
function stubNetwork(options: { consent?: () => unknown; records?: () => Promise<unknown> } = {}) {
  v1GetMock.mockImplementation(async (path: string) => {
    if (path === '/me/record-consent') return (options.consent ?? (() => consentResponse()))() as never;
    if (path.startsWith('/users/') && path.endsWith('/records')) {
      return (options.records ? await options.records() : recordsResponse()) as never;
    }
    throw new Error(`예상하지 못한 요청: ${path}`);
  });
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** "안 뜬다"를 단언하기 전에 동의 응답이 캐시에 들어와 화면이 그 응답으로 다시 그려질 때까지 기다린다. */
async function untilConsentApplied(queryClient: QueryClient) {
  await waitFor(() => expect(queryClient.getQueryData(v1Keys.recordConsent())).toBeDefined());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function mount(props: { enabled?: boolean; userId?: string | null } = {}, queryClient = newClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return renderHook(
    () => useRecordConsentNudge({ enabled: props.enabled ?? true, userId: props.userId === undefined ? USER : props.userId }),
    { wrapper },
  );
}

describe('useRecordConsentNudge', () => {
  beforeEach(() => {
    window.localStorage.clear();
    stubNetwork();
  });
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('공개 대기 경기가 있으면 가장 최근 기록 한 줄과 함께 뜬다', async () => {
    const { result } = mount();

    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current).toMatchObject({
      pendingCount: 1,
      mentionsRanking: true,
      latestRecord: { matchup: '마포 FC vs 합정 유나이티드', result: 'WON', stats: '내 기록 · 1골 · 1도움' },
    });
    expect(result.current?.latestRecord?.caption).toBe('9/30 (수) · 마포 주말 리그');
  });

  it('넘기기 전에는 몇 번을 열어도(설정에 다녀와도) 소진되지 않는다', async () => {
    for (let visit = 0; visit < 4; visit += 1) {
      const { result, unmount } = mount();
      await waitFor(() => expect(result.current).toBeDefined());
      unmount();
    }
  });

  it('X 로 넘기면 같은 대기 경기 수에서는 다시 뜨지 않고, 새 대기 경기가 생기면 다시 뜬다', async () => {
    const first = mount();
    await waitFor(() => expect(first.result.current).toBeDefined());
    act(() => first.result.current?.onDismiss());
    expect(first.result.current).toBeUndefined();
    first.unmount();

    // 같은 수 -- 다시 열어도 안 뜬다. 뜨지 않음이 "아직 로딩 중"이 아님을 동의 응답이 반영된 뒤에 확인한다.
    const sameClient = newClient();
    const same = mount({}, sameClient);
    await untilConsentApplied(sameClient);
    expect(same.result.current).toBeUndefined();
    same.unmount();

    // 새 경기 한 판이 확정돼 2경기가 됐다.
    stubNetwork({ consent: () => consentResponse({ pendingRecordCount: 2 }) });
    const grown = mount();
    await waitFor(() => expect(grown.result.current).toMatchObject({ pendingCount: 2 }));
  });

  it('응답을 남긴 사람("공개 안 함"·공개)에게는 대기 경기가 있어도 뜨지 않는다', async () => {
    stubNetwork({ consent: () => consentResponse({ hasResponded: true, granted: false }) });
    const queryClient = newClient();
    const { result } = mount({}, queryClient);

    await untilConsentApplied(queryClient);
    // 대조: 같은 조건에서 hasResponded 만 false 이면 뜨는 것은 첫 테스트가 보여 준다.
    expect(result.current).toBeUndefined();
    expect(v1GetMock).not.toHaveBeenCalledWith(expect.stringContaining('/records'), expect.anything());
  });

  it('공개할 경기가 없으면 뜨지 않는다', async () => {
    stubNetwork({ consent: () => consentResponse({ pendingRecordCount: 0 }) });
    const queryClient = newClient();
    const { result } = mount({}, queryClient);

    await untilConsentApplied(queryClient);
    expect(result.current).toBeUndefined();
    expect(v1GetMock).not.toHaveBeenCalledWith(expect.stringContaining('/records'), expect.anything());
  });

  it('다른 계정이 넘긴 기록은 내 배너를 가리지 않는다', async () => {
    const other = mount({ userId: 'user-b' });
    await waitFor(() => expect(other.result.current).toBeDefined());
    act(() => other.result.current?.onDismiss());
    other.unmount();

    const mine = mount({ userId: USER });
    await waitFor(() => expect(mine.result.current).toBeDefined());
  });

  it('내 기록을 불러오는 동안에는 뜨지 않고, 불러오지 못하면 기록 한 줄 없이 뜬다', async () => {
    let reject!: (reason: Error) => void;
    stubNetwork({ records: () => new Promise((_, rej) => { reject = rej; }) });
    const { result } = mount();

    await waitFor(() => expect(v1GetMock).toHaveBeenCalledWith(expect.stringContaining('/records'), expect.anything()));
    expect(result.current).toBeUndefined();

    reject(new Error('network'));
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current?.latestRecord).toBeUndefined();
    expect(result.current?.mentionsRanking).toBe(false);
    expect(result.current?.pendingCount).toBe(1);
  });

  it('로그인·온보딩 전(enabled=false)이거나 계정을 모르면 기록을 조회하지도 않는다', async () => {
    const offClient = newClient();
    const off = mount({ enabled: false }, offClient);
    const anonymous = mount({ userId: null }, newClient());

    await untilConsentApplied(offClient);
    expect(off.result.current).toBeUndefined();
    expect(anonymous.result.current).toBeUndefined();
    expect(v1GetMock).not.toHaveBeenCalledWith(expect.stringContaining('/records'), expect.anything());
  });

  it('공개하기는 고정 정책 해시로 granted:true 를 저장한다', async () => {
    v1PutMock.mockResolvedValue(consentResponse({ granted: true, hasResponded: true, pendingRecordCount: 0 }) as never);
    const { result } = mount();
    await waitFor(() => expect(result.current).toBeDefined());

    act(() => result.current?.onGrant());

    await waitFor(() =>
      expect(v1PutMock).toHaveBeenCalledWith('/me/record-consent', { granted: true, policyHash: 'v1-public-record-consent-1' }),
    );
    // 저장 응답이 캐시에 반영되면 배너는 스스로 사라진다.
    await waitFor(() => expect(result.current).toBeUndefined());
  });
});
