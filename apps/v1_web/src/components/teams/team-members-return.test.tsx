import { useSyncExternalStore, type AnchorHTMLAttributes } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicProfilePageClient } from '@/components/users/public-profile-client';
import { AppShellFrame } from '@/components/v1-ui/app-shell-frame';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { clearStoredV1Session } from '@/lib/session-storage';
import { createHistoryRouter, nextPopState } from '@/test/history-router';
import type { V1PublicProfile, V1TeamMember } from '@/types/api';
import { TeamMembersPageClient } from './teams-client';

const navigation = vi.hoisted(() => ({ delayedSearch: null as string | null }));
const nativeRouter = createHistoryRouter();
const currentHref = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
const notifyNavigation = () => window.dispatchEvent(new Event('member-return-navigation'));
const router = {
  ...nativeRouter,
  push: vi.fn((href: string) => { navigation.delayedSearch = null; nativeRouter.push(href); notifyNavigation(); }),
  replace: vi.fn((href: string) => { navigation.delayedSearch = null; nativeRouter.replace(href); notifyNavigation(); }),
};
function useHistoryHref() {
  return useSyncExternalStore((notify) => {
    window.addEventListener('popstate', notify);
    window.addEventListener('member-return-navigation', notify);
    return () => {
      window.removeEventListener('popstate', notify);
      window.removeEventListener('member-return-navigation', notify);
    };
  }, currentHref, currentHref);
}

// Next 경계만 연결한다. 실제 API/hooks·두 route consumer·검색·URL helper·셸 Back/history는 유지한다.
vi.mock('next/navigation', () => ({
  usePathname: () => { useHistoryHref(); return window.location.pathname; },
  useSearchParams: () => { useHistoryHref(); return new URLSearchParams(navigation.delayedSearch ?? window.location.search); },
  useRouter: () => router,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, onClick, prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => (
    <a {...props} href={href} onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      router.push(String(href));
    }}>{children}</a>
  ),
}));

