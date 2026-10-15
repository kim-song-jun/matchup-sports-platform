import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredV1Session, saveStoredV1Session } from '@/lib/session-storage';
import { v1Keys } from '@/lib/query-keys';
import {
  cleanupInquiryClients, inquirySuccess, MEMBER, parseInquiryRequest, RECEIVED_INQUIRY, receivedRequests, renderInquiry, server,
  type InquiryOverrides,
} from './tournament-inquiry-topic-picker.test-fixture';

const TOPICS = [
  { label: '참가·신청', category: 'tournament', prefix: '[참가·신청]' },
  { label: '일정·경기 운영', category: 'tournament', prefix: '[일정·운영]' },
  { label: '결제·환불', category: 'payment_refund', prefix: '[결제·환불]' },
  { label: '대회 규정', category: 'tournament', prefix: '[대회 규정]' },
  { label: '기타', category: 'other', prefix: '[기타]' },
] as const;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  receivedRequests.length = 0;
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  saveStoredV1Session({ userId: MEMBER.user.id, userEmail: MEMBER.user.email });
});
afterEach(() => {
  cleanup();
  cleanupInquiryClients();
  server.resetHandlers();
  clearStoredV1Session();
  vi.unstubAllEnvs();
});
afterAll(() => server.close());

async function openInquiry(overrides: InquiryOverrides = {}) {
  const user = userEvent.setup();
  const view = renderInquiry(overrides);
  await user.click(screen.getByRole('button', { name: '문의하기' }));
  return { ...view, user };
}
const topicControl = () => screen.getByRole('combobox', { name: '문의 유형' });
async function fillDraft(user: ReturnType<typeof userEvent.setup>, title = '  참가 확인  ') {
  await user.type(screen.getByLabelText('제목'), title);
  await user.type(screen.getByLabelText('내용'), '  신청 상태를 확인해 주세요.  ');
}
async function chooseTopic(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(topicControl());
  await user.click(within(screen.getByRole('listbox', { name: '문의 유형' })).getByRole('option', { name: label }));
}

