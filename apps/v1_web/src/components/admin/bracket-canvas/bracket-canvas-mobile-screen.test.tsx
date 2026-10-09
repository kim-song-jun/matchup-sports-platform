import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBracket, makeFixture, makeGroup, makeRegistration, makeSlot, makeStanding } from '@/test/bracket-canvas-fixtures';
import type { RegistrationsLoadState } from './bracket-team-tray';
import { BracketCanvasMobileScreen } from './bracket-canvas-mobile-screen';

const { bracketState, refetch } = vi.hoisted(() => ({
  bracketState: { value: {} as Record<string, unknown> },
  refetch: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminBracket: () => bracketState.value }));
vi.mock('./bracket-canvas-mobile', () => ({
  BracketCanvasMobile: (props: { competitionId: string; scope: string; canWrite: boolean; rounds: Array<{ label: string }>; candidates: unknown[]; slots: unknown[]; registrationsState: RegistrationsLoadState }) => (
    <div
      data-testid="mobile-canvas"
      data-competition-id={props.competitionId}
      data-scope={props.scope}
      data-can-write={String(props.canWrite)}
      data-rounds={props.rounds.map((round) => round.label).join(',')}
      data-candidates={props.candidates.length}
      data-slots={props.slots.length}
      data-registrations-status={props.registrationsState.status}
    />
  ),
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

function renderScreen(canWrite = true, format?: 'league' | 'knockout') {
  return render(
    <BracketCanvasMobileScreen tournamentId="t-1" registrations={registrations} registrationsState={registrationsState} canWrite={canWrite} format={format} showToast={vi.fn()} />,
  );
}

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

  it('토너먼트는 순위 접이식 없이 지금 탭 그대로다', () => {
    renderScreen(true, 'knockout');
    expect(screen.queryByText('조별 순위')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-canvas')).toHaveAttribute('data-rounds', '8강');
  });
});
