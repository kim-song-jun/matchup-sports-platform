import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeagueHoldControl } from './league-hold-control';

const { holdMutate, resumeMutate } = vi.hoisted(() => ({ holdMutate: vi.fn(), resumeMutate: vi.fn() }));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => true }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1HoldLeague: () => ({ mutate: holdMutate, isPending: false }),
  useV1ResumeLeague: () => ({ mutate: resumeMutate, isPending: false }),
}));

function confirmWithReason(reason: string, confirmLabel: string) {
  const dialog = screen.getByRole('alertdialog');
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: reason } });
  fireEvent.click(within(dialog).getByRole('button', { name: confirmLabel }));
}

describe('LeagueHoldControl — 리그 취소 대신 보류', () => {
  beforeEach(() => {
    holdMutate.mockReset();
    resumeMutate.mockReset();
  });

  it('진행 중 리그는 사유를 받아 보류하고, 남은 경기를 취소하지 않는다고 안내한다', () => {
    render(<LeagueHoldControl leagueId="league-1" state="active" showToast={vi.fn()} />);

    expect(screen.getByText(/남은 경기는 취소되지 않아요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '리그 보류' }));
    confirmWithReason('참가팀 사정', '보류하기');

    expect(holdMutate).toHaveBeenCalledWith({ reason: '참가팀 사정' }, expect.any(Object));
    expect(resumeMutate).not.toHaveBeenCalled();
  });

  it('보류 중이면 보류 해제를 보여 주고 해제를 요청한다', () => {
    render(<LeagueHoldControl leagueId="league-1" state="on_hold" showToast={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '보류 해제' }));
    confirmWithReason('사정 해결', '해제하기');

    expect(resumeMutate).toHaveBeenCalledWith({ reason: '사정 해결' }, expect.any(Object));
  });

  it('종료된 리그에는 보류 카드를 그리지 않는다', () => {
    const { container } = render(<LeagueHoldControl leagueId="league-1" state="completed" showToast={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