const teamId = 'qa60-team-one';
const otherTeamId = 'qa60-team-two';
const membersPath = `/teams/${teamId}/members`;
const upstream = '/teams/qa60-team-one?from=%2Fmy%2Fteams#team-info';
const members: V1TeamMember[] = Array.from({ length: 15 }, (_, index) => ({
  membershipId: `qa60-membership-${index + 1}`, userId: `qa60-user-${index + 1}`,
  displayName: index === 0 ? '정재원' : `합성 멤버 ${index + 1}`,
  realName: null, phone: null, birthDate: null, gender: null, profileImageUrl: null,
  role: index === 1 ? 'owner' : 'member', status: 'active', joinedAt: '2026-01-01T00:00:00.000Z',
  jerseyNumber: index === 0 ? 7 : index + 20, canChangeRole: false, canRemove: false, canEditJersey: false,
}));
const profile: V1PublicProfile = {
  userId: members[0].userId, displayName: '정재원', nickname: null, bio: null, profileImageUrl: null,
  teams: [], recentActivity: null, playerCard: null, activitySummary: null,
  reputation: { trustState: 'sample', mannerScore: null, activityCount: 0, reviewCount: 0, highlight: null },
};
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: '2026-10-08T00:00:00.000Z' });
const fail = (statusCode: number) => HttpResponse.json({ status: 'error', statusCode, code: statusCode === 401 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR', message: '합성 API 요청 실패', timestamp: '' }, { status: statusCode });
const clients: QueryClient[] = [];
let server: ReturnType<typeof setupServer>;
let role: 'none' | 'owner' = 'none';
let restricted = false;
let membersFail = false;
let membersPending = false;
let releaseMembers: (() => void) | undefined;
let memberRequests: URL[] = [];
let profileGets = 0;
let authGets = 0;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  vi.clearAllMocks();
  navigation.delayedSearch = null;
  clearStoredV1Session();
  __resetNavigationHistoryForTests();
  window.history.replaceState(null, '', '/home');
  installNavigationHistory();
  role = 'none'; restricted = false; membersFail = false; membersPending = false; releaseMembers = undefined;
  memberRequests = []; profileGets = 0; authGets = 0;
  server = setupServer(
    http.get('*/api/v1/teams/:teamId', ({ params }) => ok({
      teamId: params.teamId, name: params.teamId === teamId ? '합성 공개 팀' : '다른 합성 팀',
      canViewMembers: !restricted, membersVisibilityEnabled: true, memberCount: 15, managerCount: 0,
      viewer: { role, membershipId: role === 'owner' ? members[1].membershipId : null },
    })),
    http.get('*/api/v1/teams/:teamId/members', async ({ params, request }) => {
      memberRequests.push(new URL(request.url));
      if (membersPending) await new Promise<void>((resolveResponse) => { releaseMembers = resolveResponse; });
      if (membersFail) return fail(503);
      const items = params.teamId === teamId ? members : members.map((member) => ({ ...member, displayName: `다른 팀 ${member.displayName}` }));
      return ok({ items, summary: { ownerCount: 1, managerCount: 0, memberCount: 15 }, viewerRole: role, pageInfo: { nextCursor: null, hasNext: false } });
    }),
    http.get('*/api/v1/teams/:teamId/join-applications', () => ok({ items: [], pageInfo: { nextCursor: null, hasNext: false } })),
    http.get('*/api/v1/teams/:teamId/invitations', () => ok({ items: [], pastItems: [] })),
    http.get('*/api/v1/users/:userId/public-profile', ({ params }) => { profileGets += 1; return ok({ ...profile, userId: params.userId }); }),
    // 공개 프로필의 401 신원 확인은 실제 retry:false/관전자 분기를 거친다.
    http.get('*/api/v1/auth/me', () => { authGets += 1; return fail(401); }),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  releaseMembers?.();
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  server.close();
  __resetNavigationHistoryForTests();
  clearStoredV1Session();
  navigation.delayedSearch = null;
  vi.unstubAllEnvs();
});

function HistoryPage() {
  useHistoryHref();
  const route = window.location.pathname;
  const memberTeamId = /^\/teams\/([^/]+)\/members$/.exec(route)?.[1];
  const userId = /^\/users\/([^/]+)$/.exec(route)?.[1];
  return <AppShellFrame>{memberTeamId
    ? <TeamMembersPageClient teamId={memberTeamId} />
    : userId ? <PublicProfilePageClient userId={userId} /> : <p>상위 화면으로 돌아왔어요.</p>}</AppShellFrame>;
}
function renderAt(href: string) {
  nativeRouter.push(href);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  return { client, ...render(<QueryClientProvider client={client}><HistoryPage /></QueryClientProvider>) };
}
const memberLinks = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('.tm-member-rows a'));
async function expectMembers(query: string, count: number) {
  const input = await screen.findByRole('searchbox', { name: '멤버 검색' });
  await waitFor(() => {
    expect(input).toHaveValue(query);
    expect(memberLinks()).toHaveLength(count);
  });
  expect(within(screen.getByRole('region', { name: '멤버' })).getByRole('status')).toHaveTextContent(query.trim() ? `검색 결과 ${count}명` : '멤버 15명');
}
function expectedSource(query: string) {
  const url = new URL(window.location.href);
  if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
  return `${url.pathname}${url.search}${url.hash}`;
}
async function profileRoundTrip(query: string, nativeBack = false, expectedTab?: string) {
  const source = expectedSource(query);
  fireEvent.click(memberLinks()[0]);
  await screen.findByRole('heading', { level: 1, name: '정재원' });
  if (nativeBack) {
    await act(async () => { const pop = nextPopState(); window.history.back(); await pop; });
  } else {
    fireEvent.click(screen.getAllByRole('link', { name: '뒤로가기' })[0]);
  }
  if (expectedTab) await waitFor(() => {
    expect(window.location.pathname).toBe(membersPath);
    expect(new URLSearchParams(window.location.search).get('tab')).toBe(expectedTab);
  });
  await expectMembers(query, 1);
  expect(currentHref()).toBe(source);
  expect(profileGets).toBe(1);
  expect(memberRequests).toHaveLength(1);
  expect(memberRequests[0].searchParams.get('limit')).toBe('50');
  expect(memberRequests[0].searchParams.has('q')).toBe(false);
}

