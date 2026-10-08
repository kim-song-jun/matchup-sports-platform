import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailLoginClient } from '@/components/auth/email-login-client';
import { v1Get } from '@/lib/api-client';
import { createV1QueryClient } from '@/lib/query-client';
import { v1Keys } from '@/lib/query-keys';
import { V1_SESSION_HINT_KEY, V1_USER_ID_KEY } from '@/lib/session-storage';
import type { V1AuthMe, V1AuthSessionResponse, V1TournamentDetail, V1TournamentFixture, V1TournamentReview } from '@/types/api';
import { AwardsPageClient } from '../awards/awards-page-client';
import { TournamentReviewsPageClient } from './reviews-page-client';

vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/t1/reviews',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const server = setupServer();
const api = '*/api/v1';
const loginHint = '로그인하면 참가팀의 팀장·매니저는 후기를 작성할 수 있어요.';
const roleHint = '대회 후기는 참가팀의 팀장·매니저가 작성해요. 팀원은 맞붙은 상대 선수에 대한 후기를 남길 수 있어요.';
const auth: V1AuthMe = {
  user: { id: 'user-1', email: null, onboardingStatus: 'completed' },
  profile: { displayName: '참가자', avatarUrl: null },
};
const tournament: V1TournamentDetail = {
  id: 't1', sportId: 'futsal', sport: { code: 'futsal', name: '풋살' }, title: '세션 확인 대회',
  status: 'completed', format: 'knockout', kind: 'regular_tournament',
  registrationDeadlineAt: null, rosterDeadlineAt: null, bracketPublishedAt: null, bracketPublishScheduledAt: null,
  scheduledAt: null, scheduledEndAt: null, venue: null, latitude: null, longitude: null, coverImageUrl: null,
  teamCount: 8, minPlayers: 5, maxPlayers: 10, genderCategory: null,
  genderMinMale: null, genderMaxMale: null, genderMinFemale: null, genderMaxFemale: null,
  entryFee: 0, entryFeeConfigured: true, prizePool: null, prizeSummary: null, prizeBreakdown: null,
  promoHomeEnabled: false, promoHomeTitle: null, promoHomeSubtitle: null, promoHomeImageUrl: null,
  promoHomeBadgeText: null, promoHomeDateText: null, promoHomeTeamsText: null,
  promoHomeLocationText: null, promoHomePrizeText: null, promoHomePriority: 0,
  promoListEnabled: false, promoListTitle: null, promoListSubtitle: null, promoListImageUrl: null,
  promoListBadgeText: null, promoListDateText: null, promoListTeamsText: null,
  promoListLocationText: null, promoListPrizeText: null, promoListPriority: 0,
  campaignSlug: null, rulesText: null, yellowAccumulationLimit: null, redCardSuspensionMatches: null,
  refundPolicyText: null, confirmedCount: 0, participantTeams: [], pendingPaymentCount: 0,
  groups: [], fixtures: [], leagueFixtures: [], announcements: [], sponsors: [], reviews: [],
  reviewsTotalCount: 0, awards: [], createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z',
};
const completedFixture: V1TournamentFixture = {
  id: 'fixture-1', groupId: null, round: '결승', fixtureNumber: 1, legNumber: 1,
  scheduledAt: null, venue: null, status: 'completed', liveStatus: 'ended',
  homeRegistrationId: 'home', homeTeamId: 'home', homeTeamName: '홈팀', homeTeamLogoUrl: null,
  awayRegistrationId: 'away', awayTeamId: 'away', awayTeamName: '원정팀', awayTeamLogoUrl: null,
  result: { homeScore: 1, awayScore: 0, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null,
    note: null, recordedAt: '2026-10-08T00:00:00.000Z', goals: [] }, videos: [],
};
const writtenReview: V1TournamentReview = {
  id: 'review-1', rating: 5, comment: '즐거운 대회였어요.', photoUrls: [],
  teamName: '홈팀', authorId: 'user-1', authorNickname: '참가자', authorProfileImageUrl: null,
  createdAt: '2026-10-08T00:00:00.000Z',
};
function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: '2026-10-08T00:00:00.000Z' });
}
function failure(statusCode: number, message: string) {
  return HttpResponse.json({ status: 'error', statusCode, code: statusCode === 401 ? 'UNAUTHENTICATED' : 'SERVICE_UNAVAILABLE',
    message, timestamp: '2026-10-08T00:00:00.000Z' }, { status: statusCode });
}
const clients: QueryClient[] = [];
function renderPage(page: '후기' | '시상', client = new QueryClient({
  defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } },
})) {
  clients.push(client);
  return render(<QueryClientProvider client={client}>
    {page === '후기' ? <TournamentReviewsPageClient tournamentId="t1" /> : <AwardsPageClient tournamentId="t1" />}
  </QueryClientProvider>);
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  window.localStorage.clear();
  server.use(
    http.get(`${api}/auth/me`, ({ request }) => {
      expect(request.credentials).toBe('include');
      return ok(auth);
    }),
    http.get(`${api}/tournaments/t1`, () => ok(tournament)),
    http.get(`${api}/tournaments/t1/reviews`, () => ok({ items: [], total: 0, page: 1, pageSize: 10 })),
    http.get(`${api}/tournaments/t1/participant-check`, () => ok({ isParticipant: true })),
    http.get(`${api}/tournaments/t1/reviews/me`, () => ok(null)),
    http.get(`${api}/tournaments/t1/player-records`, () => ok({ goals: [], assists: [] })),
    http.get(`${api}/tournaments/me/pending-reviews`, () => ok([])),
    http.get(`${api}/reviews`, () => ok({ items: [], pageInfo: { nextCursor: null, hasNext: false } })),
    http.post(`${api}/logs/client-error`, () => ok(null)),
  );
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  server.resetHandlers();
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe.each(['후기', '시상'] as const)('%s — 실제 서버 인증과 후기 자격(MD-QA #57)', (page) => {
  it('localStorage 힌트 없이 쿠키 인증된 참가팀 관리자는 후기 작성 폼을 열 수 있다', async () => {
    renderPage(page);
    fireEvent.click(await screen.findByRole('button', { name: '+ 후기 쓰기' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.queryByText(loginHint)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();
  });

  it('쿠키 인증만으로 참가팀 관리 권한을 부여하지 않는다', async () => {
    server.use(http.get(`${api}/tournaments/t1/participant-check`, () => ok({ isParticipant: false })));
    renderPage(page);
    expect(await screen.findByText(roleHint)).toBeVisible();
    expect(screen.queryByRole('button', { name: /후기 쓰기/ })).not.toBeInTheDocument();
    expect(screen.queryByText(loginHint)).not.toBeInTheDocument();
  });

  it('auth/me 401은 남아 있는 localStorage 힌트와 무관하게 로그인 안내를 표시한다', async () => {
    window.localStorage.setItem(V1_SESSION_HINT_KEY, 'active');
    server.use(http.get(`${api}/auth/me`, () => failure(401, '로그인이 필요해요.')));
    renderPage(page);
    expect(await screen.findByText(loginHint)).toBeVisible();
    expect(screen.queryByRole('button', { name: /후기 쓰기/ })).not.toBeInTheDocument();
  });

  it('auth/me 응답을 기다리는 동안 익명 안내나 작성 액션을 표시하지 않는다', async () => {
    let release: (() => void) | undefined;
    const response = new Promise<void>((resolve) => { release = resolve; });
    server.use(http.get(`${api}/auth/me`, async () => { await response; return ok(auth); }));
    try {
      renderPage(page);
      expect(await screen.findByText('후기 작성 자격을 확인하고 있어요.')).toBeVisible();
      expect(screen.queryByText(loginHint)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /후기 쓰기/ })).not.toBeInTheDocument();
    } finally { release?.(); }
    expect(await screen.findByRole('button', { name: '+ 후기 쓰기' })).toBeVisible();
  });

  it('auth/me 서버 실패를 로그인으로 숨기지 않고 재시도로 복구한다', async () => {
    server.use(http.get(`${api}/auth/me`, () => failure(503, '인증 서버가 잠시 응답하지 않아요.')));
    renderPage(page);
    expect(await screen.findByText('인증 서버가 잠시 응답하지 않아요.')).toBeVisible();
    expect(screen.queryByText(loginHint)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /후기 쓰기/ })).not.toBeInTheDocument();
    server.use(http.get(`${api}/auth/me`, () => ok(auth)));
    fireEvent.click(screen.getByRole('button', { name: /다시 시도/ }));
    expect(await screen.findByRole('button', { name: '+ 후기 쓰기' })).toBeVisible();
  });

  it.each(['participant-check', 'reviews/me'])('%s 조회 실패에서 작성 자격을 열지 않고 실제 오류를 표시한다', async (endpoint) => {
    window.localStorage.setItem(V1_SESSION_HINT_KEY, 'active');
    server.use(http.get(`${api}/tournaments/t1/${endpoint}`, () => failure(503, '후기 자격을 불러오지 못했어요.')));
    renderPage(page);
    expect(await screen.findByText('후기 자격을 불러오지 못했어요.')).toBeVisible();
    expect(screen.queryByRole('button', { name: /후기 쓰기/ })).not.toBeInTheDocument();
    expect(screen.queryByText(loginHint)).not.toBeInTheDocument();
  });

  it('내 후기를 조회 중이면 참가팀 관리자도 쓰기 버튼을 받지 않는다', async () => {
    let release: (() => void) | undefined;
    const response = new Promise<void>((resolve) => { release = resolve; });
    let requested = false;
    server.use(http.get(`${api}/tournaments/t1/reviews/me`, async () => {
      requested = true;
      await response;
      return ok(null);
    }));
    try {
      renderPage(page);
      await waitFor(() => expect(requested).toBe(true));
      expect(await screen.findByText('후기 작성 자격을 확인하고 있어요.')).toBeVisible();
      expect(screen.queryByRole('button', { name: /후기 쓰기/ })).not.toBeInTheDocument();
    } finally { release?.(); }
    expect(await screen.findByRole('button', { name: '+ 후기 쓰기' })).toBeVisible();
  });

  it('기작성한 참가팀 관리자는 완료 안내를 받고 새 작성 버튼을 받지 않는다', async () => {
    server.use(http.get(`${api}/tournaments/t1/reviews/me`, () => ok(writtenReview)));
    renderPage(page);
    expect(await screen.findByText(page === '후기' ? '✓ 이 대회 후기를 이미 남겼어요' : '✓ 작성완료')).toBeVisible();
    expect(screen.queryByRole('button', { name: /후기 쓰기/ })).not.toBeInTheDocument();
  });

  it.each([false, true])('SPA 이메일 로그인으로 계정을 바꾸면 이전 사용자의 기작성=%s 캐시를 재사용하지 않는다', async (previouslyWritten) => {
    // Given: 앱의 실제 60초 freshness 안에 A의 HTTP 응답과 이전 버전 키가 모두 남아 있어요.
    const client = createV1QueryClient();
    const nextAuth: V1AuthSessionResponse = {
      user: { ...auth.user, id: 'user-2', email: 'second@example.test' },
      profile: { displayName: '다음 참가자', avatarUrl: null },
      session: { userId: 'user-2', userEmail: 'second@example.test' },
    };
    let activeUser = 'user-1';
    let nextParticipantRequested = false;
    let nextReviewRequested = false;
    let releaseParticipant: (() => void) | undefined;
    let releaseReview: (() => void) | undefined;
    const participantResponse = new Promise<void>((resolve) => { releaseParticipant = resolve; });
    const reviewResponse = new Promise<void>((resolve) => { releaseReview = resolve; });
    server.use(
      http.get(`${api}/auth/me`, () => ok(activeUser === 'user-1' ? auth : nextAuth)),
      http.post(`${api}/auth/login`, ({ request }) => {
        expect(request.credentials).toBe('include');
        activeUser = 'user-2';
        return ok(nextAuth);
      }),
      http.get(`${api}/tournaments/t1/participant-check`, async () => {
        if (activeUser === 'user-1') return ok({ isParticipant: true });
        nextParticipantRequested = true;
        await participantResponse;
        return ok({ isParticipant: previouslyWritten });
      }),
      http.get(`${api}/tournaments/t1/reviews/me`, async () => {
        if (activeUser === 'user-1') return ok(previouslyWritten ? writtenReview : null);
        nextReviewRequested = true;
        await reviewResponse;
        return ok(null);
      }),
    );
    await client.prefetchQuery({
      queryKey: ['tournament-participant-check', 't1'],
      queryFn: () => v1Get<{ isParticipant: boolean }>('/tournaments/t1/participant-check'),
    });
    await client.prefetchQuery({
      queryKey: ['tournament-reviews-me', 't1'],
      queryFn: () => v1Get<V1TournamentReview | null>('/tournaments/t1/reviews/me'),
    });
    const firstPage = renderPage(page, client);
    const completedHint = page === '후기' ? '✓ 이 대회 후기를 이미 남겼어요' : '✓ 작성완료';
    if (previouslyWritten) expect(await screen.findByText(completedHint)).toBeVisible();
    else expect(await screen.findByRole('button', { name: '+ 후기 쓰기' })).toBeVisible();
    firstPage.unmount();

    // When: 실제 로그인 소비자가 HTTP 인증 후 clearV1IdentityCache를 호출하고 같은 SPA 캐시로 돌아와요.
    const loginPage = render(<QueryClientProvider client={client}><EmailLoginClient /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'second@example.test' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'test-password' } });
    const loginForm = screen.getByLabelText('이메일').closest('form');
    if (loginForm === null) throw new Error('이메일 로그인 폼이 없어요.');
    fireEvent.submit(loginForm);
    await waitFor(() => expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBe('active'));
    loginPage.unmount();
    try {
      renderPage(page, client);
      await waitFor(() => expect(client.getQueryData<V1AuthMe>(v1Keys.authMe())?.user.id).toBe('user-2'));

      // Then: B의 두 응답이 확인될 때까지 A의 작성 버튼이나 완료 안내를 보여주지 않아요.
      await waitFor(() => {
        expect(screen.getByText('후기 작성 자격을 확인하고 있어요.')).toBeVisible();
        expect(screen.queryByRole('button', { name: /후기 쓰기/ })).not.toBeInTheDocument();
        expect(screen.queryByText(completedHint)).not.toBeInTheDocument();
        expect(nextParticipantRequested).toBe(true);
        expect(nextReviewRequested).toBe(true);
      });
      await act(async () => { releaseParticipant?.(); });
      expect(screen.getByText('후기 작성 자격을 확인하고 있어요.')).toBeVisible();
      expect(screen.queryByRole('button', { name: /후기 쓰기/ })).not.toBeInTheDocument();
      expect(screen.queryByText(completedHint)).not.toBeInTheDocument();
    } finally {
      releaseParticipant?.();
      releaseReview?.();
    }
    if (previouslyWritten) expect(await screen.findByRole('button', { name: '+ 후기 쓰기' })).toBeVisible();
    else expect(await screen.findByText(roleHint)).toBeVisible();
    expect(screen.queryByText(completedHint)).not.toBeInTheDocument();
  });
});

