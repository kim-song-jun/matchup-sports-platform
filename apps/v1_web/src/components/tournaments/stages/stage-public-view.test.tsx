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
});
