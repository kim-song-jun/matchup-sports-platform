import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BracketTemplateDialog } from './bracket-template-dialog';

vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminTournamentRegistrations: () => ({ data: { items: [] }, isPending: false }) }));
const success = (data: unknown) => HttpResponse.json({ status: 'success', data });
const base = '*/api/v1/admin/tournaments/t-1/bracket/template';
const plan = { groups: [{ key: 'final', name: '결승', phase: 'final', advanceCount: null }],
  slots: [{ key: 'a', position: 1, kind: 'ENTRY' }, { key: 'b', position: 2, kind: 'ENTRY' }],
  fixtures: [{ key: 'match', groupKey: 'final', fixtureNumber: 5, homeSlotKey: 'a', awaySlotKey: 'b' }],
  edges: [], byeSlots: [{ sortOrder: 0 }, { sortOrder: 2 }], counts: { groups: 3, slots: 6, fixtures: 5, edges: 4 }, previewHash: 'preview-6' };
const server = setupServer(
  http.get(`${base}/capabilities`, () => success({ flexibleEnabled: true })),
  http.get(`${base}/draft`, () => success({ input: null, revision: 0 })),
  http.post(`${base}/preview`, () => success(plan)),
  http.post('*/api/v1/logs/client-error', () => success({})),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => server.close());
function show(overrides: Partial<React.ComponentProps<typeof BracketTemplateDialog>> = {}) {
  const props = { open: true, tournamentId: 't-1', format: 'knockout' as const, confirmedTeamCount: 6,
    hasExistingBracket: false, onClose: vi.fn(), showToast: vi.fn(), ...overrides };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><BracketTemplateDialog {...props} /></QueryClientProvider>);
  return props;
}
const next = () => fireEvent.click(screen.getByRole('button', { name: '다음' }));
async function preview() { next(); next(); next(); await screen.findByText(/총 5경기/); }

