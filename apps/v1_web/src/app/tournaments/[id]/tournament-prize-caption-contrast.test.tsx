import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { V1TournamentDetail } from '@/types/api';
import { TournamentDetailView } from './tournament-detail-client';

vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/synthetic-prize',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function renderPage(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function makeTournament(overrides: Partial<V1TournamentDetail> & Pick<V1TournamentDetail, 'id' | 'status' | 'format'>): V1TournamentDetail {
  return {
    kind: 'regular_tournament',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
    registrationDeadlineAt: null,
    rosterDeadlineAt: null,
    bracketPublishedAt: '2026-01-01T00:00:00.000Z',
    bracketPublishScheduledAt: null,
    scheduledAt: null,
    scheduledEndAt: null,
    venue: null,
    latitude: null,
    longitude: null,
    coverImageUrl: null,
    teamCount: 8,
    minPlayers: 5,
    maxPlayers: 10,
    genderCategory: null,
    genderMinMale: null,
    genderMaxMale: null,
    genderMinFemale: null,
    genderMaxFemale: null,
    entryFee: 0,
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
    promoHomeEnabled: false,
    promoHomeTitle: null,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
    promoHomePriority: 0,
    promoListEnabled: false,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    promoListPriority: 0,
    campaignSlug: null,
    rulesText: null,
    yellowAccumulationLimit: null,
    redCardSuspensionMatches: null,
    refundPolicyText: null,
    confirmedCount: 0,
    participantTeams: [],
    pendingPaymentCount: 0,
    groups: [],
    fixtures: [],
    leagueFixtures: [],
    announcements: [],
    sponsors: [],
    reviews: [],
    reviewsTotalCount: 0,
    awards: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Resolve the actual rendered inline token against repository CSS; jsdom does not
// reliably compute custom properties. These calculations are not browser/alpha QA.
const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function tokens(dark = false) {
  const declarations = (selector: RegExp) => {
    const block = css.match(selector)?.[1];
    if (!block) throw new Error('Missing theme declarations');
    return [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, key, value]) => [key, value.trim()] as const);
  };
  return new Map([...declarations(/:root\s*\{([^}]*)\}/), ...(dark ? declarations(/:root\.dark\s*\{([^}]*)\}/) : [])]);
}
function resolveToken(value: string, dark = false): string {
  const theme = tokens(dark);
  const visited = new Set<string>();
  while (value.startsWith('var(')) {
    const key = value.match(/^var\((--[\w-]+)\)$/)?.[1];
    if (!key || visited.has(key) || !theme.has(key)) throw new Error(`Invalid or missing token: ${value}`);
    visited.add(key);
    value = theme.get(key)!;
  }
  return value;
}
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Expected opaque CSS color, received ${hex}`);
    return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  };
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe('actual tournament prize caption contrast', () => {
  it.each(['open', 'completed'] as const)('%s uses a sufficient light caption token while preserving the surrounding card', (status) => {
    const tournament = makeTournament({ id: 'synthetic-prize', status, format: 'knockout', prizeSummary: '합성 상금 안내', prizeBreakdown: '우승 300,000원 / 준우승 200,000원' });
    renderPage(<TournamentDetailView tournament={tournament} myRegistration={null} />);
    const region = screen.getByRole('region', { name: '상품 및 상금 안내' });
    const caption = within(region).getByText('상품 및 상금');
    const card = caption.closest<HTMLElement>('.tm-card');
    expect(card).not.toBeNull();
    expect(caption).toHaveClass('tm-text-caption');
    expect(caption.style.fontWeight).toBe('700');
    expect(caption.style.color).toBe('var(--grey700)');
    expect(card!.style.background).toBe('var(--orange50)');
    expect(card).not.toHaveClass('tm-on-tint');
    const foreground = resolveToken(caption.style.color);
    const background = resolveToken(card!.style.background);
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);

    const body = within(region).getByText('합성 상금 안내');
    expect(body).toHaveClass('tm-text-body-lg');
    expect(body.style.color).toBe('var(--orange700)');
    expect(body.style.fontWeight).toBe('800');
    const rank = within(region).getByText('우승');
    expect(rank.style.color).toBe('var(--text-strong)');
    expect(rank.parentElement!.style.color).toBe('var(--text-body)');
    expect(rank.parentElement!.style.background).toBe('var(--tint-orange)');
    expect(rank.parentElement).not.toHaveClass('tm-on-tint');
    // Same old/new dark foreground; no actual dark contrast or alpha-after claim.
    expect(resolveToken(caption.style.color, true)).toBe(resolveToken('var(--text-muted)', true));
  });

  it.each(['open', 'completed'] as const)('does not invent a prize card when %s has no prize summary', (status) => {
    renderPage(<TournamentDetailView tournament={makeTournament({ id: 'synthetic-no-prize', status, format: 'knockout' })} myRegistration={null} />);
    expect(screen.queryByRole('region', { name: '상품 및 상금 안내' })).not.toBeInTheDocument();
  });

  it('does not invent prize content from a blank summary', () => {
    renderPage(<TournamentDetailView tournament={makeTournament({ id: 'synthetic-blank-prize', status: 'completed', format: 'knockout', prizeSummary: '  ' })} myRegistration={null} />);
    expect(screen.queryByText('상품 및 상금')).not.toBeInTheDocument();
  });
});
