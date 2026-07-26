import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1_USER_ID_KEY } from '@/lib/session-storage';
import { TournamentInquirySection } from './tournament-inquiry-section';

const hookMocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  refetch: vi.fn(),
  authMode: 'guest',
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: () => ({
    data: hookMocks.authMode === 'authenticated'
      ? {
          user: { id: 'user-1', email: 'member@example.com', onboardingStatus: 'completed' },
          profile: { displayName: '알파 사용자' },
        }
      : undefined,
    isPending: hookMocks.authMode === 'checking',
    isFetching: hookMocks.authMode === 'checking',
    isError: hookMocks.authMode === 'error',
    error: hookMocks.authMode === 'error' ? new Error('network unavailable') : null,
    refetch: hookMocks.refetch,
  }),
  useV1CreateInquiry: () => ({ mutate: hookMocks.mutate, isPending: false }),
}));

function openModal() {
  render(<TournamentInquirySection tournamentId="tournament-1" tournamentTitle="알파 풋살 컵" />);
  fireEvent.click(screen.getByRole('button', { name: '문의하기' }));
}

function fillTitleAndBody() {
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: '참가비 관련 문의' } });
  fireEvent.change(screen.getByLabelText('내용'), { target: { value: '환불 규정이 궁금합니다.' } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: '문의 접수' }));
}

describe('TournamentInquirySection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    hookMocks.mutate.mockClear();
    hookMocks.refetch.mockClear();
    hookMocks.authMode = 'guest';
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('로그인 상태에서는 게스트 연락처 입력 없이 제목/내용만으로 제출되고, payload엔 guestEmail/guestPhone이 포함되지 않는다', () => {
    hookMocks.authMode = 'authenticated';

    openModal();

    expect(screen.getByText('알파 풋살 컵')).toBeInTheDocument();
    expect(screen.getByText('알파 사용자')).toBeInTheDocument();
    expect(screen.getByText('member@example.com 계정으로 답변이 연결돼요.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^이메일/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^전화번호/)).not.toBeInTheDocument();

    fillTitleAndBody();
    submit();

    expect(hookMocks.mutate).toHaveBeenCalledTimes(1);
    const [payload] = hookMocks.mutate.mock.calls[0];
    expect(payload).not.toHaveProperty('guestEmail');
    expect(payload).not.toHaveProperty('guestPhone');
  });

  it('선택한 문의 유형을 API category와 제목 컨텍스트에 함께 반영한다', () => {
    hookMocks.authMode = 'authenticated';

    openModal();
    fireEvent.change(screen.getByLabelText('문의 유형'), { target: { value: 'payment_refund' } });
    fillTitleAndBody();
    submit();

    const [payload] = hookMocks.mutate.mock.calls[0];
    expect(payload).toMatchObject({
      category: 'payment_refund',
      title: '[결제·환불] 참가비 관련 문의',
      relatedType: 'tournament',
      relatedId: 'tournament-1',
    });
  });

  it('로컬 세션 힌트가 남아 있어도 auth/me가 비회원이면 게스트 연락처를 요구한다', () => {
    window.localStorage.setItem(V1_USER_ID_KEY, 'stale-user');

    openModal();

    expect(screen.getByText('비회원 문의')).toBeInTheDocument();
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.getByLabelText('전화번호')).toBeInTheDocument();
  });

  it('계정 확인 중에는 로그인·비회원 입력을 확정하지 않고 제출을 막는다', () => {
    hookMocks.authMode = 'checking';

    openModal();

    expect(screen.getByText('계정 확인 중')).toBeInTheDocument();
    expect(screen.queryByLabelText('이메일')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계정 확인 중...' })).toBeDisabled();
    const form = screen.getByRole('dialog').querySelector('form');
    expect(form).not.toBeNull();
    if (form) fireEvent.submit(form);
    expect(hookMocks.mutate).not.toHaveBeenCalled();
  });

  it('계정 확인 실패를 비회원으로 오인하지 않고 다시 확인 동작을 제공한다', () => {
    hookMocks.authMode = 'error';

    openModal();

    expect(screen.getByRole('alert')).toHaveTextContent('계정 정보를 확인하지 못했어요.');
    expect(screen.queryByLabelText('이메일')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계정 확인 필요' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }));
    expect(hookMocks.refetch).toHaveBeenCalledTimes(1);
  });

  it('비로그인 상태에서 게스트 연락처 없이 제출하면 클라이언트 검증이 막아 네트워크 요청이 나가지 않는다', () => {
    openModal();

    fillTitleAndBody();
    submit();

    expect(screen.getByRole('alert')).toHaveTextContent('답변받을 이메일 또는 전화번호 중 하나를 입력해 주세요.');
    expect(hookMocks.mutate).not.toHaveBeenCalled();
  });

  it('비로그인 상태에서 이메일만 입력해도 제출되고 payload엔 guestEmail만 포함된다', () => {
    openModal();

    fillTitleAndBody();
    fireEvent.change(screen.getByLabelText(/^이메일/), { target: { value: 'guest@example.com' } });
    submit();

    expect(hookMocks.mutate).toHaveBeenCalledTimes(1);
    const [payload] = hookMocks.mutate.mock.calls[0];
    expect(payload.guestEmail).toBe('guest@example.com');
    expect(payload).not.toHaveProperty('guestPhone');
  });

  it('비로그인 상태에서 전화번호만 입력해도 제출되고 payload엔 guestPhone만 포함된다', () => {
    openModal();

    fillTitleAndBody();
    fireEvent.change(screen.getByLabelText(/^전화번호/), { target: { value: '010-1234-5678' } });
    submit();

    expect(hookMocks.mutate).toHaveBeenCalledTimes(1);
    const [payload] = hookMocks.mutate.mock.calls[0];
    expect(payload.guestPhone).toBe('010-1234-5678');
    expect(payload).not.toHaveProperty('guestEmail');
  });
});
