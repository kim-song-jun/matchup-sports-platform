import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyPlayerCardSection } from './my-player-card-section';
import type { V1PlayerCard } from '@/types/api';

/**
 * 마이페이지 카드 입구 (Task 155).
 *
 * 이 섹션이 생긴 이유는 **본인이 자기 카드로 갈 입구가 앱에 없었기 때문**이다.
 * 그래서 여기서 거는 것은 두 가지다: 입구가 실제로 생겼는가, 그리고 **없어야 할 때
 * 조용히 사라지는가**(카드 숨김·로딩·실패). 마이페이지는 카드가 없어도 온전해야 한다.
 */

const publicProfileMock = vi.fn();
vi.mock('@/hooks/use-v1-api', () => ({
  useV1PublicProfile: (...args: unknown[]) => publicProfileMock(...args),
}));

const card: V1PlayerCard = {
  formulaVersion: 1,
  position: 'GK',
  jerseyNumber: 1,
  overall: 48,
  tier: 'bronze',
  shape: 'rect',
  appearances: 4,
  stats: [
    { code: 'SHO', label: '골', value: 44, unlocked: true, lockedBy: null },
    { code: 'PAS', label: '도움', value: 30, unlocked: true, lockedBy: null },
    { code: 'APP', label: '출전', value: 59, unlocked: true, lockedBy: null },
    { code: 'SKI', label: '실력', value: null, unlocked: false, lockedBy: { type: 'reviews', remaining: 3 } },
    { code: 'MAN', label: '매너', value: null, unlocked: false, lockedBy: { type: 'reviews', remaining: 3 } },
    { code: 'PUN', label: '시간약속', value: null, unlocked: false, lockedBy: { type: 'reviews', remaining: 3 } },
  ],
  unlockedCount: 3,
  nextUnlock: { code: 'SKI', reason: { type: 'reviews', remaining: 3 } },
};

function renderSection() {
  return render(
    <MyPlayerCardSection userId="u-1" displayName="김선준" profileImageUrl={null} />,
  );
}

/** 카드 독립 배치(A안) 렌더 -- 실제 my-page 가 넘기는 것과 같은 형태. */
function renderStage() {
  return render(<MyPlayerCardSection userId="u-1" displayName="김선준" profileImageUrl={null} />);
}

describe('마이페이지 내 선수 카드', () => {
  it('카드가 있으면 공유 화면으로 가는 입구를 만든다', () => {
    publicProfileMock.mockReturnValue({ data: { playerCard: card, teams: [{ id: 't-1', name: '주말 풋살' }] } });

    renderSection();

    expect(screen.getByRole('link', { name: '카드 공유하기' })).toHaveAttribute('href', '/users/u-1/card');
    expect(screen.getByLabelText('등번호 1번')).toBeInTheDocument();
    // 카드 설정(숨김·모양) 입구도 카드 곁에 -- 메뉴 2클릭 뒤에만 있으면 발견 불가능하다.
    expect(screen.getByRole('link', { name: '카드 설정' })).toHaveAttribute('href', '/my/settings/player-card');
  });

  it('소속팀을 밖에서 받지 않고 조회한 프로필에서 쓴다', () => {
    publicProfileMock.mockReturnValue({ data: { playerCard: card, teams: [{ id: 't-1', name: '주말 풋살' }] } });

    renderSection();

    expect(screen.getByText('주말 풋살')).toBeInTheDocument();
  });

  it('내 카드이므로 기록 공개 유도를 띄운다 -- 이게 이 기능의 목적이다', () => {
    publicProfileMock.mockReturnValue({
      data: {
        playerCard: {
          ...card,
          stats: card.stats.map((s) =>
            ['SHO', 'PAS', 'APP'].includes(s.code)
              ? { ...s, value: null, unlocked: false, lockedBy: { type: 'consent' as const } }
              : s,
          ),
          nextUnlock: { code: 'SHO' as const, reason: { type: 'consent' as const } },
        },
        teams: [],
      },
    });

    renderSection();

    expect(screen.getByRole('link', { name: '기록 공개하고 3개 열기' })).toHaveAttribute(
      'href',
      '/my/settings/record-consent',
    );
  });

  describe('없어야 할 때는 조용히 사라진다', () => {
    it('카드를 숨긴 사용자에게는 아무것도 렌더하지 않는다', () => {
      publicProfileMock.mockReturnValue({ data: { playerCard: null, teams: [] } });

      const { container } = renderSection();

      expect(container).toBeEmptyDOMElement();
    });

    it('로딩 중에는 자리를 잡지 않는다 -- 마이페이지 상단이 깜빡이면 안 된다', () => {
      publicProfileMock.mockReturnValue({ data: undefined, isLoading: true });

      const { container } = renderSection();

      expect(container).toBeEmptyDOMElement();
    });

    it('조회에 실패해도 마이페이지를 방해하지 않는다', () => {
      publicProfileMock.mockReturnValue({ data: undefined, isError: true, error: new Error('boom') });

      const { container } = renderSection();

      expect(container).toBeEmptyDOMElement();
    });
  });
});

describe('카드 독립 배치 (사용자 선택 A안)', () => {
  it('카드를 상자에 담지 않고 그대로 놓는다 -- 상자 속 상자를 만들지 않는다', () => {
    // 무대 상자가 페이지 배경과 같은 톤이라 경계에 이유가 없었고, 모바일에서는 좌우
    // 여백이 이중으로 들었다. 상자가 되살아나면 그 문제가 그대로 돌아온다.
    publicProfileMock.mockReturnValue({ data: { playerCard: card, teams: [] } });

    const { container } = renderStage();

    expect(container.querySelector('.tm-my-profile-stage')).toBeNull();
    expect(container.querySelector('.tm-player-card')).not.toBeNull();
  });

  it('카드 아래에는 카드 조작만 둔다 -- 계정 버튼은 여기 없다', () => {
    // 계정 조작(내 프로필·프로필 수정)은 아래 프로필 카드로 내려갔다. 카드 곁에 남으면
    // "카드 이야기"와 "계정 이야기"가 다시 한 덩어리가 된다.
    publicProfileMock.mockReturnValue({ data: { playerCard: card, teams: [] } });

    renderStage();

    expect(screen.getByRole('button', { name: /카드 뒤집기/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '카드 공유하기' })).toHaveAttribute('href', '/users/u-1/card');
    expect(screen.getByRole('link', { name: '카드 설정' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '프로필 수정' })).not.toBeInTheDocument();
  });

  it('카드가 없으면(숨김·로딩·실패) 아무것도 그리지 않는다 -- 신원은 프로필 카드가 말한다', () => {
    // 예전에는 여기서 신원 박스를 대신 세웠는데, 그러면 아래 프로필 카드와 같은 버튼이
    // 두 번 나온다(실제로 '내 프로필'·'프로필 수정'이 중복 렌더돼 테스트가 잡았다).
    publicProfileMock.mockReturnValue({ data: { playerCard: null } });

    const { container } = renderStage();

    expect(container.querySelector('.tm-player-card')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
