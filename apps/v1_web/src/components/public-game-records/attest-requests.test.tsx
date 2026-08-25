import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AttestRequestsSection } from './attest-requests';

/**
 * 기록 연결 승인함 (attest UI C안) 의 계약 3개를 고정한다.
 *
 * 1. 요청이 있으면 행·승인/거절 버튼이 뜨고, 승인 클릭은 목록과 같은 시점의
 *    expectedVersion 으로 attest 를 부른다 — 이 값이 어긋나면 서버 409 가 목적대로
 *    동작하지 않는다.
 * 2. 승인함 데이터가 없으면(비로그인·관전자 403) 아무것도 렌더하지 않는다 — 관전자
 *    화면에 빈 승인 카드가 떠서는 안 된다.
 * 3. 요청 0건도 렌더하지 않는다 — 승인은 "요청이 있을 때 생기는 할 일"이다.
 */
const meMock = vi.fn();
const pendingMock = vi.fn();
const attestMutate = vi.fn();
const hasSessionMock = vi.fn();
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: (...args: unknown[]) => meMock(...args),
  useV1PendingIdentityLinkRequests: (...args: unknown[]) => pendingMock(...args),
  useV1AttestIdentityLink: () => ({ mutate: attestMutate, isPending: false }),
}));
// 로컬 세션 힌트가 없으면 /auth/me probe 자체를 보내지 않는다(401 소음 방지).
vi.mock('@/lib/session-storage', () => ({
  hasStoredV1Session: () => hasSessionMock(),
}));
vi.mock('@/components/v1-ui/primitives', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const REQUEST = {
  requestId: 'req-1',
  participantId: 'p-1',
  participantDisplayName: '김민준',
  jerseyNumber: 9,
  sideId: 's-1',
  requesterNickname: '민준이본인',
  requestedAt: '2026-08-26T00:00:00.000Z',
  expiresAt: '2026-08-27T00:00:00.000Z',
};

describe('AttestRequestsSection', () => {
  it('대기 요청이 있으면 행을 보여주고, 승인은 목록 시점의 expectedVersion 으로 attest 를 부른다', () => {
    hasSessionMock.mockReturnValue(true);
    meMock.mockReturnValue({ data: { userId: 'me' } });
    pendingMock.mockReturnValue({ data: { gameId: 'g-1', version: 5, requests: [REQUEST] } });

    render(<AttestRequestsSection gameId="g-1" />);

    expect(screen.getByText('기록 연결 승인 요청')).toBeInTheDocument();
    expect(screen.getByText(/9\. 김민준/)).toBeInTheDocument();
    expect(screen.getByText(/민준이본인/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '김민준 연결 승인' }));

    expect(attestMutate).toHaveBeenCalledWith(
      {
        participantId: 'p-1',
        requestId: 'req-1',
        decision: 'approve',
        expectedVersion: 5,
      },
      expect.anything(),
    );
  });

  it('비로그인(세션 힌트 없음)이면 세션 확인도 승인함 조회도 하지 않고 아무것도 렌더하지 않는다', () => {
    hasSessionMock.mockReturnValue(false);
    meMock.mockReturnValue({ data: undefined });
    pendingMock.mockReturnValue({ data: undefined, isError: true });

    const { container } = render(<AttestRequestsSection gameId="g-1" />);

    expect(container).toBeEmptyDOMElement();
    // 힌트 없이 /auth/me probe 부터 나가면 그 자체가 401 소음이다.
    expect(meMock).toHaveBeenLastCalledWith({ enabled: false, retry: false });
    expect(pendingMock).toHaveBeenLastCalledWith('g-1', { enabled: false });
  });

  it('대기 요청 0건이면 렌더하지 않는다', () => {
    hasSessionMock.mockReturnValue(true);
    meMock.mockReturnValue({ data: { userId: 'me' } });
    pendingMock.mockReturnValue({ data: { gameId: 'g-1', version: 5, requests: [] } });

    const { container } = render(<AttestRequestsSection gameId="g-1" />);

    expect(container).toBeEmptyDOMElement();
  });
});
