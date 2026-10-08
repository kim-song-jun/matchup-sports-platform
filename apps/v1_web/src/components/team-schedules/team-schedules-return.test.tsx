import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredV1Session } from '@/lib/session-storage';
import { v1Keys } from '@/lib/query-keys';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import type { V1TeamDetail, V1TeamScheduleDetail } from '@/types/api';
import { TeamScheduleDetailPageClient, TeamScheduleListPageClient } from './team-schedules-client';

// 라우터·Link 경계만 대체한다. 목록/상세/카드/뒤로가기/API/query는 실제 구현이다.
const navigation = vi.hoisted((): {
  path: string; reportedQuery: string | null; actions: Array<'push' | 'replace' | 'back'>;
  navigate: (path: string, replace?: boolean) => void; back: () => void; publish: () => void;
} => ({
  path: '', actions: [],
  reportedQuery: null,
  navigate: (_path: string, _replace = false) => {},
  back: () => {}, publish: () => {},
}));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.path.split('?')[0],
  useSearchParams: () => new URLSearchParams(navigation.reportedQuery ?? navigation.path.split('?')[1]),
  useRouter: () => ({
    push: (path: string) => { navigation.actions.push('push'); navigation.navigate(path); },
    replace: (path: string) => { navigation.actions.push('replace'); navigation.navigate(path, true); },
    back: () => { navigation.actions.push('back'); navigation.back(); }, prefetch: vi.fn(),
  }),
}));
vi.mock('next/link', () => ({
  default: ({ href, onClick, prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => (
    <a {...props} href={href} onClick={(event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented && href) { event.preventDefault(); navigation.navigate(href); }
    }} />
  ),
}));

const TEAM_ID = 'schedule-return-team';
const LIST = `/teams/${TEAM_ID}/schedules`;
const team: V1TeamDetail = {
  teamId: TEAM_ID, name: '합성 복귀 팀', status: 'active', visibility: 'public',
  sport: { sportId: 'sport-futsal', name: '풋살' }, region: { regionId: 'region-seoul', name: '서울', parentName: null },
  joinPolicy: 'approval_required', membersVisibilityEnabled: true, canViewMembers: true,
  profile: { logoUrl: null, coverImageUrl: null, introduction: '', activityAreaText: null,
    activityDays: [], activityFrequency: null, activityTimeSlots: [], activityTypes: [], activityMemo: null,
    activitySummary: null, skillLevelText: null, genderRule: '성별 무관', joinPolicy: 'approval_required', memberGoalCount: 20 },
  owner: { userId: 'fixture-owner', displayName: '합성 팀장', profileImageUrl: null },
  membersPreview: [], memberCount: 7, managerCount: 1, trust: { trustState: 'sample', score: null },
  viewer: { role: 'member', membershipId: 'fixture-member', joinState: 'active', canRequestJoin: false, disabledReason: null, manageRoute: null },
};
function schedule(id: string, title: string, startAt: string, overrides: Partial<V1TeamScheduleDetail> = {}): V1TeamScheduleDetail {
  return { id, title, type: 'TRAINING', startAt, endAt: new Date(new Date(startAt).getTime() + 3_600_000).toISOString(),
    timezone: 'Asia/Seoul', capacity: null, rsvpDeadlineAt: null, visibility: 'TEAM', state: 'SCHEDULED', version: 1,
    teamMatchId: null, linkedMatch: null, matchConfirmed: null, goingCount: 0, waitlistedCount: 0,
    cancelReason: null, cancelledAt: null, guestRecruitment: null, myAttendance: null, attendees: null, ...overrides };
}
const schedules = [
  schedule('oct-training', '10월 훈련', '2026-10-10T01:00:00Z'),
  schedule('nov-training', '11월 훈련', '2026-11-10T01:00:00Z'),
  schedule('oct-cancelled', '취소된 훈련', '2026-10-11T01:00:00Z', { state: 'CANCELLED' }),
  schedule('oct-event', '팀 행사', '2026-10-12T01:00:00Z', { type: 'EVENT' }),
];
const requests: URL[] = [];
let failList = false;
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: '2026-10-08T03:00:00Z' });
const server = setupServer(
  http.get('*/api/v1/teams/:teamId', () => ok(team)),
  http.get('*/api/v1/teams/:teamId/schedules', ({ request }) => {
    const url = new URL(request.url); requests.push(url);
    if (failList) return HttpResponse.json({ status: 'error', statusCode: 503, code: 'SERVICE_UNAVAILABLE', message: '일정 조회를 다시 시도해 주세요.' }, { status: 503 });
    const params = url.searchParams;
    return ok({ items: schedules.filter((item) => (!params.get('type') || item.type === params.get('type')) && (!params.get('state') || item.state === params.get('state'))), nextCursor: null });
  }),
  http.get('*/api/v1/teams/:teamId/schedules/:scheduleId', ({ params }) => ok(schedules.find((item) => item.id === params.scheduleId))),
  http.get('*/api/v1/auth/me', () => HttpResponse.json({ status: 'error', statusCode: 401, code: 'UNAUTHENTICATED', message: '로그인이 필요해요.' }, { status: 401 })),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);
