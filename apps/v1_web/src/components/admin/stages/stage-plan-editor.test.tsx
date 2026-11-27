import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StagePlanEditor } from './stage-plan-editor';
import { useState } from 'react';
import { initialStagePlan, rankedLeagueStagePlan, stagePlanError } from '@/lib/stage-plan';
vi.mock('@/components/v1-ui/confirm-modal', () => ({ useConfirm: () => ({ confirm: async () => true, ConfirmModal: null }) }));
afterEach(cleanup);
function Editor() { const [plan, setPlan] = useState(initialStagePlan); return <StagePlanEditor value={plan} onChange={setPlan} />; }
describe('단계형 대회 생성 계약', () => {
  it('생성 폼 안에서 템플릿을 적용해도 대회 저장이나 다음 단계 제출을 실행하지 않는다', async () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(<form onSubmit={submit}><Editor /></form>);
    fireEvent.click(screen.getByRole('button', { name: '20팀 순위별 리그 템플릿' }));
    expect(await screen.findByText('모집 20팀 · 2단계 · 예상 70경기')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '다음 단계 추가' }));
    expect(screen.getByText('모집 20팀 · 3단계 · 예상 71경기')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
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
    expect(screen.getAllByText(/팀 · 풀리그/)).toHaveLength(9);
    fireEvent.click(screen.getByText('1위 리그 · 5팀 · 풀리그'));
    const expanded = screen.getByText('1위 리그 · 5팀 · 풀리그').closest('details')!;
    expect(expanded.open).toBe(true);
    expect(document.querySelectorAll('details[open]')).toHaveLength(1);
    expect((within(within(expanded).getByRole('combobox', { name: '1번 자리' })).getByRole('option', { name: '예선 · A조 1위' }) as HTMLOptionElement).selected).toBe(true);
  });
  it('순위 출처 중복은 저장 가능한 구성으로 취급하지 않는다', () => {
    const plan = rankedLeagueStagePlan(); plan.stages[1].pools[0].sources[1] = plan.stages[1].pools[0].sources[0];
    expect(stagePlanError(plan)).toContain('중복');
  });
});