describe('MD-QA #148 실제 문의창의 시트 내 문의 유형 선택', () => {
  it('열기 전에는 현재값만 표시하고 OS select 없이 같은 문의창 안에 다섯 선택지를 펼친다', async () => {
    const { user } = await openInquiry();
    const control = topicControl();
    expect(control.tagName).toBe('BUTTON');
    expect(screen.getByLabelText('문의 유형')).toBe(control);
    expect(control).toHaveAttribute('aria-expanded', 'false');
    expect(control).toHaveTextContent('참가·신청');
    expect(control).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(control);
    const list = screen.getByRole('listbox', { name: '문의 유형' });
    expect(screen.getByRole('dialog')).toContainElement(list);
    expect(control).toHaveAttribute('aria-expanded', 'true');
    expect(control).toHaveAttribute('aria-controls', list.id);
    expect(list.id).not.toBe('');
    expect(within(list).getAllByRole('option')).toHaveLength(5);
    for (const option of TOPICS) expect(within(list).getByRole('option', { name: option.label })).toBeVisible();
    expect(within(list).getByRole('option', { name: '참가·신청' })).toHaveAttribute('aria-selected', 'true');
    expect(receivedRequests).toEqual([]);
  });

  it('한 항목 선택은 목록을 닫고 현재값·설명을 바꾸며 작성 내용과 트리거 포커스를 보존한다', async () => {
    const { user } = await openInquiry();
    await fillDraft(user);
    await chooseTopic(user, '결제·환불');
    expect(topicControl()).toHaveTextContent('결제·환불');
    expect(topicControl()).toHaveAttribute('aria-expanded', 'false');
    expect(topicControl()).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByText('참가비 결제, 취소, 환불 규정')).toBeVisible();
    expect(screen.getByLabelText('제목')).toHaveValue('  참가 확인  ');
    expect(screen.getByLabelText('내용')).toHaveValue('  신청 상태를 확인해 주세요.  ');
    expect(receivedRequests).toEqual([]);
    await user.click(topicControl());
    expect(screen.getAllByRole('option', { selected: true })).toHaveLength(1);
    expect(screen.getByRole('option', { name: '결제·환불' })).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowDown·End·Enter로 키보드 선택 후 명시적 접수에서만 선택된 유형을 전송한다', async () => {
    const { user } = await openInquiry();
    await fillDraft(user);
    topicControl().focus();
    await user.keyboard('{ArrowDown}{End}');
    expect(topicControl()).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: '기타' }).id);
    await user.keyboard('{ArrowUp}');
    expect(topicControl()).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: '대회 규정' }).id);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(topicControl()).toHaveTextContent('기타');
    expect(topicControl()).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(receivedRequests).toEqual([]);
    await user.click(screen.getByRole('button', { name: '문의 접수' }));
    expect(await screen.findByRole('status')).toHaveTextContent('문의 접수 완료');
    expect(receivedRequests).toEqual([{ category: 'other', title: '[기타] 참가 확인', body: '신청 상태를 확인해 주세요.', relatedType: 'tournament', relatedId: 'tournament-148' }]);
  });

  it('Space·Home로 이동한 뒤 Escape는 미확정 선택을 취소하고 두 번째 Escape만 문의창을 닫는다', async () => {
    const { user } = await openInquiry();
    await fillDraft(user);
    await chooseTopic(user, '대회 규정');
    await user.keyboard(' {Home}');
    expect(topicControl()).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: '참가·신청' }).id);
    expect(screen.getByRole('option', { name: '대회 규정' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    expect(topicControl()).toHaveTextContent('대회 규정');
    expect(topicControl()).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByLabelText('제목')).toHaveValue('  참가 확인  ');
    expect(receivedRequests).toEqual([]);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '문의하기' })).toHaveFocus();
  });

  it('펼친 목록을 Tab으로 나가면 닫고 제목 필드의 다음 입력을 보존한다', async () => {
    const { user } = await openInquiry();
    await user.click(topicControl());
    await user.tab();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('제목')).toHaveFocus();
    await user.type(screen.getByLabelText('제목'), '이어서 작성');
    expect(screen.getByLabelText('제목')).toHaveValue('이어서 작성');
    expect(receivedRequests).toEqual([]);
  });

  it.each(TOPICS)('$label 선택 후 실제 문의 HTTP는 기존 $category와 $prefix 계약을 유지한다', async ({ label, category, prefix }) => {
    const { user, client } = await openInquiry();
    await fillDraft(user);
    await chooseTopic(user, label);
    await user.click(screen.getByRole('button', { name: '문의 접수' }));
    expect(await screen.findByRole('status')).toHaveTextContent('문의 접수 완료');
    expect(receivedRequests).toEqual([{ category, title: `${prefix} 참가 확인`, body: '신청 상태를 확인해 주세요.', relatedType: 'tournament', relatedId: 'tournament-148' }]);
    expect(client.getQueryData(v1Keys.inquiry('inquiry-148'))).toEqual({
      ...RECEIVED_INQUIRY, category, title: `${prefix} 참가 확인`, body: '신청 상태를 확인해 주세요.', relatedType: 'tournament', relatedId: 'tournament-148',
    });
  });

  it('접두어가 긴 유형으로 바꾼 기존 제목이 80자를 넘으면 보존하며 전송을 막는다', async () => {
    const { user } = await openInquiry();
    await chooseTopic(user, '기타');
    await fillDraft(user, '가'.repeat(75));
    await chooseTopic(user, '일정·경기 운영');
    await user.click(screen.getByRole('button', { name: '문의 접수' }));
    expect(screen.getByLabelText('제목')).toHaveValue('가'.repeat(75));
    expect(screen.getByLabelText('제목')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(receivedRequests).toEqual([]);
  });

  it('team_match는 경기 결과 정정 단일 유형만 유지하고 기존 경기 대상을 전송한다', async () => {
    const { user, client } = await openInquiry({ relatedType: 'team_match', relatedId: 'fixture-148', targetLabel: '경기' });
    expect(topicControl()).toHaveTextContent('경기 결과 정정');
    expect(topicControl()).toBeDisabled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await fillDraft(user);
    await user.click(screen.getByRole('button', { name: '문의 접수' }));
    expect(await screen.findByRole('status')).toHaveTextContent('문의 접수 완료');
    expect(receivedRequests).toEqual([{ category: 'match', title: '[경기 결과 정정] 참가 확인', body: '신청 상태를 확인해 주세요.', relatedType: 'team_match', relatedId: 'fixture-148' }]);
    expect(client.getQueryData(v1Keys.inquiry('inquiry-148'))).toEqual({
      ...RECEIVED_INQUIRY, category: 'match', title: '[경기 결과 정정] 참가 확인', body: '신청 상태를 확인해 주세요.', relatedType: 'team_match', relatedId: 'fixture-148',
    });
  });

  it.each([
    { label: '계정 확인 중', overrides: { isSessionChecking: true } },
    { label: '계정 오류', overrides: { hasSessionError: true } },
    { label: '로그인 계정 없음', overrides: { authUser: null } },
  ])('$label 상태는 선택과 무관하게 실제 폼 전송을 막는다', async ({ overrides }) => {
    const { user } = await openInquiry(overrides);
    await fillDraft(user);
    expect(screen.getByRole('button', { name: /문의 접수|계정 확인 중|계정 확인 필요/ })).toBeDisabled();
    const form = screen.getByLabelText('제목').closest('form');
    if (!form) throw new Error('실제 문의 폼이 없어요.');
    fireEvent.submit(form);
    expect(receivedRequests).toEqual([]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('서버 실패 뒤 선택과 작성 내용이 남고 유형 변경 후 실제 재시도 결과만 성공 처리한다', async () => {
    server.use(http.post('*/api/v1/inquiries', async ({ request }) => {
      const payload: unknown = await request.json();
      receivedRequests.push(payload);
      const acceptedPayload = parseInquiryRequest(payload);
      return receivedRequests.length === 1
        ? HttpResponse.json({ status: 'error', statusCode: 503, code: 'INQUIRY_UNAVAILABLE', message: '문의 접수를 잠시 이용할 수 없어요.', timestamp: RECEIVED_INQUIRY.createdAt }, { status: 503 })
        : inquirySuccess(acceptedPayload);
    }));
    const { user, client } = await openInquiry();
    await fillDraft(user);
    await chooseTopic(user, '결제·환불');
    await user.click(screen.getByRole('button', { name: '문의 접수' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('문의 접수를 잠시 이용할 수 없어요.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('내용')).toHaveValue('  신청 상태를 확인해 주세요.  ');
    await chooseTopic(user, '대회 규정');
    expect(receivedRequests).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '문의 접수' }));
    expect(await screen.findByRole('status')).toHaveTextContent('문의 접수 완료');
    expect(receivedRequests).toEqual([
      { category: 'payment_refund', title: '[결제·환불] 참가 확인', body: '신청 상태를 확인해 주세요.', relatedType: 'tournament', relatedId: 'tournament-148' },
      { category: 'tournament', title: '[대회 규정] 참가 확인', body: '신청 상태를 확인해 주세요.', relatedType: 'tournament', relatedId: 'tournament-148' },
    ]);
    expect(client.getQueryData(v1Keys.inquiry('inquiry-148'))).toEqual({
      ...RECEIVED_INQUIRY, category: 'tournament', title: '[대회 규정] 참가 확인', body: '신청 상태를 확인해 주세요.', relatedType: 'tournament', relatedId: 'tournament-148',
    });
  });

  it('HTTP 응답을 기다리는 동안 중복 클릭·폼 submit이 문의를 추가로 접수하지 않는다', async () => {
    let releaseResponse: (() => void) | undefined;
    const responseReady = new Promise<void>((resolve) => { releaseResponse = resolve; });
    server.use(http.post('*/api/v1/inquiries', async ({ request }) => {
      const payload: unknown = await request.json();
      receivedRequests.push(payload);
      const acceptedPayload = parseInquiryRequest(payload);
      await responseReady;
      return inquirySuccess(acceptedPayload);
    }));
    try {
      const { user, client } = await openInquiry();
      await fillDraft(user);
      await chooseTopic(user, '참가·신청');
      await user.dblClick(screen.getByRole('button', { name: '문의 접수' }));
      await waitFor(() => expect(receivedRequests).toHaveLength(1));
      expect(screen.getByRole('button', { name: '접수 중...' })).toBeDisabled();
      expect(topicControl()).toBeDisabled();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      const form = screen.getByLabelText('제목').closest('form');
      if (!form) throw new Error('실제 문의 폼이 없어요.');
      fireEvent.submit(form);
      expect(receivedRequests).toHaveLength(1);
      releaseResponse?.();
      expect(await screen.findByRole('status')).toHaveTextContent('문의 접수 완료');
      expect(receivedRequests).toHaveLength(1);
      expect(client.getQueryData(v1Keys.inquiry('inquiry-148'))).toEqual({
        ...RECEIVED_INQUIRY, category: 'tournament', title: '[참가·신청] 참가 확인', body: '신청 상태를 확인해 주세요.', relatedType: 'tournament', relatedId: 'tournament-148',
      });
    } finally {
      releaseResponse?.();
    }
  });
});
