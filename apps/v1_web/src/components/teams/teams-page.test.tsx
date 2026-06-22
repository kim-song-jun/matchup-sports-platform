import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeamListPageView } from './teams-page';
import { getTeamListViewModel } from './teams.view-model';
import type { TeamListViewModel } from './teams.types';

describe('TeamListPageView', () => {
  it('does not render sample team cards while the live team list is loading', () => {
    const base = getTeamListViewModel();
    const model: TeamListViewModel = {
      ...base,
      listLoading: true,
      teams: [],
      summary: {
        ...base.summary,
        total: 0,
        recruiting: 0,
        nearby: undefined,
      },
    };

    render(<TeamListPageView model={model} />);

    expect(screen.getByLabelText('팀 목록 불러오는 중')).toBeInTheDocument();
    expect(screen.queryByText('성수 러너스 FC')).not.toBeInTheDocument();
    expect(screen.queryByText(/내 주변/)).not.toBeInTheDocument();
  });
});
