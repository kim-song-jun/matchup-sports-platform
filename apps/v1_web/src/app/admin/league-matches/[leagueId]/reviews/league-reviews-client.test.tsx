import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import type { V1AdminMe, V1AdminTournamentReview } from '@/types/api';
import type { V1AdminLeagueDetail } from '@/types/league-match';
import AdminLeagueReviewsPage from './page';

const LEAGUE_ID = 'synthetic-league-47';
const NOW = '2026-10-08T00:00:00.000Z';
const league: V1AdminLeagueDetail = {
  leagueId: LEAGUE_ID, title: '합성 종료 리그', state: 'completed', isPublic: true, teamIds: [],
  startsOn: NOW, registrationDeadlineAt: null, registrationOpen: false, sportCode: 'futsal',
  coverImageUrl: null, entryFee: 0, entryFeeConfiguredAt: null, bankName: null, bankAccount: null,
  bankHolder: null, activeRegistrationCount: 0, confirmedRegistrationCount: 0, fixtures: [],
};
const visibleReview: V1AdminTournamentReview = {
  id: 'visible-review', authorId: 'synthetic-author', authorNickname: '합성 작성자', authorProfileImageUrl: null,
  teamName: '합성 참가팀', rating: 4, comment: '리그 운영에 대한 실제 후기 계약', photoUrls: [], createdAt: NOW,
  hiddenAt: null, hiddenReason: null,
};
const server = setupServer();
const clients: QueryClient[] = [];
let role: V1AdminMe['adminRole'];
let reviews: V1AdminTournamentReview[];
let reviewReads: string[];
let writes: Array<{ path: string; reason?: string }>;
let hideFails: boolean;

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/league-matches/synthetic-league-47/reviews',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

function success(data: unknown) {
  return HttpResponse.json({ status: 'success', data, timestamp: NOW });
}
function failure(status: number, message: string) {
  return HttpResponse.json({ status: 'error', statusCode: status, code: 'REVIEW_TEST_ERROR', message, timestamp: NOW }, { status });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  role = 'ops'; reviews = [{ ...visibleReview }]; reviewReads = []; writes = []; hideFails = false;
  server.use(
    http.get('*/api/v1/admin/me', () => success({
      userId: 'synthetic-admin', adminUserId: 'synthetic-admin-user', adminRole: role,
      status: 'active', capabilities: [], lastActiveAt: null,
    } satisfies V1AdminMe)),
    http.get('*/api/v1/admin/league-matches/:leagueId', ({ params }) =>
      params.leagueId === LEAGUE_ID ? success(league) : failure(404, '리그를 찾을 수 없어요.')),
    http.get('*/api/v1/admin/tournaments/:id/reviews', ({ params }) => {
      reviewReads.push(String(params.id));
      return params.id === LEAGUE_ID
        ? success({ items: reviews, total: reviews.length, page: 1, pageSize: 10 })
        : failure(404, '후기 대상이 달라요.');
    }),
    http.patch('*/api/v1/admin/tournaments/:id/reviews/:reviewId/:action', async ({ params, request }) => {
      const body = params.action === 'hide' ? await request.json() : null;
      const reason = typeof body === 'object' && body !== null && 'reason' in body && typeof body.reason === 'string' ? body.reason : undefined;
      writes.push({ path: new URL(request.url).pathname, reason });
      if (params.id !== LEAGUE_ID) return failure(404, '후기 대상이 달라요.');
      if (role === 'support') return failure(403, '조회 전용 권한이에요.');
      if (params.action === 'hide' && hideFails) return failure(503, '숨김 처리에 실패했어요.');
      reviews = reviews.map((review) => review.id === params.reviewId
        ? { ...review, hiddenAt: params.action === 'hide' ? NOW : null, hiddenReason: params.action === 'hide' ? reason ?? null : null }
        : review);
      return success(params.action === 'hide' ? { alreadyHidden: false } : { alreadyVisible: false });
    }),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  __resetOverlayHistoryForTests(); __resetNavigationHistoryForTests();
  server.resetHandlers(); vi.unstubAllEnvs();
});

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const page = await AdminLeagueReviewsPage({ params: Promise.resolve({ leagueId: LEAGUE_ID }) });
  render(<QueryClientProvider client={client}>{page}</QueryClientProvider>);
}

