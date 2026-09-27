import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminToasts, useAdminToast } from '@/components/admin';
import { v1Keys } from '@/lib/query-keys';
import type { V1GuestInquiryPurgeCandidates, V1InquiryCategory } from '@/types/api';
import { GuestInquiryPurgePanel } from './guest-inquiry-purge-panel';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const LABELS = { tournament_hosting: '대회 개설', partnership: '제휴' } as Record<V1InquiryCategory, string>;

const TWO: V1GuestInquiryPurgeCandidates = {
  retentionDays: 365,
  total: 2,
  items: [
    { inquiryId: 'inq-a', category: 'tournament_hosting', completedAt: '2025-01-10T03:00:00.000Z', retentionExpiredAt: '2026-01-10T03:00:00.000Z' },
    { inquiryId: 'inq-b', category: 'partnership', completedAt: '2025-02-01T03:00:00.000Z', retentionExpiredAt: '2026-02-01T03:00:00.000Z' },
  ],
};

type Reply = { status: number; body: unknown };
const ok = (data: unknown): Reply => ({ status: 200, body: { status: 'success', data, timestamp: '' } });
let capabilities: string[];
let candidates: V1GuestInquiryPurgeCandidates;
let purgeReply: Reply;
const purgeCalls: unknown[] = [];

beforeEach(() => {
  purgeCalls.length = 0;
  capabilities = ['status:write'];
  candidates = TWO;
  purgeReply = ok({ purgedCount: 2, skippedCount: 0, inquiryIds: ['inq-a', 'inq-b'] });
  // 네트워크 경계만 바꾼다 — 훅·api-client·확인 모달은 실제 코드가 돈다.
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace(/^.*\/api\/v1/, '');
    let result: Reply = { status: 404, body: {} };
    if (path === '/admin/me') result = ok({ capabilities });
    else if (path === '/admin/guest-inquiries/purge-candidates') result = ok(candidates);
    else if (path === '/admin/guest-inquiries/purge' && init.method === 'POST') {
      purgeCalls.push(JSON.parse(String(init.body)));
      result = purgeReply;
    }
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'content-type': 'application/json' } });
  }));
});

afterEach(() => vi.unstubAllGlobals());

function Harness() {
  const { toasts, showToast } = useAdminToast();
  return (
    <>
      <GuestInquiryPurgePanel categoryLabel={LABELS} showToast={showToast} />
      <AdminToasts toasts={toasts} />
    </>
  );
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  return { user, client, ...view };
}

describe('GuestInquiryPurgePanel (/admin/inquiries)', () => {
  it('파기 대상이 0건이면 아무것도 그리지 않는다', async () => {
    candidates = { retentionDays: 365, total: 0, items: [] };
    const { container, client } = renderPanel();
    // 로딩 중에도 비어 있으므로, 응답을 받은 뒤에 판정한다.
    await waitFor(() => expect(client.getQueryData(v1Keys.adminGuestInquiryPurgeCandidates())).toEqual(candidates));
    expect(container).toBeEmptyDOMElement();
  });

  it('대상 건수·보관 기간·목록을 보여 주고, 확인 모달에서 취소하면 보내지 않는다', async () => {
    const { user } = renderPanel();
    expect(await screen.findByRole('heading', { name: '보관 기간이 지난 비회원 문의 2건' })).toBeInTheDocument();
    expect(screen.getByText(/현재 설정\(문의 처리 완료 후 1년\) 중 짧은 쪽이 지났어요/)).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: '파기 대상 문의' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('대회 개설'),
      expect.stringContaining('제휴'),
    ]);
    expect(within(rows[0]).getByRole('link', { name: '조회' })).toHaveAttribute('href', '/admin/inquiries/inq-a');

    const trigger = await screen.findByRole('button', { name: '개인정보 파기 (2건)' });
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('비회원 문의 2건의 개인정보를 파기할까요?');
    expect(dialog).toHaveTextContent('되돌릴 수 없어요.');
    await user.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(purgeCalls).toHaveLength(0);
  });

  it('확인하면 화면에 보인 id 만 보내고 결과 건수를 토스트로 알린다', async () => {
    purgeReply = ok({ purgedCount: 1, skippedCount: 1, inquiryIds: ['inq-a'] });
    const { user } = renderPanel();
    const trigger = await screen.findByRole('button', { name: '개인정보 파기 (2건)' });
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '개인정보 파기' }));

    await waitFor(() => expect(purgeCalls).toEqual([{ scope: 'selected', inquiryIds: ['inq-a', 'inq-b'] }]));
    expect(
      await screen.findByText('비회원 문의 1건의 개인정보를 파기했어요. 대상에서 빠진 1건은 건너뛰었어요.'),
    ).toBeInTheDocument();
  });

  it('서버가 거부하면 오류 토스트를 보인다', async () => {
    purgeReply = { status: 403, body: { status: 'error', statusCode: 403, code: 'PERMISSION_DENIED', message: '권한이 없어요.', timestamp: '' } };
    const { user } = renderPanel();
    const trigger = await screen.findByRole('button', { name: '개인정보 파기 (2건)' });
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '개인정보 파기' }));
    expect(await screen.findByText('권한이 없어요.')).toBeInTheDocument();
  });

  it('쓰기 권한이 없으면(지원 역할) 버튼을 잠그고 이유를 버튼 설명으로 단다', async () => {
    capabilities = [];
    renderPanel();
    const trigger = await screen.findByRole('button', { name: '개인정보 파기 (2건)' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAccessibleDescription('개인정보 파기는 운영·소유자 역할만 할 수 있어요.');
  });
});
