import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBracket, makeFixture, makeGame, makeGroup } from '@/test/bracket-canvas-fixtures';
import { BracketFixtureToolsDialog } from './bracket-fixture-tools-dialog';

const mocks = vi.hoisted(() => ({ create: vi.fn(), setSources: vi.fn() }));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AddBracketFixture: () => ({ mutate: mocks.create, isPending: false }),
  useV1SetBracketSources: () => ({ mutate: mocks.setSources, isPending: false }),
}));

const bracket = makeBracket({
  groups: [
    makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter', sortOrder: 0 }),
    makeGroup({ id: 'g-sf', name: '4강', phase: 'semi', sortOrder: 1 }),
  ],
  fixtures: [
    makeFixture({ id: 'q1', groupId: 'g-qf', fixtureNumber: 1, game: makeGame() }),
    makeFixture({ id: 'q2', groupId: 'g-qf', fixtureNumber: 2, game: makeGame() }),
    makeFixture({ id: 's1', groupId: 'g-sf', fixtureNumber: 3, game: makeGame(), bracketSources: [{ fixtureId: 'q1', outcome: 'WINNER', side: 'HOME' }] }),
  ],
});

function renderDialog(mode: 'add' | 'link') {
  const props = { open: true, mode, format: 'knockout' as const, tournamentId: 't-1', bracket, onClose: vi.fn(), showToast: vi.fn() };
  render(<BracketFixtureToolsDialog {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BracketFixtureToolsDialog — 경기 추가', () => {
  it('고른 단계의 round 로 경기 추가를 요청하고(번호는 서버가 정한다), 성공하면 알리고 닫는다', () => {
    const props = renderDialog('add');
    fireEvent.change(screen.getByLabelText('추가할 단계'), { target: { value: 'g-sf' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    expect(mocks.create).toHaveBeenCalledWith({ groupId: 'g-sf', round: '4강' }, expect.any(Object));
    mocks.create.mock.calls[0][1].onSuccess();
    expect(props.showToast).toHaveBeenCalledWith('4강 경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.', 'success');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('실패하면 해요체 안내를 보여 주고 닫지 않는다', () => {
    const props = renderDialog('add');
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    mocks.create.mock.calls[0][1].onError(undefined);
    expect(props.showToast).toHaveBeenCalledWith('경기를 추가하지 못했어요.', 'error');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('조별리그 단계만 있는 대진은 추가할 단계가 없다고 안내하고 버튼을 막는다', () => {
    render(
      <BracketFixtureToolsDialog
        open
        format="knockout"
        mode="add"
        tournamentId="t-1"
        bracket={makeBracket({ groups: [makeGroup({ id: 'g', name: 'A조', phase: 'group' })], fixtures: [] })}
        onClose={vi.fn()}
        showToast={vi.fn()}
      />,
    );
    expect(screen.getByText('경기를 추가할 수 있는 단계가 없어요. 템플릿으로 대진을 먼저 만들어 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '경기 추가' })).toBeDisabled();
  });

  it('group_knockout 은 리그 폼이 아니라 결선 단계 목록 그대로이고, 조별 단계는 나열하지 않는다', () => {
    render(
      <BracketFixtureToolsDialog
        open
        mode="add"
        format="group_knockout"
        tournamentId="t-1"
        bracket={makeBracket({
          groups: [makeGroup({ id: 'g-a', name: 'A조', phase: 'group', sortOrder: 0 }), makeGroup({ id: 'g-sf', name: '4강', phase: 'semi', sortOrder: 1 })],
          fixtures: [makeFixture({ id: 'a1', groupId: 'g-a', fixtureNumber: 1, round: 'league_r1' })],
        })}
        onClose={vi.fn()}
        showToast={vi.fn()}
      />,
    );
    const select = screen.getByLabelText('추가할 단계') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['4강']);
    expect(screen.queryByLabelText('라운드')).not.toBeInTheDocument();
  });
});

describe('BracketFixtureToolsDialog — 경기 연결', () => {
  it('앞 단계 경기만 후보로 보여 주고, 현재 연결을 미리 고른다', () => {
    renderDialog('link');
    fireEvent.change(screen.getByLabelText('연결할 경기'), { target: { value: 's1' } });
    const home = screen.getByLabelText('홈 자리') as HTMLSelectElement;
    expect(home.value).toBe('q1');
    expect(Array.from(home.options).map((option) => option.textContent)).toEqual([
      '연결 없음 · 직접 배정',
      '8강 1번 경기 승자',
      '8강 2번 경기 승자',
    ]);
    expect((screen.getByLabelText('어웨이 자리') as HTMLSelectElement).value).toBe('');
  });

  it('고른 원천을 보내고, 비운 쪽은 null 로 보낸다', () => {
    const props = renderDialog('link');
    fireEvent.change(screen.getByLabelText('연결할 경기'), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText('어웨이 자리'), { target: { value: 'q2' } });
    fireEvent.change(screen.getByLabelText('홈 자리'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '연결 저장' }));
    expect(mocks.setSources).toHaveBeenCalledWith(
      { fixtureId: 's1', homeSourceFixtureId: null, awaySourceFixtureId: 'q2' },
      expect.any(Object),
    );
    mocks.setSources.mock.calls[0][1].onSuccess();
    expect(props.showToast).toHaveBeenCalledWith('진출 연결을 저장했어요.', 'success');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('현재 연결된 원천이 더는 후보가 아니어도(진행 중) 선택값과 표시가 어긋나지 않는다', () => {
    render(
      <BracketFixtureToolsDialog
        open
        format="knockout"
        mode="link"
        tournamentId="t-1"
        bracket={makeBracket({
          groups: [makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter' }), makeGroup({ id: 'g-sf', name: '4강', phase: 'semi' })],
          fixtures: [
            makeFixture({ id: 'q1', groupId: 'g-qf', fixtureNumber: 1, game: makeGame({ state: 'LIVE' }) }),
            makeFixture({ id: 'q2', groupId: 'g-qf', fixtureNumber: 2, game: makeGame() }),
            makeFixture({ id: 's1', groupId: 'g-sf', fixtureNumber: 3, game: makeGame(), bracketSources: [{ fixtureId: 'q1', outcome: 'WINNER', side: 'HOME' }] }),
          ],
        })}
        onClose={vi.fn()}
        showToast={vi.fn()}
      />,
    );
    const home = screen.getByLabelText('홈 자리') as HTMLSelectElement;
    expect(home.value).toBe('q1');
    expect(home.selectedOptions[0].textContent).toBe('8강 1번 경기 승자');
  });

  it('이미 시작한 경기는 연결 대상에서 뺀다', () => {
    render(
      <BracketFixtureToolsDialog
        open
        format="knockout"
        mode="link"
        tournamentId="t-1"
        bracket={makeBracket({
          groups: [makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter' }), makeGroup({ id: 'g-sf', name: '4강', phase: 'semi' })],
          fixtures: [
            makeFixture({ id: 'q1', groupId: 'g-qf', fixtureNumber: 1, game: makeGame() }),
            makeFixture({ id: 's1', groupId: 'g-sf', fixtureNumber: 3, game: makeGame({ state: 'LIVE' }) }),
          ],
        })}
        onClose={vi.fn()}
        showToast={vi.fn()}
      />,
    );
    expect(screen.getByText('이전 단계 경기를 이어 줄 수 있는 경기가 없어요.')).toBeInTheDocument();
  });

  it('연결할 수 있는 경기(앞 단계가 있는 경기)가 없으면 안내하고 저장을 막는다', () => {
    render(
      <BracketFixtureToolsDialog
        open
        format="knockout"
        mode="link"
        tournamentId="t-1"
        bracket={makeBracket({
          groups: [makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter' })],
          fixtures: [makeFixture({ id: 'q1', groupId: 'g-qf', fixtureNumber: 1 })],
        })}
        onClose={vi.fn()}
        showToast={vi.fn()}
      />,
    );
    expect(screen.getByText('이전 단계 경기를 이어 줄 수 있는 경기가 없어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '연결 저장' })).toBeDisabled();
  });
});
