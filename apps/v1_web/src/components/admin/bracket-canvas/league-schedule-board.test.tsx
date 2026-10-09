import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installViewport, resizeViewport } from '@/test/viewport';
import { makeGame, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixtureGame } from '@/types/api';
import type { V1AdminLeagueTeam, V1LeagueFixture } from '@/types/league-match';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';
import { LeagueScheduleBoard, type LeagueScheduleBoardProps } from './league-schedule-board';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

const TEAMS: V1AdminLeagueTeam[] = [
  { teamId: 't1', name: '독수리FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r1' },
  { teamId: 't2', name: '호랑이FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r2' },
  { teamId: 't3', name: '사자FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r3' },
];

const SLOTS = [
  makeSlot({ id: 's1', position: 1, label: '1번 자리' }),
  makeSlot({ id: 's2', position: 2, label: '2번 자리' }),
  makeSlot({ id: 's3', position: 3, label: '3번 자리', registrationId: 'r3', teamName: '사자FC' }),
  makeSlot({ id: 's4', position: 4, label: '4번 자리', registrationId: 'r2', teamName: '호랑이FC' }),
];

const OFFICIAL_QUICK: V1AdminBracketFixtureGame = makeGame({
  id: 'g1',
  state: 'ENDED',
  version: 2,
  latestRevision: { id: 'rev1', state: 'OFFICIAL', score: { home: 2, away: 1 }, entryMethod: 'quick' },
});

function fixture(overrides: Partial<V1LeagueFixture> & { teamMatchId: string }): V1LeagueFixture {
  return { title: '가을 리그', homeTeamId: 't1', awayTeamId: 't2', startAt: '2030-01-07T10:00:00.000Z', placeName: '망원 유수지', status: 'matched', ...overrides };
}

const FIXTURES: V1LeagueFixture[] = [
  fixture({ teamMatchId: 'fx-empty', homeTeamId: null, awayTeamId: null, homeSlotId: 's1', awaySlotId: 's2' }),
  fixture({ teamMatchId: 'fx-full', homeTeamId: 't3', awayTeamId: 't2', homeSlotId: 's3', awaySlotId: 's4', startAt: '2030-01-14T10:00:00.000Z', game: OFFICIAL_QUICK }),
  fixture({ teamMatchId: 'fx-legacy', startAt: '2030-01-21T10:00:00.000Z' }),
];

const REGISTRATIONS = [
  makeRegistration({ id: 'r1', teamName: '독수리FC' }),
  makeRegistration({ id: 'r2', teamName: '호랑이FC' }),
  makeRegistration({ id: 'r3', teamName: '사자FC' }),
];

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  randomFill: vi.fn(),
  registrations: { data: undefined as unknown, isError: false, error: null as unknown, refetch: vi.fn() },
  trayProps: [] as Array<Record<string, unknown>>,
  panelProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminTournamentRegistrations: () => mocks.registrations }));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutateAsync: mocks.assign, isPending: false }),
  useV1RandomFillSlots: () => ({ mutateAsync: mocks.randomFill, isPending: false }),
}));

// 트레이·패널 내부는 PR-3 와 Task 6 의 자체 테스트가 지킨다 — 여기서는 보드가 넘기는 props 와 반응만 본다.
vi.mock('./bracket-team-tray', () => ({
  BracketTeamTray: (props: {
    registrations: Array<{ id: string; teamName: string }>;
    canWrite: boolean;
    pendingRegistrationId: string | null;
    onPick: (registrationId: string | null) => void;
  }) => {
    mocks.trayProps.push(props);
    return (
      <div data-testid="tray" data-canwrite={String(props.canWrite)}>
        {props.registrations.map((registration) => (
          <button key={registration.id} type="button" onClick={() => props.onPick(registration.id)}>
            {registration.teamName}
          </button>
        ))}
      </div>
    );
  },
}));
vi.mock('./league-fixture-panel', () => ({
  LeagueFixturePanel: (props: {
    node: { fixtureId: string; home: { label: string }; away: { label: string } };
    onEditSchedule: () => void;
    onCancelFixture: () => void;
    onClose: () => void;
  }) => {
    mocks.panelProps.push(props);
    return (
      <div role="dialog" aria-label="경기 패널">
        {`${props.node.home.label} vs ${props.node.away.label}`}
        <button type="button" onClick={props.onEditSchedule}>일정 수정</button>
        <button type="button" onClick={props.onCancelFixture}>경기 취소</button>
        <button type="button" onClick={props.onClose}>패널 닫기</button>
      </div>
    );
  },
}));

