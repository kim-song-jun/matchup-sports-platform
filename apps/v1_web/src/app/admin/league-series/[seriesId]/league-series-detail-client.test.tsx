import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  useV1AdminLeagueSeries,
  useV1CommitLeaguePromotions,
  useV1PreviewLeaguePromotions,
  useV1SeedLeagueSeason,
} from '@/hooks/use-v1-api';
import LeagueSeriesDetailClient from './league-series-detail-client';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueSeries: vi.fn(),
  useV1CommitLeaguePromotions: vi.fn(),
  useV1PreviewLeaguePromotions: vi.fn(),
  useV1SeedLeagueSeason: vi.fn(),
}));
vi.mock('@/components/admin', () => ({
  AdminEmpty: ({ title, description, action }: { title: string; description: string; action?: ReactNode }) => <div>{title}{description}{action}</div>,
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  AdminPageSkeleton: () => <div>loading</div>,
  AdminStatusPill: ({ label, status }: { label?: string; status: string }) => <span>{label ?? status}</span>,
  AdminToasts: () => null,
  useAdminToast: () => ({ toasts: [], showToast: vi.fn() }),
}));
vi.mock('@/components/admin/season-seed-panel', () => ({ SeasonSeedPanel: () => <div>seed season</div> }));

const useSeries = vi.mocked(useV1AdminLeagueSeries, { partial: true });
const usePreview = vi.mocked(useV1PreviewLeaguePromotions, { partial: true });
const useCommit = vi.mocked(useV1CommitLeaguePromotions, { partial: true });
const useSeed = vi.mocked(useV1SeedLeagueSeason, { partial: true });

const SERIES = {
  id: 'series-1', title: '부산 풋살 리그', sportId: 'sport-1', regionId: 'region-1', tierCount: 2,
  tierLabels: ['1부', '2부'], promotionRule: { mode: 'fixed' as const, fixedCount: 1 }, state: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  seasons: [{ seasonNo: 1, allCompleted: true, tiers: [{ leagueId: 'league-1', tier: 1, tierLabel: '1부', state: 'completed', title: '1부', teamCount: 2 }] }],
};

const VALID_PREVIEW = {
  seriesId: 'series-1', seasonNo: 1, rule: { mode: 'fixed' as const, fixedCount: 1 }, ruleFingerprint: 'fp', alreadyDecided: false,
  warnings: [],
  tiers: [1, 2].map((tier) => ({
    tier, tierLabel: `${tier}부`, leagueId: `league-${tier}`, teamCount: 2, promoteCount: 1, relegateCount: 1,
    skippedByMajorityGuard: false, nextSeasonTeamCount: 2, tieBreakGroups: [],
    entries: [
      { teamId: `team-${tier}-a`, teamName: `팀 ${tier}A`, tier, position: 1, computedKind: tier === 1 ? 'stayed' as const : 'promoted' as const, toTier: tier === 1 ? 1 : 1, toTierLabel: '1부', points: 6, played: 2, wins: 2, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 1, goalDifference: 2 },
      { teamId: `team-${tier}-b`, teamName: `팀 ${tier}B`, tier, position: 2, computedKind: tier === 1 ? 'relegated' as const : 'stayed' as const, toTier: tier === 1 ? 2 : 2, toTierLabel: '2부', points: 3, played: 2, wins: 1, draws: 0, losses: 1, goalsFor: 2, goalsAgainst: 2, goalDifference: 0 },
    ],
  })),
};

function setup() {
  const refetch = vi.fn();
  useSeries.mockReturnValue({ data: SERIES, isPending: false, isError: false, refetch } as never);
  useSeed.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  useCommit.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  usePreview.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  return refetch;
}

describe('LeagueSeriesDetailClient promotion state', () => {
  it('does not mount an actionable panel when preview reports an already-decided season', () => {
    const refetch = setup();
    const previewMutate = vi.fn((_seasonNo, options) => options.onSuccess({ alreadyDecided: true }));
    usePreview.mockReturnValue({ mutate: previewMutate, isPending: false } as never);

    render(<LeagueSeriesDetailClient seriesId="series-1" />);
    fireEvent.click(screen.getByRole('button', { name: '승강 후보 계산' }));

    expect(previewMutate).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '승강 최종 승인' })).not.toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
  });

  it('clears a stale panel and refreshes after an already-decided commit conflict', () => {
    const refetch = setup();
    const commitMutate = vi.fn((_payload, options) => options.onError({ code: 'PROMOTION_ALREADY_DECIDED' }));
    useCommit.mockReturnValue({ mutate: commitMutate, isPending: false } as never);
    usePreview.mockReturnValue({ mutate: vi.fn((_seasonNo, options) => options.onSuccess(VALID_PREVIEW)), isPending: false } as never);

    render(<LeagueSeriesDetailClient seriesId="series-1" />);
    fireEvent.click(screen.getByRole('button', { name: '승강 후보 계산' }));
    fireEvent.click(screen.getByRole('button', { name: '승강 최종 승인' }));

    expect(commitMutate).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '승강 최종 승인' })).not.toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
  });

  it('hides a valid preview when refreshed series data contains the next season', () => {
    const refetch = setup();
    let currentSeries = SERIES;
    useSeries.mockImplementation(() => ({ data: currentSeries, isPending: false, isError: false, refetch } as never));
    usePreview.mockReturnValue({ mutate: vi.fn((_seasonNo, options) => options.onSuccess(VALID_PREVIEW)), isPending: false } as never);
    const view = render(<LeagueSeriesDetailClient seriesId="series-1" />);

    fireEvent.click(screen.getByRole('button', { name: '승강 후보 계산' }));
    expect(screen.getByRole('button', { name: '승강 최종 승인' })).toBeInTheDocument();

    currentSeries = { ...SERIES, seasons: [...SERIES.seasons, { seasonNo: 2, allCompleted: false, tiers: [] }] };
    view.rerender(<LeagueSeriesDetailClient seriesId="series-1" />);

    expect(screen.queryByRole('button', { name: '승강 최종 승인' })).not.toBeInTheDocument();
  });

  it('keeps the proposal visible for a transient commit error', () => {
    setup();
    const commitMutate = vi.fn((_payload, options) => options.onError({ code: 'NETWORK_ERROR', message: '잠시 후 다시 시도해 주세요.' }));
    useCommit.mockReturnValue({ mutate: commitMutate, isPending: false } as never);
    usePreview.mockReturnValue({ mutate: vi.fn((_seasonNo, options) => options.onSuccess(VALID_PREVIEW)), isPending: false } as never);

    render(<LeagueSeriesDetailClient seriesId="series-1" />);
    fireEvent.click(screen.getByRole('button', { name: '승강 후보 계산' }));
    fireEvent.click(screen.getByRole('button', { name: '승강 최종 승인' }));

    expect(commitMutate).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '승강 최종 승인' })).toBeInTheDocument();
  });
});
