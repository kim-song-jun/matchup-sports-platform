import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminFilterBar } from './admin-filter-bar';

describe('AdminFilterBar', () => {
  it('복수 선택·개별 해제·전체를 누르면 선택 상태가 실제로 갱신된다', async () => {
    const user = userEvent.setup();
    function MultiFilter() {
      const [selected, setSelected] = useState<string[]>([]);
      return <AdminFilterBar hideSearch searchValue="" onSearchChange={() => {}}
        statusOptions={[{ value: '', label: '전체', count: 7 }, { value: 'kakao', label: '카카오', count: 4 }, { value: 'apple', label: 'Apple', count: 5 }]}
        selectedStatuses={selected} onStatusesChange={setSelected} />;
    }
    render(<MultiFilter />);
    const all = screen.getByRole('button', { name: '전체 7' });
    const kakao = screen.getByRole('button', { name: '카카오 4' });
    const apple = screen.getByRole('button', { name: 'Apple 5' });
    await user.click(kakao); await user.click(apple);
    expect(kakao).toHaveAttribute('aria-pressed', 'true');
    expect(apple).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveAttribute('aria-pressed', 'false');
    await user.click(kakao);
    expect(kakao).toHaveAttribute('aria-pressed', 'false');
    expect(apple).toHaveAttribute('aria-pressed', 'true');
    await user.click(all);
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(apple).toHaveAttribute('aria-pressed', 'false');
  });
  it('renders exact facet counts and keeps the count in the accessible name', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();

    render(
      <AdminFilterBar
        hideSearch
        searchValue=""
        onSearchChange={vi.fn()}
        statusOptions={[
          { value: '', label: '전체', count: 1234 },
          { value: 'active', label: '활성', count: 7 },
        ]}
        activeStatus=""
        onStatusChange={onStatusChange}
      />,
    );

    expect(screen.getByRole('button', { name: '전체 1234' })).toHaveTextContent('전체1,234');
    await user.click(screen.getByRole('button', { name: '활성 7' }));
    expect(onStatusChange).toHaveBeenCalledWith('active');
  });

  it('shows a pending placeholder for a chip still loading while sibling chips already have counts', () => {
    render(
      <AdminFilterBar
        hideSearch
        searchValue=""
        onSearchChange={vi.fn()}
        statusOptions={[
          { value: '', label: '전체', count: 12 },
          { value: 'pending', label: '대기' },
        ]}
        activeStatus=""
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '대기' })).toHaveTextContent('대기—');
  });

  it('renders no count span at all when the screen never provides counts for any chip', () => {
    // 리그 허브 체계 필터처럼 애초에 count 를 제공하지 않는 화면 — '—' 가 영구
    // 로딩처럼 보이는 것을 막는다 (index 12 회귀 테스트).
    render(
      <AdminFilterBar
        hideSearch
        searchValue=""
        onSearchChange={vi.fn()}
        statusOptions={[
          { value: '', label: '전체' },
          { value: 'sr-1', label: '서울 풋살 리그' },
        ]}
        activeStatus=""
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '전체' })).toHaveTextContent('전체');
    expect(screen.getByRole('button', { name: '전체' })).not.toHaveTextContent('—');
    expect(screen.getByRole('button', { name: '서울 풋살 리그' })).not.toHaveTextContent('—');
  });
});

describe('AdminFilterBar rightSlot', () => {
  it('lets the slot wrap inside the viewport instead of overflowing it', () => {
    render(
      <AdminFilterBar
        hideSearch
        searchValue=""
        onSearchChange={vi.fn()}
        rightSlot={<span>slot</span>}
      />,
    );
    const wrapper = screen.getByText('slot').parentElement;
    expect(wrapper).toHaveClass('flex-wrap', 'max-w-full');
  });
});