const showToast = vi.fn();
const onOpenTemplate = vi.fn();
const onEditSchedule = vi.fn();
const onCancelFixture = vi.fn();
const onShowList = vi.fn();

function renderBoard(overrides: Partial<LeagueScheduleBoardProps> = {}) {
  return render(
    <LeagueScheduleBoard
      leagueId="league-1"
      fixtures={FIXTURES}
      slots={SLOTS}
      teams={TEAMS}
      canWrite
      showToast={showToast}
      onOpenTemplate={onOpenTemplate}
      onEditSchedule={onEditSchedule}
      onCancelFixture={onCancelFixture}
      onShowList={onShowList}
      {...overrides}
    />,
  );
}

const cardOf = (name: string) => screen.getByRole('listitem', { name });
const lastTray = () => mocks.trayProps[mocks.trayProps.length - 1];

let restoreViewport: (() => void) | null = null;
afterEach(() => {
  restoreViewport?.();
  restoreViewport = null;
});

beforeEach(() => {
  vi.resetAllMocks();
  restoreViewport = installViewport(1280);
  mocks.trayProps.length = 0;
  mocks.panelProps.length = 0;
  mocks.registrations = { data: { items: REGISTRATIONS, truncated: false }, isError: false, error: null, refetch: vi.fn() };
  mocks.assign.mockResolvedValue({ slot: {}, affectedTeamMatchIds: [] });
  mocks.randomFill.mockResolvedValue({ assignments: [] });
});

describe('LeagueScheduleBoard — 렌더', () => {
  it('경기일마다 "N주차 · 날짜" 열을 만들고 자리 라벨·팀 이름·상태를 카드에 싣는다', () => {
    renderBoard();

    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(3);
    expect(headings.map((heading) => heading.textContent)).toEqual([
      expect.stringMatching(/^1주차 · /),
      expect.stringMatching(/^2주차 · /),
      expect.stringMatching(/^3주차 · /),
    ]);
    const empty = cardOf('1번 자리 대 2번 자리 경기');
    expect(within(empty).getByRole('button', { name: '홈 1번 자리 비어 있음' })).toBeInTheDocument();
    expect(within(empty).getByRole('button', { name: '원정 2번 자리 비어 있음' })).toBeInTheDocument();
    expect(within(empty).getByText('예정')).toBeInTheDocument();
    expect(within(empty).getByText(/망원 유수지/)).toBeInTheDocument();

    const full = cardOf('사자FC 대 호랑이FC 경기');
    expect(within(full).getByRole('button', { name: '홈 사자FC' })).toBeInTheDocument();
    expect(within(full).getByText('확정')).toBeInTheDocument();
    expect(within(full).getByText('2 : 1')).toBeInTheDocument();
    expect(within(full).getByText('어드민 빠른 입력')).toBeInTheDocument();
  });

  it('공개 대기 표시는 팀이 빈 자리 경기에만 붙는다 — 다 찬 경기·자리 없는 기존 경기에는 없다', () => {
    renderBoard();

    expect(within(cardOf('1번 자리 대 2번 자리 경기')).getByText('공개 대기')).toBeInTheDocument();
    expect(within(cardOf('사자FC 대 호랑이FC 경기')).queryByText('공개 대기')).toBeNull();
    expect(within(cardOf('독수리FC 대 호랑이FC 경기')).queryByText('공개 대기')).toBeNull();
    expect(screen.getByText(/자리 2\/4 배정/)).toBeInTheDocument();
    expect(screen.getByText(/공개 대기 1경기/)).toBeInTheDocument();
  });

  it('읽기 전용이면 안내를 보인다', () => {
    renderBoard({ canWrite: false });
    expect(screen.getByRole('status')).toHaveTextContent('읽기 전용');
  });

  it('경기가 없으면 빈 상태에서 템플릿을 권하고(쓰기 권한 있을 때만) 목록으로 가는 길을 남긴다', () => {
    const { unmount } = renderBoard({ fixtures: [], slots: [] });
    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 시작' }));
    expect(onOpenTemplate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /목록으로/ }));
    expect(onShowList).toHaveBeenCalledTimes(1);
    unmount();

    renderBoard({ fixtures: [], slots: [], canWrite: false });
    expect(screen.queryByRole('button', { name: '템플릿으로 시작' })).toBeNull();
  });

  it('경기가 있어도 자리가 없는 리그는 팀 넣기를 쓸 수 없다고 알린다', () => {
    renderBoard({ slots: [] });
    expect(screen.getByText(/자리 없이 만든 대진/)).toBeInTheDocument();
  });
});

