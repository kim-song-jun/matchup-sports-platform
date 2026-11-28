import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1DataSource } from '@/components/providers/v1-data-source';
import { useBracketResetFlow } from './use-bracket-reset-flow';

const root = '*/api/v1/admin/tournaments/t1/bracket';
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data });
let count: number, blocked: boolean, stale: boolean, saveFailed: boolean, refreshFailed: boolean;
let writes: unknown[], reads: number;
const server = setupServer(
  http.post('*/api/v1/logs/client-error', () => ok({})),
  http.get(root, () => refreshFailed && count === 0
    ? HttpResponse.json({ message: '새 목록 조회 실패' }, { status: 500 }) : ok({ count })),
  http.get(`${root}/reset-preview`, () => { reads++; return ok({ snapshot: 'a'.repeat(64), fixtureCount: count, groupCount: 2,
    canReset: !blocked, blockedReason: blocked ? '기록이 있는 경기는 초기화할 수 없어요.' : null, stageBased: false, preservesPreliminaryGroups: true }); }),
  http.post(`${root}/reset`, async ({ request }) => {
    writes.push(await request.json());
    if (stale) return HttpResponse.json({ message: '대진이 바뀌었어요. 다시 확인해 주세요.', code: 'BRACKET_RESET_STALE' }, { status: 409 });
    if (saveFailed) return HttpResponse.json({ message: '초기화 감사 저장 실패' }, { status: 500 });
    const previous = count; count = 0; return ok({ deletedFixtureCount: previous });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => { cleanup(); server.resetHandlers(); });
beforeEach(() => { count = 3; blocked = stale = saveFailed = refreshFailed = false; writes = []; reads = 0; });

function CurrentBracket() {
  const { v1Get } = useV1DataSource();
  const query = useQuery({ queryKey: ['bracket', 't1'], queryFn: () => v1Get<{ count: number }>('/admin/tournaments/t1/bracket') });
  return <p>현재 경기 {query.data?.count ?? '조회 중'}개</p>;
}
function ResetHarness({ canWrite, showToast }: { canWrite: boolean; showToast: (message: string, variant?: 'success' | 'error') => void }) {
  const flow = useBracketResetFlow('t1', canWrite, showToast);
  return <>
    <button type="button" disabled={flow.busy} onClick={flow.start}>대진 초기화</button>
    {flow.error ? <p role="alert">{flow.error}</p> : null}
    {flow.ConfirmModal}
  </>;
}
async function show(canWrite = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const toast = vi.fn();
  render(<QueryClientProvider client={client}><ResetHarness canWrite={canWrite} showToast={toast} /><CurrentBracket /></QueryClientProvider>);
  await screen.findByText('현재 경기 3개');
  return { client, toast };
}
async function confirmReset() {
  fireEvent.click(screen.getByRole('button', { name: '대진 초기화' }));
  const dialog = await screen.findByRole('dialog', { name: '대진 초기화' });
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '초기화한다' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '대진 초기화' }));
}

describe('대진 초기화 실제 HTTP 흐름', () => {
  it('정확한 문구 입력만 실행을 허용하고 다시 열면 입력을 비운다', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: '대진 초기화' }));
    let dialog = await screen.findByRole('dialog', { name: '대진 초기화' });
    const submit = within(dialog).getByRole('button', { name: '대진 초기화' });
    const input = within(dialog).getByRole('textbox', { name: /초기화한다/ });
    for (const value of ['', '초기화', ' 초기화한다', '초기화한다 ']) {
      fireEvent.change(input, { target: { value } });
      expect(submit).toBeDisabled(); fireEvent.click(submit);
      expect(writes).toEqual([]); expect(count).toBe(3);
    }
    fireEvent.change(input, { target: { value: '초기화한다' } });
    expect(submit).toBeEnabled();
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: '대진 초기화' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '대진 초기화' }));
    dialog = await screen.findByRole('dialog', { name: '대진 초기화' });
    // The dialog mounts before its opening effect clears the previous confirmation.
    await waitFor(() => expect(within(dialog).getByRole('textbox')).toHaveValue(''));
    expect(within(dialog).getByRole('button', { name: '대진 초기화' })).toBeDisabled();
    expect(writes).toEqual([]);
  });
  it('영향을 안내한 뒤 확인한 snapshot을 저장하고 대진 화면을 다시 조회한다', async () => {
    const { toast } = await show();
    fireEvent.click(screen.getByRole('button', { name: '대진 초기화' }));
    const dialog = await screen.findByRole('dialog', { name: '대진 초기화' });
    expect(dialog).toHaveTextContent('3경기');
    expect(dialog).toHaveTextContent('참가 신청·대회 규칙·등록 시간과 구장은 유지');
    expect(dialog).toHaveTextContent('대진 공개도 해제');
    expect(writes).toEqual([]);
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '초기화한다' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '대진 초기화' }));
    await screen.findByText('현재 경기 0개');
    expect(writes).toEqual([{ expectedSnapshot: 'a'.repeat(64), confirmed: true, confirmationText: '초기화한다' }]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('3경기의 대진을 초기화했어요.', 'success'));
  });
  it('취소하면 쓰기 요청과 기존 대진 변경이 없다', async () => {
    await show(); fireEvent.click(screen.getByRole('button', { name: '대진 초기화' }));
    const dialog = await screen.findByRole('dialog', { name: '대진 초기화' });
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writes).toEqual([]); expect(count).toBe(3);
  });
  it.each(['stale', 'failure'])('%s 응답은 성공으로 처리하지 않고 기존 대진을 보존한다', async failure => {
    stale = failure === 'stale'; saveFailed = failure === 'failure';
    const { toast } = await show(); await confirmReset();
    expect(await screen.findByRole('alert')).toHaveTextContent(stale ? '대진이 바뀌었어요' : '초기화 감사 저장 실패');
    expect(count).toBe(3); expect(screen.getByText('현재 경기 3개')).toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
  });
  it('진행·기록 보호 사유를 표시하고 확인창과 쓰기 요청을 열지 않는다', async () => {
    blocked = true; await show(); fireEvent.click(screen.getByRole('button', { name: '대진 초기화' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('기록이 있는 경기는 초기화할 수 없어요.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(writes).toEqual([]);
  });
  it('저장은 완료됐지만 재조회만 실패한 경우를 구분한다', async () => {
    refreshFailed = true; const { toast } = await show(); await confirmReset();
    expect(await screen.findByRole('alert')).toHaveTextContent('대진은 초기화됐지만 최신 화면을 불러오지 못했어요');
    expect(count).toBe(0); expect(toast).not.toHaveBeenCalled();
  });
  it('쓰기 권한이 없으면 start 가 미리보기 요청도 확인창도 열지 않는다', async () => {
    await show(false);
    fireEvent.click(screen.getByRole('button', { name: '대진 초기화' }));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(reads).toBe(0); expect(writes).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('진행 중에는 busy 로 한 번 더 시작하지 못한다', async () => {
    await show();
    const button = screen.getByRole('button', { name: '대진 초기화' });
    fireEvent.click(button); fireEvent.click(button);
    await screen.findByRole('dialog', { name: '대진 초기화' });
    expect(reads).toBe(1);
  });
});