it('개발 헤더 인증도 auth/me와 참가 자격을 확인한 뒤 쓰기 버튼을 표시한다', async () => {
  vi.stubEnv('NODE_ENV', 'test');
  window.localStorage.setItem(V1_USER_ID_KEY, 'user-1');
  server.use(http.get(`${api}/auth/me`, ({ request }) => {
    expect(request.headers.get('x-v1-user-id')).toBe('user-1');
    return ok(auth);
  }));
  renderPage('후기');
  expect(await screen.findByRole('button', { name: '+ 후기 쓰기' })).toBeVisible();
});

it('쿠키 인증된 팀원에게 대회 쓰기 권한 없이 실제 완료 경기 후기 진입을 보여준다', async () => {
  server.use(
    http.get(`${api}/tournaments/t1`, () => ok({ ...tournament, fixtures: [completedFixture] })),
    http.get(`${api}/tournaments/t1/participant-check`, () => ok({ isParticipant: false })),
    http.get(`${api}/reviews`, ({ request }) => {
      expect(new URL(request.url).searchParams.get('tournamentId')).toBe('t1');
      return ok({ items: [{ sourceType: 'tournament_fixture', sourceId: 'fixture-1', title: '결승', completedAt: null,
        targetType: 'user', targetCount: 1, reviewedCount: 0, remainingCount: 1, state: 'ready' }],
        pageInfo: { nextCursor: null, hasNext: false } });
    }),
  );
  renderPage('후기');
  const link = await screen.findByRole('link', { name: /홈팀 대 원정팀 경기 남은 리뷰 1개 작성/ });
  expect(link).toHaveAttribute('href', expect.stringContaining('fixture-1'));
  expect(await screen.findByText(roleHint)).toBeVisible();
  expect(screen.queryByRole('button', { name: /후기 쓰기/ })).not.toBeInTheDocument();
});
