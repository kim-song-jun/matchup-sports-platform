import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StagePublicView } from './stage-public-view';
import { rankedLeagueStagePlan } from '@/lib/stage-plan';
import type { V1TournamentDetail } from '@/types/api';
afterEach(cleanup);
describe('공개 단계별 순위 범위', () => {
  it('예선과 본선을 선택해 별도 순위를 보여주며 성적을 합치지 않는다', () => {
    const plan = rankedLeagueStagePlan();
    const group = (id: string, poolKey: string, stageKey: string, points: number) => ({ id, poolKey, stageKey, name: id, phase: 'group', groupTeams: [], standings: [{ registrationId: 'same-team', teamId: null, teamName: '동일팀', position: 1, points, wins: points / 3, draws: 0, losses: 0, goalsFor: 1, goalsAgainst: 0 }] });
    render(<StagePublicView tournament={{ id: 't', stagePlan: plan, groups: [group('pre', 'pre-0', 'preliminary', 9), group('main', 'main-0', 'main', 0)], fixtures: [], tieBreakOrder: [] } as unknown as V1TournamentDetail} />);
    expect(screen.getByRole('table', { name: '예선 A조 순위표' })).toHaveTextContent('9');
    expect(screen.queryByRole('table', { name: '본선 1위 리그 순위표' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '진행 단계' }), { target: { value: 'main' } });
    expect(screen.getByRole('table', { name: '본선 1위 리그 순위표' })).toHaveTextContent('0');
    expect(screen.queryByRole('table', { name: '예선 A조 순위표' })).not.toBeInTheDocument();
  });
  it('대회·단계별 동점 순서가 있어도 각 단계 순위표에 규정 문구를 반복하지 않는다', () => {
    const plan = rankedLeagueStagePlan();
    const group = (id: string, poolKey: string, stageKey: string) => ({ id, poolKey, stageKey, name: id, phase: 'group', groupTeams: [], standings: [{ registrationId: 'a', teamId: null, teamName: '동일팀', position: 1, points: 3, wins: 1, draws: 0, losses: 0, goalsFor: 1, goalsAgainst: 0 }] });
    const tournamentOrder = ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw'];
    render(<StagePublicView tournament={{
      id: 't', stagePlan: plan, groups: [group('pre', 'pre-0', 'preliminary'), group('main', 'main-0', 'main')], fixtures: [],
      tieBreakOrder: tournamentOrder,
      stageTieBreakOrders: { main: ['points', 'goals_for', 'goal_difference', 'fewest_goals_against', 'head_to_head', 'fair_play', 'seeded_draw'] },
    } as unknown as V1TournamentDetail} />);
    expect(screen.getByRole('table', { name: '예선 A조 순위표' })).toHaveTextContent('동일팀');
    expect(screen.queryByText(/규정이에요|동점이면/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: '진행 단계' }), { target: { value: 'main' } });
    expect(screen.getByRole('table', { name: '본선 1위 리그 순위표' })).toHaveTextContent('동일팀');
    expect(screen.queryByText(/규정이에요|동점이면/)).not.toBeInTheDocument();
  });
});
