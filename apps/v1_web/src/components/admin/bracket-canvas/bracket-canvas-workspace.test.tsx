import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installViewport, resizeViewport } from '@/test/viewport';
import { makeBracket, makeFixture, makeGroup, makeRegistration, makeSlot, makeStanding } from '@/test/bracket-canvas-fixtures';
import type { V1AdminTournamentBracket } from '@/types/api';
import type { RegistrationsLoadState } from './bracket-team-tray';
import { BracketCanvasWorkspace } from './bracket-canvas-workspace';
import { useBracketViewControls, type BracketViewControls } from './use-bracket-view-controls';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

const mocks = vi.hoisted(() => ({
  bracket: { data: undefined as unknown, isPending: false, isError: false, error: null as unknown, refetch: vi.fn() },
  assign: vi.fn(),
  updateFixture: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminBracket: () => mocks.bracket,
  useV1UpdateFixture: () => ({ mutate: mocks.updateFixture, isPending: false }),
}));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutate: mocks.assign, isPending: false }),
}));
// 패널은 자기 테스트가 있다 — 여기서는 열림/닫힘과 넘겨 받는 값만 본다.
vi.mock('./bracket-node-panel', () => ({
  BracketNodePanel: (props: { fixture: { id: string }; canWrite: boolean; onClose: () => void }) => (
    <aside data-testid="panel" data-can-write={String(props.canWrite)}>
      {props.fixture.id}
      <button type="button" onClick={props.onClose}>패널 닫기</button>
    </aside>
  ),
}));

const group = makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter' });
const slots = [1, 2, 3, 4].map((n) => makeSlot({ id: `s${n}`, label: `${n}번 자리`, position: n }));
const populated = makeBracket({
  groups: [group],
  slots,
  fixtures: [
    makeFixture({ id: 'f1', groupId: 'g-qf', fixtureNumber: 1, homeSlotId: 's1', awaySlotId: 's2' }),
    makeFixture({ id: 'f2', groupId: 'g-qf', fixtureNumber: 2, homeSlotId: 's3', awaySlotId: 's4' }),
  ],
});
const registrations = [
  makeRegistration({ id: 'r1', teamName: '서울FC' }),
  makeRegistration({ id: 'r2', teamName: '부산FC' }),
  makeRegistration({ id: 'r3', teamName: '대구FC' }),
];

function setBracket(data: V1AdminTournamentBracket | undefined, state: Partial<typeof mocks.bracket> = {}) {
  Object.assign(mocks.bracket, { data, isPending: false, isError: false, error: null, ...state });
}

const loaded: RegistrationsLoadState = { status: 'success', truncated: false, refetchFailed: false, error: null, onRetry: vi.fn() };

let latestControls: BracketViewControls;
function Harness(props: Omit<React.ComponentProps<typeof BracketCanvasWorkspace>, 'controls'> & { controls?: BracketViewControls }) {
  const own = useBracketViewControls();
  latestControls = props.controls ?? own;
  return <BracketCanvasWorkspace {...props} controls={latestControls} />;
}
const staticControls = (overrides: Partial<BracketViewControls> = {}): BracketViewControls => ({
  trayOpen: null, setTrayOpen: vi.fn(), unscheduledOnly: false, setUnscheduledOnly: vi.fn(), focusRequest: null, requestFocus: vi.fn(), clearFocusRequest: vi.fn(), ...overrides,
});
const baseProps = (format: 'league' | 'knockout' = 'knockout') => ({
  tournamentId: 't-1', format, registrations, registrationsState: loaded, canWrite: true, showToast: vi.fn(),
});
function renderWorkspace(overrides: Partial<React.ComponentProps<typeof Harness>> = {}) {
  const props = { ...baseProps(), ...overrides };
  const view = render(<Harness {...props} />);
  return { ...props, rerender: () => view.rerender(<Harness {...props} />) };
}
const leagueProps = baseProps;

