import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeagueCloseRegistrationControl } from './league-close-registration-control';

const { closeMutate, canWrite } = vi.hoisted(() => ({ closeMutate: vi.fn(), canWrite: { value: true } }));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => canWrite.value }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1CloseLeagueRegistration: () => ({ mutate: closeMutate, isPending: false }),
}));

const DEADLINE = '2026-10-12T14:59:00.000Z';

function renderControl(overrides: Partial<React.ComponentProps<typeof LeagueCloseRegistrationControl>> = {}) {
  const showToast = vi.fn();
  const view = render(
    <LeagueCloseRegistrationControl
      leagueId="league-1"
      state="active"
      registrationOpen
      registrationDeadlineAt={DEADLINE}
      activeRegistrationCount={6}
      confirmedCount={4}
      showToast={showToast}
      {...overrides}
    />,
  );
  return { ...view, showToast };
}

describe('LeagueCloseRegistrationControl', () => {
  beforeEach(() => {
    closeMutate.mockReset();
    canWrite.value = true;
  });

  it('모집 중이면 마감 버튼, 마감이 지났거나 미설정이면 신청 관리 링크, 끝난 리그는 아무것도 그리지 않는다', () => {
    const open = renderControl();
    expect(screen.getByRole('button', { name: '지금 마감하기' })).toBeEnabled();
    open.unmount();

    const closed = renderControl({ registrationOpen: false });
    expect(screen.queryByRole('button', { name: '지금 마감하기' })).toBeNull();
    expect(screen.getByRole('link', { name: '신청 관리에서 다시 열기' })).toHaveAttribute('href', '/admin/league-matches/league-1/registrations');
    closed.unmount();

    const noDeadline = renderControl({ registrationOpen: false, registrationDeadlineAt: null });
    expect(screen.getByRole('link', { name: '신청 관리에서 열기' })).toBeInTheDocument();
    expect(screen.getByText(/마감을 정해야 신청을 받아요/)).toBeInTheDocument();
    noDeadline.unmount();

    const { container } = renderControl({ state: 'completed' });
    expect(container).toBeEmptyDOMElement();
  });

  it('보류 중에도 신청은 열려 있을 수 있어 마감 버튼을 그린다', () => {
    renderControl({ state: 'on_hold' });
    expect(screen.getByRole('button', { name: '지금 마감하기' })).toBeInTheDocument();
  });

  it('읽기 전용 계정은 버튼이 꺼지고 안내가 나온다', () => {
    canWrite.value = false;
    renderControl();
    expect(screen.getByRole('button', { name: '지금 마감하기' })).toBeDisabled();
    expect(screen.getByText('현재 계정은 신청을 마감할 권한이 없어요.')).toBeInTheDocument();
  });

  it('모달은 낸 신청 6팀 중 확정 4 · 대기 2 를 보여 주고, 사유를 비우면 reason 키 없이 보낸다', () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: '지금 마감하기' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('6팀 (확정 4 · 대기 2)')).toBeInTheDocument();
    expect(within(dialog).getByText(/대기 중인 2팀은 마감 뒤에도 처리할 수 있어요/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '지금 마감' }));
    expect(closeMutate).toHaveBeenCalledTimes(1);
    expect(closeMutate.mock.calls[0][0]).toEqual({});
  });

  it('대기 팀이 없으면 대기 안내 문장을 넣지 않고, 사유는 trim 해서 보내며 201자는 입력할 수 없다', () => {
    renderControl({ activeRegistrationCount: 4, confirmedCount: 4 });
    fireEvent.click(screen.getByRole('button', { name: '지금 마감하기' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText(/대기 중인/)).toBeNull();
    const textbox = within(dialog).getByRole('textbox');
    expect(textbox).toHaveAttribute('maxlength', '200');
    fireEvent.change(textbox, { target: { value: '  정원이 찼어요  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '지금 마감' }));
    expect(closeMutate.mock.calls[0][0]).toEqual({ reason: '정원이 찼어요' });
  });

  it('성공하면 모달을 닫고 처음 마감과 이미 마감된 경우의 토스트를 구분한다', () => {
    const { showToast } = renderControl();
    for (const [alreadyProcessed, message] of [
      [false, '신청을 마감했어요. 새 신청은 받지 않아요.'],
      [true, '이미 신청이 마감된 리그예요.'],
    ] as const) {
      showToast.mockReset();
      fireEvent.click(screen.getByRole('button', { name: '지금 마감하기' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '지금 마감' }));
      const options = closeMutate.mock.calls.at(-1)?.[1];
      act(() => options.onSuccess({ alreadyProcessed }));
      expect(showToast).toHaveBeenCalledWith(message, 'success');
      expect(screen.queryByRole('dialog')).toBeNull();
    }
  });

  it('실패하면 모달을 연 채 오류를 alert 로 보여 준다', () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: '지금 마감하기' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '지금 마감' }));
    act(() => closeMutate.mock.calls[0][1].onError(new Error('boom')));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('alert')).toBeInTheDocument();
  });
});
