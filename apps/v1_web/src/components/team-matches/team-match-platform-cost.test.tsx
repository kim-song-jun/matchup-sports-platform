import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { toTeamMatch } from '@/components/team-matches/team-matches.card-model';
import { TeamMatchDetailPageView, TeamMatchListPageView } from '@/components/team-matches/team-matches-page';
import { getTeamMatchDetailViewModel, getTeamMatchListViewModel } from '@/components/team-matches/team-matches.view-model';
import { draftFromTeamMatchEdit } from '@/components/team-matches/team-matches-create-client';
import { buildTeamMatchPayloadResult } from '@/components/team-matches/team-matches.validation';
import type { V1TeamMatch, V1TeamMatchEdit } from '@/types/api';

vi.mock('next/navigation', () => ({
  usePathname: () => '/team-matches/cost-contract-match',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function renderCost(costNote: string | null, platformManaged: boolean) {
  const api: V1TeamMatch = {
    id: 'cost-contract-match', title: '합성 비용 계약', sportName: '풋살', placeName: '합성 경기장',
    startsAt: '2099-10-10T10:00:00.000Z', capacityText: '1/2', status: 'recruiting', costNote, platformManaged,
  };
  const model = getTeamMatchDetailViewModel();
  model.match = { ...model.match, ...toTeamMatch(api, model.match) };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><TeamMatchDetailPageView model={model} /></QueryClientProvider>);
  return { ...result, match: model.match };
}

describe('현재 v1 mapper → 실제 상세 비용 계약 (#1578)', () => {
  it.each([
    [true, '총 90,000원 · 상대팀 30,000원', 90000, 30000],
    [true, '총 50,000원 · 상대팀 0원', 50000, 0],
    [false, '총 90,000원 · 상대팀 30,000원', 90000, 30000],
  ] as const)('platformManaged=%s, %s의 신청팀 비용을 균등 분담으로 단정하지 않는다', (platform, note, total, applicant) => {
    const { container, match } = renderCost(note, platform);
    expect(match.platformManaged).toBe(platform);
    expect(match.cost).toBe(total);
    expect(match.opponentCost).toBe(applicant);
    const hero = container.querySelector<HTMLElement>('.tm-info-cost-hero');
    expect(hero).not.toBeNull();
    expect(screen.getByText(total.toLocaleString('ko-KR'))).toBeInTheDocument();
    if (applicant === 0) expect(within(hero!).getByText('무료초청')).toBeInTheDocument();
    else expect(within(hero!).getByText(applicant.toLocaleString('ko-KR'))).toBeInTheDocument();
    expect(within(hero!).queryByText('각 팀 부담금')).not.toBeInTheDocument();
    expect(within(hero!).getByText('상대팀 부담금')).toBeInTheDocument();
    expect(within(hero!).getByText('신청하는 팀의 비용이에요')).toBeVisible();
  });

  it.each([null, '총 90,000원'] as const)('플랫폼 비용 %s를 무료나 신청팀 확정 금액으로 만들지 않는다', (note) => {
    const { container, match } = renderCost(note, true);
    expect(match.opponentCost).toBeNull();
    expect(container.querySelector('.tm-info-cost-hero')).toBeNull();
    expect(screen.queryByText('무료초청')).not.toBeInTheDocument();
    expect(screen.queryByText('신청하는 팀의 비용이에요')).not.toBeInTheDocument();
    if (note) expect(screen.getByText('90,000')).toBeInTheDocument();
    else expect(screen.queryByText('총비용')).not.toBeInTheDocument();
  });
});

describe('platform applicant cost adjacent contracts', () => {
  it.each([
    ['총 90,000원 · 상대팀 30,000원', '30,000', true],
    ['총 50,000원 · 상대팀 0원', '무료초청', true],
    [null, '비용 미정', false],
    ['총 90,000원', '비용 미정', false],
  ] as const)('actual mapper → platform list keeps %s', (costNote, label, applicantKnown) => {
    const api: V1TeamMatch = { id: 'platform-cost', title: '합성 플랫폼 비용', sportName: '풋살',
      placeName: '합성 경기장', startsAt: '2099-10-10T10:00:00.000Z', capacityText: '0/2',
      status: 'recruiting', costNote, platformManaged: true };
    const model = getTeamMatchListViewModel();
    model.matches = [toTeamMatch(api, model.matches[0])];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><TeamMatchListPageView model={model} /></QueryClientProvider>);
    const card = screen.getByRole('link', { name: /합성 플랫폼 비용/ });
    expect(within(card).getByText(label)).toBeInTheDocument();
    expect(within(card).getByText('팀 모집 중')).toBeInTheDocument();
    expect(card).toHaveAttribute('href', expect.stringContaining('/team-matches/platform-cost'));
    if (applicantKnown) expect(card).toHaveAccessibleName(/신청하는 팀의 비용이에요/);
    else expect(card).not.toHaveAccessibleName(/신청하는 팀의 비용이에요|무료초청/);
    expect(card).not.toHaveAccessibleName(/각 팀 부담금/);
  });

  it.each([
    ['총 90,000원 · 상대팀 30,000원', 90000, 30000],
    ['총 50,000원 · 상대팀 0원', 50000, 0],
    ['총 120,000원 · 상대팀 60,000원', 120000, 60000],
  ] as const)('actual edit hydration → payload keeps the known costs: %s', (costNote, total, applicant) => {
    const edit: V1TeamMatchEdit = { teamMatchId: 'cost-edit', editable: true, lockedReason: null,
      status: 'recruiting', version: 'v1', form: { hostTeamId: 'team-1', sportId: 'sport-futsal',
        regionId: 'region-1', title: '합성 수정 비용', startsAt: '2099-10-10T10:00:00.000Z',
        manualPlaceName: '합성 경기장', costNote } };
    const draft = draftFromTeamMatchEdit(edit);
    expect(draft.cost).toBe(total);
    expect(draft.opponentCost).toBe(applicant);
    const result = buildTeamMatchPayloadResult(draft, edit.form.hostTeamId, edit.form.sportId, edit.form.regionId);
    expect(result.payload).toBeDefined();
    expect(result).not.toHaveProperty('missingFields');
    expect(result.payload?.costNote).toBe(costNote);
    expect(result.payload).not.toHaveProperty('shareMode');
  });
});
