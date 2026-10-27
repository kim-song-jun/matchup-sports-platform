import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import AdminUsersPage from './page';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => false }));

const requests: URL[] = [];
const server = setupServer(http.get('http://localhost/api/v1/admin/users', ({ request }) => {
  const url = new URL(request.url);
  requests.push(url);
  const filtered = url.searchParams.has('providers');
  return HttpResponse.json({ status: 'success', data: {
    items: [{
      userId: 'linked-user', nickname: filtered ? '연결회원' : '전체회원', displayName: null,
      email: 'fixture@example.test', authProviders: ['kakao', 'apple'], gender: null,
      accountStatus: 'active', onboardingStatus: 'social_profile_deferred', signupStage: 'profile_deferred',
      lastLoginAt: null, createdAt: '2026-10-26T00:00:00Z', hostedMatchCount: 0, ownedTeamCount: 0,
      membershipCount: 0, adminRole: null,
    }],
    pageInfo: { page: 1, total: 1, totalPages: 1, limit: 20, hasNext: false, nextCursor: null },
    summary: { total: 1, byStatus: { active: 1 }, signupTotal: 1, providerTotal: 1,
      bySignup: { required_complete: 0, onboarding_complete: 0, incomplete: 1, terms_required: 0, profile_required: 0, profile_deferred: 1 },
      byProvider: { email: 0, kakao: 1, apple: 1 } },
  }, timestamp: new Date().toISOString() });
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  requests.length = 0;
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  window.history.replaceState(null, '', '/admin/users?status=active&page=3');
});
afterEach(() => { cleanup(); server.resetHandlers(); vi.unstubAllEnvs(); });
afterAll(() => server.close());

it('실제 목록 훅과 HTTP 직렬화로 복수 필터를 전달하고 응답 회원·집계를 함께 표시한다', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AdminUsersPage /></QueryClientProvider>);
  expect((await screen.findAllByText('전체회원')).length).toBeGreaterThan(0);
  const signup = within(screen.getByRole('group', { name: '가입 상태 필터' }));
  const providers = within(screen.getByRole('group', { name: '로그인 수단 필터' }));
  fireEvent.click(signup.getByRole('button', { name: '가입 미완료 1' }));
  fireEvent.click(providers.getByRole('button', { name: '카카오 1' }));
  fireEvent.click(providers.getByRole('button', { name: 'Apple 1' }));
  await waitFor(() => expect(requests.at(-1)?.searchParams.get('providers')).toBe('kakao,apple'));
  expect(requests.at(-1)?.searchParams.get('signup')).toBe('incomplete');
  expect(requests.at(-1)?.searchParams.get('status')).toBe('active');
  expect(requests.at(-1)?.searchParams.get('page')).toBe('1');
  expect((await screen.findAllByText('연결회원')).length).toBeGreaterThan(0);
  expect(providers.getByRole('button', { name: '카카오 1' })).toHaveAttribute('aria-pressed', 'true');
  expect(providers.getByRole('button', { name: 'Apple 1' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getAllByText('입력 보류').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
  await waitFor(() => expect(requests.at(-1)?.searchParams.has('providers')).toBe(false));
  expect(requests.at(-1)?.searchParams.has('signup')).toBe(false);
  expect(requests.at(-1)?.searchParams.has('status')).toBe(false);
  client.clear();
});
