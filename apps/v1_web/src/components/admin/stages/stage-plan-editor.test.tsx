import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StagePlanEditor } from './stage-plan-editor';
import { useState } from 'react';
import { initialStagePlan, rankedLeagueStagePlan, stagePlanCounts, stagePlanError } from '@/lib/stage-plan';
import { buildTournamentCreatePayload, INITIAL_TOURNAMENT_CREATE_STATE, mapTournamentToWizardFields, tournamentCreateReducer, hasUnsavedTournamentChanges } from '@/app/admin/tournaments/new/tournament-create-model';
import type { V1Tournament } from '@/types/api';
vi.mock('@/components/v1-ui/confirm-modal', () => ({ useConfirm: () => ({ confirm: async () => true, ConfirmModal: null }) }));
afterEach(cleanup);
function Editor() { const [plan, setPlan] = useState(initialStagePlan); return <StagePlanEditor value={plan} onChange={setPlan} />; }
describe('단계형 대회 생성 계약', () => {
  it('단일 본선에서 토너먼트로 바꾸고 예선 없이 유지할 수 있다', () => {
    render(<Editor />);
    expect(screen.getByRole('status')).toHaveTextContent('모집 4팀 · 1단계 · 예상 6경기');
    fireEvent.change(screen.getByRole('combobox', { name: '경기 방식' }), { target: { value: 'knockout' } });
    expect(screen.getByRole('status')).toHaveTextContent('예상 3경기');
    expect(screen.queryByText('진출 출처 · 시드 순서')).not.toBeInTheDocument();
  });
  it('20팀 템플릿은 5개 예선 리그와 4개 본선 리그·70경기를 실제 폼에 채운다', async () => {
    render(<Editor />); fireEvent.click(screen.getByRole('button', { name: '20팀 순위별 리그 템플릿' }));
    expect(await screen.findByText('모집 20팀 · 2단계 · 예상 70경기')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox', { name: '경기 방식' })).toHaveLength(9);
    expect((within(screen.getAllByRole('combobox', { name: '1번 자리' })[0]).getByRole('option', { name: '예선 · A조 1위' }) as HTMLOptionElement).selected).toBe(true);
  });
  it('대회 저장 payload와 초안 복원에 단계 구성을 보존하고 변경을 감지한다', () => {
    const plan = rankedLeagueStagePlan();
    const state = tournamentCreateReducer(INITIAL_TOURNAMENT_CREATE_STATE, { type: 'set-stage-plan', plan });
    const payload = buildTournamentCreatePayload(state);
    expect(payload).toMatchObject({ teamCount: 20, format: 'league_knockouts', stagePlan: plan, sixTeamMode: false });
    expect(stagePlanCounts(plan)).toEqual({ teams: 20, fixtures: 70 });
    expect(stagePlanError(plan)).toBeNull();
    const restored = mapTournamentToWizardFields({ ...payload, id: 'draft', updatedAt: '2026-11-09T00:00:00Z', stagePlan: plan } as V1Tournament);
    expect(restored.stagePlan).toEqual(plan);
    const changed = tournamentCreateReducer(restored, { type: 'set-stage-plan', plan: initialStagePlan() });
    expect(hasUnsavedTournamentChanges(changed)).toBe(true);
  });
  it('순위 출처 중복은 저장 가능한 구성으로 취급하지 않는다', () => {
    const plan = rankedLeagueStagePlan(); plan.stages[1].pools[0].sources[1] = plan.stages[1].pools[0].sources[0];
    expect(stagePlanError(plan)).toContain('중복');
  });
});
