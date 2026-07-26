import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PushFailureTable } from './push-failure-table';

const ackMutate = vi.fn();

vi.mock('@/hooks/use-v1-api', () => ({
  useV1RecentPushFailures: () => ({
    data: [
      {
        id: 'fail-1',
        userIdHash: 'abcd1234',
        endpointSuffix: 'ghijkl',
        statusCode: 500,
        occurredAt: '2026-07-19T00:00:00Z',
        acknowledgedAt: null,
      },
    ],
    isLoading: false,
  }),
  useV1AckPushFailures: () => ({ mutate: ackMutate, isPending: false }),
}));

describe('PushFailureTable', () => {
  // AdminDataTable dual-renders a desktop <table> and a mobile card <ul>
  // (CSS-only responsive, both present in jsdom) — assertions use
  // getAllBy* and take the first match rather than a single getBy*.
  it('renders the masked failure row and an ack button', () => {
    render(<PushFailureTable />);

    expect(screen.getAllByText(/abcd1234/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ghijkl/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /확인/ }).length).toBeGreaterThan(0);
  });

  it('calls ack when the button is clicked', async () => {
    const user = userEvent.setup();
    render(<PushFailureTable />);

    await user.click(screen.getAllByRole('button', { name: /확인/ })[0]);
    expect(ackMutate).toHaveBeenCalledWith(['fail-1']);
  });
});
