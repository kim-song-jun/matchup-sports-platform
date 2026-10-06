import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { v1MswHandlers } from '@/test/msw/handlers';
import { withFromPath } from '@/lib/session-storage';
import type { V1Team, V1TeamDetail } from '@/types/api';
import { TeamDetailPageClient, TeamListPageClient, TeamMembersPageClient } from './teams-client';

const navigation = vi.hoisted(() => ({
  href: '/teams',
  params: new URLSearchParams(),
  navigate: (_href: string) => {},
}));
const router = vi.hoisted(() => ({
  push: (href: string) => navigation.navigate(href),
  replace: (href: string) => navigation.navigate(href),
  back: vi.fn(),
  prefetch: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => new URL(navigation.href, 'http://localhost').pathname,
  useSearchParams: () => navigation.params,
  useRouter: () => router,
}));

const teamId = '00620e9d-b432-4a59-98ef-68afcac31c8b';
const teamName = 'E2E 알파 A팀';
const teamPath = `/teams/${teamId}`;
const queryString = new URLSearchParams({ q: teamName }).toString();
const searchedHref = `/teams?${queryString}`;
const team: V1Team = {
  id: teamId, teamId, name: teamName, sportName: '풋살', regionName: '서울 강동',
  memberCount: 2, trustState: 'sample', joinPolicy: 'approval_required',
  minLevel: { code: 'novice', name: '초보' }, maxLevel: { code: 'intermediate', name: '중수' },
};
const detail: V1TeamDetail = {
  ...team, teamId, status: 'active', visibility: 'public',
  sport: { sportId: 'sport-futsal', name: '풋살' },
  region: { regionId: 'region-seoul-gangdong', name: '서울 강동' },
  membersVisibilityEnabled: true, canViewMembers: true,
  profile: {
    logoUrl: null, coverImageUrl: null, introduction: null, activityAreaText: null,
    activityDays: [], activityFrequency: null, activityTimeSlots: [], activityTypes: [],
    activityMemo: null, activitySummary: null, skillLevelText: '초보-중수',
    joinPolicy: 'approval_required', memberGoalCount: 20,
  },
  owner: { userId: 'user-1', displayName: '김도윤', profileImageUrl: null },
  membersPreview: [{ membershipId: 'membership-1', userId: 'user-1', displayName: '김도윤', role: 'owner' }],
  managerCount: 0, trust: { trustState: 'sample', score: null },
  viewer: { role: 'none', membershipId: null, joinState: 'none', canRequestJoin: false, disabledReason: 'LOGIN_REQUIRED', manageRoute: null },
};
const allTeams = [team, ...Array.from({ length: 19 }, (_, index) => ({
  ...team, id: `other-${index}`, teamId: `other-${index}`, name: `다른 팀 ${index}`,
}))];
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: '2026-10-06T03:00:00.000Z' });
const server = setupServer(
  http.get('*/api/v1/teams', ({ request }) => {
    const items = new URL(request.url).searchParams.get('query') === teamName ? [team] : allTeams;
    return ok({ items, pageInfo: { total: items.length, nextCursor: null, hasNext: false } });
  }),
  http.get(`*/api/v1/teams/${teamId}`, () => ok(detail)),
  http.get(`*/api/v1/teams/${teamId}/reviews`, () => ok({ bySport: [], highlight: null })),
  http.get('*/api/v1/league-matches', () => ok({ items: [], pageInfo: { nextCursor: null, hasNext: false } })),
  http.get('*/api/v1/auth/me', () => HttpResponse.json({ status: 'error', statusCode: 401, code: 'UNAUTHENTICATED', message: '로그인이 필요해요.' }, { status: 401 })),
  ...v1MswHandlers,
);
const clients: QueryClient[] = [];

// Next의 URL 갱신만 대체한다. 화면, 카드 href, API 훅, AppBackLink 클릭 처리는 실제 구현을 쓴다.
function RouteHarness({ initialHref }: { initialHref: string }) {
  const [href, setHref] = useState(initialHref);
  navigation.href = href;
  const location = new URL(href, 'http://localhost');
  navigation.params = new URLSearchParams(location.search);
  navigation.navigate = setHref;
  return (
    <div onClickCapture={(event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      const target = anchor?.getAttribute('href');
      // 뒤로가기 링크는 자체 실제 onClick을 통해 router.replace를 실행한다.
      if (!target || anchor?.hasAttribute('data-nav-back')) return;
      event.preventDefault();
      setHref(target);
    }}>
      {location.pathname === '/teams' ? <TeamListPageClient />
        : location.pathname.endsWith('/members') ? <TeamMembersPageClient teamId={teamId} />
          : <TeamDetailPageClient teamId={teamId} />}
    </div>
  );
}

