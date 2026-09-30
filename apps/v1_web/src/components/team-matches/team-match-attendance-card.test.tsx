import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1TeamMatchLineup } from '@/types/api';
import { TeamMatchAttendanceCard } from './team-match-attendance-card';

const hooks = vi.hoisted(() => ({ lineup: undefined as V1TeamMatchLineup | undefined, startsAt: '2026-09-30T12:00:00.000Z' }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1TeamMatchLineup: () => ({ data: hooks.lineup }),
  useV1TeamMatch: () => ({ data: { startsAt: hooks.startsAt } }),
}));

const player = (id: string, jerseyNumber: number) => ({
  id, userId: id, displayName: id, jerseyNumber, position: null, goalkeeper: false, positionX: null, positionY: null,
});

function lineup(opponent: V1TeamMatchLineup['opponent']): V1TeamMatchLineup {
  return {
    teamMatchId: 'tm-1', gameId: 'game-1', sideId: 'side-home', role: 'team_owner', lineupId: 'l-1', revision: 2,
    state: 'SUBMITTED', version: 2, formation: null, publicLineupAt: null, ownTeamName: '마포 FC',
    starters: [player('a', 1), player('b', 2), player('c', 3)], bench: [], opponent,
  };
}

const rows = () => screen.getByText('상대 팀').closest('div')?.parentElement?.parentElement as HTMLElement;

describe('TeamMatchAttendanceCard — 우리·상대 참석명단 (H5 D-1)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // KST 오후 7:12 — 공개(킥오프 1시간 전) 오후 8:00 전.
    vi.setSystemTime(new Date('2026-09-30T10:12:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('공개 전에는 상대의 제출 여부만 보이고 명단 입구는 닫혀 있다', () => {
    hooks.lineup = lineup({ teamName: '합정 유나이티드', submitted: true, published: false, participantCount: null });
    render(<TeamMatchAttendanceCard teamMatchId="tm-1" manageHref="/team-matches/tm-1/lineup" primary />);

    expect(screen.getByText('제출 완료 · 3명')).toBeInTheDocument();
    expect(screen.getByText('오후 8:00에 상대 팀에게 공개돼요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '참석명단 관리' })).toHaveClass('tm-btn-primary');
    const opponent = within(rows());
    expect(opponent.getByText('제출 완료')).toBeInTheDocument();
    expect(opponent.getByText('명단은 오후 8:00에 공개돼요 · 지금은 제출 여부만 보여요')).toBeInTheDocument();
    expect(opponent.getByRole('button', { name: '공개 전' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: '상대 참석명단 보기' })).not.toBeInTheDocument();
  });

  it('공개 뒤에는 인원과 [보기]로 읽기 전용 화면을 연다', () => {
    vi.setSystemTime(new Date('2026-09-30T11:05:00.000Z'));
    hooks.lineup = lineup({ teamName: '합정 유나이티드', submitted: true, published: true, participantCount: 6 });
    render(<TeamMatchAttendanceCard teamMatchId="tm-1" manageHref="/team-matches/tm-1/lineup" primary={false} />);

    expect(screen.getByText('공개됨 · 6명')).toBeInTheDocument();
    expect(screen.getByText('오후 8:00에 공개됐어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '상대 참석명단 보기' })).toHaveAttribute('href', '/team-matches/tm-1/lineup/opponent');
    expect(screen.getByRole('link', { name: '참석명단 관리' })).toHaveClass('tm-btn-outline');
  });

  it('공개 시각이 지나도 상대가 안 냈으면 제출 전으로 남고 입구가 없다', () => {
    vi.setSystemTime(new Date('2026-09-30T11:05:00.000Z'));
    hooks.lineup = lineup({ teamName: '합정 유나이티드', submitted: false, published: false, participantCount: null });
    render(<TeamMatchAttendanceCard teamMatchId="tm-1" manageHref="/team-matches/tm-1/lineup" primary />);

    const opponent = within(rows());
    expect(opponent.getByText('제출 전')).toBeInTheDocument();
    expect(opponent.getByText('상대 팀이 아직 참석명단을 내지 않았어요')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '상대 참석명단 보기' })).not.toBeInTheDocument();
  });

  it('상대가 확정 전이면 상대 줄 없이 우리 팀만 보인다', () => {
    hooks.lineup = lineup({ teamName: null, submitted: false, published: false, participantCount: null });
    render(<TeamMatchAttendanceCard teamMatchId="tm-1" manageHref="/team-matches/tm-1/lineup" primary />);

    expect(screen.queryByText('상대 팀')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '참석명단 관리' })).toBeInTheDocument();
  });
});
