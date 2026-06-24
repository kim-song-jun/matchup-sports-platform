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
    expect(screen.queryByText(/내 주변\s+\d+/)).not.toBeInTheDocument();
  });

  it('renders team list cards from the explicit team fields without stale recruiting copy', () => {
    const base = getTeamListViewModel();
    const model: TeamListViewModel = {
      ...base,
      summary: {
        ...base.summary,
        total: 1,
        recruiting: 1,
        nearby: undefined,
      },
      teams: [
        {
          id: 'team-live-1',
          name: '라이브 팀',
          logo: '라',
          sport: '풋살',
          sports: ['풋살'],
          region: '서울 성동구',
          members: 7,
          capacity: 0,
          status: 'open',
          statusLabel: '가입 신청 가능',
          tags: ['레벨 미설정'],
          genderRule: '성별 무관',
          intro: '짧은 소개',
          next: '',
        },
      ],
    };

    render(<TeamListPageView model={model} />);

    expect(screen.getByText('라이브 팀')).toBeInTheDocument();
    expect(screen.getByText('가입 신청 가능')).toBeInTheDocument();
    expect(screen.getByText('레벨 미설정')).toBeInTheDocument();
    expect(screen.getByText('짧은 소개')).toBeInTheDocument();
    expect(screen.queryByText('가입 신청은 운영진 승인 후 확정돼요.')).not.toBeInTheDocument();
    expect(screen.getByText('자세히 보기 ›')).toBeInTheDocument();
    expect(screen.queryByText('팀 보기 ›')).not.toBeInTheDocument();
    expect(screen.queryByText('알림받기')).not.toBeInTheDocument();
    expect(screen.queryByText('오늘 21:00 정기전')).not.toBeInTheDocument();
  });
});