describe('단계별 대진 설정', () => {
  it('출시 플래그가 꺼져 있으면 기존 템플릿을 제공한다', async () => {
    server.use(http.get(`${base}/capabilities`, () => success({ flexibleEnabled: false })));
    show({ confirmedTeamCount: 8 });
    expect(await screen.findByLabelText('8팀 대진 틀')).toBeChecked();
    expect(screen.queryByText('전체 대진 만들기')).not.toBeInTheDocument();
  });
  it('저장한 초안을 읽고 revision과 수정된 참가 수를 함께 저장한다', async () => {
    const saved = { schemaVersion: 2, kind: 'knockout', participantCount: 10, size: 10, legs: 1, thirdPlace: false, drawSeed: 123, seedPolicy: 'seeded' };
    let payload: unknown;
    server.use(http.get(`${base}/draft`, () => success({ input: saved, revision: 3 })),
      http.put(`${base}/draft`, async ({ request }) => { payload = await request.json(); return success({ input: payload, revision: 4 }); }));
    const props = show();
    fireEvent.click(await screen.findByRole('button', { name: '저장한 설정 불러오기' }));
    await waitFor(() => expect(screen.getByLabelText('참가 팀 수')).toHaveValue(10));
    fireEvent.change(screen.getByLabelText('참가 팀 수'), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith('설정 초안을 저장했어요.', 'success'));
    expect(payload).toMatchObject({ participantCount: 18, size: 18, drawSeed: 123, expectedRevision: 3 });
  });
  it('기본 진입에서 6팀을 설정하고 서버 미리보기와 같은 입력으로 생성한다', async () => {
    let previewInput: Record<string, unknown> = {};
    let applied: Record<string, unknown> = {};
    server.use(http.post(`${base}/preview`, async ({ request }) => { previewInput = await request.json() as typeof previewInput; return success(plan); }),
      http.post(base, async ({ request }) => { applied = await request.json() as typeof applied; return success(plan.counts); }));
    const props = show();
    expect(await screen.findByLabelText('참가 팀 수')).toHaveValue(6);
    await preview();
    expect(screen.getByText(/#5.*1번 자리 vs 2번 자리/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이 설정으로 대진 만들기' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    expect(applied).toMatchObject({ ...previewInput, schemaVersion: 2, size: 6, previewHash: 'preview-6', requestId: expect.any(String) });
    expect(props.showToast).toHaveBeenCalledWith('5경기 대진을 만들었어요.', 'success');
  });
  it('14팀을 4·4·3·3팀으로 추천하고 조별 진출 수 수정값을 미리보기에 전달한다', async () => {
    let input: Record<string, unknown> = {};
    server.use(http.post(`${base}/preview`, async ({ request }) => { input = await request.json() as typeof input; return success(plan); }));
    show({ format: 'group_knockout', confirmedTeamCount: 14 });
    await screen.findByLabelText('참가 팀 수');
    next();
    fireEvent.click(screen.getByRole('button', { name: '4개 조 · 4·4·3·3팀' }));
    fireEvent.change(screen.getByLabelText('4번째 조 진출 수'), { target: { value: '1' } });
    expect(screen.getByText('참가 14팀 중 14팀 편성 · 결선 7팀')).toBeInTheDocument();
    next(); next();
    await screen.findByText(/총 5경기/);
    expect(input).toMatchObject({ participantCount: 14, groups: [
      { name: 'A조', capacity: 4, advanceCount: 2 }, { name: 'B조', capacity: 4, advanceCount: 2 },
      { name: 'C조', capacity: 3, advanceCount: 2 }, { name: 'D조', capacity: 3, advanceCount: 1 },
    ] });
  });
  it('오래된 미리보기 오류를 표시하고 같은 설정 재시도에서 요청 ID를 유지한다', async () => {
    const ids: unknown[] = [];
    server.use(http.post(base, async ({ request }) => {
      ids.push((await request.json() as { requestId: string }).requestId);
      return HttpResponse.json({ status: 'error', statusCode: 409, code: 'BRACKET_PREVIEW_STALE', message: '대진이 바뀌었어요. 미리보기를 다시 확인해 주세요.' }, { status: 409 });
    }));
    const props = show(); await screen.findByLabelText('참가 팀 수'); await preview();
    fireEvent.click(screen.getByRole('button', { name: '이 설정으로 대진 만들기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('대진이 바뀌었어요');
    await waitFor(() => expect(screen.getByRole('button', { name: '이 설정으로 대진 만들기' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '이 설정으로 대진 만들기' }));
    await waitFor(() => expect(ids).toHaveLength(2));
    expect(ids[0]).toBe(ids[1]); expect(props.onClose).not.toHaveBeenCalled();
  });
  it('조 합계가 틀리거나 참가 수가 홀수이면 다음 단계로 진행하지 못한다', async () => {
    show({ format: 'group_knockout' });
    await screen.findByLabelText('참가 팀 수');
    fireEvent.change(screen.getByLabelText('참가 팀 수'), { target: { value: '7' } });
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('참가 팀 수'), { target: { value: '6' } }); next();
    fireEvent.change(screen.getByLabelText('1번째 조 팀 수'), { target: { value: '4' } });
    expect(screen.getByRole('alert')).toHaveTextContent('합계');
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });
  it('생성 응답이 유실되면 요청 상태를 확인하고 같은 키의 저장 결과를 복구한다', async () => {
    const ids: string[] = [];
    let checked = false;
    server.use(http.post(base, async ({ request }) => {
      ids.push((await request.json() as { requestId: string }).requestId);
      return ids.length === 1 ? HttpResponse.json({ status: 'error', statusCode: 503, code: 'UNAVAILABLE', message: '응답을 확인하지 못했어요.' }, { status: 503 }) : success(plan.counts);
    }), http.get(`${base}/requests/:requestId`, ({ params }) => { checked = params.requestId === ids[0]; return success({ completed: true }); }));
    const props = show(); await screen.findByLabelText('참가 팀 수'); await preview();
    fireEvent.click(screen.getByRole('button', { name: '이 설정으로 대진 만들기' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    expect(checked).toBe(true); expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
  });
});