describe('LeagueScheduleBoard — 툴바', () => {
  it('빈 자리 무작위 채우기: 넣은 팀 수를 알리고, 아무것도 못 넣으면 그렇게 말한다', async () => {
    mocks.randomFill.mockResolvedValueOnce({ assignments: [{ slotId: 's1', registrationId: 'r1' }, { slotId: 's2', registrationId: 'r2' }] });
    renderBoard();

    fireEvent.click(screen.getByRole('button', { name: '빈 자리 무작위 채우기' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('2팀을 빈 자리에 넣었어요.', 'success'));

    fireEvent.click(screen.getByRole('button', { name: '빈 자리 무작위 채우기' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('넣을 수 있는 팀이나 빈 자리가 없어요.', 'success'));
  });

  it('무작위 채우기가 거부되면 서버 사유를 오류 토스트로 보여 준다', async () => {
    mocks.randomFill.mockRejectedValueOnce(new Error('참가팀이 모자라요.'));
    renderBoard();

    fireEvent.click(screen.getByRole('button', { name: '빈 자리 무작위 채우기' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('참가팀이 모자라요.', 'error'));
  });

  it('빈 자리가 없으면 무작위 채우기 버튼이 잠긴다', () => {
    renderBoard({ slots: SLOTS.map((slot) => ({ ...slot, registrationId: `r-${slot.id}`, teamName: slot.id })) });
    expect(screen.getByRole('button', { name: '빈 자리 무작위 채우기' })).toBeDisabled();
  });

  it('읽기 전용에는 툴바가 없다', () => {
    renderBoard({ canWrite: false });
    expect(screen.queryByRole('button', { name: '빈 자리 무작위 채우기' })).toBeNull();
    expect(screen.queryByRole('button', { name: /템플릿으로/ })).toBeNull();
  });

  it('자리가 없는 리그는 무작위 채우기 없이 템플릿으로 다시 만들기만 권한다', () => {
    renderBoard({ slots: [] });
    expect(screen.queryByRole('button', { name: '빈 자리 무작위 채우기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 다시 만들기' }));
    expect(onOpenTemplate).toHaveBeenCalledTimes(1);
  });
});

describe('LeagueScheduleBoard — 트레이', () => {
  it('확정 팀 목록·자리·직접 배치 팀을 트레이에 넘긴다 — 자리 없는 기존 경기의 팀은 directPlacedIds 에 든다', () => {
    renderBoard();

    const tray = lastTray() as {
      registrations: Array<{ id: string }>;
      slots: unknown[];
      canWrite: boolean;
      directPlacedIds: ReadonlySet<string>;
      registrationsState: { status: string; truncated: boolean; refetchFailed: boolean };
    };
    expect(tray.registrations.map((registration) => registration.id)).toEqual(['r1', 'r2', 'r3']);
    expect(tray.slots).toBe(SLOTS);
    expect(tray.canWrite).toBe(true);
    // fx-legacy(t1 vs t2, 자리 없음)만 직접 배치 — 자리에 연결된 fx-empty·fx-full 의 팀은 제외.
    expect([...tray.directPlacedIds].sort()).toEqual(['r1', 'r2']);
    expect(tray.registrationsState).toMatchObject({ status: 'success', truncated: false, refetchFailed: false });
  });

  it('읽기 전용이면 트레이가 canWrite=false 로 내려간다', () => {
    renderBoard({ canWrite: false });
    expect(screen.getByTestId('tray')).toHaveAttribute('data-canwrite', 'false');
  });

  it('참가팀 조회 상태를 트레이에 그대로 알린다 — 로딩·실패·재조회 실패(캐시 유지)·잘림', () => {
    mocks.registrations = { data: undefined, isError: false, error: null, refetch: vi.fn() };
    const { unmount } = renderBoard();
    expect((lastTray().registrationsState as { status: string }).status).toBe('pending');
    unmount();

    const error = new Error('boom');
    mocks.registrations = { data: undefined, isError: true, error, refetch: vi.fn() };
    const failed = renderBoard();
    const errorState = lastTray().registrationsState as { status: string; error: unknown; onRetry: () => void };
    expect(errorState).toMatchObject({ status: 'error', error });
    errorState.onRetry();
    expect(mocks.registrations.refetch).toHaveBeenCalledTimes(1);
    failed.unmount();

    mocks.registrations = { data: { items: REGISTRATIONS, truncated: true }, isError: true, error, refetch: vi.fn() };
    renderBoard();
    expect(lastTray().registrationsState).toMatchObject({ status: 'success', truncated: true, refetchFailed: true });
  });

  it('참가팀을 못 받은 동안에는 무작위 채우기를 이유와 함께 막는다', () => {
    mocks.registrations = { data: undefined, isError: false, error: null, refetch: vi.fn() };
    const { unmount } = renderBoard();
    expect(screen.getByRole('button', { name: '빈 자리 무작위 채우기' })).toBeDisabled();
    expect(screen.getByText('참가팀을 불러오는 중이에요.')).toBeInTheDocument();
    unmount();

    mocks.registrations = { data: undefined, isError: true, error: new Error('x'), refetch: vi.fn() };
    renderBoard();
    expect(screen.getByRole('button', { name: '빈 자리 무작위 채우기' })).toBeDisabled();
    expect(screen.getByText('참가팀을 불러오지 못했어요.')).toBeInTheDocument();
  });
});

describe('LeagueScheduleBoard — 팀 넣기', () => {
  it('트레이에서 팀을 고르고 빈 자리를 누르면 그 자리에 배정하고 선택을 푼다', async () => {
    renderBoard();

    fireEvent.click(within(screen.getByTestId('tray')).getByRole('button', { name: '독수리FC' }));
    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리 비어 있음' }));

    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith({ slotId: 's1', registrationId: 'r1' }));
    expect(showToast).toHaveBeenCalledWith('자리에 팀을 넣었어요.', 'success');
    await waitFor(() => expect(lastTray().pendingRegistrationId).toBeNull());
  });

  it('선택한 팀이 없으면 같은 자리를 눌러도 배정하지 않고 패널을 연다 — 자리 없는 기존 경기는 선택이 있어도 패널만 연다', () => {
    renderBoard();

    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리 비어 있음' }));
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '경기 패널' })).toHaveTextContent('1번 자리 vs 2번 자리');

    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    fireEvent.click(within(screen.getByTestId('tray')).getByRole('button', { name: '독수리FC' }));
    fireEvent.click(within(cardOf('독수리FC 대 호랑이FC 경기')).getByRole('button', { name: '홈 독수리FC' }));
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '경기 패널' })).toHaveTextContent('독수리FC vs 호랑이FC');
  });

  it('배정이 거부되면 서버 사유를 오류 토스트로 보여 주고 선택을 유지한다', async () => {
    mocks.assign.mockRejectedValueOnce(new Error('이미 시작했거나 결과가 있는 경기라 팀을 바꿀 수 없어요.'));
    renderBoard();

    fireEvent.click(within(screen.getByTestId('tray')).getByRole('button', { name: '독수리FC' }));
    fireEvent.click(screen.getByRole('button', { name: '원정 2번 자리 비어 있음' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('이미 시작했거나 결과가 있는 경기라 팀을 바꿀 수 없어요.', 'error'));
    expect(lastTray().pendingRegistrationId).toBe('r1');
  });

  it('끌어 놓으면 놓인 자리에 그 등록을 배정한다 — 자리 없는 사이드나 읽기 전용에서는 무시한다', async () => {
    const { rerender } = renderBoard();
    const drop = (target: HTMLElement) =>
      fireEvent.drop(target, { dataTransfer: { getData: (type: string) => (type === REGISTRATION_DRAG_MIME ? 'r1' : '') } });
    const emptyAway = () => screen.getByRole('button', { name: '원정 2번 자리 비어 있음' });

    drop(emptyAway());
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith({ slotId: 's2', registrationId: 'r1' }));

    mocks.assign.mockClear();
    drop(within(cardOf('독수리FC 대 호랑이FC 경기')).getByRole('button', { name: '원정 호랑이FC' })); // 자리 없는 기존 경기 — slotId 가 없다
    expect(mocks.assign).not.toHaveBeenCalled();

    rerender(
      <LeagueScheduleBoard
        leagueId="league-1" fixtures={FIXTURES} slots={SLOTS} teams={TEAMS} canWrite={false} showToast={showToast}
        onOpenTemplate={onOpenTemplate} onEditSchedule={onEditSchedule} onCancelFixture={onCancelFixture} onShowList={onShowList}
      />,
    );
    drop(emptyAway());
    expect(mocks.assign).not.toHaveBeenCalled();
  });
});