describe('MD-QA60 공개 멤버 검색의 실제 프로필 왕복', () => {
  it('기본 공개 목록은 실제 HTTP의15명과 이름 검색1명을 표시한다', async () => {
    renderAt(membersPath);
    await expectMembers('', 15);
    expect(memberRequests).toHaveLength(1);
    expect(memberRequests[0].pathname).toBe(`/api/v1/teams/${teamId}/members`);
    expect(memberRequests[0].searchParams.get('limit')).toBe('50');
    expect(memberLinks()[0]).toHaveTextContent('정재원');
    fireEvent.change(screen.getByRole('searchbox', { name: '멤버 검색' }), { target: { value: '정재원' } });
    await expectMembers('정재원', 1);
  });

  it.each(['', `?from=${encodeURIComponent(upstream)}&tab=members&extra=keep#member-list`])('정재원1 검색→실제 프로필→페이지 Back에서 URL·검색·결과를 유지한다 (%s)', async (suffix) => {
    renderAt(`${membersPath}${suffix}`);
    await expectMembers('', 15);
    fireEvent.change(screen.getByRole('searchbox', { name: '멤버 검색' }), { target: { value: '정재원' } });
    await expectMembers('정재원', 1);
    await profileRoundTrip('정재원');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    // 목록의 중복 항목이 생기지 않아 다음 native Back은 원래 상위 항목이다.
    await act(async () => { const pop = nextPopState(); window.history.back(); await pop; });
    expect(currentHref()).toBe('/home');
  });

  it('등번호7번 검색도 실제 프로필과 native Back 뒤에 같은1명을 복원한다', async () => {
    renderAt(membersPath);
    await expectMembers('', 15);
    fireEvent.change(screen.getByRole('searchbox', { name: '멤버 검색' }), { target: { value: '7번' } });
    await expectMembers('7번', 1);
    await profileRoundTrip('7번', true);
  });

  it.each([['정재원', 1], ['7번', 1], ['없는 이름', 0]] as const)('q=%s 직접 진입은 실제 HTTP 멤버를 %s명으로 필터한다', async (query, count) => {
    renderAt(`${membersPath}?q=${encodeURIComponent(query)}`);
    await expectMembers(query, count);
    expect(memberRequests).toHaveLength(1);
    if (count === 0) expect(screen.getByText('‘없는 이름’에 맞는 멤버가 없어요.')).toBeInTheDocument();
  });

  it('clear는 q만 제거하고 전체15와 다른 query·hash·상위 출처를 보존한다', async () => {
    renderAt(`${membersPath}?q=${encodeURIComponent('정재원')}&from=${encodeURIComponent(upstream)}&tab=members&extra=keep#member-list`);
    await expectMembers('정재원', 1);
    const historyLength = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: '검색어 지우기' }));
    await expectMembers('', 15);
    expect(window.history.length).toBe(historyLength);
    expect(new URLSearchParams(window.location.search).has('q')).toBe(false);
    expect(new URLSearchParams(window.location.search).get('from')).toBe(upstream);
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('members');
    expect(new URLSearchParams(window.location.search).get('extra')).toBe('keep');
    expect(window.location.hash).toBe('#member-list');
  });

  it('늦은 Next snapshot·빠른 연속 입력에서도 마지막 query와 프로필 출처가 유지된다', async () => {
    renderAt(`${membersPath}?from=${encodeURIComponent(upstream)}&extra=keep#member-list`);
    await expectMembers('', 15);
    navigation.delayedSearch = window.location.search;
    const historyLength = window.history.length;
    for (const query of ['정', '7번', '정재원']) fireEvent.change(screen.getByRole('searchbox', { name: '멤버 검색' }), { target: { value: query } });
    await expectMembers('정재원', 1);
    expect(window.history.length).toBe(historyLength);
    await profileRoundTrip('정재원');
    expect(new URLSearchParams(window.location.search).get('from')).toBe(upstream);
    expect(new URLSearchParams(window.location.search).get('extra')).toBe('keep');
    expect(window.location.hash).toBe('#member-list');
  });

  it('다른 팀으로 같은 client를 전환하면 이전 팀 검색을 적용하지 않는다', async () => {
    renderAt(membersPath);
    await expectMembers('', 15);
    fireEvent.change(screen.getByRole('searchbox', { name: '멤버 검색' }), { target: { value: '정재원' } });
    await expectMembers('정재원', 1);
    act(() => router.push(`/teams/${otherTeamId}/members`));
    await expectMembers('', 15);
    expect(memberLinks()[0]).toHaveTextContent('다른 팀 정재원');
    expect(memberRequests).toHaveLength(2);
  });

  it('관리 탭 이동 후 검색과 기존 멤버 관리 동작을 유지한다', async () => {
    role = 'owner';
    renderAt(`${membersPath}?tab=members&extra=keep`);
    await expectMembers('', 15);
    fireEvent.change(screen.getByRole('searchbox', { name: '멤버 검색' }), { target: { value: '정재원' } });
    await expectMembers('정재원', 1);
    fireEvent.click(screen.getByRole('button', { name: /가입 신청/ }));
    expect(screen.queryByRole('searchbox', { name: '멤버 검색' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^멤버/ }));
    await expectMembers('정재원', 1);
    expect(screen.getByRole('button', { name: '정재원 관리' })).toBeEnabled();
    expect(new URLSearchParams(window.location.search).get('extra')).toBe('keep');
  });

  it('가입 신청으로 직접 진입한 뒤 선택한 멤버 탭도 실제 프로필 왕복에서 복원한다', async () => {
    role = 'owner';
    renderAt(`${membersPath}?tab=requests&extra=keep#member-list`);
    await screen.findByText('기다리는 가입 신청이 없어요');
    expect(screen.getByRole('button', { name: /가입 신청/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /^멤버/ }));
    await expectMembers('', 15);
    fireEvent.change(screen.getByRole('searchbox', { name: '멤버 검색' }), { target: { value: '정재원' } });
    await expectMembers('정재원', 1);
    await profileRoundTrip('정재원', false, 'members');
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('members');
    expect(new URLSearchParams(window.location.search).get('extra')).toBe('keep');
    expect(window.location.hash).toBe('#member-list');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('실제 HTTP cache로 만든 SSR 첫 markup도 URL 검색1을 유지하고 hash는 클라이언트에서 전달한다', async () => {
    const { client } = renderAt(`${membersPath}?q=${encodeURIComponent('정재원')}&from=${encodeURIComponent(upstream)}#member-list`);
    await waitFor(() => expect(memberLinks().length).toBeGreaterThan(0));
    const markup = renderToStaticMarkup(<QueryClientProvider client={client}><AppShellFrame><TeamMembersPageClient teamId={teamId} /></AppShellFrame></QueryClientProvider>);
    const document = new DOMParser().parseFromString(markup, 'text/html');
    expect(document.querySelector('input[type="search"]')?.getAttribute('value')).toBe('정재원');
    expect(document.querySelectorAll('.tm-member-rows a')).toHaveLength(1);
    const serverLink = document.querySelector<HTMLAnchorElement>('.tm-member-rows a');
    if (!serverLink) throw new Error('SSR 실제 프로필 링크가 없어요.');
    const source = new URL(serverLink.getAttribute('href') ?? '/', window.location.origin).searchParams.get('from');
    expect(source).toContain(`q=${encodeURIComponent('정재원')}`);
    expect(source).not.toContain('#member-list');
    await expectMembers('정재원', 1);
    const clientSource = new URL(memberLinks()[0].href).searchParams.get('from');
    expect(clientSource).toContain('#member-list');
  });

  it('공개 프로필의 실제 auth401은 관전자 화면과 복귀를 막지 않는다', async () => {
    renderAt(membersPath);
    await expectMembers('', 15);
    fireEvent.change(screen.getByRole('searchbox', { name: '멤버 검색' }), { target: { value: '정재원' } });
    await expectMembers('정재원', 1);
    await profileRoundTrip('정재원');
    expect(authGets).toBe(1);
    expect(screen.queryByRole('button', { name: '정재원 관리' })).not.toBeInTheDocument();
  });

  it('멤버 실제503은 검색이나 정상 목록으로 숨기지 않는다', async () => {
    membersFail = true;
    renderAt(`${membersPath}?q=${encodeURIComponent('정재원')}`);
    expect((await screen.findAllByText('팀 목록을 불러오지 못했어요')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('searchbox', { name: '멤버 검색' })).not.toBeInTheDocument();
    expect(memberLinks()).toHaveLength(0);
  });

  it('실제 멤버 HTTP 대기 상태를 표시하고 완료 뒤 URL 검색1을 적용한다', async () => {
    membersPending = true;
    renderAt(`${membersPath}?q=${encodeURIComponent('정재원')}`);
    expect(await screen.findByLabelText('멤버 불러오는 중')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('searchbox', { name: '멤버 검색' })).not.toBeInTheDocument();
    await waitFor(() => expect(releaseMembers).toBeTypeOf('function'));
    if (!releaseMembers) throw new Error('실제 멤버 요청이 대기하지 않았어요.');
    releaseMembers();
    await expectMembers('정재원', 1);
  });

  it('비공개 멤버 권한은 URL 검색과 무관하게 조회와 목록을 막는다', async () => {
    restricted = true;
    renderAt(`${membersPath}?q=${encodeURIComponent('정재원')}`);
    expect((await screen.findAllByText('멤버 목록이 비공개예요')).length).toBeGreaterThan(0);
    expect(memberRequests).toHaveLength(0);
    expect(screen.queryByRole('searchbox', { name: '멤버 검색' })).not.toBeInTheDocument();
  });
});
