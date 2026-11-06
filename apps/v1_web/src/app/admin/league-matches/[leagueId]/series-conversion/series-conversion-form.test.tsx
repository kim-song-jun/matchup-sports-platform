import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { LeagueConversionForm } from './series-conversion-form';
const push = vi.fn();
const leagueState = vi.hoisted(() => ({ teamIds: ['a', 'b', 'c', 'd', 'e', 'f'] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => true }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminLeagueMatch: () => ({ data: { state: 'completed', teamIds: leagueState.teamIds } }) }));
const path = '*/api/v1/admin/league-matches/source/series-conversion';
const entries = ['a', 'b', 'c', 'd', 'e', 'f'].map((teamId, i) => ({ teamId, teamName: `팀${teamId}`, position: i + 1, points: 18 - i, suggestedTier: i < 3 ? 1 : 2 }));
const success = (data: unknown) => HttpResponse.json({ status: 'success', data });
let submitted: unknown;
const server = setupServer(
  http.get(path, () => success({ seriesId: null })),
  http.post(`${path}/preview`, () => success({ entries, fingerprint: 'a'.repeat(64), boundaryTies: [] })),
  http.post(`${path}/commit`, async ({ request }) => { submitted = await request.json(); return success({ seriesId: 'new-series' }); }),
  http.post('*/api/v1/logs/client-error', () => success({})),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => { cleanup(); server.resetHandlers(); });
beforeEach(() => { submitted = undefined; push.mockClear(); leagueState.teamIds = ['a', 'b', 'c', 'd', 'e', 'f']; });
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><LeagueConversionForm leagueId="source" /></QueryClientProvider>); }
async function fill() {
  mount();
  fireEvent.change(await screen.findByLabelText('리그 체계 이름'), { target: { value: '서울 풋살' } });
  fireEvent.change(screen.getByLabelText('첫 시즌 시작일'), { target: { value: '2030-01-01' } });
  fireEvent.change(screen.getByLabelText('첫 시즌 종료일'), { target: { value: '2030-03-01' } });
  fireEvent.click(screen.getByRole('button', { name: '배정 미리보기' }));
  await screen.findByText(/1위 · 팀a/);
}
it('미리보기에서 티어별 인원을 확인하고 확인 모달 뒤에 실제 API 계약으로 확정한다', async () => {
  await fill();
  fireEvent.click(screen.getByRole('button', { name: '확정하고 첫 시즌 만들기' }));
  expect(submitted).toBeUndefined();
  fireEvent.click(await screen.findByRole('button', { name: '확정하고 만들기' }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/league-series/new-series'));
  expect(submitted).toMatchObject({ title: '서울 풋살', tierSizes: [3, 3], startsOn: '2029-12-31T15:00:00.000Z', entries: entries.map((e) => ({ teamId: e.teamId, tier: e.suggestedTier })) });
});
it('티어를 서로 교환해도 사유가 없으면 확정할 수 없다', async () => {
  await fill();
  fireEvent.change(screen.getByLabelText('팀a 배정 티어'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('팀f 배정 티어'), { target: { value: '1' } });
  expect(screen.getByRole('button', { name: '확정하고 첫 시즌 만들기' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('팀a 배정 사유'), { target: { value: '운영자 조정' } });
  fireEvent.change(screen.getByLabelText('팀f 배정 사유'), { target: { value: '운영자 조정' } });
  expect(screen.getByRole('button', { name: '확정하고 첫 시즌 만들기' })).toBeEnabled();
});
it('서버 충돌을 알리고 입력을 유지한다', async () => {
  server.use(http.post(`${path}/commit`, () => HttpResponse.json({ message: '순위가 바뀌었어요.', code: 'LEAGUE_CONVERSION_STALE' }, { status: 409 })));
  await fill();
  fireEvent.click(screen.getByRole('button', { name: '확정하고 첫 시즌 만들기' }));
  fireEvent.click(await screen.findByRole('button', { name: '확정하고 만들기' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('순위가 바뀌었어요.');
  expect(screen.getByLabelText('리그 체계 이름')).toHaveValue('서울 풋살');
  expect(push).not.toHaveBeenCalled();
});

it.each([[8, 4, 4], [7, 4, 3]])('%i팀 리그는 처음부터 %i/%i팀으로 나누고 미리보기를 사용할 수 있다', async (count, first, second) => {
  leagueState.teamIds = Array.from({ length: count }, (_, i) => `team-${i}`);
  mount();
  expect(await screen.findByLabelText('1부 팀 수')).toHaveValue(first);
  expect(screen.getByLabelText('2부 팀 수')).toHaveValue(second);
  expect(screen.getByRole('button', { name: '배정 미리보기' })).toBeEnabled();
});
