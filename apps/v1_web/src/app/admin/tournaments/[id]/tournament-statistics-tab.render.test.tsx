import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1AdminBracket, useV1AdminTournamentPlayers } from '@/hooks/use-v1-api';
import { TournamentStatisticsTab } from './tournament-statistics-tab';

vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminBracket: vi.fn(), useV1AdminTournamentPlayers: vi.fn() }));
const retry = vi.fn();
const bracket = {
  groups: [{ id: 'final', phase: 'final' }, { id: 'third', phase: 'third_place' }],
  fixtures: [
    { id: 'f1', groupId: 'final', round: '결승', homeRegistrationId: 'a', awayRegistrationId: 'b', homeTeamName: '한강 FC', awayTeamName: '성수 FC', result: { homeScore: 1, awayScore: 0, outcomeReason: 'NORMAL', goals: [{ team: 'home', playerName: '결승 선수', playerUserId: 'u1' }] } },
    { id: 'f2', groupId: 'third', round: '3위', homeRegistrationId: 'c', awayRegistrationId: 'd', homeTeamName: '마포 FC', awayTeamName: '강남 FC', result: { homeScore: 2, awayScore: 0, outcomeReason: 'NORMAL', goals: [{ team: 'home', playerName: '3위전 선수', playerUserId: 'u2' }] } },
  ],
};
const section = (title: string) => within(screen.getByRole('heading', { name: title }).closest('section')!);
function roster(state: object) {
  vi.mocked(useV1AdminTournamentPlayers).mockReturnValue(state as ReturnType<typeof useV1AdminTournamentPlayers>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useV1AdminBracket).mockReturnValue({ data: bracket, isPending: false, isError: false } as unknown as ReturnType<typeof useV1AdminBracket>);
  roster({ data: { players: [
    { goalkeeper: true, removedAt: null, realName: '김수문', nickname: '수문장' },
    { goalkeeper: true, removedAt: null, realName: '이수문', nickname: '철벽' },
    { goalkeeper: true, removedAt: '2026-10-01', realName: '제외 선수', nickname: '제외' },
    { goalkeeper: false, removedAt: null, realName: '필드 선수', nickname: '필드' },
  ] }, isPending: false, isError: false, refetch: retry });
});

describe('어드민 대회 통계 추가 기록', () => {
  it('기존 세 표를 유지하고 경기별 득점자와 최소 실점 공동 1위 팀의 GK만 추가한다', () => {
    render(<TournamentStatisticsTab tournamentId="t1" />);
    expect(section('득점자 TOP 10').getByText('결승 선수')).toBeInTheDocument();
    expect(section('득점자 TOP 10').getByText('3위전 선수')).toBeInTheDocument();
    expect(section('최다 득점 팀').getByText('마포 FC')).toBeInTheDocument();
    expect(section('결승전 득점자').getByText('결승 선수')).toBeInTheDocument();
    expect(section('결승전 득점자').queryByText('3위전 선수')).not.toBeInTheDocument();
    expect(section('3·4위전 득점자').getByText('3위전 선수')).toBeInTheDocument();
    const rows = section('최소 실점 팀').getAllByRole('row');
    for (const team of ['한강 FC', '마포 FC']) {
      const row = rows.find((row) => within(row).queryByText(team))!;
      expect(within(row).getByText('등록 GK: 김수문 (수문장), 이수문 (철벽)')).toBeInTheDocument();
    }
    const loser = rows.find((row) => within(row).queryByText('성수 FC'))!;
    expect(within(loser).queryByText(/등록 GK:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/제외 선수|필드 선수/)).not.toBeInTheDocument();
  });

  it('GK 조회 실패는 오류와 재시도를 제공하고 득점자 표는 유지한다', () => {
    roster({ isPending: false, isError: true, error: new Error('명단 조회 실패'), refetch: retry });
    render(<TournamentStatisticsTab tournamentId="t1" />);
    expect(screen.getAllByText('명단 조회 실패')).toHaveLength(2);
    expect(screen.queryByText(/등록된 GK가 없어요/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'GK 다시 시도' })[0]);
    expect(retry).toHaveBeenCalledOnce();
    expect(section('결승전 득점자').getByText('결승 선수')).toBeInTheDocument();
  });

  it('등록 GK가 없는 팀은 명확하게 표시한다', () => {
    roster({ data: { players: [] }, isPending: false, isError: false });
    render(<TournamentStatisticsTab tournamentId="t1" />);
    expect(screen.getAllByText('등록 GK: 등록된 GK가 없어요.')).toHaveLength(2);
  });
});
