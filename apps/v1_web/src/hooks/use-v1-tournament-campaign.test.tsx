import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { v1Get, v1Patch, v1Post } from '@/lib/api-client';
import type { V1TournamentCampaign } from '@/types/tournament-campaign';
import {
  useV1AdminTournamentCampaign,
  useV1AdminTournamentCampaignPreview,
  useV1ChangeTournamentCampaignStatus,
  useV1CreateTournamentCampaign,
  useV1TournamentCampaign,
  useV1TournamentCampaignsInfinite,
  useV1UpdateTournamentCampaign,
} from './use-v1-tournament-campaign';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    v1Get: vi.fn(),
    v1Patch: vi.fn(),
    v1Post: vi.fn(),
  };
});

const v1GetMock = vi.mocked(v1Get);
const v1PatchMock = vi.mocked(v1Patch);
const v1PostMock = vi.mocked(v1Post);

function createWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = function TestQueryProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
  return { wrapper, queryClient };
}

const campaign: V1TournamentCampaign = {
  id: 'campaign-1',
  tournamentId: 'tournament-1',
  slug: 'summer-futsal-cup',
  status: 'draft',
  content: {
    version: 1,
    hero: { title: '여름 풋살 컵' },
    intro: { title: '대회 소개', body: '모두가 즐기는 여름 대회예요.' },
    highlightsSectionTitle: '대회 하이라이트',
    highlights: [],
    faqSectionTitle: '자주 묻는 질문',
    faq: [],
  },
  publishedAt: null,
  archivedAt: null,
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
};

describe('tournament campaign hooks', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reads public, admin, and admin preview campaigns through non-conflicting routes', async () => {
    v1GetMock.mockResolvedValue(campaign);
    const publicContext = createWrapperWithClient();
    const publicHook = renderHook(() => useV1TournamentCampaign('summer-futsal-cup'), {
      wrapper: publicContext.wrapper,
    });
    await waitFor(() => expect(publicHook.result.current.isSuccess).toBe(true));
    expect(v1GetMock).toHaveBeenCalledWith('/tournaments/campaigns/summer-futsal-cup');

    v1GetMock.mockClear();
    const adminContext = createWrapperWithClient();
    const adminHook = renderHook(() => useV1AdminTournamentCampaign('tournament-1'), {
      wrapper: adminContext.wrapper,
    });
    await waitFor(() => expect(adminHook.result.current.isSuccess).toBe(true));
    expect(v1GetMock).toHaveBeenCalledWith('/admin/tournaments/tournament-1/campaign');

    v1GetMock.mockClear();
    const previewContext = createWrapperWithClient();
    const previewHook = renderHook(
      () => useV1AdminTournamentCampaignPreview('tournament-1'),
      { wrapper: previewContext.wrapper },
    );
    await waitFor(() => expect(previewHook.result.current.isSuccess).toBe(true));
    expect(v1GetMock).toHaveBeenCalledWith(
      '/admin/tournaments/tournament-1/campaign/preview',
    );
  });

  it('does not request a campaign when its route identity is empty', () => {
    const publicContext = createWrapperWithClient();
    const adminContext = createWrapperWithClient();
    renderHook(() => useV1TournamentCampaign(''), { wrapper: publicContext.wrapper });
    renderHook(() => useV1AdminTournamentCampaign(''), { wrapper: adminContext.wrapper });
    renderHook(() => useV1AdminTournamentCampaignPreview(''), {
      wrapper: createWrapperWithClient().wrapper,
    });
    expect(v1GetMock).not.toHaveBeenCalled();
  });

  it('does not request an admin preview before its campaign exists', () => {
    renderHook(() => useV1AdminTournamentCampaignPreview('tournament-1', false), {
      wrapper: createWrapperWithClient().wrapper,
    });

    expect(v1GetMock).not.toHaveBeenCalled();
  });

  it('loads every requested public campaign page with its cursor and sport filter', async () => {
    v1GetMock
      .mockResolvedValueOnce({ items: [], nextCursor: 'campaign-30' })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const context = createWrapperWithClient();
    const hook = renderHook(
      () => useV1TournamentCampaignsInfinite({ limit: 30, sportCode: 'futsal' }),
      { wrapper: context.wrapper },
    );

    await waitFor(() => expect(hook.result.current.data?.pages).toHaveLength(1));
    expect(hook.result.current.hasNextPage).toBe(true);
    expect(v1GetMock).toHaveBeenNthCalledWith(
      1,
      '/tournaments/campaigns?limit=30&sportCode=futsal',
    );

    await act(async () => {
      await hook.result.current.fetchNextPage();
    });
    await waitFor(() => expect(hook.result.current.data?.pages).toHaveLength(2));
    expect(v1GetMock).toHaveBeenNthCalledWith(
      2,
      '/tournaments/campaigns?cursor=campaign-30&limit=30&sportCode=futsal',
    );
    expect(hook.result.current.hasNextPage).toBe(false);
  });

  it('creates and updates the typed campaign payload through the admin contract', async () => {
    v1PostMock.mockResolvedValue(campaign);
    v1PatchMock.mockResolvedValue({ ...campaign, slug: 'renamed-summer-cup' });
    const { wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const createHook = renderHook(() => useV1CreateTournamentCampaign('tournament-1'), {
      wrapper,
    });

    createHook.result.current.mutate({ slug: campaign.slug, content: campaign.content });
    await waitFor(() => expect(createHook.result.current.isSuccess).toBe(true));
    expect(v1PostMock).toHaveBeenCalledWith('/admin/tournaments/tournament-1/campaign', {
      slug: campaign.slug,
      content: campaign.content,
    });

    const updateHook = renderHook(() => useV1UpdateTournamentCampaign('tournament-1'), {
      wrapper,
    });
    updateHook.result.current.mutate({ slug: 'renamed-summer-cup' });
    await waitFor(() => expect(updateHook.result.current.isSuccess).toBe(true));
    expect(v1PatchMock).toHaveBeenCalledWith('/admin/tournaments/tournament-1/campaign', {
      slug: 'renamed-summer-cup',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['v1', 'tournaments', 'campaigns'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['v1', 'admin', 'tournaments', 'tournament-1', 'campaign', 'preview'],
    });
  });

  it('sends the mandatory status reason and refreshes public discovery contracts', async () => {
    v1PostMock.mockResolvedValue({ ...campaign, status: 'published' });
    const { wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(
      () => useV1ChangeTournamentCampaignStatus('tournament-1'),
      { wrapper },
    );

    result.current.mutate({ status: 'published', reason: '캠페인 검수 완료' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(v1PostMock).toHaveBeenCalledWith(
      '/admin/tournaments/tournament-1/campaign/status',
      { status: 'published', reason: '캠페인 검수 완료' },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['v1', 'tournaments', {}],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['v1', 'admin', 'tournaments', 'tournament-1', 'campaign', 'preview'],
    });
  });
});
