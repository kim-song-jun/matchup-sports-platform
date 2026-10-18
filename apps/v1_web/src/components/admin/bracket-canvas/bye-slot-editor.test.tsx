import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFixture, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import { buildBracketMobileRounds } from '@/lib/bracket-canvas-mobile-model';
import { BracketCanvas } from './bracket-canvas';
import { BracketCanvasMobile } from './bracket-canvas-mobile';
import { ByeSlotEditor } from './bye-slot-editor';

const mocks = vi.hoisted(() => ({ update: vi.fn(), assign: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1UpdateFixture: () => ({ mutateAsync: mocks.update, isPending: false }) }));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({ useV1AssignTournamentSlot: () => ({ mutateAsync: mocks.assign, isPending: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.update.mockResolvedValue({}); mocks.assign.mockResolvedValue({}); });
const groups = [makeGroup({ id: 'r12', name: '12강', phase: 'round12' }), makeGroup({ id: 'qf', name: '8강', phase: 'quarter' })];
const slot = makeSlot({ id: 'bye', kind: 'BYE', groupId: 'r12', label: '12강 부전승 1', automaticLabel: '12강 부전승 1', displayLabel: null });
const source = makeFixture({ id: 'source', groupId: 'r12', fixtureNumber: 1 });
const fixture = makeFixture({ id: 'q1', groupId: 'qf', fixtureNumber: 5, homeSlotId: slot.id, homeDisplayLabel: null, bracketSources: [{ fixtureId: source.id, side: 'AWAY', outcome: 'WINNER' }] });
const fixtures = [source, fixture];
const common = { tournamentId: 't-1', slot, fixture, groups, slots: [slot], candidates: [{ registrationId: 'r1', teamName: '서울FC' }], canWrite: true, registrationsLoaded: true };

describe('BYE slot editing', () => {
  it('opens an empty standalone canvas slot, independently of selecting the quarter-final', () => {
    const selectBye = vi.fn(), selectFixture = vi.fn();
    render(<BracketCanvas groups={groups} fixtures={fixtures} slots={[slot]} selectedFixtureId={null} pendingRegistrationId={null} canWrite onSelectBye={selectBye} onSelectFixture={selectFixture} onAssignSlot={vi.fn()} onAssignDirect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '12강 부전승 12강 부전승 1 편집' }));
    expect(selectBye).toHaveBeenCalledWith('bye');
    expect(selectFixture).not.toHaveBeenCalled();
  });
  it('writes text through the linked quarter-final side and assignment through the shared slot, with no BYE schedule', async () => {
    render(<ByeSlotEditor {...common} />);
    expect(screen.getByText(/연결 위치: 8강 5번 경기 · 홈/)).toBeInTheDocument();
    expect(screen.queryByLabelText('경기 번호')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('경기 시각')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('표시 문구'), { target: { value: '조 1위 중 5위' } });
    fireEvent.click(screen.getByRole('button', { name: '문구 저장' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ fixtureId: 'q1', homeDisplayLabel: '조 1위 중 5위' }));
    fireEvent.change(screen.getByLabelText('배정팀'), { target: { value: 'r1' } });
    fireEvent.click(screen.getByRole('button', { name: '팀 저장' }));
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith({ slotId: 'bye', registrationId: 'r1' }));
  });
  it('opens the same BYE editor in the mobile BottomSheet instead of the real match editor', async () => {
    render(<BracketCanvasMobile competitionId="t-1" scope="tournament" rounds={buildBracketMobileRounds({ groups, fixtures, slots: [slot] })} slots={[slot]} groups={groups} fixtures={fixtures} candidates={common.candidates} canWrite registrationsState={{ status: 'success', truncated: false, refetchFailed: false, error: null, onRetry: vi.fn() }} showToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: '12강' }));
    fireEvent.click(screen.getByRole('button', { name: /12강 부전승/ }));
    expect(await screen.findByLabelText('표시 문구')).toBeInTheDocument();
    expect(screen.getByText(/연결 위치: 8강 5번 경기/)).toBeInTheDocument();
    expect(screen.queryByLabelText('경기 시각')).not.toBeInTheDocument();
  });
});
