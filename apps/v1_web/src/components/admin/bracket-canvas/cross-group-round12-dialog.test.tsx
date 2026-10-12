import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCrossGroupRound12Fixture } from '@/test/msw/cross-group-round12-fixture';
import { crossGroupRecommendation } from '@/lib/cross-group-round12';
import type { CrossGroupApplyInput } from '@/types/cross-group-round12';
import { CrossGroupRound12Dialog } from './cross-group-round12-dialog';
import { BracketListTemplateTools } from './bracket-list-template-tools';

const api = 'http://localhost/api/v1/admin/tournaments/test/bracket';
const server = setupServer();
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: new Date().toISOString() });
beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1'); server.listen({ onUnhandledRequest: 'error' }); });
afterAll(() => { server.close(); vi.unstubAllEnvs(); });
afterEach(() => { cleanup(); server.resetHandlers(); });
function mount(preview = createCrossGroupRound12Fixture()) {
  server.use(http.get(`${api}/round12-preview`, () => ok(preview)));
  const onClose = vi.fn();
  const showToast = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><CrossGroupRound12Dialog tournamentId="test" onClose={onClose} showToast={showToast} /></QueryClientProvider>);
  return { onClose, showToast, client };
}
describe('목록 12강 자동 배정 팝업 HTTP 계약', () => {
  it('빈 목록의 전체 대진 만들기에서 20팀 프리셋을 실제 API로 저장한다', async () => {
    let saved: unknown;
    server.use(http.post(`${api}/template`, async ({ request }) => {
      saved = await request.json(); return ok({ groups: 9, fixtures: 41, slots: 32, edges: 10 });
    }));
    const showToast = vi.fn();
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><BracketListTemplateTools tournamentId="test" format="group_knockout"
      hasExistingBracket={false} groups={[]} slots={[]} registrations={[]} showToast={showToast} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: '전체 대진 만들기' }));
    fireEvent.change(await screen.findByLabelText('참가 팀 수'), { target: { value: '20' } });
    const preset = await screen.findByRole('radio', { name: '5개 조 × 4팀 → 12강' });
    expect(preset).toHaveAccessibleDescription(/조 1·2위 10팀과 3위 상위 2팀이 진출/);
    fireEvent.click(preset);
    fireEvent.click(screen.getByRole('button', { name: /^대진 만들기$/ }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('경기 41개와 자리 32개를 만들었어요.', 'success'));
    expect(saved).toEqual({ kind: 'group_knockout', groupCount: 5, teamsPerGroup: 4, advancePerGroup: 2,
      legs: 1, thirdPlace: false, qualificationMode: 'cross_group_round12' });
  });
  it('12팀 전체와 부전승을 추천하고 팀 교환을 중복 없이 저장한다', async () => {
    const preview = createCrossGroupRound12Fixture();
    let saved: CrossGroupApplyInput | undefined;
    server.use(http.post(`${api}/round12-assignments`, async ({ request }) => {
      saved = await request.json() as CrossGroupApplyInput;
      return ok({ assignments: saved.assignments.map((registrationId, index) => ({ slotId: `slot-${index + 1}`, registrationId })) });
    }));
    const { onClose, showToast } = mount(preview);
    const select = await screen.findByLabelText('1번 시드 · 부전승');
    const picks = preview.ranks.map((rank) => rank.candidates[0]);
    const ranked = crossGroupRecommendation(preview, picks)!;
    expect((select as HTMLSelectElement).value).toBe(ranked[0]);
    fireEvent.change(select, { target: { value: ranked[11] } });
    expect((screen.getByLabelText(/12번 시드 · 12강/) as HTMLSelectElement).value).toBe(ranked[0]);
    fireEvent.click(screen.getByRole('button', { name: '배정 저장 · 12자리' }));
    const confirmation = await screen.findByRole('dialog', { name: '진출팀 배정 저장' });
    fireEvent.click(within(confirmation).getByRole('button', { name: '배정 저장' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(new Set(saved!.assignments).size).toBe(12);
    expect(saved!.assignments[0]).toBe(ranked[11]);
    expect(saved!.assignments[11]).toBe(ranked[0]);
    expect(saved!.version).toBe(preview.version);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('저장했어요'), 'success');
  });
  it('완전 동률 순서는 직접 확인하기 전까지 저장할 수 없다', async () => {
    const preview = createCrossGroupRound12Fixture();
    const first = preview.teams[0], second = preview.teams[4];
    second.points = first.points; second.goalsFor = first.goalsFor; second.goalsAgainst = first.goalsAgainst;
    mount(preview);
    const save = await screen.findByRole('button', { name: '배정 저장 · 12자리' });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByLabelText('완전 동률 팀의 순서와 진출·부전승 여부를 직접 확인했어요.'));
    expect(save).toBeEnabled();
  });
  it('409 결과 변경을 성공으로 숨기지 않고 초안을 유지한다', async () => {
    server.use(
      http.post(`${api}/round12-assignments`, () => HttpResponse.json({ status: 'error', statusCode: 409,
        code: 'ROUND12_PREVIEW_STALE', message: '결과나 대진이 바뀌었어요. 다시 계산하고 확인해 주세요.' }, { status: 409 })),
      http.post('http://localhost/api/v1/logs/client-error', () => ok({})),
      http.post('/api/v1/logs/client-error', () => ok({})),
    );
    const { onClose, showToast } = mount();
    fireEvent.click(await screen.findByRole('button', { name: '배정 저장 · 12자리' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: '진출팀 배정 저장' })).getByRole('button', { name: '배정 저장' }));
    await screen.findByText('결과나 대진이 바뀌었어요. 다시 계산하고 확인해 주세요.');
    expect(onClose).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(screen.getByLabelText('1번 시드 · 부전승')).toBeInTheDocument();
  });
});
