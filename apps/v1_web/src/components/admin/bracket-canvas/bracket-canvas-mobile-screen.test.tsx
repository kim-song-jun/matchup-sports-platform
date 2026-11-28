import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBracket, makeFixture, makeGroup, makeRegistration, makeSlot, makeStanding } from '@/test/bracket-canvas-fixtures';
import type { RegistrationsLoadState } from './bracket-team-tray';
import { BracketCanvasMobileScreen } from './bracket-canvas-mobile-screen';
import type { BracketViewControls } from './use-bracket-view-controls';

const { bracketState, refetch } = vi.hoisted(() => ({
  bracketState: { value: {} as Record<string, unknown> },
  refetch: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminBracket: () => bracketState.value }));
vi.mock('./bracket-canvas-mobile', () => ({
  BracketCanvasMobile: (props: { competitionId: string; scope: string; canWrite: boolean; rounds: Array<{ label: string; sections: Array<{ nodes: Array<{ fixtureId: string }> }> }>; candidates: unknown[]; slots: unknown[]; groups?: unknown[]; registrationsState: RegistrationsLoadState; hint?: string | null; focusFixtureId?: string | null }) => (
    <div
      data-testid="mobile-canvas"
      data-competition-id={props.competitionId}
      data-scope={props.scope}
      data-can-write={String(props.canWrite)}
      data-rounds={props.rounds.map((round) => round.label).join(',')}
      data-nodes={props.rounds.flatMap((round) => round.sections.flatMap((section) => section.nodes.map((node) => node.fixtureId))).join(',')}
      data-hint={props.hint === null ? 'none' : String(props.hint)}
      data-focus={props.focusFixtureId ?? ''}
      data-candidates={props.candidates.length}
      data-slots={props.slots.length}
      data-groups={props.groups?.length ?? -1}
      data-registrations-status={props.registrationsState.status}
    />
  ),
}));

vi.mock('./mobile-team-fill-sheet', () => ({
  MobileTeamFillSheet: (props: { open: boolean; onClose: () => void }) => (props.open ? <div data-testid="team-fill-sheet"><button type="button" onClick={props.onClose}>팀 시트 닫기</button></div> : null),
}));

const registrations = [
  makeRegistration({ id: 'r1', teamName: 'A팀', status: 'confirmed' }),
  makeRegistration({ id: 'r2', teamName: 'B팀', status: 'waitlisted' }),
];
const registrationsState: RegistrationsLoadState = { status: 'success', truncated: false, refetchFailed: false, error: null, onRetry: vi.fn() };
const bracket = makeBracket({
  groups: [makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 })],
  fixtures: [makeFixture({ id: 'fx-1', groupId: 'g-q', fixtureNumber: 1, homeSlotId: 's-1' })],
  slots: [makeSlot({ id: 's-1' })],
});

const controlsOf = (overrides: Partial<BracketViewControls> = {}): BracketViewControls => ({
  trayOpen: null, setTrayOpen: vi.fn(), unscheduledOnly: false, setUnscheduledOnly: vi.fn(), focusRequest: null, requestFocus: vi.fn(), clearFocusRequest: vi.fn(), ...overrides,
});

function renderScreen(canWrite = true, format: 'league' | 'knockout' | undefined = 'knockout', controls = controlsOf()) {
  render(
    <BracketCanvasMobileScreen tournamentId="t-1" registrations={registrations} registrationsState={registrationsState} canWrite={canWrite} format={format} showToast={vi.fn()} controls={controls} />,
  );
  return controls;
}

afterEach(() => cleanup());
beforeEach(() => {
  refetch.mockReset();
  bracketState.value = { data: bracket, isPending: false, isError: false, error: null, refetch };
});

