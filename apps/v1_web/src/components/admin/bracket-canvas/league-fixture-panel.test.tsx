import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLeagueBoard, type LeagueBoardNode } from '@/lib/league-board-model';
import { v1Keys } from '@/lib/query-keys';
import { makeGame, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixtureGame } from '@/types/api';
import type { V1LeagueFixture } from '@/types/league-match';
import { LeagueFixturePanel, type LeagueFixturePanelProps } from './league-fixture-panel';

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  quick: vi.fn(),
  formProps: [] as Array<Record<string, unknown>>,
  resultProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutate: mocks.assign, isPending: false }),
  useV1QuickResult: () => ({ mutate: mocks.quick, isPending: false }),
}));

// 점수 입력 폼과 결과 동작의 내부는 PR-3 테스트가 지킨다 — 여기서는 리그 패널이 넘기는 값과 반응만 본다.
vi.mock('./bracket-quick-result-form', () => ({
  BracketQuickResultForm: (props: { onSubmit: (score: { home: number; away: number }) => void }) => {
    mocks.formProps.push(props);
    return <button type="button" onClick={() => props.onSubmit({ home: 2, away: 1 })}>점수 확정 폼</button>;
  },
}));
vi.mock('./bracket-result-actions', () => ({
  BracketResultActions: (props: { showToast: (message: string, variant?: 'success' | 'error') => void }) => {
    mocks.resultProps.push(props);
    return (
      <div data-testid="result-actions">
        <button type="button" onClick={() => props.showToast('점수를 고쳤어요.', 'success')}>성공 신호</button>
        <button type="button" onClick={() => props.showToast('고치지 못했어요.', 'error')}>실패 신호</button>
      </div>
    );
  },
}));

const REGISTRATIONS = [
  makeRegistration({ id: 'r1', teamName: '독수리FC' }),
  makeRegistration({ id: 'r2', teamName: '호랑이FC' }),
  makeRegistration({ id: 'r3', teamName: '사자FC' }),
  makeRegistration({ id: 'r9', teamName: '입금 대기 팀', status: 'awaiting_payment' }),
];
const SLOTS = [
  makeSlot({ id: 's1', position: 1, label: '1번 자리' }),
  makeSlot({ id: 's2', position: 2, label: '2번 자리' }),
  makeSlot({ id: 's3', position: 3, label: '3번 자리', registrationId: 'r3', teamName: '사자FC' }),
];

function nodeOf(overrides: Partial<V1LeagueFixture> = {}): LeagueBoardNode {
  const fixture: V1LeagueFixture = {
    teamMatchId: 'fx-1', title: '1주차', homeTeamId: null, awayTeamId: null, homeSlotId: 's1', awaySlotId: 's2',
    startAt: '2030-01-07T10:00:00.000Z', placeName: '망원 유수지', status: 'matched', game: null, ...overrides,
  };
  const { columns } = buildLeagueBoard({ fixtures: [fixture], slots: SLOTS, teamNameById: new Map([['t1', '독수리FC'], ['t2', '호랑이FC']]) });
  return columns[0].nodes[0];
}

const showToast = vi.fn();
const onEditSchedule = vi.fn();
const onCancelFixture = vi.fn();
const onClose = vi.fn();
let queryClient: QueryClient;

