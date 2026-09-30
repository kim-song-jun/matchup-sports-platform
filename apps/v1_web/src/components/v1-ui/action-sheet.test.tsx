import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionSheet, type ActionSheetAction } from './action-sheet';

function setup(actions: readonly ActionSheetAction[], open = true) {
  const onClose = vi.fn();
  render(<ActionSheet open={open} title="경기 더보기" actions={actions} onClose={onClose} />);
  return { onClose };
}

describe('ActionSheet', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    setup([{ key: 'a', label: '동작', onSelect: vi.fn() }], false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('제목이 dialog 의 접근 이름이고 항목을 고르면 그 동작이 불린다', () => {
    const onSelect = vi.fn();
    setup([{ key: 'a', label: '결과 정정', description: '확정된 결과를 고쳐요', onSelect }]);

    const dialog = screen.getByRole('dialog', { name: '경기 더보기' });
    fireEvent.click(within(dialog).getByRole('button', { name: /^결과 정정/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('href 항목은 버튼이 아니라 링크로 그려 이동 경로를 그대로 가진다', () => {
    setup([{ key: 'roster', label: '레드팀 경기 명단', href: '/teams/t-1/games/g-1/roster' }]);

    const link = screen.getByRole('link', { name: '레드팀 경기 명단' });
    expect(link).toHaveAttribute('href', '/teams/t-1/games/g-1/roster');
    expect(screen.queryByRole('button', { name: /레드팀 경기 명단/ })).toBeNull();
  });

  it('비활성 항목은 누를 수 없고 왜 못 누르는지를 설명 자리에 말한다', () => {
    const onSelect = vi.fn();
    setup([
      { key: 'end', label: '경기 종료', description: '경기를 마쳐요', disabled: true, disabledReason: '승부차기를 먼저 입력해 주세요.', onSelect },
    ]);

    const button = screen.getByRole('button', { name: /^경기 종료/ });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('승부차기를 먼저 입력해 주세요.');
    expect(button).not.toHaveTextContent('경기를 마쳐요');
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('닫기 버튼이 onClose 를 부른다', () => {
    const { onClose } = setup([{ key: 'a', label: '동작', onSelect: vi.fn() }]);

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
