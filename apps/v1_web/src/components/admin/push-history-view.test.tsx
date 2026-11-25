import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminPushHistoryFixture, adminPushHistoryMswHandlers } from '@/test/msw/admin-push-history-handlers';
import { PushHistoryView } from './push-history-view';

const server = setupServer(...adminPushHistoryMswHandlers,
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 201 })),
);
beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1'); server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { server.close(); vi.unstubAllEnvs(); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><PushHistoryView /></QueryClientProvider>);
}
const firstDetailButton = async () => (await screen.findAllByRole('button', { name: /발송 상세 보기/ }))[0];
const detailPath = '*/api/v1/admin/ops/push-history/:id';
const envelope = (data: unknown) => HttpResponse.json({ status: 'success', data });

describe('PushHistoryView with real query hooks and HTTP handlers', () => {
  it('loads a real list request, inspects its content/channel results, and closes with focus restored', async () => {
    const user = userEvent.setup(); mount();
    const trigger = await firstDetailButton();
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: '발송 상세' });
    await within(dialog).findByText('내용 전문');
    expect(within(dialog).getByTestId('phone-push-preview')).toHaveTextContent(adminPushHistoryFixture.content.body!);
    expect(within(dialog).getByTestId('inbox-push-preview')).toHaveTextContent(adminPushHistoryFixture.title!);
    expect(within(dialog).getByText('대상 2건 · 접수 1건 · 실패 1건')).toBeInTheDocument();
    expect(within(dialog).getByText(/실제 기기 도착·읽음 수와는 달라요/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('shows historical content provenance and unknown channel results honestly', async () => {
    server.use(http.get(detailPath, () => envelope({ ...adminPushHistoryFixture,
      content: { ...adminPushHistoryFixture.content, source: 'notification' }, delivery: { web: null, native: null },
    })));
    const user = userEvent.setup(); mount();
    await user.click(await firstDetailButton());
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/회원 알림함에서 확인한 내용/)).toBeInTheDocument();
    expect(within(dialog).getAllByText('전송 결과가 보관되지 않았어요.')).toHaveLength(2);
  });

  it('does not render a misleading preview for ambiguous historical bodies', async () => {
    server.use(http.get(detailPath, () => envelope({ ...adminPushHistoryFixture, content: { source: 'ambiguous', body: null, url: null } })));
    const user = userEvent.setup(); mount();
    await user.click(await firstDetailButton());
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/본문을 확정할 수 없어요/)).toBeInTheDocument();
    expect(within(dialog).queryByTestId('phone-push-preview')).not.toBeInTheDocument();
  });

  it('changes target filters using a new API query and shows its actual empty state', async () => {
    const user = userEvent.setup(); mount();
    await firstDetailButton();
    await user.selectOptions(screen.getByRole('combobox', { name: '발송 대상 필터' }), 'user');
    expect(await screen.findByText('발송 이력이 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /발송 상세 보기/ })).not.toBeInTheDocument();
  });

  it('대회·리그 발송 행에는 대회 이름과 성별 조건이 함께 보이고, 대상 필터에 대회·리그 참가팀이 있다', async () => {
    server.use(http.get('*/api/v1/admin/ops/push-history', () => envelope({
      items: [{ ...adminPushHistoryFixture, target: 'competition', gender: 'female', competition: { id: 'league-1', title: '11월 여자부 리그' } }],
      pageInfo: { hasNextPage: false, nextCursor: null },
    })));
    mount();
    // 같은 문구가 필터 옵션에도 있으므로, 표에만 있는 대회 이름을 기다린 뒤 확인한다.
    // 표가 데스크톱·모바일 표현을 함께 그려서 같은 글이 여러 번 나온다.
    expect((await screen.findAllByText('11월 여자부 리그')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('여성 (성별 미입력 포함)').length).toBeGreaterThan(0);
    expect(screen.getByRole('option', { name: '대회·리그 참가팀' })).toBeInTheDocument();
  });

  it('예전 이력(성별·대회 정보 없음)은 성별을 지어내지 않는다', async () => {
    mount();
    await firstDetailButton();
    expect(screen.queryByText(/성별 미입력 포함/)).not.toBeInTheDocument();
  });

  it('appends the next API page instead of replacing earlier history', async () => {
    server.use(http.get('*/api/v1/admin/ops/push-history', ({ request }) => {
      const next = new URL(request.url).searchParams.get('cursor');
      return envelope({ items: next ? [{ ...adminPushHistoryFixture, id: '00000000-0000-4000-8000-000000000002', title: '두 번째 발송' }] : [adminPushHistoryFixture], pageInfo: { hasNextPage: !next, nextCursor: next ? null : 'page2' } });
    }));
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole('button', { name: '이력 더 보기' }));
    expect((await screen.findAllByRole('button', { name: '두 번째 발송 발송 상세 보기' }))[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '[샘플] 경기 안내 발송 상세 보기' })[0]).toBeInTheDocument();
  });

  it('shows a real detail API error and allows retry without a fake preview', async () => {
    let failed = true;
    server.use(http.get(detailPath, () => failed
      ? HttpResponse.json({ status: 'error', code: 'PUSH_HISTORY_NOT_FOUND', message: '발송 이력을 찾을 수 없어요.' }, { status: 404 })
      : envelope(adminPushHistoryFixture)));
    const user = userEvent.setup(); mount();
    await user.click(await firstDetailButton());
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('발송 이력을 찾을 수 없어요.');
    expect(within(dialog).queryByTestId('phone-push-preview')).not.toBeInTheDocument();
    failed = false;
    await user.click(within(dialog).getByRole('button', { name: '다시 시도' }));
    expect(await within(dialog).findByTestId('phone-push-preview')).toBeInTheDocument();
  });
});
