import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixture, V1BracketSource } from '@/types/api';
import { WinnerTargetField } from './winner-target-field';

const setSources = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({ useV1SetBracketSources: () => ({ mutateAsync: setSources, isPending: false }) }));

const showToast = vi.fn();
beforeEach(() => { setSources.mockReset(); setSources.mockResolvedValue({}); showToast.mockReset(); });
afterEach(() => cleanup());

const groups = [
  makeGroup({ id: 'g-semi', name: '4강', phase: 'semi' }),
  makeGroup({ id: 'g-final', name: '결승', phase: 'final' }),
  makeGroup({ id: 'g-final-b', name: '하위 결승', phase: 'final' }),
  makeGroup({ id: 'g-third', name: '3·4위전', phase: 'third_place' }),
];
const game = { id: 'game', state: 'SCHEDULED', version: 1, hasLiveRecords: false, hasOfficialResult: false, latestRevision: null } as const;
const fx = (id: string, groupId: string, fixtureNumber: number, bracketSources: V1BracketSource[] = []) =>
  makeFixture({ id, groupId, fixtureNumber, bracketSources, game });

function show(source: V1AdminBracketFixture, fixtures: V1AdminBracketFixture[], canWrite = true) {
  return render(<WinnerTargetField tournamentId="t-1" fixture={source} groups={groups} fixtures={fixtures} canWrite={canWrite} showToast={showToast} />);
}

describe('WinnerTargetField', () => {
  const semi1 = fx('semi1', 'g-semi', 1);
  const semi2 = fx('semi2', 'g-semi', 2);
  const final = fx('final', 'g-final', 3);

  it('4강 경기의 「이긴 팀이 갈 경기」에서 결승 홈 자리를 고르면 setSources 를 한 번 부르고 토스트를 띄운다', async () => {
    show(semi1, [semi1, semi2, final]);
    fireEvent.change(screen.getByLabelText('이긴 팀이 갈 경기'), { target: { value: 'final:HOME' } });
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('이긴 팀이 갈 경기를 저장했어요.', 'success'));
    expect(setSources).toHaveBeenCalledTimes(1);
    expect(setSources).toHaveBeenCalledWith({ fixtureId: 'final', homeSourceFixtureId: 'semi1', awaySourceFixtureId: null });
  });

  it('현재 연결을 골라 둔 채 보여 주고, 「연결 없음」을 고르면 연결을 해제한다', async () => {
    const linked = fx('final', 'g-final', 3, [{ fixtureId: 'semi1', side: 'HOME', outcome: 'WINNER' }]);
    show(semi1, [semi1, semi2, linked]);
    const select = screen.getByLabelText('이긴 팀이 갈 경기');
    expect(select).toHaveValue('final:HOME');
    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() => expect(setSources).toHaveBeenCalledWith({ fixtureId: 'final', homeSourceFixtureId: null, awaySourceFixtureId: null }));
  });

  it('둘째 호출이 실패하면 어디까지 저장됐는지 알린다', async () => {
    const finalA = fx('finalA', 'g-final', 3, [{ fixtureId: 'semi1', side: 'HOME', outcome: 'WINNER' }]);
    const finalB = fx('finalB', 'g-final-b', 4);
    setSources.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('이미 시작된 경기예요.'));
    show(semi1, [semi1, finalA, finalB]);
    fireEvent.change(screen.getByLabelText('이긴 팀이 갈 경기'), { target: { value: 'finalB:HOME' } });
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      '이긴 팀이 갈 경기를 모두 바꾸지 못했어요. 앞선 변경은 저장됐어요: 이미 시작된 경기예요.', 'error'));
    expect(setSources).toHaveBeenCalledTimes(2);
    expect(setSources.mock.calls[0][0]).toMatchObject({ fixtureId: 'finalA', homeSourceFixtureId: null });
    expect(setSources.mock.calls[1][0]).toMatchObject({ fixtureId: 'finalB', homeSourceFixtureId: 'semi1' });
  });

  it('첫 호출이 실패하면 둘째 호출 없이 이유만 알린다', async () => {
    const finalA = fx('finalA', 'g-final', 3, [{ fixtureId: 'semi1', side: 'HOME', outcome: 'WINNER' }]);
    const finalB = fx('finalB', 'g-final-b', 4);
    setSources.mockRejectedValueOnce(new Error('서버가 거절했어요.'));
    show(semi1, [semi1, finalA, finalB]);
    fireEvent.change(screen.getByLabelText('이긴 팀이 갈 경기'), { target: { value: 'finalB:HOME' } });
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('서버가 거절했어요.', 'error'));
    expect(setSources).toHaveBeenCalledTimes(1);
  });

  it('3·4위전이 있으면 「진 팀이 갈 경기」가 따로 나온다(대조: 없으면 이긴 팀 칸만)', () => {
    const third = fx('third', 'g-third', 4);
    const view = show(semi1, [semi1, semi2, final, third]);
    expect(screen.getByLabelText('이긴 팀이 갈 경기')).toBeInTheDocument();
    expect(screen.getByLabelText('진 팀이 갈 경기')).toBeInTheDocument();
    view.unmount();
    show(semi1, [semi1, semi2, final]);
    expect(screen.queryByLabelText('진 팀이 갈 경기')).not.toBeInTheDocument();
  });

  it('후보도 현재 연결도 없는 경기(결승)에는 아무것도 그리지 않는다', () => {
    const view = show(final, [semi1, semi2, final]);
    expect(view.container).toBeEmptyDOMElement();
  });

  it('canWrite=false 는 선택이 잠긴다', () => {
    show(semi1, [semi1, semi2, final], false);
    expect(screen.getByLabelText('이긴 팀이 갈 경기')).toBeDisabled();
  });

  it('시작된 경기는 현재 연결을 보여 주기만 하고 바꿀 수 없다', () => {
    const live = makeFixture({ id: 'semi1', groupId: 'g-semi', fixtureNumber: 1, game: { ...game, state: 'LIVE' } });
    const linked = fx('final', 'g-final', 3, [{ fixtureId: 'semi1', side: 'AWAY', outcome: 'WINNER' }]);
    show(live, [live, linked]);
    const select = screen.getByLabelText('이긴 팀이 갈 경기');
    expect(select).toHaveValue('final:AWAY');
    expect(select).toBeDisabled();
  });
});
