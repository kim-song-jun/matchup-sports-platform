import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminSiteInfo } from '@/types/api';
import { SiteInfoView } from './site-info-view';

const SAVED: V1AdminSiteInfo = {
  companyName: '가상 회사',
  representativeName: '가상 대표',
  businessRegistrationNumber: null,
  address: null,
  mailOrderSalesNumber: null,
  contactEmail: 'help@example.com',
  guestInquiryRetention: '문의 처리 완료 후 1년',
  guestInquiryRetentionIsDefault: true,
  updatedByAdminUserId: null,
  updatedAt: null,
};

type Reply = { status: number; body: unknown };
let capabilities: string[];
let putReply: (body: Record<string, unknown>) => Reply;
const putCalls: Record<string, unknown>[] = [];

const ok = (data: unknown): Reply => ({ status: 200, body: { status: 'success', data, timestamp: '' } });

beforeEach(() => {
  putCalls.length = 0;
  capabilities = ['status:write'];
  putReply = (body) => ok({ ...SAVED, ...body });
  // 네트워크 경계만 바꾼다 — 훅·api-client·에러 해석은 실제 코드가 돈다.
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace(/^.*\/api\/v1/, '');
    let result: Reply = { status: 200, body: {} };
    if (path === '/admin/me') result = ok({ capabilities });
    else if (path === '/admin/site-info' && init.method === 'GET') result = ok(SAVED);
    else if (path === '/admin/site-info' && init.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      putCalls.push(body);
      result = putReply(body);
    }
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'content-type': 'application/json' } });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <SiteInfoView />
    </QueryClientProvider>,
  );
  return user;
}

async function ready() {
  await waitFor(() => expect(screen.getByLabelText('상호')).toHaveValue('가상 회사'));
  await waitFor(() => expect(screen.getByLabelText('상호')).toBeEnabled());
}

describe('SiteInfoView (/admin/settings?tab=site-info)', () => {
  it('저장은 바뀐 칸만 PUT /admin/site-info 로 보내고, 비운 칸은 빈 문자열(지우기)로 보낸다', async () => {
    const user = renderView();
    await ready();
    expect(screen.getByLabelText('비회원 문의 보관 기간')).toHaveValue('');
    expect(screen.getByLabelText('비회원 문의 보관 기간')).toHaveAttribute('placeholder', '기본값: 문의 처리 완료 후 1년');

    await user.type(screen.getByLabelText('사업장 주소'), '  가상시 가상로 1 ');
    await user.clear(screen.getByLabelText('대표자'));
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(putCalls[0]).toEqual({ address: '가상시 가상로 1', representativeName: '' });
    expect(await screen.findByText('사업자 정보를 저장했어요.')).toBeInTheDocument();
  });

  it('바뀐 칸이 없으면 보내지 않는다', async () => {
    const user = renderView();
    await ready();
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('바뀐 항목이 없어요.')).toBeInTheDocument();
    expect(putCalls).toHaveLength(0);
  });

  it('사업자등록번호 형식이 틀리면 칸 아래에 오류를 보이고 그 칸으로 초점을 옮긴다', async () => {
    const user = renderView();
    await ready();
    const field = screen.getByLabelText('사업자등록번호');
    await user.type(field, '1234567890');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(field).toHaveFocus();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('사업자등록번호는 000-00-00000 형식으로 입력해 주세요.');
    expect(putCalls).toHaveLength(0);
  });

  it('서버 검증 오류(VALIDATION_ERROR details)를 해당 칸 아래에 보여 준다', async () => {
    putReply = () => ({
      status: 400,
      body: {
        status: 'error', statusCode: 400, code: 'VALIDATION_ERROR', message: '입력값을 다시 확인해 주세요.', timestamp: '',
        details: [{ field: 'contactEmail', messages: ['이메일 형식이 올바르지 않아요.'] }],
      },
    });
    const user = renderView();
    await ready();
    const email = screen.getByLabelText('문의 이메일');
    await user.clear(email);
    await user.type(email, 'ops@example.co');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
    expect(email.getAttribute('aria-describedby')).toContain('site-info-contactEmail-error');
    expect(document.getElementById('site-info-contactEmail-error')).toHaveTextContent('이메일 형식이 올바르지 않아요.');
    expect(email).toHaveFocus();
  });

  it('쓰기 권한이 없으면(지원 역할) 입력과 저장을 잠근다', async () => {
    capabilities = [];
    renderView();
    await waitFor(() => expect(screen.getByLabelText('상호')).toHaveValue('가상 회사'));
    const companyName = screen.getByLabelText('상호');
    // 값을 읽을 수 있어야 하므로 disabled(저대비)가 아니라 읽기 전용이다.
    expect(companyName).not.toBeDisabled();
    expect(companyName).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(screen.getByText('지원 역할은 사업자 정보를 조회할 수 있지만 저장할 수 없어요.')).toBeInTheDocument();
  });
});
