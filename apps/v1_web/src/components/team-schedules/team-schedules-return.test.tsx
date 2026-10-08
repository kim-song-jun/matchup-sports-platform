import { useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredV1Session } from '@/lib/session-storage';
import type { V1TeamDetail, V1TeamScheduleDetail } from '@/types/api';
import { TeamScheduleDetailPageClient, TeamScheduleListPageClient } from './team-schedules-client';

// 라우터·Link 경계만 대체한다. 목록/상세/카드/뒤로가기/API/query는 실제 구현이다.
const navigation = vi.hoisted((): {
  path: string; history: string[]; index: number; reportedQuery: string | null;
  navigate: (path: string, replace?: boolean) => void; back: () => void; publish: () => void;
} => ({
  path: '', history: new Array<string>(), index: 0,
  reportedQuery: null,
  navigate: (_path: string, _replace = false) => {},
  back: () => {}, publish: () => {},
}));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.path.split('?')[0],
  useSearchParams: () => new URLSearchParams(navigation.reportedQuery ?? navigation.path.split('?')[1]),
  useRouter: () => ({ push: (path: string) => navigation.navigate(path), replace: (path: string) => navigation.navigate(path, true), back: navigation.back, prefetch: vi.fn() }),
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
    if (replace) navigation.history[navigation.index] = next;
    else { navigation.history = [...navigation.history.slice(0, navigation.index + 1), next]; navigation.index += 1; }
    navigation.path = next;
    originalReplace(null, '', next);
    setPath(next);
  };
  navigation.back = () => {
    const previous = navigation.history[navigation.index - 1];
    if (!previous) return;
    navigation.index -= 1;
    navigation.path = previous;
    originalReplace(null, '', previous);
    setPath(previous);
  };
  const pathname = path.split('?')[0];
  if (pathname === LIST) return <TeamScheduleListPageClient teamId={TEAM_ID} />;
  if (pathname.startsWith(`${LIST}/`)) return <TeamScheduleDetailPageClient teamId={TEAM_ID} scheduleId={pathname.slice(LIST.length + 1)} />;
  return <div>출처 화면 {pathname}</div>;
}
function renderRoute(path = LIST) {
  navigation.path = path; navigation.history = [path]; navigation.index = 0;
  originalReplace(null, '', path);
  return render(<QueryClientProvider client={client}><PublicRoute /></QueryClientProvider>);
}
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-08T03:00:00Z'));
  clearStoredV1Session(); requests.length = 0; failList = false; navigation.reportedQuery = null;
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, url) => {
    originalReplace(data, unused, url);
    if (url === null || url === undefined) return;
    navigation.path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    navigation.history[navigation.index] = navigation.path;
    navigation.publish();
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  cleanup(); client.clear(); server.resetHandlers(); server.close();
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); originalReplace(null, '', '/');
});
async function idle() { await waitFor(() => expect(client.isFetching()).toBe(0)); }
async function goBack(action: string) {
  if (action === 'header Back') await userEvent.click(screen.getByRole('link', { name: '뒤로가기' }));
  else act(() => navigation.back());
}
function params() { return new URL(navigation.path, 'https://teameet.example').searchParams; }

describe('MD-QA #45 — 팀 일정 실제 상세 복귀', () => {
  it.each(['header Back', 'browser Back'])('훈련·예정 선택 후 %s하면 같은 선택과 실제 필터 결과를 복원한다', async (action) => {
    // Given: 실제 API 목록에서 종류와 상태를 고른다.
    renderRoute(); await screen.findByRole('link', { name: /10월 훈련/ });
    await userEvent.click(screen.getByRole('button', { name: '훈련', exact: true }));
    await userEvent.click(screen.getByRole('button', { name: '예정', exact: true })); await idle();
    expect(screen.queryByRole('link', { name: /취소된 훈련|팀 행사/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /10월 훈련/ }));
    await screen.findByRole('heading', { name: '10월 훈련', exact: true });

    // When: 실제 상세의 헤더 링크 또는 직전 history entry로 돌아간다.
    await goBack(action); await screen.findByRole('heading', { name: '합성 복귀 팀 · 일정' }); await idle();

    // Then: remount에도 제어와 API 결과가 함께 복원된다.
    expect(screen.getByRole('button', { name: '훈련', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '예정', exact: true })).toHaveAttribute('aria-pressed', 'true');
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
    await screen.findByRole('heading', { name: '11월 훈련', exact: true });

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
      fireEvent.click(screen.getByRole('button', { name: '훈련', exact: true }));
      fireEvent.click(screen.getByRole('button', { name: '예정', exact: true }));
      fireEvent.click(screen.getByRole('tab', { name: '캘린더' }));
    }); await idle();

    // Then: local draft 및 실제 URL/카드 출처가 마지막 조합을 유지한다.
    expect(screen.getByRole('button', { name: '훈련', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '예정', exact: true })).toHaveAttribute('aria-pressed', 'true');
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
    await screen.findByRole('heading', { name: '10월 훈련', exact: true });
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