describe('QA #47 실제 리그 관리자 route → hooks → 후기 관리', () => {
  it('대회 전용 상세 조회 없이 현재 리그 후기와 관리자 상세 복귀를 연결해요', async () => {
    await renderPage();
    expect(await screen.findByText(visibleReview.comment ?? '')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('합성 종료 리그 후기 관리');
    expect(screen.getByRole('link', { name: '리그 상세로' })).toHaveAttribute('href', `/admin/league-matches/${LEAGUE_ID}`);
    expect(reviewReads).toEqual([LEAGUE_ID]);
  });

  it('관리자 권한을 확인하는 동안 후기 목록이나 쓰기 버튼을 먼저 노출하지 않아요', async () => {
    let release = () => {};
    const ready = new Promise<void>((resolve) => { release = resolve; });
    server.use(http.get('*/api/v1/admin/me', async () => {
      await ready;
      return success({ userId: 'admin', adminUserId: 'admin-user', adminRole: 'support', status: 'active', capabilities: [], lastActiveAt: null });
    }));
    await renderPage();
    try {
      expect(screen.getByRole('status')).toHaveTextContent('후기 관리 정보를 불러오는 중이에요');
      expect(reviewReads).toEqual([]);
      expect(screen.queryByRole('button', { name: '숨기기' })).not.toBeInTheDocument();
    } finally { release(); }
    expect(await screen.findByText(visibleReview.comment ?? '')).toBeVisible();
  });

  it.each([
    [404, '리그를 찾을 수 없어요.'], [403, '리그 조회 권한이 없어요.'], [503, '리그 조회가 잠시 중단됐어요.'],
  ])('리그 조회 %s 오류를 실제 메시지로 표시하고 재시도할 수 있어요', async (status, message) => {
    server.use(http.get('*/api/v1/admin/league-matches/:leagueId', () => failure(status, message)));
    await renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(reviewReads).toEqual([]);
    expect(screen.getByRole('link', { name: '리그 상세로' })).toBeVisible();
    server.use(http.get('*/api/v1/admin/league-matches/:leagueId', () => success(league)));
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText(visibleReview.comment ?? '')).toBeVisible();
  });

  it.each([403, 503])('관리자 권한 조회 %s 실패 시 목록과 모더레이션을 닫아요', async (status) => {
    server.use(http.get('*/api/v1/admin/me', () => failure(status, '관리자 권한을 확인하지 못했어요.')));
    await renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('관리자 권한을 확인하지 못했어요.');
    expect(reviewReads).toEqual([]); expect(writes).toEqual([]);
  });

  it('support는 실제 목록을 읽되 숨김·공개 작업을 제공하지 않아요', async () => {
    role = 'support';
    await renderPage();
    expect(await screen.findByText(visibleReview.comment ?? '')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('조회 전용 권한');
    expect(screen.queryByRole('button', { name: '숨기기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '공개로 전환' })).not.toBeInTheDocument();
    expect(writes).toEqual([]);
  });

  it('ops가 숨김 사유를 저장하고 새 목록을 확인한 뒤 다시 공개해요', async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '숨기기' }));
    const modal = screen.getByRole('dialog', { name: '리뷰 숨기기' });
    fireEvent.change(within(modal).getByLabelText('숨김 사유 (선택)'), { target: { value: '  부적절한 표현  ' } });
    fireEvent.click(within(modal).getByRole('button', { name: '숨기기' }));
    expect(await screen.findByText('숨김 사유: 부적절한 표현')).toBeVisible();
    expect(writes[0]).toEqual({ path: `/api/v1/admin/tournaments/${LEAGUE_ID}/reviews/visible-review/hide`, reason: '부적절한 표현' });
    fireEvent.click(screen.getByRole('button', { name: '공개로 전환' }));
    expect(await screen.findByText('리뷰를 다시 공개했어요.')).toBeVisible();
    await waitFor(() => expect(screen.queryByText('숨김 사유: 부적절한 표현')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '숨기기' })).toBeEnabled();
  });

  it('후기 목록 조회 실패는 빈 목록과 구분하고 재시도해요', async () => {
    server.use(http.get('*/api/v1/admin/tournaments/:id/reviews', () => failure(503, '후기 목록을 읽지 못했어요.')));
    await renderPage();
    expect(await screen.findByText('후기 목록을 읽지 못했어요.')).toBeVisible();
    expect(screen.queryByText('등록된 리뷰가 없어요')).not.toBeInTheDocument();
    server.use(http.get('*/api/v1/admin/tournaments/:id/reviews', () => success({ items: [], total: 0, page: 1, pageSize: 10 })));
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('등록된 리뷰가 없어요')).toBeVisible();
  });

  it('숨김 실패를 성공으로 표시하지 않고 다른 후기의 공개 전환을 유지해요', async () => {
    hideFails = true;
    reviews.push({ ...visibleReview, id: 'hidden-review', authorNickname: '다른 작성자', hiddenAt: NOW, hiddenReason: '기존 사유' });
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '숨기기' }));
    const modal = screen.getByRole('dialog', { name: '리뷰 숨기기' });
    fireEvent.click(within(modal).getByRole('button', { name: '숨기기' }));
    expect(await screen.findByText('숨김 처리에 실패했어요.')).toBeVisible();
    expect(screen.queryByText('리뷰를 숨겼어요.')).not.toBeInTheDocument();
    fireEvent.click(within(modal).getByRole('button', { name: '취소' }));
    fireEvent.click(screen.getByRole('button', { name: '공개로 전환' }));
    expect(await screen.findByText('리뷰를 다시 공개했어요.')).toBeVisible();
    await waitFor(() => expect(screen.getAllByRole('button', { name: '숨기기' })).toHaveLength(2));
  });
});