describe('BracketCanvasMobileScreen', () => {
  it('응답에서 만든 라운드·자리와 확정된 참가팀만 후보로 모바일 목록에 넘긴다', () => {
    renderScreen();
    const mobile = screen.getByTestId('mobile-canvas');
    expect(mobile).toHaveAttribute('data-competition-id', 't-1');
    expect(mobile).toHaveAttribute('data-scope', 'tournament');
    expect(mobile).toHaveAttribute('data-rounds', '8강');
    expect(mobile).toHaveAttribute('data-slots', '1');
    expect(mobile).toHaveAttribute('data-groups', '1');
    expect(mobile).toHaveAttribute('data-candidates', '1');
    expect(mobile).toHaveAttribute('data-can-write', 'true');
    expect(mobile).toHaveAttribute('data-registrations-status', 'success');
  });

  it('읽기 전용 어드민은 canWrite=false 로 넘어간다', () => {
    renderScreen(false);
    expect(screen.getByTestId('mobile-canvas')).toHaveAttribute('data-can-write', 'false');
  });

  it('불러오는 동안에는 목록 대신 로딩 상태를 보여 준다', () => {
    bracketState.value = { data: undefined, isPending: true, isError: false, error: null, refetch };
    renderScreen();
    expect(screen.getByRole('status', { name: '대진을 불러오는 중이에요' })).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-canvas')).not.toBeInTheDocument();
  });

  it('조회가 실패하면 오류와 다시 시도 버튼을 보여 준다', () => {
    bracketState.value = { data: undefined, isPending: false, isError: true, error: new Error('x'), refetch };
    renderScreen();
    expect(screen.getByText('대진을 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-canvas')).not.toBeInTheDocument();
  });

  it('리그 대회는 라운드 탭이 「N라운드」 이고 조별 순위 접이식이 함께 나온다', () => {
    bracketState.value = {
      data: makeBracket({
        groups: [makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0 })],
        fixtures: [
          makeFixture({ id: 'f1', groupId: 'gA', fixtureNumber: 1, round: 'league_r1' }),
          makeFixture({ id: 'f2', groupId: 'gA', fixtureNumber: 2, round: 'league_r2' }),
        ],
        standings: [makeStanding({ groupId: 'gA', registrationId: 'r1' })],
      }),
      isPending: false, isError: false, error: null, refetch,
    };
    renderScreen(true, 'league');
    expect(screen.getByTestId('mobile-canvas')).toHaveAttribute('data-rounds', '1라운드,2라운드');
    expect(screen.getByText('조별 순위')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'A조 순위표', hidden: true })).toBeInTheDocument();
  });

  it('대회 형식을 알기 전에는 라운드 목록을 그리지 않고 로딩을 보여 준다', () => {
    const controls = controlsOf();
    const { rerender } = render(
      <BracketCanvasMobileScreen tournamentId="t-1" registrations={registrations} registrationsState={registrationsState} canWrite format={undefined} showToast={vi.fn()} controls={controls} />,
    );
    expect(screen.getByRole('status', { name: '대진을 불러오는 중이에요' })).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-canvas')).not.toBeInTheDocument();
    rerender(
      <BracketCanvasMobileScreen tournamentId="t-1" registrations={registrations} registrationsState={registrationsState} canWrite format="league" showToast={vi.fn()} controls={controls} />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-canvas').getAttribute('data-rounds')).toMatch(/^1라운드/);
  });

  it('토너먼트는 순위 접이식 없이 지금 탭 그대로다', () => {
    renderScreen(true, 'knockout');
    expect(screen.queryByText('조별 순위')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-canvas')).toHaveAttribute('data-rounds', '8강');
  });

  it('구조 편집 안내(「대진 구조는 큰 화면에서 편집해요」)를 숨기도록 hint=null 을 넘긴다', () => {
    renderScreen();
    expect(screen.getByTestId('mobile-canvas')).toHaveAttribute('data-hint', 'none');
  });

  it('도구 메뉴의 결선 진출팀 항목이 생겼으므로 화면 위 「결선 진출팀 배정」 버튼은 없다', () => {
    bracketState.value = { data: makeBracket({ ...bracket, groups: [makeGroup({ id: 'g-a', phase: 'group', name: 'A조' }), ...bracket.groups] }), isPending: false, isError: false, error: null, refetch };
    renderScreen(true, 'knockout');
    expect(screen.queryByRole('button', { name: '결선 진출팀 배정' })).not.toBeInTheDocument();
  });
});

describe('BracketCanvasMobileScreen — 도구 줄과 주고받는 보기 상태', () => {
  const scheduled = makeBracket({
    groups: [makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 })],
    fixtures: [
      makeFixture({ id: 'fx-timed', groupId: 'g-q', fixtureNumber: 1, scheduledAt: '2026-11-20T01:00:00.000Z' }),
      makeFixture({ id: 'fx-open', groupId: 'g-q', fixtureNumber: 2 }),
    ],
    slots: [],
  });
  beforeEach(() => { bracketState.value = { data: scheduled, isPending: false, isError: false, error: null, refetch }; });

  it('시간 미정만 보기를 켜면 시간 있는 카드가 사라진다(끄면 전부 보인다)', () => {
    renderScreen();
    expect(screen.getByTestId('mobile-canvas')).toHaveAttribute('data-nodes', 'fx-timed,fx-open');
    cleanup();
    renderScreen(true, 'knockout', controlsOf({ unscheduledOnly: true }));
    expect(screen.getByTestId('mobile-canvas')).toHaveAttribute('data-nodes', 'fx-open');
  });

  it('시간 미정 경기가 0건이면 「시간 미정 경기가 없어요」와 「모든 경기 보기」를 보이고 누르면 켠 것을 끈다', () => {
    bracketState.value = { data: makeBracket({ ...scheduled, fixtures: [scheduled.fixtures[0]] }), isPending: false, isError: false, error: null, refetch };
    const controls = renderScreen(true, 'knockout', controlsOf({ unscheduledOnly: true }));
    expect(screen.getByText('시간 미정 경기가 없어요')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-canvas')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '모든 경기 보기' }));
    expect(controls.setUnscheduledOnly).toHaveBeenCalledWith(false);
  });

  it('controls.focusRequest 의 경기를 시트로 열도록 넘기고, 넘긴 뒤 요청을 비운다', () => {
    const controls = renderScreen(true, 'knockout', controlsOf({ focusRequest: { fixtureId: 'fx-open', nonce: 1 } }));
    expect(screen.getByTestId('mobile-canvas')).toHaveAttribute('data-focus', 'fx-open');
    expect(controls.clearFocusRequest).toHaveBeenCalledTimes(1);
  });

  it('없는 경기 요청은 열지도 비우지도 않는다', () => {
    const controls = renderScreen(true, 'knockout', controlsOf({ focusRequest: { fixtureId: 'nope', nonce: 1 } }));
    expect(screen.getByTestId('mobile-canvas')).toHaveAttribute('data-focus', '');
    expect(controls.clearFocusRequest).not.toHaveBeenCalled();
  });

  it('controls.trayOpen=true 면 팀 시트가 열리고 닫으면 setTrayOpen(false)', () => {
    const controls = renderScreen(true, 'knockout', controlsOf({ trayOpen: true }));
    fireEvent.click(screen.getByRole('button', { name: '팀 시트 닫기' }));
    expect(controls.setTrayOpen).toHaveBeenCalledWith(false);
    cleanup();
    renderScreen();
    expect(screen.queryByTestId('team-fill-sheet')).not.toBeInTheDocument();
  });
});