describe('LeagueScheduleBoard — 패널', () => {
  it('경기 머리를 누르면 패널이 열리고, 일정 수정·경기 취소는 패널을 닫고 부모 모달로 넘긴다', () => {
    renderBoard();

    fireEvent.click(within(cardOf('1번 자리 대 2번 자리 경기')).getByRole('button', { name: /경기 상세 열기/ }));
    expect((mocks.panelProps[mocks.panelProps.length - 1] as { node: { fixtureId: string } }).node.fixtureId).toBe('fx-empty');

    fireEvent.click(screen.getByRole('button', { name: '일정 수정' }));
    expect(onEditSchedule).toHaveBeenCalledWith('fx-empty');
    expect(screen.queryByRole('dialog', { name: '경기 패널' })).toBeNull();

    fireEvent.click(within(cardOf('1번 자리 대 2번 자리 경기')).getByRole('button', { name: /경기 상세 열기/ }));
    fireEvent.click(screen.getByRole('button', { name: '경기 취소' }));
    expect(onCancelFixture).toHaveBeenCalledWith('fx-empty');
    expect(screen.queryByRole('dialog', { name: '경기 패널' })).toBeNull();
  });
});

describe('LeagueScheduleBoard — 태블릿(768~1023)', () => {
  const openerName = /^1번 자리 대 2번 자리 경기 상세 열기$/;

  it('1023: 경기 패널이 시트로 열리고, 닫으면 경기 머리 버튼으로 포커스가 돌아온다', () => {
    resizeViewport(1023);
    renderBoard();
    const opener = within(cardOf('1번 자리 대 2번 자리 경기')).getByRole('button', { name: openerName });
    opener.focus();
    fireEvent.click(opener);

    const sheet = screen.getByRole('dialog', { name: '1번 자리 vs 2번 자리' });
    expect(within(sheet).getByRole('dialog', { name: '경기 패널' })).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('1024: 시트 없이 옆(본문) 패널로 열린다(대조군)', () => {
    resizeViewport(1024);
    renderBoard();
    fireEvent.click(within(cardOf('1번 자리 대 2번 자리 경기')).getByRole('button', { name: openerName }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: '경기 패널' })).toBeInTheDocument();
  });

  it('1024: 패널이 보드와 같은 그리드의 세 번째 열이고, 선택 전에는 두 열이다', () => {
    resizeViewport(1024);
    renderBoard();
    const grid = screen.getByTestId('league-board-grid');
    expect(grid.className).toContain('lg:grid-cols-[16rem_minmax(0,1fr)]');
    expect(grid.className).not.toContain('320px');
    fireEvent.click(within(cardOf('1번 자리 대 2번 자리 경기')).getByRole('button', { name: openerName }));
    expect(grid.className).toContain('lg:grid-cols-[16rem_minmax(0,1fr)_320px]');
    expect(grid.lastElementChild).toBe(screen.getByRole('dialog', { name: '경기 패널' }));
  });

  it('1023: 패널은 그리드 밖 시트에 있고 그리드는 두 열을 유지한다(대조군)', () => {
    resizeViewport(1023);
    renderBoard();
    fireEvent.click(within(cardOf('1번 자리 대 2번 자리 경기')).getByRole('button', { name: openerName }));
    const grid = screen.getByTestId('league-board-grid');
    expect(grid.className).not.toContain('320px');
    expect(grid).not.toContainElement(screen.getByRole('dialog', { name: '경기 패널' }));
  });

  it('트레이는 1023 에서만 접힌다', () => {
    resizeViewport(1023);
    const { unmount } = renderBoard();
    expect(lastTray().collapsible).toBe(true);
    unmount();
    resizeViewport(1024);
    mocks.trayProps.length = 0;
    renderBoard();
    expect(lastTray().collapsible).toBe(false);
  });
});