function renderPanel(node: LeagueBoardNode, overrides: Partial<LeagueFixturePanelProps> = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <LeagueFixturePanel
        leagueId="league-1"
        node={node}
        slots={SLOTS}
        registrations={REGISTRATIONS}
        canWrite
        showToast={showToast}
        onEditSchedule={onEditSchedule}
        onCancelFixture={onCancelFixture}
        onClose={onClose}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

const READY_GAME: V1AdminBracketFixtureGame = makeGame({ id: 'g1', version: 3 });
const OFFICIAL_GAME: V1AdminBracketFixtureGame = makeGame({
  id: 'g1', state: 'ENDED', version: 4,
  latestRevision: { id: 'rev1', state: 'OFFICIAL', score: { home: 2, away: 1 }, entryMethod: 'quick' },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.formProps.length = 0;
  mocks.resultProps.length = 0;
  queryClient = new QueryClient();
});

describe('LeagueFixturePanel — 팀 자리', () => {
  it('자리가 있고 시작 전이면 확정 팀 중 아직 자리에 없는 팀만 고를 수 있고, 고르면 그 자리에 배정한다', () => {
    renderPanel(nodeOf());

    const select = screen.getByRole('combobox', { name: '홈 팀 선택' });
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.textContent);
    // r3(사자FC)는 s3 에 이미 있고 r9 는 확정이 아니다.
    expect(options).toEqual(['비워 두기', '독수리FC', '호랑이FC']);

    mocks.assign.mockImplementation((_vars: unknown, handlers: { onSuccess: () => void }) => handlers.onSuccess());
    fireEvent.change(select, { target: { value: 'r1' } });
    expect(mocks.assign).toHaveBeenCalledWith({ slotId: 's1', registrationId: 'r1' }, expect.any(Object));
    expect(showToast).toHaveBeenCalledWith('팀을 넣었어요.', 'success');
  });

  it('이미 들어간 팀은 그 자리의 선택지에 남고, 비워 두기는 null 로 보낸다', () => {
    renderPanel(nodeOf({ homeTeamId: 't3', homeSlotId: 's3' }));

    const select = screen.getByRole('combobox', { name: '홈 팀 선택' });
    expect(select).toHaveValue('r3');
    fireEvent.change(select, { target: { value: '' } });
    expect(mocks.assign).toHaveBeenCalledWith({ slotId: 's3', registrationId: null }, expect.any(Object));
  });

  it('배정이 거부되면 서버 사유를 오류 토스트로 보인다', () => {
    mocks.assign.mockImplementation((_vars: unknown, handlers: { onError: (error: unknown) => void }) =>
      handlers.onError(new Error('이미 다른 자리에 들어간 팀이에요.')));
    renderPanel(nodeOf());

    fireEvent.change(screen.getByRole('combobox', { name: '원정 팀 선택' }), { target: { value: 'r2' } });
    expect(showToast).toHaveBeenCalledWith('이미 다른 자리에 들어간 팀이에요.', 'error');
  });

  it('시작했거나 결과가 있는 경기는 팀을 못 바꾼다고 안내한다 — 시작 전 경기에는 선택창이 있다(대조)', () => {
    const { unmount } = renderPanel(nodeOf({ game: OFFICIAL_GAME }));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getAllByText('경기가 시작됐거나 결과가 있어 팀을 바꿀 수 없어요.')).toHaveLength(2);
    unmount();

    renderPanel(nodeOf({ game: READY_GAME }));
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('자리 없이 만든 기존 경기는 여기서 팀을 바꾸지 않는다', () => {
    renderPanel(nodeOf({ homeTeamId: 't1', awayTeamId: 't2', homeSlotId: null, awaySlotId: null }));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getAllByText('자리 없이 만든 경기예요.')).toHaveLength(2);
  });
});

