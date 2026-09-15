import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminFilterBar } from './admin-filter-bar';

describe('AdminFilterBar', () => {
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
