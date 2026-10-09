import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installViewport, resizeViewport } from '@/test/viewport';
import { makeBracket, makeFixture, makeGroup, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminTournamentBracket } from '@/types/api';
import type { V1FillSlotsFromStandingsResult } from '@/types/bracket-standings-fill';
import type { RegistrationsLoadState } from './bracket-team-tray';
import { BracketCanvasWorkspace } from './bracket-canvas-workspace';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

const mocks = vi.hoisted(() => ({
  bracket: { data: undefined as unknown, isPending: false, isError: false, error: null as unknown, refetch: vi.fn() },
  assign: vi.fn(),
  updateFixture: vi.fn(),
  randomFill: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminBracket: () => mocks.bracket,
  useV1UpdateFixture: () => ({ mutate: mocks.updateFixture, isPending: false }),
  useV1PublishTournamentBracket: () => ({ mutate: mocks.publish, isPending: false }),
  useV1UnpublishTournamentBracket: () => ({ mutate: mocks.unpublish, isPending: false }),
}));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutate: mocks.assign, isPending: false }),
  useV1RandomFillSlots: () => ({ mutate: mocks.randomFill, isPending: false }),
}));
// 패널·대화상자는 각자의 테스트가 있다 — 여기서는 열림/닫힘과 넘겨 받는 값만 본다.
vi.mock('./bracket-node-panel', () => ({
  BracketNodePanel: (props: { fixture: { id: string }; canWrite: boolean; onClose: () => void }) => (
    <aside data-testid="panel" data-can-write={String(props.canWrite)}>
      {props.fixture.id}
      <button type="button" onClick={props.onClose}>패널 닫기</button>
    </aside>
  ),
}));
vi.mock('./bracket-fixture-tools-dialog', () => ({
  BracketFixtureToolsDialog: (props: { open: boolean; mode: string }) =>
    props.open ? <div data-testid="tools-dialog" data-mode={props.mode} /> : null,
}));
vi.mock('./bracket-template-dialog', () => ({
  BracketTemplateDialog: (props: { open: boolean; hasExistingBracket: boolean; format: string }) =>
    props.open ? <div data-testid="template-dialog" data-existing={String(props.hasExistingBracket)} data-format={props.format} /> : null,
}));

