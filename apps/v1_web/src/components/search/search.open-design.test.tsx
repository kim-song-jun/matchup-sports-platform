import { render, screen, within } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchExperience } from './search-experience';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1Matches: () => ({ data: { items: [] }, isError: false, isLoading: false }),
  useV1RecentSearches: () => ({ data: { items: [] }, isLoading: false }),
  useV1RecordSearch: () => ({ mutate: vi.fn() }),
  useV1TeamMatches: () => ({ data: { items: [] }, isError: false, isLoading: false }),
  useV1Teams: () => ({ data: { items: [] }, isError: false, isLoading: false }),
}));

describe('search Open Design contract', () => {
  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
      push: vi.fn(),
      refresh: vi.fn(),
      replace: vi.fn(),
    });
  });

  it('renders supported v1 search domains without unsupported global result claims', () => {
    render(<SearchExperience state="new" />);

    const page = screen.getByTestId('search-open-design');
    expect(page).toHaveClass('tm-search-open-design');
    expect(page).toHaveTextContent('매치/팀매치/팀 통합 조회');
    expect(page).not.toHaveTextContent('레슨');
    expect(page).not.toHaveTextContent('마켓');
    expect(page).not.toHaveTextContent('장소');
  });

  it('uses the server-provided initial query for hydration-safe first render', () => {
    render(<SearchExperience initialQuery="풋살" />);

    expect(screen.getByLabelText('검색어')).toHaveValue('풋살');
    expect(screen.getByRole('button', { name: 'clear search' })).toBeInTheDocument();
  });
});
