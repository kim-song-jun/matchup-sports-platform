import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinalistPreview, FinalistAssignmentInput } from '@/types/finalist-assignment';
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api-client', async (original) => ({ ...await original<typeof import('@/lib/api-client')>(), v1Get: get, v1Post: post }));
import { FinalistAssignmentDialog } from './finalist-assignment-dialog';
function preview(): FinalistPreview {
  return { version: 'a'.repeat(64), blockedReason: null,
    groups: [4, 4, 3, 3].map((size, i) => ({ id: `g${i}`, name: `${i}조`, advanceCount: 2, complete: true, ranks: [],
      teams: Array.from({ length: size }, (_, j) => ({ registrationId: `g${i}-${j}`, teamName: `팀${i}-${j}`, position: j + 1, points: 6 - j, goalsFor: 3, goalsAgainst: j })) })),
    targets: Array.from({ length: 8 }, (_, i) => ({ fixtureId: `f${Math.floor(i / 2)}`, side: i % 2 ? 'AWAY' : 'HOME', label: `8강 자리${i}`, groupId: 'q', slotId: null, currentRegistrationId: null })),
  };
}
function setup(data = preview(), supportsRound12 = false) {
  get.mockResolvedValue(data); post.mockResolvedValue({ assignments: [] });
  const onClose = vi.fn(); const showToast = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><FinalistAssignmentDialog tournamentId="t1" supportsRound12={supportsRound12} onClose={onClose} showToast={showToast} /></QueryClientProvider>);
  return { onClose, showToast, client };
}
const save = () => screen.getByRole('button', { name: /배정 저장 ·/ });
beforeEach(() => { get.mockReset(); post.mockReset(); });
describe('결선 진출팀 배정', () => {
  it('템플릿 없는 14팀 대진을 공식 순위에서 자동 배정하고 실제 API payload로 저장한다', async () => {
    const { onClose, showToast } = setup();
    await screen.findByRole('button', { name: '조별 교차 자동 배정' });
    expect(get).toHaveBeenCalledWith('/admin/tournaments/t1/bracket/finalist-preview');
    expect(save()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '조별 교차 자동 배정' }));
    expect(save()).toBeEnabled(); fireEvent.click(save());
    const confirm = await screen.findByRole('dialog', { name: '결선 배정 저장' });
    fireEvent.click(within(confirm).getByRole('button', { name: '배정 저장' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, input] = post.mock.calls[0] as [string, FinalistAssignmentInput];
    expect(url).toBe('/admin/tournaments/t1/bracket/finalist-assignments');
    expect(input.version).toBe('a'.repeat(64));
    expect(input.assignments).toHaveLength(8);
    expect(new Set(input.assignments.map((row) => row.registrationId)).size).toBe(8);
    expect(input.assignments.map((row) => row.fixtureId + row.side)).toEqual(preview().targets.map((target) => target.fixtureId + target.side));
    await waitFor(() => expect(onClose).toHaveBeenCalled()); expect(showToast).toHaveBeenCalledWith('결선 8자리의 팀을 배정했어요.', 'success');
  });
  it('자동 배정 후 수동 선택 시 자리를 교환하고 운영자 확인을 받는다', async () => {
    setup(); await screen.findByRole('button', { name: '시드순 자동 배정' });
    fireEvent.click(screen.getByRole('button', { name: '시드순 자동 배정' }));
    const first = screen.getByLabelText('8강 자리0') as HTMLSelectElement;
    const second = screen.getByLabelText('8강 자리1') as HTMLSelectElement;
    const beforeFirst = first.value; const beforeSecond = second.value;
    fireEvent.change(first, { target: { value: beforeSecond } });
    expect(second.value).toBe(beforeFirst); expect(save()).toBeDisabled();
    fireEvent.click(screen.getByLabelText('동률·운영자 조정 및 최종 진출팀 배치를 확인했어요.'));
    expect(save()).toBeEnabled();
  });
  it('조별 공식 순위 표시를 유지하며 배정 순서만 바꾼다', async () => {
    setup(); await screen.findByRole('button', { name: '0조 팀0-2 올리기' });
    fireEvent.click(screen.getByRole('button', { name: '0조 팀0-2 올리기' }));
    fireEvent.click(screen.getByRole('button', { name: '조별 교차 자동 배정' }));
    const values = screen.getAllByRole('combobox').filter((el) => el.getAttribute('aria-label')?.startsWith('8강')).map((el) => (el as HTMLSelectElement).value);
    expect(values).toContain('g0-2'); expect(values).not.toContain('g0-1');
    expect(screen.getAllByText(/공식 3위 · 승점/).length).toBeGreaterThan(0);
    expect(save()).toBeDisabled();
  });
  it('서버가 미완료 또는 시작된 결선을 알리면 배정/저장을 차단한다', async () => {
    setup({ ...preview(), blockedReason: '공식 결과를 모두 확정해 주세요.' });
    await screen.findByText('공식 결과를 모두 확정해 주세요.');
    expect(screen.getByRole('button', { name: '조별 교차 자동 배정' })).toBeDisabled();
    expect(screen.getByLabelText('8강 자리0')).toBeDisabled(); expect(save()).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });
  it('저장 실패를 표시하고 성공 알림이나 닫기를 실행하지 않는다', async () => {
    const { onClose, showToast } = setup(); post.mockRejectedValue(new Error('결과나 대진이 바뀌었어요.'));
    await screen.findByRole('button', { name: '조별 교차 자동 배정' });
    fireEvent.click(screen.getByRole('button', { name: '조별 교차 자동 배정' })); fireEvent.click(save());
    const dialog = await screen.findByRole('dialog', { name: '결선 배정 저장' });
    fireEvent.click(within(dialog).getByRole('button', { name: '배정 저장' }));
    await screen.findByRole('alert'); expect(onClose).not.toHaveBeenCalled(); expect(showToast).not.toHaveBeenCalled();
  });
  it('저장 뒤 순위가 바뀌면 기존 배정을 유지하고 재확인 안내를 표시한다', async () => {
    setup({ ...preview(), standingsChanged: true });
    await screen.findByText(/마지막 배정 이후 조별 순위나 결과가 바뀌었어요/);
    expect(post).not.toHaveBeenCalled();
  });
  it('12강 구성은 기존 전용 배정 흐름과 일반 배정을 선택할 수 있다', () => {
    setup(preview(), true);
    expect(screen.getByRole('button', { name: '12강 진출팀 자동 배정' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '일반 결선 · 자동·수동 배정' })).toBeEnabled();
    expect(get).not.toHaveBeenCalled();
  });
});
