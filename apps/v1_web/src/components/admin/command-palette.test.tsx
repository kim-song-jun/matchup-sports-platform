import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './command-palette';

const pushMock = vi.fn();
const searchMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminGlobalSearch: (q: string) => searchMock(q),
}));

const result = {
  users: [
    { userId: 'u-1', label: '호스트민', sublabel: 'host@teameet.v1', status: 'active' },
  ],
  teams: [{ teamId: 't-1', label: '민FC', status: 'active' }],
  matches: [{ matchId: 'm-1', label: '민 매치', sublabel: '서울 풋살장', status: 'open' }],
};

function typeAndDebounce(value: string) {
  fireEvent.change(screen.getByRole('combobox', { name: '회원·팀·매치 전역 검색' }), {
    target: { value },
  });
  act(() => {
    vi.advanceTimersByTime(300);
  });
}

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pushMock.mockClear();
    searchMock.mockReset();
    searchMock.mockImplementation((q: string) => ({
      data: q ? result : undefined,
      isFetching: false,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows grouped hits after the debounce and deep-links a user on click', () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} />);

    // debounce 전에는 빈 질의어로만 호출된다
    expect(searchMock).toHaveBeenCalledWith('');
    typeAndDebounce('민');
    expect(searchMock).toHaveBeenCalledWith('민');

    expect(screen.getByText('회원')).toBeInTheDocument();
    expect(screen.getByText('팀')).toBeInTheDocument();
    // 매치 그룹은 상세가 없어 목록 이동 안내가 붙는다
    expect(screen.getByText('— 목록으로 이동')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /호스트민/ }));
    expect(pushMock).toHaveBeenCalledWith('/admin/users/u-1');
    expect(onClose).toHaveBeenCalled();
  });

  it('navigates with arrow keys and Enter, clamping at both ends', () => {
    render(<CommandPalette open onClose={vi.fn()} />);
    typeAndDebounce('민');

    const input = screen.getByRole('combobox', { name: '회원·팀·매치 전역 검색' });
    // 위로는 0에서 멈춘다
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    // 두 번째 항목(팀 민FC)으로 이동
    expect(pushMock).toHaveBeenCalledWith('/admin/teams/t-1');

    // 아래로는 마지막 항목에서 멈춘다 (3개 항목에 ArrowDown 5회)
    pushMock.mockClear();
    for (let i = 0; i < 5; i += 1) fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(pushMock).toHaveBeenCalledWith('/admin/matches');
  });

  it('does not hijack arrow keys when there are no results', () => {
    searchMock.mockImplementation((q: string) => ({
      data: q ? { users: [], teams: [], matches: [] } : undefined,
      isFetching: false,
    }));
    render(<CommandPalette open onClose={vi.fn()} />);
    typeAndDebounce('없는검색어');

    const input = screen.getByRole('combobox', { name: '회원·팀·매치 전역 검색' });
    const arrowNotPrevented = fireEvent.keyDown(input, { key: 'ArrowDown' });
    // preventDefault가 호출되지 않아야 한다 (fireEvent는 defaultPrevented면 false 반환)
    expect(arrowNotPrevented).toBe(true);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('closes on Escape and renders nothing while closed', () => {
    const onClose = vi.fn();
    const { rerender } = render(<CommandPalette open onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();

    rerender(<CommandPalette open={false} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
