import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBracket, makeFixture, makeGame, makeGroup, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { RegistrationsLoadState } from './bracket-team-tray';
import { MobileTeamFillSheet } from './mobile-team-fill-sheet';

const mocks = vi.hoisted(() => ({ assign: vi.fn(), update: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1UpdateFixture: () => ({ mutate: mocks.update, isPending: false }) }));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({ useV1AssignTournamentSlot: () => ({ mutate: mocks.assign, isPending: false }) }));

const group = makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter' });
const slots = [makeSlot({ id: 's1', label: '1번 자리', registrationId: 'r1', teamName: '서울FC' }), makeSlot({ id: 's2', label: '2번 자리' })];
const bracket = makeBracket({
  groups: [group],
  slots,
  fixtures: [makeFixture({ id: 'f1', groupId: 'g-qf', fixtureNumber: 1, homeSlotId: 's1', awaySlotId: 's2', game: makeGame() })],
});
const registrations = [
  makeRegistration({ id: 'r1', teamName: '서울FC' }),
  makeRegistration({ id: 'r2', teamName: '부산FC' }),
  makeRegistration({ id: 'r3', teamName: '대구FC' }),
  makeRegistration({ id: 'r4', teamName: '입금 대기 팀', status: 'awaiting_payment' }),
];
const loaded: RegistrationsLoadState = { status: 'success', truncated: false, refetchFailed: false, error: null, onRetry: vi.fn() };
const showToast = vi.fn();
const onClose = vi.fn();

function show(overrides: Partial<React.ComponentProps<typeof MobileTeamFillSheet>> = {}) {
  return render(<MobileTeamFillSheet open onClose={onClose} tournamentId="t-1" bracket={bracket} registrations={registrations} registrationsState={loaded} showToast={showToast} {...overrides} />);
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('MobileTeamFillSheet', () => {
  it('자리 없는 확정 팀만 이름순으로 보여 준다(자리에 들어간 팀·신청 중인 팀은 뺀다)', () => {
    show();
    const list = screen.getByRole('list', { name: '자리 없는 팀' });
    expect(within(list).getAllByRole('button').map((button) => button.textContent)).toEqual(['대구FC', '부산FC']);
  });

  it('팀을 고르면 「넣을 자리」가 나오고, 슬롯 자리는 assign.mutate(slotId)로 넣고 「팀을 넣었어요.」를 알린다', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: '부산FC' }));
    const targets = screen.getByRole('list', { name: '넣을 자리' });
    expect(screen.getByText('부산FC · 넣을 자리')).toBeInTheDocument();
    fireEvent.click(within(targets).getByRole('button', { name: /1번 경기 · 원정$/ }));
    expect(mocks.assign).toHaveBeenCalledWith({ slotId: 's2', registrationId: 'r2' }, expect.any(Object));
    act(() => mocks.assign.mock.calls[0][1].onSuccess());
    expect(showToast).toHaveBeenCalledWith('팀을 넣었어요.', 'success');
    expect(screen.getByRole('list', { name: '자리 없는 팀' })).toBeInTheDocument();
  });

  it('자리 없는 경기의 직접 칸은 updateFixture.mutate(homeRegistrationId) 로 넣는다', () => {
    const direct = makeBracket({ groups: [group], slots: [], fixtures: [makeFixture({ id: 'fd', groupId: 'g-qf', fixtureNumber: 1, game: makeGame() })] });
    show({ bracket: direct });
    fireEvent.click(screen.getByRole('button', { name: '대구FC' }));
    fireEvent.click(screen.getByRole('button', { name: /1번 경기 · 홈$/ }));
    expect(mocks.update).toHaveBeenCalledWith({ fixtureId: 'fd', homeRegistrationId: 'r3' }, expect.any(Object));
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('넣을 자리가 없으면 안내하고, 「팀 다시 고르기」로 돌아간다', () => {
    show({ bracket: makeBracket({ groups: [group], slots: [], fixtures: [] }) });
    fireEvent.click(screen.getByRole('button', { name: '대구FC' }));
    expect(screen.getByText('넣을 수 있는 자리가 없어요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '팀 다시 고르기' }));
    expect(screen.getByRole('list', { name: '자리 없는 팀' })).toBeInTheDocument();
  });

  it('미배정 팀이 없으면 「자리 없는 팀이 없어요」', () => {
    show({ registrations: [registrations[0]] });
    expect(screen.getByText('자리 없는 팀이 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('참가팀을 아직 불러오는 중이면 불러오는 중임을, 실패하면 다시 시도를 보인다', () => {
    show({ registrationsState: { ...loaded, status: 'pending' } });
    expect(screen.getByRole('status')).toHaveTextContent('참가팀을 불러오는 중이에요.');
    cleanup();
    const onRetry = vi.fn();
    show({ registrationsState: { ...loaded, status: 'error', error: new Error('x'), onRetry } });
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    show({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
