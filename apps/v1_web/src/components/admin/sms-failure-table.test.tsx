import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SmsFailureTable } from './sms-failure-table';

const ackMutate = vi.fn();

vi.mock('@/hooks/use-v1-api', () => ({
  useV1RecentSmsFailures: () => ({
    data: [
      {
        id: 'sms-1',
        eventType: 'SMS_SEND_FAILED',
        resultCode: '400',
        phoneMasked: '5678',
        provider: 'solapi',
        detail: 'Bad Request',
        createdAt: '2026-07-25T00:00:00Z',
        acknowledgedAt: null,
      },
      {
        id: 'sms-2',
        eventType: 'SOMETHING_NEW_FROM_SERVER',
        resultCode: null,
        phoneMasked: '****',
        provider: null,
        detail: null,
        createdAt: '2026-07-25T00:01:00Z',
        acknowledgedAt: '2026-07-25T00:02:00Z',
      },
    ],
    isLoading: false,
  }),
  useV1AckSmsFailures: () => ({ mutate: ackMutate, isPending: false }),
}));

describe('SmsFailureTable', () => {
  // AdminDataTable dual-renders a desktop <table> and a mobile card <ul>
  // (CSS-only responsive, both present in jsdom) — assertions use
  // getAllBy* and take the first match rather than a single getBy*.
  it('renders the Korean event label and the masked phone tail', () => {
    render(<SmsFailureTable />);

    expect(screen.getAllByText(/SMS 발송 실패/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5678/).length).toBeGreaterThan(0);
  });

  it('falls back to the raw eventType for values the UI does not know yet', () => {
    render(<SmsFailureTable />);

    expect(screen.getAllByText(/SOMETHING_NEW_FROM_SERVER/).length).toBeGreaterThan(0);
  });

  it('shows an ack button for unacknowledged rows only, and acks the clicked row', async () => {
    const user = userEvent.setup();
    render(<SmsFailureTable />);

    // sms-2 is already acknowledged → rendered as a label, not a button.
    expect(screen.getAllByText(/확인됨/).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: /SMS 발송 실패 실패 기록 확인/ })[0]);
    expect(ackMutate).toHaveBeenCalledWith(['sms-1']);
  });
});