function renderRoute(initialHref = '/teams') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><RouteHarness initialHref={initialHref} /></QueryClientProvider>);
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  server.resetHandlers();
});
afterAll(() => server.close());

describe('팀 검색 목록 상세 복귀 (MD-QA #24)', () => {
  it.each(['', 'sportId=sport-futsal&regionId=region-seoul-gangdong&sort=latest&levelCodes=novice'])('확정 검색 뒤 상세에서 앱 뒤로가기를 누르면 검색어·조건과 1팀 결과를 보존한다 (%s)', async (filters) => {
    // Given: 검색 전 목록은 20팀이고, 검색 제출 후 q가 실제 URL에 반영돼요.
    const user = userEvent.setup();
    const rendered = renderRoute(filters ? `/teams?${filters}` : '/teams');
    await screen.findByRole('link', { name: /다른 팀 18/ });
    await user.type(screen.getByRole('textbox', { name: '팀 검색어' }), teamName);
    await user.click(screen.getByRole('button', { name: '검색' }));
    const expectedHref = filters ? `/teams?${filters}&${queryString}` : searchedHref;
    await waitFor(() => expect(navigation.href).toBe(expectedHref));
    const card = await screen.findByRole('link', { name: /E2E 알파 A팀/ });
    await waitFor(() => expect(rendered.container.querySelectorAll('.tm-team-card')).toHaveLength(1));
    // When: 실제 상세를 열고 실제 AppBackLink를 클릭해요.
    await user.click(card);
    await user.click(await screen.findByRole('link', { name: '뒤로가기' }));
    // Then: 같은 확정 URL에서 입력과 서버 검색 결과가 복원돼요.
    await waitFor(() => expect(navigation.href).toBe(expectedHref));
    expect(await screen.findByRole('textbox', { name: '팀 검색어' })).toHaveValue(teamName);
    await waitFor(() => expect(rendered.container.querySelectorAll('.tm-team-card')).toHaveLength(1));
    expect(screen.queryByRole('link', { name: /다른 팀 18/ })).not.toBeInTheDocument();
  });

  it('검색 출처를 가진 상세의 멤버·프로필·팀매치 링크가 해당 상세의 복귀 문맥을 이어간다', async () => {
    // Given: 목록에서 받은 검색 출처가 있는 실제 팀 상세예요.
    const selfHref = withFromPath(teamPath, searchedHref);
    renderRoute(selfHref);
    const user = userEvent.setup();
    const memberLink = (await screen.findAllByRole('link', { name: /김도윤/ }))[0];
    expect(memberLink).toHaveAttribute('href', withFromPath('/users/user-1', selfHref));
    const matchLink = (await screen.findAllByRole('link', { name: /마포 FC 상대팀 모집/ }))[0];
    expect(matchLink).toHaveAttribute('href', withFromPath('/team-matches/team-match-1', selfHref));
    // When: 전체 멤버로 들어가요.
    await user.click((await screen.findAllByRole('link', { name: /1명 더보기/ }))[0]);
    const membersHref = withFromPath(`${teamPath}/members`, selfHref);
    await waitFor(() => expect(navigation.href).toBe(membersHref));
    // Then: 멤버의 프로필과 실제 뒤로가기도 출처가 담긴 상세를 보존해요.
    expect(await screen.findByRole('link', { name: /김도윤 팀장/ })).toHaveAttribute('href', withFromPath('/users/user-1', membersHref));
    await user.click(screen.getByRole('link', { name: '뒤로가기' }));
    await waitFor(() => expect(navigation.href).toBe(selfHref));
    expect(await screen.findByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', searchedHref);
  });

  it.each([teamPath, `${teamPath}?from=${encodeURIComponent('//external.example/teams')}`])('직접 진입하거나 외부 출처를 받으면 안전한 기본 팀 목록으로 돌아간다 (%s)', async (href) => {
    // Given: 목록 출처가 없거나 신뢰할 수 없는 출처예요.
    renderRoute(href);
    // When: 실제 화면의 뒤로가기를 눌러요.
    await userEvent.setup().click(await screen.findByRole('link', { name: '뒤로가기' }));
    // Then: 외부 사이트로 나가지 않고 기본 목록 20팀을 표시해요.
    await waitFor(() => expect(navigation.href).toBe('/teams'));
    expect(await screen.findByRole('textbox', { name: '팀 검색어' })).toHaveValue('');
    expect(await screen.findByRole('link', { name: /다른 팀 18/ })).toBeInTheDocument();
  });
});