vi.mock('./bracket-standings-fill-button', () => ({
  BracketStandingsFillButton: (props: {
    tournamentId: string;
    canWrite: boolean;
    slots: unknown[];
    teamNames: ReadonlyMap<string, string>;
    onFilled: (result: V1FillSlotsFromStandingsResult) => void;
    onError: (message: string) => void;
  }) => (
    <div
      data-testid="fill-button"
      data-tournament={props.tournamentId}
      data-can-write={String(props.canWrite)}
      data-slots={props.slots.length}
      data-team-names={JSON.stringify([...props.teamNames])}
    >
      <button type="button" onClick={() => props.onFilled({ assignments: [{ slotId: 's1', registrationId: 'r1' }], skipped: [{ slotId: 's2', reason: 'tied' }] })}>
        채움 성공
      </button>
      <button type="button" onClick={() => props.onError('이미 시작했어요.')}>채움 실패</button>
    </div>
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

function renderWorkspace(overrides: Partial<React.ComponentProps<typeof BracketCanvasWorkspace>> = {}) {
  const props = {
    tournamentId: 't-1',
    format: 'knockout' as const,
    registrations,
    registrationsState: loaded,
    bracketPublishedAt: null,
    bracketPublishScheduledAt: null,
    canWrite: true,
    showToast: vi.fn(),
    onShowList: vi.fn(),
    ...overrides,
  };
  render(<BracketCanvasWorkspace {...props} />);
  return props;
}

// 기본은 옆 패널이 붙는 데스크톱 폭 — 태블릿 describe 만 폭을 바꾼다.
let restoreViewport: (() => void) | null = null;
beforeEach(() => {
  vi.clearAllMocks();
  setBracket(populated);
  restoreViewport = installViewport(1280);
});
afterEach(() => {
  restoreViewport?.();
  restoreViewport = null;
});

describe('BracketCanvasWorkspace — 로딩·에러·빈 상태', () => {
  it('불러오는 동안 스켈레톤만 보이고 도구 모음은 없다', () => {
    setBracket(undefined, { isPending: true });
    renderWorkspace();
    expect(screen.getByRole('status', { name: '대진을 불러오는 중이에요' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: /템플릿/ })).not.toBeInTheDocument();
  });

  it('실패하면 다시 시도 버튼을 주고 템플릿 버튼은 숨긴다', () => {
    setBracket(undefined, { isError: true, error: new Error('network') });
    renderWorkspace();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /템플릿/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(mocks.bracket.refetch).toHaveBeenCalledTimes(1);
  });

  it('대진이 비어 있으면 "템플릿으로 시작"을 유도하고, 누르면 대화상자가 새 대진 모드로 열린다', () => {
    setBracket(makeBracket());
    renderWorkspace();
    expect(screen.getByText('아직 대진이 없어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 시작' }));
    expect(screen.getByTestId('template-dialog')).toHaveAttribute('data-existing', 'false');
  });

  it('조별+결선 방식 대회도 템플릿으로 시작한다 — 대화상자가 group_knockout 형식으로 열린다', () => {
    setBracket(makeBracket());
    renderWorkspace({ format: 'group_knockout' });
    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 시작' }));
    expect(screen.getByTestId('template-dialog')).toHaveAttribute('data-format', 'group_knockout');
  });

  it('형식을 알 수 없는 대회는 템플릿 대신 목록으로 안내한다(대화상자를 열지 않는다)', () => {
    setBracket(makeBracket());
    const props = renderWorkspace({ format: undefined });
    expect(screen.queryByRole('button', { name: '템플릿으로 시작' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '목록으로 보기' }));
    expect(props.onShowList).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('template-dialog')).not.toBeInTheDocument();
  });

  it('읽기 전용 화면의 빈 대진에는 행동 버튼이 없다', () => {
    setBracket(makeBracket());
    renderWorkspace({ canWrite: false });
    expect(screen.getByText('아직 대진이 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '템플릿으로 시작' })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /^어웨이 .*선택한 팀을 여기에 넣어요$/ }));
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

  it('읽기 전용에서는 팀을 고를 수 없다', () => {
    renderWorkspace({ canWrite: false });
    expect(screen.getByRole('button', { name: /서울FC/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '빈 자리 무작위 채우기' })).not.toBeInTheDocument();
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

  it('패널에 쓰기 권한을 그대로 넘긴다', () => {
    renderWorkspace({ canWrite: false });
    fireEvent.click(screen.getByRole('button', { name: '8강 1번 경기 열기' }));
    expect(screen.getByTestId('panel')).toHaveAttribute('data-can-write', 'false');
  });
});

describe('BracketCanvasWorkspace — 도구 모음', () => {
  it('대진이 있으면 "템플릿으로 다시 만들기"가 교체 모드로 대화상자를 연다', () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 다시 만들기' }));
    expect(screen.getByTestId('template-dialog')).toHaveAttribute('data-existing', 'true');
    expect(screen.getByTestId('template-dialog')).toHaveAttribute('data-format', 'knockout');
  });

  it('빈 자리 무작위 채우기: 채운 수를 알리고, 자리나 팀이 없으면 이유와 함께 막는다', () => {
    const props = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: '빈 자리 무작위 채우기' }));
    expect(mocks.randomFill).toHaveBeenCalledTimes(1);
    act(() =>
      mocks.randomFill.mock.calls[0][1].onSuccess({ assignments: [{ slotId: 's1', registrationId: 'r1' }, { slotId: 's2', registrationId: 'r2' }] }),
    );
    expect(props.showToast).toHaveBeenCalledWith('2개 자리를 채웠어요.', 'success');
  });

  it('모든 자리가 찼으면 무작위 채우기를 막는다', () => {
    setBracket({
      ...populated,
      slots: slots.map((slot, index) => ({ ...slot, registrationId: `r${index + 1}`, teamName: `팀${index + 1}` })),
    });
    renderWorkspace();
    const button = screen.getByRole('button', { name: '빈 자리 무작위 채우기' });
    expect(button).toBeDisabled();
    // 막힌 이유는 title 이 아니라 화면에 보이는 문구로, 버튼이 그 문구를 가리킨다.
    expect(button).toHaveAccessibleDescription('비어 있는 자리가 없어요.');
    expect(screen.getByText('비어 있는 자리가 없어요.')).toBeVisible();
  });

  it('배정할 팀이 하나도 없으면 무작위 채우기를 막는다', () => {
    renderWorkspace({ registrations: [] });
    const button = screen.getByRole('button', { name: '빈 자리 무작위 채우기' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('배정할 수 있는 팀이 없어요.');
  });

  it('"경기 추가"와 "경기 연결"은 각각 대화상자를 add·link 모드로 연다', () => {
    renderWorkspace();
    expect(screen.queryByTestId('tools-dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    expect(screen.getByTestId('tools-dialog')).toHaveAttribute('data-mode', 'add');
    fireEvent.click(screen.getByRole('button', { name: '경기 연결' }));
    expect(screen.getByTestId('tools-dialog')).toHaveAttribute('data-mode', 'link');
  });

  it('읽기 전용에서는 경기 추가·연결 버튼이 없다', () => {
    renderWorkspace({ canWrite: false });
    expect(screen.queryByRole('button', { name: '경기 추가' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '경기 연결' })).not.toBeInTheDocument();
  });
});

describe('BracketCanvasWorkspace — 공개 상태', () => {
  it('비공개 대진은 확인을 거쳐 공개한다', async () => {
    renderWorkspace();
    expect(screen.getByText('비공개')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '지금 전체 공개' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '전체 공개' }));
    await vi.waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1));
  });

  it('이미 공개된 대진을 편집하면 "바꾸는 즉시 보여요" 안내와 공개 취소를 보여 준다', async () => {
    renderWorkspace({ bracketPublishedAt: '2026-10-01T00:00:00.000Z' });
    expect(screen.getByText('공개 중')).toBeInTheDocument();
    expect(screen.getByText('이미 공개된 대진표예요. 바꾸는 즉시 참가팀에게 보여요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '지금 전체 공개' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '공개 취소' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '비공개로 되돌리기' }));
    await vi.waitFor(() => expect(mocks.unpublish).toHaveBeenCalledTimes(1));
  });

  it('읽기 전용에는 공개 상태만 보이고 버튼과 경고는 없다', () => {
    renderWorkspace({ canWrite: false, bracketPublishedAt: '2026-10-01T00:00:00.000Z' });
    expect(screen.getByText('공개 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '공개 취소' })).not.toBeInTheDocument();
    expect(screen.queryByText(/바꾸는 즉시/)).not.toBeInTheDocument();
  });
});

describe('BracketCanvasWorkspace — 신청 목록 조회 상태', () => {
  it('불러오는 중에는 무작위 채우기를 이유와 함께 막는다("팀이 없어요"라고 하지 않는다)', () => {
    renderWorkspace({ registrations: [], registrationsState: { ...loaded, status: 'pending' } });
    const fill = screen.getByRole('button', { name: /빈 자리 무작위 채우기/ });
    expect(fill).toBeDisabled();
    expect(document.getElementById(fill.getAttribute('aria-describedby')!)).toHaveTextContent('참가팀을 불러오는 중이에요.');
    expect(screen.queryByText('배정할 수 있는 팀이 없어요.')).not.toBeInTheDocument();
  });

  it('실패하면 이유를 알리고 다시 시도가 재조회를 부른다', () => {
    const onRetry = vi.fn();
    renderWorkspace({ registrations: [], registrationsState: { ...loaded, status: 'error', onRetry } });
    expect(screen.getByRole('button', { name: /빈 자리 무작위 채우기/ })).toBeDisabled();
    expect(screen.getAllByText('참가팀을 불러오지 못했어요.').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('성공이면 기존처럼 무작위 채우기가 열려 있다', () => {
    renderWorkspace();
    expect(screen.getByRole('button', { name: /빈 자리 무작위 채우기/ })).toBeEnabled();
  });
});

describe('BracketCanvasWorkspace — 조별+결선 순위 채우기', () => {
  const stageGroup = makeGroup({
    id: 'gA',
    name: 'A조',
    phase: 'group',
    groupTeams: [
      { id: 'gt1', groupId: 'gA', registrationId: 'r1', teamName: '서울FC', sortOrder: 0, createdAt: '2026-10-08T00:00:00.000Z' },
      // 부전승 자리는 팀 이름이 없다 — 이름 표에 들어가면 안 된다.
      { id: 'gt2', groupId: 'gA', registrationId: null, teamName: null, sortOrder: 1, createdAt: '2026-10-08T00:00:00.000Z', isBye: true },
    ],
  });
  const withRanks = makeBracket({
    groups: [stageGroup, group],
    slots: [...slots, makeSlot({ id: 'rank1', kind: 'GROUP_RANK', label: 'A조 1위', sourceGroupId: 'gA' })],
    fixtures: populated.fixtures,
  });

  it('순위 채우기 버튼에 대회·자리·권한·조 편성 팀 이름 표를 넘긴다', () => {
    setBracket(withRanks);
    renderWorkspace({ format: 'group_knockout' });
    const button = screen.getByTestId('fill-button');
    expect(button).toHaveAttribute('data-tournament', 't-1');
    expect(button).toHaveAttribute('data-can-write', 'true');
    expect(button).toHaveAttribute('data-slots', '5');
    expect(JSON.parse(button.getAttribute('data-team-names')!)).toEqual([['r1', '서울FC']]);
  });

  it('채우기가 끝나면 채운 수를, 실패하면 이유를 토스트로 알린다', () => {
    setBracket(withRanks);
    const props = renderWorkspace({ format: 'group_knockout' });
    fireEvent.click(screen.getByRole('button', { name: '채움 성공' }));
    expect(props.showToast).toHaveBeenCalledWith('1개 자리를 순위대로 채웠어요. 1개 자리는 건너뛰었어요.', 'success');
    fireEvent.click(screen.getByRole('button', { name: '채움 실패' }));
    expect(props.showToast).toHaveBeenCalledWith('이미 시작했어요.', 'error');
  });

  it('빈 대진과 읽기 전용 화면에는 순위 채우기 버튼을 두지 않는다', () => {
    setBracket(makeBracket());
    renderWorkspace({ format: 'group_knockout' });
    expect(screen.queryByTestId('fill-button')).not.toBeInTheDocument();
    cleanup();
    setBracket(withRanks);
    renderWorkspace({ format: 'group_knockout', canWrite: false });
    expect(screen.queryByTestId('fill-button')).not.toBeInTheDocument();
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

    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
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

  it('1024: 같은 동작이 시트 없이 옆 패널로 열린다(대조군)', () => {
    resizeViewport(1024);
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: '8강 2번 경기 열기' }));
    expect(screen.getByTestId('panel')).toHaveTextContent('f2');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('1023: 트레이는 접혀 있고 펼치면 목록이 보인다', () => {
    resizeViewport(1023);
    renderWorkspace();
    const toggle = screen.getByRole('button', { name: '펼치기' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /서울FC/ })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: '접기' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /서울FC/ })).toBeInTheDocument();
  });

  it('1024: 트레이에 토글이 없고 목록이 바로 보인다', () => {
    resizeViewport(1024);
    renderWorkspace();
    expect(screen.queryByRole('button', { name: '펼치기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /서울FC/ })).toBeInTheDocument();
  });
});
