import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TeamMatchCreatePageView } from './team-matches-page';
import { getTeamMatchCreateViewModel } from './team-matches.view-model';

describe('team match creation team step empty states', () => {
  function teamStepModel() {
    const model = getTeamMatchCreateViewModel('team');
    model.form = {
      selectedTeamId: '', selectedSportId: '', regionId: '', regions: [],
      onSelectTeam: vi.fn(), onSelectSport: vi.fn(), onFieldChange: vi.fn(), onRegionChange: vi.fn(),
      onBack: vi.fn(), onNext: vi.fn(), onSubmit: vi.fn(),
    };
    return model;
  }

  it('disables Next while teams are loading or unavailable', () => {
    const onNext = vi.fn();
    const loading = teamStepModel();
    loading.isLoadingTeams = true;
    loading.form!.onNext = onNext;
    const { rerender } = render(<TeamMatchCreatePageView model={loading} />);
    const next = screen.getByRole('button', { name: '다음' });
    expect(next).toBeDisabled();
    next.click();
    expect(onNext).not.toHaveBeenCalled();

    const failed = teamStepModel();
    failed.teamLoadError = { message: '팀 목록 오류', onRetry: vi.fn() };
    failed.form!.onNext = onNext;
    rerender(<TeamMatchCreatePageView model={failed} />);
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    screen.getByRole('button', { name: '다음' }).click();
    expect(onNext).not.toHaveBeenCalled();

    const unauthorized = teamStepModel();
    unauthorized.teams = [{ name: '읽기 전용 팀', sport: '풋살', members: 4, role: '멤버', disabled: true }];
    unauthorized.form!.onNext = onNext;
    rerender(<TeamMatchCreatePageView model={unauthorized} />);
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    screen.getByRole('button', { name: '다음' }).click();
    expect(onNext).not.toHaveBeenCalled();

    const unselected = teamStepModel();
    unselected.teams = [{ name: '권한 팀', sport: '풋살', members: 4, role: '팀장', disabled: false }];
    unselected.form!.onNext = onNext;
    rerender(<TeamMatchCreatePageView model={unselected} />);
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    screen.getByRole('button', { name: '다음' }).click();
    expect(onNext).not.toHaveBeenCalled();

    const selected = teamStepModel();
    selected.teams = [{ name: '권한 팀', sport: '풋살', members: 4, role: '팀장', selected: true, disabled: false }];
    selected.form!.onNext = onNext;
    rerender(<TeamMatchCreatePageView model={selected} />);
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
    screen.getByRole('button', { name: '다음' }).click();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('offers team creation when no teams are available', () => {
    const model = getTeamMatchCreateViewModel('team');
    model.teams = [];
    model.form = {
      selectedTeamId: '', selectedSportId: '', regionId: '', regions: [],
      onSelectTeam: vi.fn(), onSelectSport: vi.fn(), onFieldChange: vi.fn(), onRegionChange: vi.fn(),
      onBack: vi.fn(), onNext: vi.fn(), onSubmit: vi.fn(),
    };

    render(<TeamMatchCreatePageView model={model} />);

    expect(screen.getByRole('link', { name: '팀 만들기' })).toHaveAttribute('href', '/teams/new');
  });

  it('offers both team creation and team discovery when every team lacks permission', () => {
    const model = getTeamMatchCreateViewModel('team');
    model.teams = [{ name: '읽기 전용 팀', sport: '풋살', members: 4, role: '멤버', disabled: true }];
    model.form = {
      selectedTeamId: '', selectedSportId: '', regionId: '', regions: [],
      onSelectTeam: vi.fn(), onSelectSport: vi.fn(), onFieldChange: vi.fn(), onRegionChange: vi.fn(),
      onBack: vi.fn(), onNext: vi.fn(), onSubmit: vi.fn(),
    };

    render(<TeamMatchCreatePageView model={model} />);

    expect(screen.getByRole('link', { name: '팀 만들기' })).toHaveAttribute('href', '/teams/new');
    expect(screen.getByRole('link', { name: '팀 찾기' })).toHaveAttribute('href', '/teams');
  });
});
