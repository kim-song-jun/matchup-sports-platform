import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { V1TeamMatch } from '@/types/api';
import { toTeamMatch } from './team-matches.card-model';
import { TeamMatchCreatePageView, TeamMatchDetailPageView, TeamMatchListPageView } from './team-matches-page';
import { getTeamMatchCreateViewModel, getTeamMatchDetailViewModel, getTeamMatchListViewModel } from './team-matches.view-model';
import { buildTeamMatchPayloadResult } from './team-matches.validation';
import type { TeamMatchCreateViewModel } from './team-matches.types';

const explanation = '신청하는 팀의 비용이에요';

vi.mock('next/navigation', () => ({
  usePathname: () => '/team-matches/new/condition',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function renderPage(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function apiMatch(costNote: string | null, league = false): V1TeamMatch {
  return {
    id: 'cost-contract-match', title: '비용 계약 팀매치', sportName: '풋살',
    placeName: '합성 경기장', startsAt: '2099-10-10T10:00:00.000Z',
    capacityText: '1/2', status: 'recruiting', costNote,
    ...(league ? { league: { leagueId: 'synthetic-league', title: '합성 리그' } } : {}),
  };
}

describe('selected C: keep the payer label and explain the applicant perspective', () => {
  it.each([
    ['총 50,000원 · 상대팀 25,000원', 50000, 25000],
    ['총 50,000원 · 상대팀 10,000원', 50000, 10000],
    ['총 50,000원 · 상대팀 0원', 50000, 0],
  ] as const)('maps and renders %s without inventing equal allocation', (costNote, cost, opponentCost) => {
    const model = getTeamMatchDetailViewModel();
    model.match = { ...model.match, ...toTeamMatch(apiMatch(costNote), model.match) };
    const { container } = renderPage(<TeamMatchDetailPageView model={model} />);
    const hero = container.querySelector<HTMLElement>('.tm-info-cost-hero');

    expect(model.match.cost).toBe(cost);
    expect(model.match.opponentCost).toBe(opponentCost);
    expect(within(hero!).getByText('상대팀 부담금')).toBeInTheDocument();
    expect(within(hero!).getByText(explanation)).toBeVisible();
    expect(screen.queryByText(/각 팀/)).not.toBeInTheDocument();
    if (opponentCost === 0) {
      expect(within(hero!).getByText('무료초청')).toBeInTheDocument();
      expect(within(hero!).getByText('실제 청구 없어요')).toBeInTheDocument();
    } else {
      expect(within(hero!).getByText(opponentCost.toLocaleString('ko-KR'))).toBeInTheDocument();
      expect(screen.queryByText('무료초청')).not.toBeInTheDocument();
    }
    expect(screen.getByText(cost.toLocaleString('ko-KR'))).toBeInTheDocument();
  });

  it.each([null, '총 50,000원'] as const)('does not add a payer or free claim to unknown cost %s', (costNote) => {
    const model = getTeamMatchDetailViewModel();
    model.match = { ...model.match, ...toTeamMatch(apiMatch(costNote), model.match) };
    renderPage(<TeamMatchDetailPageView model={model} />);

    expect(screen.queryByText('상대팀 부담금')).not.toBeInTheDocument();
    expect(screen.queryByText(explanation)).not.toBeInTheDocument();
    expect(screen.queryByText('무료초청')).not.toBeInTheDocument();
    if (costNote) expect(screen.getByText('50,000')).toBeInTheDocument();
    else expect(screen.queryByText('총비용')).not.toBeInTheDocument();
  });

  it.each([25000, 10000, 0])('keeps list amounts and describes whose cost is shown: %i', (opponentCost) => {
    const model = getTeamMatchListViewModel();
    model.matches = [toTeamMatch(apiMatch(`총 50,000원 · 상대팀 ${opponentCost}원`), model.matches[0])];
    renderPage(<TeamMatchListPageView model={model} />);
    const card = screen.getByRole('link', { name: /비용 계약 팀매치/ });

    expect(card).toHaveAccessibleName(new RegExp(explanation));
    expect(card.getAttribute('href')).toContain('/team-matches/cost-contract-match');
    if (opponentCost === 0) expect(within(card).getByText('무료초청')).toBeInTheDocument();
    else expect(within(card).getByText(opponentCost.toLocaleString('ko-KR'))).toBeInTheDocument();
    expect(within(card).queryByText(/각 팀/)).not.toBeInTheDocument();
  });

  it.each([false, true])('keeps unknown and league list semantics (league=%s)', (league) => {
    const model = getTeamMatchListViewModel();
    model.matches = [toTeamMatch(apiMatch(null, league), model.matches[0])];
    renderPage(<TeamMatchListPageView model={model} />);
    expect(screen.getByText(league ? '경기 보기' : '비용 미정')).toBeInTheDocument();
    expect(screen.queryByText(explanation, { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText('무료초청')).not.toBeInTheDocument();
  });

  it.each([25000, 10000, 0])('keeps the preview and actual costNote payload for applicant cost %i', (opponentCost) => {
    const model = getTeamMatchCreateViewModel('confirm');
    model.draft = { ...model.draft, cost: 50000, opponentCost, title: '합성 비용 매치', venue: '합성 경기장', date: '2099-10-10', startTime: '19:00', endTime: '', deadlineDate: '', deadlineTime: '' };
    renderPage(<TeamMatchCreatePageView model={model} />);
    expect(screen.getByText(explanation)).toBeVisible();
    expect(screen.getByText(`총 50,000원 · 상대팀 ${opponentCost.toLocaleString('ko-KR')}원`)).toBeInTheDocument();
    const payload = buildTeamMatchPayloadResult(model.draft, 'team-1', 'sport-futsal', 'region-1').payload;
    expect(payload?.costNote).toBe(`총 50,000원 · 상대팀 ${opponentCost.toLocaleString('ko-KR')}원`);
    expect(payload).not.toHaveProperty('shareMode');
  });

  it.each(['condition', 'edit'] as const)('explains the existing input label in %s and keeps sequential edits/Back', (step) => {
    const onBack = vi.fn();
    function FormHarness() {
      const base = getTeamMatchCreateViewModel(step);
      const [draft, setDraft] = useState({ ...base.draft, cost: 50000, opponentCost: 25000 });
      const form: NonNullable<TeamMatchCreateViewModel['form']> = {
        selectedTeamId: 'team-1', selectedSportId: 'sport-futsal', regionId: 'region-1', regions: [],
        onSelectTeam: vi.fn(), onSelectSport: vi.fn(), onRegionChange: vi.fn(),
        onFieldChange: (field, value) => setDraft((current) => ({ ...current, [field]: value })),
        onBack, onNext: vi.fn(), onSubmit: vi.fn(),
      };
      return <TeamMatchCreatePageView model={{ ...base, draft, form }} />;
    }
    renderPage(<FormHarness />);
    const input = screen.getByLabelText('상대팀 부담금');
    expect(input.closest('.tm-create-field')).toHaveTextContent(explanation);
    fireEvent.change(input, { target: { value: '10000' } });
    expect(input).toHaveValue(10000);
    fireEvent.change(input, { target: { value: '0' } });
    expect(input).toHaveValue(0);
    expect(screen.getByLabelText('총비용')).toHaveValue(50000);
    fireEvent.click(screen.getByRole('button', { name: step === 'edit' ? '변경 취소' : '이전' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
