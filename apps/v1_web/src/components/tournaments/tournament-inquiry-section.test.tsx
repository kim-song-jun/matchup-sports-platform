import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { TournamentInquirySection } from './tournament-inquiry-section';

const hookMocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  push: vi.fn(),
  refetch: vi.fn(),
  authMode: 'guest',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: hookMocks.push }),
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
    isError: hookMocks.authMode === 'guest' || hookMocks.authMode === 'error',
    error: hookMocks.authMode === 'guest'
      ? new V1ApiError({
          status: 'error',
          statusCode: 401,
          code: 'UNAUTHENTICATED',
          message: '로그인이 필요합니다.',
          timestamp: '2026-07-29T00:00:00.000Z',
        })
      : hookMocks.authMode === 'error'
        ? new Error('network unavailable')
        : null,
    refetch: hookMocks.refetch,
  }),
  useV1CreateInquiry: () => ({ mutate: hookMocks.mutate, isPending: false }),
}));

function renderSection() {
  render(<TournamentInquirySection tournamentId="tournament-1" tournamentTitle="알파 풋살 컵" />);
}

function openModal() {
  renderSection();
  fireEvent.click(screen.getByRole('button', { name: '문의하기' }));
}

describe('TournamentInquirySection', () => {
  beforeEach(() => {
    hookMocks.mutate.mockClear();
    hookMocks.push.mockClear();
    hookMocks.refetch.mockClear();
    hookMocks.authMode = 'guest';
  });

  it('로그인 회원은 일반 문의와 같은 계정 기반 폼으로 대회 문의를 제출한다', () => {
    hookMocks.authMode = 'authenticated';
    openModal();

    expect(screen.getByText('알파 사용자')).toBeInTheDocument();
    expect(screen.getByText('member@example.com 계정으로 답변이 연결돼요.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^이메일/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^전화번호/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('문의 유형'), { target: { value: 'payment_refund' } });
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '참가비 관련 문의' } });
    fireEvent.change(screen.getByLabelText('내용'), { target: { value: '환불 규정이 궁금합니다.' } });
    fireEvent.click(screen.getByRole('button', { name: '문의 접수' }));

    expect(hookMocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'payment_refund',
        title: '[결제·환불] 참가비 관련 문의',
        relatedType: 'tournament',
        relatedId: 'tournament-1',
      }),
      expect.any(Object),
    );
  });

  it('비회원은 문의 폼 대신 로그인으로 이동하며 현재 대회 경로를 복귀 경로로 유지한다', () => {
    window.history.replaceState({}, '', '/tournaments/tournament-1');
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: '로그인 후 문의하기' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hookMocks.push).toHaveBeenCalledWith(
      '/login?redirect=%2Ftournaments%2Ftournament-1',
    );
  });

  it('하단에 하드코딩된 인스타그램과 이메일 문의 연락처를 제공한다', () => {
    renderSection();

    expect(screen.getByRole('link', { name: /인스타그램.*@teameet_official/ })).toHaveAttribute(
      'href',
      'https://www.instagram.com/teameet_official/',
    );
    expect(screen.getByRole('link', { name: /이메일.*teameetsports@naver\.com/ })).toHaveAttribute(
      'href',
      'mailto:teameetsports@naver.com',
    );
  });

  it('계정 확인 중이거나 일시 오류가 있으면 문의 진입을 막는다', () => {
    hookMocks.authMode = 'checking';
    const { unmount } = render(<TournamentInquirySection tournamentId="tournament-1" tournamentTitle="알파 풋살 컵" />);
    expect(screen.getByRole('button', { name: '로그인 확인 중...' })).toBeDisabled();
    unmount();

    hookMocks.authMode = 'error';
    renderSection();
    expect(screen.getByRole('button', { name: '문의하기' })).toBeDisabled();
  });
});
