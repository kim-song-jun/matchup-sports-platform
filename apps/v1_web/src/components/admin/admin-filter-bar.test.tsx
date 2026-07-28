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

  it('shows a pending placeholder until summary data is available', () => {
    render(
      <AdminFilterBar
        hideSearch
        searchValue=""
        onSearchChange={vi.fn()}
        statusOptions={[{ value: '', label: '전체' }]}
        activeStatus=""
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '전체' })).toHaveTextContent('전체—');
  });
});
