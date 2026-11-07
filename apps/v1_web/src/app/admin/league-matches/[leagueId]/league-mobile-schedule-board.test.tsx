import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { buildLeagueBoard } from '@/lib/league-board-model';
import type { V1LeagueFixture } from '@/types/league-match';
import { LeagueMobileScheduleBoard } from './league-mobile-schedule-board';

// 캔버스 본체는 자체 테스트가 지킨다 — 여기서는 고른 라운드의 머리(주차 날짜·요약·추가 버튼)만 본다.
vi.mock('@/components/admin/bracket-canvas/bracket-canvas-mobile', () => ({
  BracketCanvasMobile: ({ rounds, renderRoundHeader }: { rounds: Array<{ key: string }>; renderRoundHeader?: (key: string) => ReactNode }) => (
    <div>{renderRoundHeader?.(rounds[0].key)}</div>
  ),
}));

const fixture = (teamMatchId: string, homeTeamId: string, awayTeamId: string, startAt: string): V1LeagueFixture => ({
  teamMatchId, title: '가을 리그 1주차', homeTeamId, awayTeamId, startAt, placeName: '구장', status: 'matched',
});

const NAMES = new Map([['t1', '독수리FC'], ['t2', '호랑이FC'], ['t3', '사자FC']]);
const { columns } = buildLeagueBoard({
  fixtures: [fixture('m1', 't1', 't2', '2030-01-12T01:00:00.000Z')],
  slots: [],
  teamNameById: NAMES,
});

function renderBoard(onAddToWeek?: () => void) {
  render(
    <LeagueMobileScheduleBoard
      leagueId="league-1"
      replaceExisting
      templateBlockedReason={null}
      canEditFixture
      onOpenTemplate={vi.fn()}
      onEditFixture={vi.fn()}
      weeks={columns}
      teamsKnown
      onAddToWeek={onAddToWeek}
      rounds={[{ key: columns[0].key, label: '1주차', sections: [] }]}
      slots={[]}
      candidates={[]}
      canWrite
      registrationsState={{ status: 'success', truncated: false, refetchFailed: false, error: null, onRetry: vi.fn() }}
      showToast={vi.fn()}
    />,
  );
}

describe('LeagueMobileScheduleBoard 주차 머리 (2026-11-03)', () => {
  it('고른 주차의 날짜 범위·요약을 보이고 추가 버튼은 그 주를 넘긴다', () => {
    const onAddToWeek = vi.fn();
    renderBoard(onAddToWeek);
    expect(screen.getByText('1주차 · 1/12 (토)')).toBeInTheDocument();
    expect(screen.getByText('1경기 · 쉬는 팀 사자FC')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1주차에 경기 추가' }));
    expect(onAddToWeek).toHaveBeenCalledWith(columns[0]);
  });

  it('추가 콜백이 없으면 버튼을 그리지 않는다', () => {
    renderBoard();
    expect(screen.queryByRole('button', { name: '1주차에 경기 추가' })).toBeNull();
  });
});
