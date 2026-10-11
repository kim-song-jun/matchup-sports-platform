/**
 * 빈 상태가 화면을 혼자 차지할 때 상단에 붙던 문제(2026-09-01 사용자 보고: 채팅)의 회귀 방지.
 *
 * `.tm-empty-state` 는 흐름대로 놓이므로 목록이 비면 검색바·칩 바로 아래에 붙고 그 아래가
 * 통째로 남았다(390 실측: y=245, 아래 300px+ 공백). `fill` 은 부모의 `.tm-list-empty` 와
 * 짝을 이뤄 남은 세로 공간의 중앙에 놓는다 — **둘 중 하나만 있으면 동작하지 않으므로**
 * 여기서 두 클래스가 함께 붙는지를 못박는다.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './primitives';

describe('EmptyState fill', () => {
  it('fill 을 켜면 tm-empty-state-fill 이 함께 붙는다', () => {
    render(<EmptyState fill title="아직 채팅방이 없어요" sub="매치에 참가하면 채팅방이 열려요." />);

    const node = screen.getByText('아직 채팅방이 없어요').closest('.tm-empty-state');
    expect(node).toHaveClass('tm-empty-state-fill');
  });

  it('기본값에는 붙지 않는다 — 카드·탭 안에 섞여 나오는 빈 상태는 흐름대로 둔다', () => {
    render(<EmptyState title="아직 후기가 없어요" sub="경기 후 후기를 남겨 보세요." />);

    const node = screen.getByText('아직 후기가 없어요').closest('.tm-empty-state');
    expect(node).not.toHaveClass('tm-empty-state-fill');
  });
});

describe('EmptyState secondaryCta', () => {
  it('보조 행동이 있으면 중립 버튼이 주 CTA 옆에 나란히 놓이고 각자 호출된다', async () => {
    const onCta = vi.fn();
    const onSecondaryCta = vi.fn();
    render(
      <EmptyState
        title="팀을 만들려면 정보가 필요해요"
        sub="한 번만 입력하면 돼요."
        cta="정보 입력하기"
        onCta={onCta}
        secondaryCta="다음에 할게요"
        onSecondaryCta={onSecondaryCta}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '다음에 할게요' }));
    expect(onSecondaryCta).toHaveBeenCalledTimes(1);
    expect(onCta).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '다음에 할게요' })).toHaveClass('tm-btn-neutral');
    fireEvent.click(screen.getByRole('button', { name: '정보 입력하기' }));
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it('보조 행동이 없으면 주 CTA 하나만 그린다', () => {
    render(<EmptyState title="비었어요" sub="아직 없어요." cta="만들기" onCta={() => undefined} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
