import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1CreateInquiry } from '@/hooks/use-v1-api';
import { V1_USER_ID_KEY } from '@/lib/session-storage';
import { TournamentInquirySection } from './tournament-inquiry-section';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1CreateInquiry: vi.fn(),
}));

const useV1CreateInquiryMock = vi.mocked(useV1CreateInquiry);
const mutate = vi.fn();

function openModal() {
  render(<TournamentInquirySection tournamentId="tournament-1" />);
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
    mutate.mockClear();
    useV1CreateInquiryMock.mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useV1CreateInquiry>);
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('로그인 상태에서는 게스트 연락처 입력 없이 제목/내용만으로 제출되고, payload엔 guestEmail/guestPhone이 포함되지 않는다', () => {
    window.localStorage.setItem(V1_USER_ID_KEY, 'user-1');

    openModal();

    expect(screen.queryByLabelText(/^이메일/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^전화번호/)).not.toBeInTheDocument();

    fillTitleAndBody();
    submit();

    expect(mutate).toHaveBeenCalledTimes(1);
    const [payload] = mutate.mock.calls[0];
    expect(payload).not.toHaveProperty('guestEmail');
    expect(payload).not.toHaveProperty('guestPhone');
  });

  it('비로그인 상태에서 게스트 연락처 없이 제출하면 클라이언트 검증이 막아 네트워크 요청이 나가지 않는다', () => {
    openModal();

    fillTitleAndBody();
    submit();

    expect(screen.getByRole('alert')).toHaveTextContent('이메일 또는 전화번호 중 하나는 꼭 입력해 주세요.');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('비로그인 상태에서 이메일만 입력해도 제출되고 payload엔 guestEmail만 포함된다', () => {
    openModal();

    fillTitleAndBody();
    fireEvent.change(screen.getByLabelText(/^이메일/), { target: { value: 'guest@example.com' } });
    submit();

    expect(mutate).toHaveBeenCalledTimes(1);
    const [payload] = mutate.mock.calls[0];
    expect(payload.guestEmail).toBe('guest@example.com');
    expect(payload).not.toHaveProperty('guestPhone');
  });

  it('비로그인 상태에서 전화번호만 입력해도 제출되고 payload엔 guestPhone만 포함된다', () => {
    openModal();

    fillTitleAndBody();
    fireEvent.change(screen.getByLabelText(/^전화번호/), { target: { value: '010-1234-5678' } });
    submit();

    expect(mutate).toHaveBeenCalledTimes(1);
    const [payload] = mutate.mock.calls[0];
    expect(payload.guestPhone).toBe('010-1234-5678');
    expect(payload).not.toHaveProperty('guestEmail');
  });
});
