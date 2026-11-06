import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaguePreviousSeasonTeams } from './league-previous-season-teams';

const mutate = vi.hoisted(() => vi.fn());
const previousTeams = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const registrations = vi.hoisted(() => ({ items: [] as Array<{ teamId: string; status: string }> }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueTeams: (leagueId: string) => (leagueId === 'league-0' ? previousTeams.value : { data: undefined, isPending: true }),
  useV1AddPreviousSeasonTeams: () => ({ mutate, isPending: false }),
  useV1AdminTournamentRegistrations: () => ({ data: { items: registrations.items, truncated: false } }),
}));

const team = (teamId: string, name: string, status = 'active') => ({ teamId, name, status });

function renderPicker(currentTeamIds: string[] = ['team-a']) {
  const showToast = vi.fn();
  render(
    <LeaguePreviousSeasonTeams
      leagueId="league-1"
      previousSeason={{ leagueId: 'league-0', title: '가을 리그' }}
      currentTeamIds={new Set(currentTeamIds)}
      disabled={false}
      showToast={showToast}
    />,
  );
  return showToast;
}

describe('LeaguePreviousSeasonTeams', () => {
  beforeEach(() => {
    mutate.mockReset();
    registrations.items = [];
    previousTeams.value = {
      data: { teams: [team('team-a', '팀A'), team('team-b', '팀B'), team('team-c', '팀C'), team('team-d', '팀D', 'inactive')] },
      isPending: false, isError: false,
    };
  });

  it('지난 시즌 팀 중 아직 없는 팀만 보여 주고, 활동하지 않는 팀은 고르지 못한다', () => {
    renderPicker();
    expect(screen.getByRole('group', { name: '지난 시즌 팀 · 가을 리그' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /팀A/ })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /팀B/ })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: /팀D/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '선택한 팀 넣기' })).toBeDisabled();
  });

  it('고른 팀을 한 번에 넣고, 옮긴 명단과 대진 재생성 안내를 알린다', () => {
    const showToast = renderPicker();
    fireEvent.click(screen.getByRole('checkbox', { name: /팀B/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /팀C/ }));
    fireEvent.click(screen.getByRole('button', { name: '선택한 팀 넣기 (2)' }));

    expect(mutate).toHaveBeenCalledWith(['team-b', 'team-c'], expect.any(Object));
    mutate.mock.calls[0][1].onSuccess({ leagueId: 'league-1', teamIds: ['team-b', 'team-c'], carriedPlayerCount: 9, hasExistingFixtures: true });
    expect(showToast).toHaveBeenCalledWith(
      '2팀을 넣었어요. 지난 시즌 명단 9명을 옮겨 왔어요. 대진에 반영하려면 표 아래 "대진 관리"에서 "대진 재생성"을 눌러 주세요.',
      'success',
    );
  });

  // 2026-11-04 알파 QA: 입금 대기 팀을 넣으면 결제가 '대기'인 채 참가 확정이 됐다.
  it('이미 신청이 진행 중인 팀은 고르지 못하고 신청 관리로 안내한다 — 취소한 신청은 다시 고를 수 있다', () => {
    registrations.items = [{ teamId: 'team-b', status: 'awaiting_payment' }, { teamId: 'team-c', status: 'cancelled' }];
    renderPicker();
    expect(screen.getByRole('checkbox', { name: /팀B/ })).toBeDisabled();
    expect(screen.getByText('신청 진행 중 · 신청 관리에서 확정')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /팀C/ })).toBeEnabled();
  });

  it('지난 시즌 팀이 모두 들어와 있으면 그렇게 알린다', () => {
    renderPicker(['team-a', 'team-b', 'team-c', 'team-d']);
    expect(screen.getByText('지난 시즌 팀이 모두 이 리그에 있어요.')).toBeInTheDocument();
  });
});