describe('LeagueFixturePanel — 결과', () => {
  const TEAMS_FILLED = { homeTeamId: 't1', awayTeamId: 't2' };

  it('양쪽 팀이 정해진 시작 전 경기는 점수 폼을 열고, 제출하면 게임 id·버전과 함께 빠른 결과를 보낸다', () => {
    mocks.quick.mockImplementation((_vars: unknown, handlers: { onSuccess: () => void }) => handlers.onSuccess());
    renderPanel(nodeOf({ ...TEAMS_FILLED, game: READY_GAME }));

    expect(mocks.formProps[0]).toMatchObject({ isKnockout: false, submitLabel: '점수 확정' });
    fireEvent.click(screen.getByRole('button', { name: '점수 확정 폼' }));

    expect(mocks.quick).toHaveBeenCalledWith({ gameId: 'g1', expectedVersion: 3, score: { home: 2, away: 1 } }, expect.any(Object));
    expect(showToast).toHaveBeenCalledWith('점수를 확정했어요.', 'success');
  });

  it('빠른 결과가 거부되면 폼 아래에 사유를 남기고 폼을 유지한다 — 명단 동기화 중이면 다시 시도 안내', () => {
    mocks.quick.mockImplementation((_vars: unknown, handlers: { onError: (error: unknown) => void }) =>
      handlers.onError(new Error('명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.')));
    renderPanel(nodeOf({ ...TEAMS_FILLED, game: READY_GAME }));

    fireEvent.click(screen.getByRole('button', { name: '점수 확정 폼' }));

    expect(mocks.formProps[mocks.formProps.length - 1]).toMatchObject({ errorMessage: '명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.' });
  });

  it('팀이 비어 있으면 점수 폼 대신 안내만 보인다', () => {
    renderPanel(nodeOf({ game: READY_GAME }));
    expect(screen.getByText('양쪽 팀이 정해지면 점수를 넣을 수 있어요.')).toBeInTheDocument();
    expect(mocks.formProps).toHaveLength(0);
  });

  it('라이브 득점 기록이 있으면 정정 화면으로 보내고, 진행 중이면 콘솔로 보낸다', () => {
    const { unmount } = renderPanel(nodeOf({ ...TEAMS_FILLED, game: makeGame({ id: 'g1', hasLiveRecords: true }) }));
    expect(screen.getByRole('link', { name: '결과 정정 화면 열기' })).toHaveAttribute(
      'href',
      '/admin/live/league-1/records/corrections?fixtureId=fx-1',
    );
    expect(mocks.formProps).toHaveLength(0);
    unmount();

    renderPanel(nodeOf({ ...TEAMS_FILLED, game: makeGame({ id: 'g1', state: 'LIVE' }) }));
    expect(screen.getByRole('link', { name: '콘솔 열기' })).toHaveAttribute('href', '/admin/live/league-1/fixtures/fx-1/operate');
  });

  it('확정 전·확정된 결과가 있으면 PR-3 결과 동작에 리그 id 를 넘기고, 성공할 때만 리그 화면을 새로 읽는다', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderPanel(nodeOf({ ...TEAMS_FILLED, game: OFFICIAL_GAME }));

    expect(mocks.resultProps[0]).toMatchObject({ tournamentId: 'league-1', fixtureId: 'fx-1', isKnockout: false, canWrite: true });

    fireEvent.click(screen.getByRole('button', { name: '실패 신호' }));
    expect(showToast).toHaveBeenLastCalledWith('고치지 못했어요.', 'error');
    expect(invalidate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '성공 신호' }));
    expect(showToast).toHaveBeenLastCalledWith('점수를 고쳤어요.', 'success');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: v1Keys.adminLeagueMatch('league-1') });
  });

  it('읽기 전용이면 점수 폼·자리 선택·일정/취소 버튼이 없다 — 결과 동작에는 canWrite=false 가 간다', () => {
    renderPanel(nodeOf({ ...TEAMS_FILLED, game: OFFICIAL_GAME }), { canWrite: false });

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: '일정 수정' })).toBeNull();
    expect(screen.queryByRole('button', { name: '경기 취소' })).toBeNull();
    expect(mocks.resultProps[0]).toMatchObject({ canWrite: false });
  });
});

describe('LeagueFixturePanel — 일정 · 취소 · 닫기', () => {
  it('일정 수정·경기 취소는 부모의 기존 모달을 연다', () => {
    renderPanel(nodeOf({ game: READY_GAME }));

    fireEvent.click(screen.getByRole('button', { name: '일정 수정' }));
    fireEvent.click(screen.getByRole('button', { name: '경기 취소' }));
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));

    expect(onEditSchedule).toHaveBeenCalledTimes(1);
    expect(onCancelFixture).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('진행 중 경기에는 취소가 없고(서버가 409), 취소된 경기에는 쓰기 버튼이 모두 없다', () => {
    const { unmount } = renderPanel(nodeOf({ homeTeamId: 't1', awayTeamId: 't2', game: makeGame({ id: 'g1', state: 'PAUSED' }) }));
    expect(screen.getByRole('button', { name: '일정 수정' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '경기 취소' })).toBeNull();
    unmount();

    renderPanel(nodeOf({ status: 'cancelled', homeSlotId: null, awaySlotId: null }));
    expect(screen.getByText('취소된 경기예요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '일정 수정' })).toBeNull();
    expect(screen.queryByRole('button', { name: '경기 취소' })).toBeNull();
  });
});