const originalReplace = window.history.replaceState.bind(window.history);
let client: QueryClient;

function PublicRoute() {
  const [path, setPath] = useState(navigation.path);
  navigation.publish = () => setPath(navigation.path);
  navigation.navigate = (next, replace = false) => {
    if (replace) window.history.replaceState(null, '', next);
    else window.history.pushState(null, '', next);
    navigation.path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setPath(navigation.path);
  };
  navigation.back = () => window.history.back();
  useEffect(() => {
    const onPop = () => {
      navigation.path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      setPath(navigation.path);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const pathname = path.split('?')[0];
  if (pathname === LIST) return <TeamScheduleListPageClient teamId={TEAM_ID} />;
  if (pathname.startsWith(`${LIST}/`)) return <TeamScheduleDetailPageClient teamId={TEAM_ID} scheduleId={pathname.slice(LIST.length + 1)} />;
  return <div>출처 화면 {pathname}</div>;
}
function renderRoute(path = LIST) {
  navigation.path = path;
  originalReplace(null, '', path);
  installNavigationHistory();
  return render(<QueryClientProvider client={client}><PublicRoute /></QueryClientProvider>);
}
beforeEach(() => {
  __resetNavigationHistoryForTests(); window.sessionStorage.clear(); navigation.actions.length = 0;
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-08T03:00:00Z'));
  clearStoredV1Session(); requests.length = 0; failList = false; navigation.reportedQuery = null;
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, url) => {
    History.prototype.replaceState.call(window.history, data, unused, url);
    if (url === null || url === undefined) return;
    navigation.path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    navigation.publish();
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  cleanup(); client.clear(); server.resetHandlers(); server.close();
  vi.restoreAllMocks(); __resetNavigationHistoryForTests(); vi.useRealTimers(); vi.unstubAllEnvs(); originalReplace(null, '', '/');
});
// 현재 화면의 실제 응답을 기다린다. 상세가 unmount된 뒤 남은 auth 재시도는 목록 계약 밖이다.
async function idle() { await waitFor(() => expect(client.isFetching({ type: 'active' })).toBe(0)); }
async function goBack(action: string) {
  if (action === 'header Back') await userEvent.click(screen.getByRole('link', { name: '뒤로가기' }));
  else act(() => navigation.back());
}
function params() { return new URL(navigation.path, 'https://teameet.example').searchParams; }

describe('MD-QA #45 — 팀 일정 실제 상세 복귀', () => {
  it('상세 auth 재시도가 남아도 복귀 목록의 실제 응답 완료를 기다린다', async () => {
    // Given: 실제 401 재시도와 목록 재조회가 서로 독립적으로 응답한다.
    let releaseAuth = () => {};
    let releaseList = () => {};
    const authResponse = new Promise<void>((resolve) => { releaseAuth = resolve; });
    const listResponse = new Promise<void>((resolve) => { releaseList = resolve; });
    let authAttempts = 0;
    let authRetryStarted = false;
    let holdList = false;
    let returnedListStarted = false;
    // 재시도 대기 시간만 생략한다. 실제 첫 401과 두 번째 HTTP 요청은 모두 실행한다.
    client.setQueryDefaults(v1Keys.authMe(), { retryDelay: 0 });
    server.use(
      http.get('*/api/v1/auth/me', async () => {
        authAttempts += 1;
        if (authAttempts > 1) { authRetryStarted = true; await authResponse; }
        return HttpResponse.json({ status: 'error', statusCode: 401, code: 'UNAUTHENTICATED', message: '로그인이 필요해요.' }, { status: 401 });
      }),
      http.get('*/api/v1/teams/:teamId/schedules', async ({ request }) => {
        const url = new URL(request.url); requests.push(url);
        if (holdList) { returnedListStarted = true; await listResponse; }
        const items = schedules.filter((item) => (!url.searchParams.get('type') || item.type === url.searchParams.get('type'))
          && (!url.searchParams.get('state') || item.state === url.searchParams.get('state')));
        return ok({ items: items.map((item) => holdList && item.id === 'oct-training' ? { ...item, title: '복귀 응답 훈련' } : item), nextCursor: null });
      }),
    );
    renderRoute(`${LIST}?type=TRAINING&state=SCHEDULED`);
    await screen.findByRole('link', { name: /10월 훈련/ }); await idle();

    try {
      await userEvent.click(screen.getByRole('link', { name: /10월 훈련/ }));
      await screen.findByRole('heading', { name: '10월 훈련' });
      await waitFor(() => expect(authRetryStarted).toBe(true));
      expect(authAttempts).toBe(2);
      expect(client.getQueryState(v1Keys.authMe())?.fetchFailureCount).toBe(1);

      // When: 실제 browser Back 뒤 현재 목록 응답은 보류하고 상세의 auth 재시도도 남긴다.
      holdList = true; await goBack('browser Back');
      await screen.findByRole('heading', { name: '합성 복귀 팀 · 일정' });
      await waitFor(() => expect(returnedListStarted).toBe(true));
      await waitFor(() => expect(client.isFetching({ type: 'active' })).toBe(1));
      expect(client.isFetching()).toBe(2);
      const authQuery = client.getQueryCache().find({ queryKey: v1Keys.authMe(), exact: true });
      expect(authQuery?.getObserversCount()).toBe(0);
      expect(authQuery?.state.fetchStatus).toBe('fetching');
      let completed = false;
      const completion = idle().then(() => { completed = true; return {}; }, (error: unknown) => ({ error }));
      await act(async () => { await Promise.resolve(); });
      expect(completed).toBe(false);

      // Then: 실제 새 목록 데이터 이후에만 완료하며 비활성 상세 요청과 조건·카드를 혼동하지 않는다.
      releaseList(); await screen.findByRole('link', { name: /복귀 응답 훈련/ });
      const result = await completion;
      if ('error' in result) throw result.error;
      expect(completed).toBe(true);
      expect(client.isFetching()).toBe(1);
      expect(params().get('type')).toBe('TRAINING'); expect(params().get('state')).toBe('SCHEDULED');
      expect(requests.at(-1)?.searchParams.get('type')).toBe('TRAINING');
      expect(requests.at(-1)?.searchParams.get('state')).toBe('SCHEDULED');
      expect(screen.getByRole('button', { name: '훈련' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: '예정' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByRole('link', { name: /취소된 훈련|팀 행사/ })).not.toBeInTheDocument();
    } finally {
      releaseAuth(); releaseList();
      await waitFor(() => expect(client.isFetching()).toBe(0));
    }
  });

  it.each([
    { initialQuery: 'type=EVENT', label: '훈련', param: 'type', value: 'TRAINING', oldTitle: '팀 행사', newTitle: '10월 훈련' },
    { initialQuery: 'state=SCHEDULED', label: '취소됨', param: 'state', value: 'CANCELLED', oldTitle: '10월 훈련', newTitle: '취소된 훈련' },
  ])('지연된 $param 응답 중 이전 카드의 상세 진입을 막고 새 $value 카드의 복귀 조건을 유지한다', async ({ initialQuery, label, param, value, oldTitle, newTitle }) => {
    // Given: 실제 query가 보관한 이전 결과와 아직 응답하지 않은 새 필터 HTTP 요청.
    let release = () => {};
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    let requestStarted = false;
    server.use(http.get('*/api/v1/teams/:teamId/schedules', async ({ request }) => {
      const url = new URL(request.url); requests.push(url);
      if (url.searchParams.get(param) === value) { requestStarted = true; await delayed; }
      return ok({ items: schedules.filter((item) => (!url.searchParams.get('type') || item.type === url.searchParams.get('type'))
        && (!url.searchParams.get('state') || item.state === url.searchParams.get('state'))), nextCursor: null });
    }));
    renderRoute(`${LIST}?${initialQuery}`);
    await screen.findByRole('link', { name: new RegExp(oldTitle) }); await idle();

    try {
      // When: 조건은 바뀌었지만 새 API 응답은 계속 지연한다.
      await userEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() => expect(requestStarted).toBe(true));
      expect(client.isFetching()).toBe(1);
      expect(params().get(param)).toBe(value);

      // Then: 이전 카드로 새 목록에 잘못 복귀하는 진입점을 남기지 않는다.
      expect(screen.queryByRole('link', { name: new RegExp(oldTitle) })).not.toBeInTheDocument();
      expect(screen.queryByText('조건에 맞는 일정이 없어요')).not.toBeInTheDocument();
      release();
      await userEvent.click(await screen.findByRole('link', { name: new RegExp(newTitle) }));
      await screen.findByRole('heading', { name: newTitle });
      await goBack('header Back'); await screen.findByRole('heading', { name: '합성 복귀 팀 · 일정' }); await idle();
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
      expect(params().get(param)).toBe(value);
      expect(screen.getByRole('link', { name: new RegExp(newTitle) })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: new RegExp(oldTitle) })).not.toBeInTheDocument();
    } finally {
      release(); await idle();
    }
  });

  it.each([LIST, `${LIST}?type=TRAINING&state=SCHEDULED`])('실제 history의 %s에서 헤더 복귀 후 browser Back 한 번으로 이전 home에 돌아간다', async (entry) => {
    // Given: 실제 추적기가 관리하는 home → month 없는 목록 → 상세 이력.
    renderRoute('/home'); act(() => navigation.navigate(entry));
    await screen.findByRole('link', { name: /10월 훈련/ });
    await userEvent.click(screen.getByRole('link', { name: /10월 훈련/ }));
    await screen.findByRole('heading', { name: '10월 훈련' });
    // When: 실제 AppBackLink 결정으로 복귀하고 실제 browser history를 한 번 더 뒤로 간다.
    await goBack('header Back'); await screen.findByRole('heading', { name: '합성 복귀 팀 · 일정' });
    act(() => navigation.back());
    // Then: 목록 복사본에 멈추지 않고 원래 이전 화면에 도달한다.
    await waitFor(() => expect(window.location.pathname).toBe('/home'));
    expect(screen.getByText('출처 화면 /home')).toBeInTheDocument();
    expect(navigation.actions).toEqual(['back']);
  });

  it.each(['header Back', 'browser Back'])('훈련·예정 선택 후 %s하면 같은 선택과 실제 필터 결과를 복원한다', async (action) => {
    // Given: 실제 API 목록에서 종류와 상태를 고른다.
    renderRoute(); await screen.findByRole('link', { name: /10월 훈련/ });
    await userEvent.click(screen.getByRole('button', { name: '훈련' }));
    await userEvent.click(screen.getByRole('button', { name: '예정' })); await idle();
    expect(screen.queryByRole('link', { name: /취소된 훈련|팀 행사/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /10월 훈련/ }));
    await screen.findByRole('heading', { name: '10월 훈련' });

    // When: 실제 상세의 헤더 링크 또는 직전 history entry로 돌아간다.
    await goBack(action); await screen.findByRole('heading', { name: '합성 복귀 팀 · 일정' }); await idle();

    // Then: remount에도 제어와 API 결과가 함께 복원된다.
    expect(screen.getByRole('button', { name: '훈련' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '예정' })).toHaveAttribute('aria-pressed', 'true');
    expect(params().get('type')).toBe('TRAINING'); expect(params().get('state')).toBe('SCHEDULED');
    expect(requests.at(-1)?.searchParams.get('type')).toBe('TRAINING');
    expect(requests.at(-1)?.searchParams.get('state')).toBe('SCHEDULED');
    expect(screen.queryByRole('link', { name: /취소된 훈련|팀 행사/ })).not.toBeInTheDocument();
  });

  it.each(['header Back', 'browser Back'])('캘린더·다음 달·선택 날짜에서 %s하면 보기·월·날짜를 복원한다', async (action) => {
    // Given: 11월 10일을 고른 실제 캘린더와 날짜별 카드.
    renderRoute(); await screen.findByRole('link', { name: /11월 훈련/ });
    await userEvent.click(screen.getByRole('tab', { name: '캘린더' }));
    await userEvent.click(screen.getByRole('button', { name: '다음 달' }));
    await userEvent.click(screen.getByRole('button', { name: '10일, 일정 1건' }));
    await userEvent.click(screen.getByRole('link', { name: /11월 훈련/ }));
    await screen.findByRole('heading', { name: '11월 훈련' });

    // When: 상세에서 목록으로 돌아간다.
    await goBack(action); await screen.findByRole('heading', { name: '합성 복귀 팀 · 일정' });

    // Then: 캘린더의 제어와 선택 날짜 카드가 복원된다.
    expect(screen.getByRole('tab', { name: '캘린더' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('2026년 11월')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10일, 일정 1건' })).toHaveAttribute('aria-pressed', 'true');
    expect(params().get('month')).toBe('2026-11'); expect(params().get('date')).toBe('2026-11-10');
    expect(screen.queryByRole('link', { name: /10월 훈련/ })).not.toBeInTheDocument();
  });

  it('연속 조건 입력과 늦은 query 응답도 마지막 선택과 카드 from을 덮지 않는다', async () => {
    // Given: 최초 query만 늦게 보고하는 Next 경계.
    renderRoute(); await screen.findByRole('link', { name: /10월 훈련/ }); navigation.reportedQuery = '';

    // When: 같은 React flush 전에 종류·상태·보기를 연속 바꾼다.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '훈련' }));
      fireEvent.click(screen.getByRole('button', { name: '예정' }));
      fireEvent.click(screen.getByRole('tab', { name: '캘린더' }));
    }); await idle();

    // Then: local draft 및 실제 URL/카드 출처가 마지막 조합을 유지한다.
    expect(screen.getByRole('button', { name: '훈련' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '예정' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: '캘린더' })).toHaveAttribute('aria-selected', 'true');
    const href = screen.getByRole('link', { name: /10월 훈련/ }).getAttribute('href');
    const from = new URL(href ?? '', 'https://teameet.example').searchParams.get('from');
    const restored = new URL(from ?? '', 'https://teameet.example').searchParams;
    expect(restored.get('type')).toBe('TRAINING'); expect(restored.get('state')).toBe('SCHEDULED'); expect(restored.get('view')).toBe('calendar');
    expect(params().get('type')).toBe('TRAINING'); expect(params().get('state')).toBe('SCHEDULED');
  });

  it('공유 URL의 유효한 캘린더 상태를 처음부터 hydrate한다', async () => {
    // Given: 다른 월의 날짜가 선택된 URL.
    renderRoute(`${LIST}?type=TRAINING&state=SCHEDULED&view=calendar&month=2026-11&date=2026-11-10`);
    // When: 실제 목록 API 응답이 도착한다.
    await screen.findByRole('link', { name: /11월 훈련/ });
    // Then: 다른 카드가 섞이지 않고 같은 날짜를 표시한다.
    expect(screen.getByRole('tab', { name: '캘린더' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('2026년 11월')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10일, 일정 1건' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('link', { name: /10월 훈련/ })).not.toBeInTheDocument();
  });

  it.each(['2026-02-30', '2026-13-10', 'garbage'])('잘못된 조건·월·날짜 %s는 안전한 기본 제어와 서버 필터로 정규화한다', async (date) => {
    // Given: 편집된 URL의 잘못된 값.
    renderRoute(`${LIST}?type=unknown&state=unknown&view=unknown&month=2026-13&date=${date}`);
    // When: 실제 목록을 불러오고 기본 캘린더를 연다.
    await screen.findByRole('link', { name: /팀 행사/ }); await idle();
    await userEvent.click(screen.getByRole('tab', { name: '캘린더' }));
    // Then: 서버가 거절하는 입력이나 존재하지 않는 날짜를 사용하지 않는다.
    expect(requests.at(-1)?.searchParams.has('type')).toBe(false); expect(requests.at(-1)?.searchParams.has('state')).toBe(false);
    expect(screen.getByText('2026년 10월')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '날짜 필터 해제' })).not.toBeInTheDocument();
    expect(params().has('date')).toBe(false);
  });

  it.each([null, '/my/schedule?status=scheduled', '/notifications', 'https://outside.example'])('직접 상세의 출처 %s는 기존 안전한 뒤로가기 계약을 유지한다', async (from) => {
    // Given: 팀 목록 외부의 기존 상세 진입.
    renderRoute(`${LIST}/oct-training${from ? `?from=${encodeURIComponent(from)}` : ''}`);
    await screen.findByRole('heading', { name: '10월 훈련' });
    // When: 실제 헤더 뒤로가기 링크를 누른다.
    await userEvent.click(screen.getByRole('link', { name: '뒤로가기' }));
    // Then: 개인 일정·알림 출처와 안전한 팀 목록 fallback을 유지한다.
    expect(navigation.path).toBe(from?.startsWith('/') ? from : LIST);
  });

  it('목록 실패는 실제 오류·재시도를 유지하고 멤버에게 관리 CTA를 노출하지 않는다', async () => {
    // Given: 관리자가 아닌 멤버의 실패하는 API.
    failList = true; renderRoute(); await screen.findByRole('alert');
    expect(screen.queryByRole('link', { name: '일정 만들기' })).not.toBeInTheDocument();
    // When: API가 복구된 뒤 기존 재시도를 누른다.
    failList = false; await userEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    // Then: 오류를 숨긴 샘플이 아닌 실제 재조회 결과를 보여준다.
    await screen.findByRole('link', { name: /10월 훈련/ }); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(requests.length).toBeGreaterThanOrEqual(2);
  });
});