// 기본은 옆 패널이 붙는 데스크톱 폭 — 태블릿 describe 만 폭을 바꾼다.
let restoreViewport: (() => void) | null = null;
beforeEach(() => {
  vi.clearAllMocks();
  setBracket(populated);
  restoreViewport = installViewport(1440);
});
afterEach(() => {
  restoreViewport?.();
  restoreViewport = null;
});

describe('BracketCanvasWorkspace — 로딩·에러', () => {
  it('불러오는 동안 스켈레톤만 보인다', () => {
    setBracket(undefined, { isPending: true });
    renderWorkspace();
    expect(screen.getByRole('status', { name: '대진을 불러오는 중이에요' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('bracket-canvas-area')).not.toBeInTheDocument();
  });

  it('실패하면 다시 시도 버튼을 준다', () => {
    setBracket(undefined, { isError: true, error: new Error('network') });
    renderWorkspace();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(mocks.bracket.refetch).toHaveBeenCalledTimes(1);
  });
});

describe('BracketCanvasWorkspace — 팀 배정(키보드 경로)', () => {
  it('팀을 고른 뒤 칸의 빈 줄을 누르면 그 자리에 배정하고 고른 팀을 푼다', () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /서울FC/ }));
    expect(screen.getByRole('button', { name: /서울FC/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리, 선택한 팀을 여기에 넣어요' }));
    expect(mocks.assign).toHaveBeenCalledWith({ slotId: 's1', registrationId: 'r1' }, expect.any(Object));

    act(() => mocks.assign.mock.calls[0][1].onSuccess());
    expect(screen.getByRole('button', { name: /서울FC/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('자리 없는 옛 대진의 줄에는 경기 PATCH 로 팀을 넣고 고른 팀을 푼다(슬롯 배정은 부르지 않는다)', () => {
    setBracket(makeBracket({ groups: [group], fixtures: [makeFixture({ id: 'f1', groupId: 'g-qf', fixtureNumber: 1 })] }));
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /서울FC/ }));
    fireEvent.click(screen.getByRole('button', { name: /^원정 .*선택한 팀을 여기에 넣어요$/ }));
    expect(mocks.updateFixture).toHaveBeenCalledWith({ fixtureId: 'f1', awayRegistrationId: 'r1' }, expect.any(Object));
    expect(mocks.assign).not.toHaveBeenCalled();

    act(() => mocks.updateFixture.mock.calls[0][1].onSuccess());
    expect(screen.getByRole('button', { name: /서울FC/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('배정이 거절되면 고른 팀을 유지해 다른 자리를 바로 시도할 수 있다', () => {
    const props = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /서울FC/ }));
    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리, 선택한 팀을 여기에 넣어요' }));
    mocks.assign.mock.calls[0][1].onError(new Error('x'));
    expect(props.showToast).toHaveBeenCalledWith('x', 'error');
    expect(screen.getByRole('button', { name: /서울FC/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('고른 팀이 다른 경로(무작위 채우기 등)로 자리에 들어가면 선택이 풀린다', () => {
    const view = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /서울FC/ }));
    expect(screen.getByRole('button', { name: /서울FC/ })).toHaveAttribute('aria-pressed', 'true');
    setBracket(makeBracket({ ...populated, slots: slots.map((slot, index) => (index === 0 ? { ...slot, registrationId: 'r1', teamName: '서울FC' } : slot)) }));
    view.rerender();
    expect(screen.getByRole('button', { name: /서울FC/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /선택한 팀을 여기에 넣어요/ })).not.toBeInTheDocument();
  });

  it('읽기 전용에서는 팀을 고를 수 없다', () => {
    renderWorkspace({ canWrite: false });
    expect(screen.getByRole('button', { name: /서울FC/ })).toBeDisabled();
  });
});

describe('BracketCanvasWorkspace - 한 팀 한 조(탭 배정)', () => {
  const member = (groupId: string, registrationId: string) => ({ id: `gt-${registrationId}`, groupId, registrationId, teamName: registrationId, sortOrder: 0, createdAt: '' });
  const withTeams = makeBracket({
    groups: [
      makeGroup({ id: 'lgA', name: 'A조', phase: 'group', sortOrder: 0, groupTeams: [member('lgA', 'r1')] }),
      makeGroup({ id: 'lgB', name: 'B조', phase: 'group', sortOrder: 1, groupTeams: [member('lgB', 'r2')] }),
    ],
    fixtures: [makeFixture({ id: 'l1', groupId: 'lgA', fixtureNumber: 1, round: 'league_r1' })],
  });
  const placeInto = (teamName: RegExp) => {
    const props = renderWorkspace({ format: 'league' });
    fireEvent.click(screen.getByRole('button', { name: '펼치기' }));
    fireEvent.click(screen.getByRole('button', { name: teamName }));
    fireEvent.click(within(screen.getByRole('group', { name: '1라운드 A조' })).getByRole('button', { name: /^홈 .*선택한 팀을 여기에 넣어요/ }));
    return props;
  };

  beforeEach(() => setBracket(withTeams));

  it('다른 조 팀을 A조 칸에 넣으려 하면 요청 없이 해요체로 막고 고른 팀을 유지한다', () => {
    const props = placeInto(/부산FC/);
    expect(mocks.updateFixture).not.toHaveBeenCalled();
    expect(props.showToast).toHaveBeenCalledWith('다른 조에 있는 팀은 이 조에 넣을 수 없어요. 그 조에서 먼저 빼 주세요.', 'error');
    expect(screen.getByRole('button', { name: /부산FC/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('대조군 - 같은 조 팀과 어느 조에도 없는 팀은 그대로 PATCH 된다', () => {
    placeInto(/서울FC/);
    expect(mocks.updateFixture).toHaveBeenCalledWith({ fixtureId: 'l1', homeRegistrationId: 'r1' }, expect.any(Object));
    cleanup();
    mocks.updateFixture.mockClear();
    placeInto(/대구FC/);
    expect(mocks.updateFixture).toHaveBeenCalledWith({ fixtureId: 'l1', homeRegistrationId: 'r3' }, expect.any(Object));
  });

  it('조별 자리에 다른 조 팀을 넣으려 하면 assignSlot 호출 없이 같은 토스트, 결선 자리는 통과한다', () => {
    const slotInA = makeSlot({ id: 'sa', label: 'A조 1번', groupId: 'lgA', position: 1 });
    const slotInQf = makeSlot({ id: 'sq', label: '8강 1번', groupId: 'g-qf', position: 1 });
    setBracket(makeBracket({
      groups: [...withTeams.groups, group],
      slots: [slotInA, slotInQf],
      fixtures: [
        makeFixture({ id: 'fa', groupId: 'lgA', fixtureNumber: 1, homeSlotId: 'sa', awaySlotId: null }),
        makeFixture({ id: 'fq', groupId: 'g-qf', fixtureNumber: 2, homeSlotId: 'sq', awaySlotId: null }),
      ],
    }));
    const props = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /부산FC/ }));
    fireEvent.click(screen.getByRole('button', { name: /^홈 A조 1번, 선택한 팀을 여기에 넣어요/ }));
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(props.showToast).toHaveBeenCalledWith('다른 조에 있는 팀은 이 조에 넣을 수 없어요. 그 조에서 먼저 빼 주세요.', 'error');
    fireEvent.click(screen.getByRole('button', { name: /^홈 8강 1번, 선택한 팀을 여기에 넣어요/ }));
    expect(mocks.assign).toHaveBeenCalledWith({ slotId: 'sq', registrationId: 'r2' }, expect.any(Object));
  });
});

describe('BracketCanvasWorkspace — 칸 패널', () => {
  it('칸을 열면 패널이 그 칸으로 열리고, 닫으면 사라진다', () => {
    renderWorkspace();
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '8강 2번 경기 열기' }));
    expect(screen.getByTestId('panel')).toHaveTextContent('f2');
    fireEvent.click(within(screen.getByTestId('panel')).getByRole('button', { name: '패널 닫기' }));
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  it('1440: 패널을 닫으면 그 칸의 열기 버튼으로 포커스가 돌아온다 — 포인터로 열어 포커스가 없어도 마찬가지', () => {
    renderWorkspace();
    const first = screen.getByRole('button', { name: '8강 1번 경기 열기' });
    const second = screen.getByRole('button', { name: '8강 2번 경기 열기' });
    fireEvent.click(second);
    first.focus();

    fireEvent.click(within(screen.getByTestId('panel')).getByRole('button', { name: '패널 닫기' }));
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    expect(second).toHaveFocus();
  });

  it('1440: 칸의 팀 줄로 열었어도 닫으면 같은 칸의 열기 버튼으로 돌아온다', () => {
    renderWorkspace();
    const second = screen.getByRole('button', { name: '8강 2번 경기 열기' });
    const secondCard = second.closest('[data-fixture-id]') as HTMLElement;
    fireEvent.click(within(secondCard).getAllByRole('button')[1]);
    expect(screen.getByTestId('panel')).toHaveTextContent('f2');

    fireEvent.click(within(screen.getByTestId('panel')).getByRole('button', { name: '패널 닫기' }));
    expect(second).toHaveFocus();
  });

  it('읽기 전용: 패널에 쓰기 권한 없음을 그대로 넘긴다(저장·삭제는 패널이 숨긴다)', () => {
    renderWorkspace({ canWrite: false });
    fireEvent.click(screen.getByRole('button', { name: '8강 1번 경기 열기' }));
    expect(screen.getByTestId('panel')).toHaveAttribute('data-can-write', 'false');
  });

  it('칸을 열어도 그림 영역의 className·부모 그리드가 그대로고, 패널은 그 영역 안에 겹쳐 있다(옆 칸이 아니다)', () => {
    renderWorkspace();
    const area = screen.getByTestId('bracket-canvas-area');
    const before = { area: area.className, parent: area.parentElement!.className, sibling: area.parentElement!.children.length };
    fireEvent.click(screen.getByRole('button', { name: '8강 2번 경기 열기' }));
    expect(screen.getByTestId('bracket-canvas-area')).toBe(area);
    expect({ area: area.className, parent: area.parentElement!.className, sibling: area.parentElement!.children.length }).toEqual(before);
    expect(within(area).getByTestId('panel')).toHaveTextContent('f2');
    expect(area.querySelector('[data-dock]')).toHaveClass('absolute');
  });

  describe('붙는 쪽', () => {
    const rect = (left: number, width: number) => ({ left, width, right: left + width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    const stubRects = (openerLeft: number) =>
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === 'bracket-canvas-area') return rect(0, 1136);
        if (this.hasAttribute('data-fixture-opener')) return rect(openerLeft, 232);
        return rect(0, 0);
      });
    afterEach(() => vi.restoreAllMocks());

    it('칸이 왼쪽 절반이면 end, 오른쪽 절반이면 start 에 붙는다', () => {
      stubRects(100);
      renderWorkspace();
      fireEvent.click(screen.getByRole('button', { name: '8강 1번 경기 열기' }));
      expect(screen.getByTestId('panel').closest('[data-dock]')).toHaveAttribute('data-dock', 'end');
      cleanup();
      vi.restoreAllMocks();
      stubRects(800);
      renderWorkspace();
      fireEvent.click(screen.getByRole('button', { name: '8강 1번 경기 열기' }));
      expect(screen.getByTestId('panel').closest('[data-dock]')).toHaveAttribute('data-dock', 'start');
    });

    it('다른 칸을 열면 그 칸 기준으로 다시 정한다', () => {
      stubRects(100);
      renderWorkspace();
      fireEvent.click(screen.getByRole('button', { name: '8강 1번 경기 열기' }));
      expect(screen.getByTestId('panel').closest('[data-dock]')).toHaveAttribute('data-dock', 'end');
      vi.restoreAllMocks();
      stubRects(900);
      fireEvent.click(screen.getByRole('button', { name: '8강 2번 경기 열기' }));
      expect(screen.getByTestId('panel').closest('[data-dock]')).toHaveAttribute('data-dock', 'start');
    });
  });
});

describe('BracketCanvasWorkspace — 참가팀 트레이', () => {
  const placedAll = () => makeBracket({
    ...populated,
    slots: slots.map((slot, index) => ({ ...slot, registrationId: `r${index + 1}`, teamName: `팀${index + 1}` })),
  });
  const trayList = () => screen.queryByRole('region', { name: '참가팀' });

  it('미배정 팀이 있으면 트레이가 처음부터 열려 있다', () => {
    renderWorkspace();
    expect(trayList()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /서울FC/ })).toBeInTheDocument();
  });

  it('미배정 팀이 0 이면 접혀 있고(트레이 자체가 없다), 그림이 폭 전체를 쓴다', () => {
    setBracket(placedAll());
    renderWorkspace({ registrations: registrations.slice(0, 3) });
    expect(trayList()).not.toBeInTheDocument();
    expect(screen.getByTestId('bracket-canvas-area').parentElement!.children).toHaveLength(1);
  });

  it('마지막 팀을 넣어도 트레이가 저절로 접히지 않는다(열림 기본값은 처음 한 번만 정한다)', () => {
    setBracket(makeBracket({ ...populated, slots: slots.map((slot, index) => (index < 2 ? { ...slot, registrationId: `r${index + 1}`, teamName: `팀${index + 1}` } : slot)) }));
    const view = renderWorkspace({ registrations: registrations.slice(0, 3) });
    expect(trayList()).toBeInTheDocument();
    setBracket(makeBracket({ ...populated, slots: slots.map((slot, index) => (index < 3 ? { ...slot, registrationId: `r${index + 1}`, teamName: `팀${index + 1}` } : slot)) }));
    view.rerender();
    expect(screen.getByText('미배정 0 / 전체 3')).toBeInTheDocument();
    expect(trayList()).toBeInTheDocument();
  });

  it('controls.trayOpen=true 면 미배정 0 이어도 열리고, false 면 미배정이 있어도 닫힌다', () => {
    setBracket(placedAll());
    renderWorkspace({ registrations: registrations.slice(0, 3), controls: staticControls({ trayOpen: true }) });
    expect(trayList()).toBeInTheDocument();
    cleanup();
    setBracket(populated);
    renderWorkspace({ controls: staticControls({ trayOpen: false }) });
    expect(trayList()).not.toBeInTheDocument();
  });

  it('열린 트레이의 「닫기」는 controls.setTrayOpen(false) 를 부른다', () => {
    const controls = staticControls();
    renderWorkspace({ controls });
    fireEvent.click(screen.getByRole('button', { name: '참가팀 목록 닫기' }));
    expect(controls.setTrayOpen).toHaveBeenCalledWith(false);
  });

  it('참가팀을 아직 불러오는 중이면 목록을 열어 두고 불러오는 중임을 보여 준다', () => {
    renderWorkspace({ registrations: [], registrationsState: { ...loaded, status: 'pending' } });
    expect(screen.getByText('참가팀을 불러오는 중이에요.')).toBeInTheDocument();
  });

  it('조회가 실패하면 다시 시도가 재조회를 부른다', () => {
    const onRetry = vi.fn();
    renderWorkspace({ registrations: [], registrationsState: { ...loaded, status: 'error', onRetry } });
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('BracketCanvasWorkspace — 보기 컨트롤', () => {
  const scheduled = makeBracket({
    groups: [group],
    slots,
    fixtures: [
      makeFixture({ id: 'f1', groupId: 'g-qf', fixtureNumber: 1, homeSlotId: 's1', awaySlotId: 's2', scheduledAt: '2026-11-20T01:00:00.000Z' }),
      makeFixture({ id: 'f2', groupId: 'g-qf', fixtureNumber: 2, homeSlotId: 's3', awaySlotId: 's4' }),
    ],
  });

  it('controls.unscheduledOnly: 시간이 있는 칸에 data-dimmed, 시간 미정 칸은 그대로(접근 이름은 그대로)', () => {
    setBracket(scheduled);
    renderWorkspace({ controls: staticControls({ unscheduledOnly: true }) });
    const first = screen.getByRole('button', { name: '8강 1번 경기 열기' }).closest('[data-fixture-id]')!;
    const second = screen.getByRole('button', { name: '8강 2번 경기 열기' }).closest('[data-fixture-id]')!;
    expect(first).toHaveAttribute('data-dimmed', 'true');
    expect(second).not.toHaveAttribute('data-dimmed');
  });

  it('끄면 어떤 칸도 흐리지 않는다(대조군)', () => {
    setBracket(scheduled);
    renderWorkspace({ controls: staticControls({ unscheduledOnly: false }) });
    expect(document.querySelector('[data-dimmed]')).toBeNull();
  });

  it('controls.focusRequest 가 오면 그 경기가 열리고 요청이 비워진다', () => {
    const controls = staticControls({ focusRequest: { fixtureId: 'f2', nonce: 1 } });
    renderWorkspace({ controls });
    expect(screen.getByTestId('panel')).toHaveTextContent('f2');
    expect(controls.clearFocusRequest).toHaveBeenCalledTimes(1);
  });

  it('없는 경기 id 요청은 아무것도 열지 않는다', () => {
    renderWorkspace({ controls: staticControls({ focusRequest: { fixtureId: 'nope', nonce: 1 } }) });
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  it('같은 요청을 두 번 처리하지 않는다 — 열린 패널을 닫으면 다시 열리지 않는다', () => {
    const controls = staticControls({ focusRequest: { fixtureId: 'f1', nonce: 1 } });
    const view = renderWorkspace({ controls });
    fireEvent.click(within(screen.getByTestId('panel')).getByRole('button', { name: '패널 닫기' }));
    view.rerender();
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });
});

describe('BracketCanvasWorkspace — 태블릿(768~1023) 칸 패널 시트·트레이 접기', () => {
  it('1023: 칸을 열면 시트(dialog)로 열리고, 닫으면 칸 머리 버튼으로 포커스가 돌아온다', () => {
    resizeViewport(1023);
    renderWorkspace();
    const opener = screen.getByRole('button', { name: '8강 2번 경기 열기' });
    opener.focus();
    fireEvent.click(opener);

    const sheet = screen.getByRole('dialog', { name: '8강 2번 경기' });
    expect(within(sheet).getByTestId('panel')).toHaveTextContent('f2');

    fireEvent.click(within(sheet).getByRole('button', { name: '패널 닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('1023: 패널의 닫기 버튼으로도 시트가 닫히고 선택이 풀린다', () => {
    resizeViewport(1023);
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: '8강 1번 경기 열기' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '패널 닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '8강 1번 경기 열기' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('1024: 같은 동작이 시트 없이 그림 위에 겹친 패널로 열린다(대조군)', () => {
    resizeViewport(1024);
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: '8강 2번 경기 열기' }));
    expect(within(screen.getByTestId('bracket-canvas-area')).getByTestId('panel')).toHaveTextContent('f2');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('1023: 트레이는 접혀 있고 펼치면 목록이 보인다 — 펼침은 controls 를 따른다', () => {
    resizeViewport(1023);
    renderWorkspace();
    const toggle = screen.getByRole('button', { name: '펼치기' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /서울FC/ })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(latestControls.trayOpen).toBe(true);
    expect(screen.getByRole('button', { name: '접기' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /서울FC/ })).toBeInTheDocument();
  });

  it('1023: controls.trayOpen=true 면 처음부터 펼쳐진다(메뉴의 「참가팀 목록 열기」)', () => {
    resizeViewport(1023);
    renderWorkspace({ controls: staticControls({ trayOpen: true }) });
    expect(screen.getByRole('button', { name: '접기' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('1024: 트레이에 접기·펼치기 토글이 없고 목록이 바로 보인다', () => {
    resizeViewport(1024);
    renderWorkspace();
    expect(screen.queryByRole('button', { name: '펼치기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '접기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /서울FC/ })).toBeInTheDocument();
  });
});

const lgA = makeGroup({ id: 'lgA', name: 'A조', phase: 'group', sortOrder: 0 });
const lgB = makeGroup({ id: 'lgB', name: 'B조', phase: 'group', sortOrder: 1 });
const leagueBracket = makeBracket({
  groups: [lgA, lgB],
  fixtures: [
    makeFixture({ id: 'l1', groupId: 'lgA', fixtureNumber: 1, round: 'league_r1' }),
    makeFixture({ id: 'l2', groupId: 'lgB', fixtureNumber: 2, round: 'league_r1' }),
    makeFixture({ id: 'l3', groupId: 'lgA', fixtureNumber: 3, round: 'league_r2' }),
  ],
});

describe('BracketCanvasWorkspace — 리그 방식 대회', () => {
  it('format 이 league 면 라운드×조 격자를 그리고 knockout 이면 캔버스를 그린다', () => {
    setBracket(leagueBracket);
    const { unmount } = render(<Harness {...leagueProps('league')} />);
    expect(screen.getByRole('region', { name: '대진 그림' })).toHaveAttribute('data-league-grid');
    expect(screen.getByRole('heading', { level: 4, name: '2라운드' })).toBeInTheDocument();
    unmount();
    setBracket(populated);
    render(<Harness {...leagueProps('knockout')} />);
    expect(screen.getByRole('region', { name: '대진 그림' })).not.toHaveAttribute('data-league-grid');
  });

  it('격자 칸을 누르면 캔버스와 같은 칸 패널이 그 경기로 열린다', () => {
    setBracket(leagueBracket);
    render(<Harness {...leagueProps('league')} />);
    fireEvent.click(screen.getByRole('button', { name: /A조.*1번 경기 열기/ }));
    expect(screen.getByTestId('panel')).toHaveTextContent('l1');
  });

  it('리그 격자에서도 시간 미정만 보기는 시간이 있는 칸을 흐리게 한다', () => {
    setBracket(makeBracket({ ...leagueBracket, fixtures: [{ ...leagueBracket.fixtures[0], scheduledAt: '2026-11-20T01:00:00.000Z' }, ...leagueBracket.fixtures.slice(1)] }));
    render(<Harness {...leagueProps('league')} controls={staticControls({ unscheduledOnly: true })} />);
    expect(document.querySelectorAll('[data-dimmed]')).toHaveLength(1);
    expect(document.querySelector('[data-fixture-id="l1"]')).toHaveAttribute('data-dimmed', 'true');
  });
});

const gt = (groupId: string, registrationId: string, teamName: string, sortOrder: number) => ({
  id: `gt-${registrationId}`, groupId, registrationId, teamName, sortOrder, createdAt: '',
});
const standingGroupA = makeGroup({ id: 'lgA', name: 'A조', phase: 'group', sortOrder: 0, groupTeams: [gt('lgA', 'r1', '송파', 0), gt('lgA', 'r2', '마포', 1)] });
const standingGroupB = makeGroup({ id: 'lgB', name: 'B조', phase: 'group', sortOrder: 1, groupTeams: [gt('lgB', 'r4', '알파8', 0)] });
const withStandings = makeBracket({
  ...leagueBracket,
  groups: [standingGroupA, standingGroupB],
  standings: [
    makeStanding({ groupId: 'lgA', registrationId: 'r1', teamName: '송파', position: 1, wins: 1, goalDifference: 2, points: 3 }),
    makeStanding({ groupId: 'lgB', registrationId: 'r4', teamName: '알파8', position: 1 }),
  ],
});

describe('BracketCanvasWorkspace — 리그 순위표 배치', () => {
  it('1440 이상: 순위표 옆 열은 항상 있고, 경기를 고르면 칸 패널이 그림 위에 겹친다(순위표를 밀어내지 않는다)', () => {
    setBracket(withStandings);
    render(<Harness {...leagueProps('league')} />);
    const aside = screen.getByRole('complementary', { name: '조별 순위' });
    expect(within(aside).getByRole('table', { name: 'A조 순위표' })).toBeInTheDocument();
    expect(within(aside).getByRole('table', { name: 'B조 순위표' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '순위표 보기' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /A조.*1번 경기 열기/ }));
    expect(within(screen.getByTestId('bracket-canvas-area')).getByTestId('panel')).toHaveTextContent('l1');
    expect(screen.getByRole('complementary', { name: '조별 순위' })).toBe(aside);
    expect(screen.queryByRole('button', { name: '순위표 보기' })).not.toBeInTheDocument();
  });

  it('1440 과 1439 경계: 1440 은 옆 열, 1439 는 옆 열 없이 「순위표」 시트 버튼', () => {
    setBracket(withStandings);
    render(<Harness {...leagueProps('league')} />);
    resizeViewport(1440);
    expect(screen.getByRole('complementary', { name: '조별 순위' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '순위표' })).not.toBeInTheDocument();

    resizeViewport(1439);
    expect(screen.queryByRole('complementary', { name: '조별 순위' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '순위표' }));
    const dialog = screen.getByRole('dialog', { name: '조별 순위' });
    expect(within(dialog).getByRole('table', { name: 'A조 순위표' })).toBeInTheDocument();
  });

  it('1439: 경기를 고르면 패널이 시트(dialog)로 열리고, 1440 은 그림 위에 겹친다', () => {
    setBracket(withStandings);
    render(<Harness {...leagueProps('league')} />);
    resizeViewport(1439);
    fireEvent.click(screen.getByRole('button', { name: /A조.*1번 경기 열기/ }));
    expect(within(screen.getByRole('dialog')).getByTestId('panel')).toHaveTextContent('l1');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '패널 닫기' }));

    resizeViewport(1440);
    fireEvent.click(screen.getByRole('button', { name: /A조.*1번 경기 열기/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('bracket-canvas-area')).getByTestId('panel')).toHaveTextContent('l1');
  });

  it('1439 에서 연 「순위표」 시트는 1440 으로 넓히면 닫히고, 다시 좁혀도 저절로 뜨지 않는다', () => {
    setBracket(withStandings);
    render(<Harness {...leagueProps('league')} />);
    resizeViewport(1439);
    fireEvent.click(screen.getByRole('button', { name: '순위표' }));
    expect(screen.getByRole('dialog', { name: '조별 순위' })).toBeInTheDocument();

    resizeViewport(1440);
    resizeViewport(1439);
    expect(screen.queryByRole('dialog', { name: '조별 순위' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '순위표' })).toBeInTheDocument();
  });

  it('리그는 1440 에서도 트레이가 접힌 한 줄 요약이고, 토너먼트는 펼쳐 둔다(대조군)', () => {
    setBracket(withStandings);
    const { unmount } = render(<Harness {...leagueProps('league')} />);
    resizeViewport(1440);
    expect(screen.getByRole('button', { name: '펼치기' })).toHaveAttribute('aria-expanded', 'false');
    unmount();
    setBracket(populated);
    render(<Harness {...leagueProps('knockout')} />);
    expect(screen.queryByRole('button', { name: '펼치기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /서울FC/ })).toBeInTheDocument();
  });

  it('리그가 아니거나 편성 팀이 없으면 순위표도 버튼도 없다', () => {
    setBracket(withStandings);
    const { unmount } = render(<Harness {...leagueProps('knockout')} />);
    expect(screen.queryByRole('complementary', { name: '조별 순위' })).not.toBeInTheDocument();
    unmount();
    setBracket(leagueBracket);
    render(<Harness {...leagueProps('league')} />);
    expect(screen.queryByRole('complementary', { name: '조별 순위' })).not.toBeInTheDocument();
    resizeViewport(900);
    expect(screen.queryByRole('button', { name: '순위표' })).not.toBeInTheDocument();
  });
});
