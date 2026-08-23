import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClaimMyRecordSection } from './claim-my-record';

/**
 * alpha 실화면(2026-08-24)에서 잡은 결함을 고정한다.
 *
 * 연결 가능한 참가자가 0명인데 "이 선수가 저예요" 버튼이 그대로 남아 있었다.
 * disabled 라도 회색 버튼이 보이면 "누를 수 있을 것 같은" 신호를 주고, 사용자는 왜
 * 안 눌리는지 찾게 된다. 아무것도 할 수 없는 상태에서는 그 버튼을 렌더하지 않는다.
 *
 * 유닛 테스트로는 안 잡혔던 종류다 -- 로직은 맞았고(버튼이 disabled 였다) 화면에서만
 * 잘못 읽혔다.
 */
const claimableMock = vi.fn();
vi.mock('@/hooks/use-v1-api', () => ({
  useV1ClaimableParticipants: (...args: unknown[]) => claimableMock(...args),
  useV1RequestIdentityLink: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/v1-ui/primitives', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function openModal() {
  render(<ClaimMyRecordSection tournamentId="t-1" fixtureId="f-1" />);
  fireEvent.click(screen.getByRole('button', { name: '명단에서 나 찾기' }));
}

describe('ClaimMyRecordSection 빈 상태', () => {
  it('연결 가능한 참가자가 없으면 확정 버튼을 렌더하지 않는다', () => {
    claimableMock.mockReturnValue({
      data: { gameId: 'g-1', version: 3, participants: [] },
      isLoading: false,
      isError: false,
      error: null,
    });

    openModal();

    // 제목이 상태를 따라가야 한다. 고를 게 없는 화면이 "골라 주세요"라고 말하면
    // 사용자는 자기가 뭘 잘못했는지 찾게 된다(alpha 실화면에서 그렇게 읽혔다).
    expect(screen.getByText('연결할 참가자가 없어요')).toBeInTheDocument();
    expect(screen.queryByText('명단에서 본인을 골라 주세요')).not.toBeInTheDocument();
    // 막다른 안내로 끝내지 않고 진짜 남은 원인(공개 동의)으로 이어 준다.
    expect(screen.getByRole('link', { name: '기록 공개 설정' })).toHaveAttribute(
      'href',
      '/my/settings/record-consent',
    );
    expect(screen.queryByRole('button', { name: '이 선수가 저예요' })).not.toBeInTheDocument();
    // 할 수 있는 게 닫기뿐이므로 "취소"가 아니라 "닫기"로 말한다.
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  });

  it('고를 참가자가 있으면 확정 버튼을 보여준다', () => {
    claimableMock.mockReturnValue({
      data: {
        gameId: 'g-1',
        version: 3,
        participants: [{ participantId: 'p-1', sideId: 's-1', displayName: '홍길동', jerseyNumber: 7 }],
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    openModal();

    expect(screen.getByRole('button', { name: /홍길동/ })).toBeInTheDocument();
    // 고를 게 있을 때는 원래 제목 그대로여야 한다 -- 빈 상태 문구가 새어 나오면 안 된다.
    expect(screen.getByText('명단에서 본인을 골라 주세요')).toBeInTheDocument();
    expect(screen.queryByText('연결할 참가자가 없어요')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이 선수가 저예요' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
  });
});
