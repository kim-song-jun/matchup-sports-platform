import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TournamentRosterDeadlineCard } from './tournament-roster-client';

describe('TournamentRosterDeadlineCard', () => {
  it('shows a closed registration deadline while keeping an unlocked roster editable', () => {
    render(
      <TournamentRosterDeadlineCard
        deadlineAt={'2026-07-20T18:30:00'}
        isRosterLocked={false}
        isRosterEditBlockedByStatus={false}
        isRosterDeadlineBlocked={false}
        nowMs={new Date('2026-07-20T19:00:00').getTime()}
      />,
    );

    expect(screen.getByText('2026년 7월 20일 (월) 오후 6:30')).toBeInTheDocument();
    expect(screen.getByText('신청 마감')).toBeInTheDocument();
    expect(screen.getByText('수정 가능')).toBeInTheDocument();
    expect(screen.getByText(/대회 신청 마감과 별개로/)).toBeInTheDocument();
  });

  it('shows an upcoming registration deadline and an independently locked roster', () => {
    render(
      <TournamentRosterDeadlineCard
        deadlineAt={'2026-07-20T18:30:00'}
        isRosterLocked
        isRosterEditBlockedByStatus={false}
        isRosterDeadlineBlocked={false}
        nowMs={new Date('2026-07-20T17:00:00').getTime()}
      />,
    );

    expect(screen.getByText('신청 접수 중')).toBeInTheDocument();
    expect(screen.getByText('명단 마감')).toBeInTheDocument();
    expect(screen.getByText('선수 명단이 운영진에 의해 마감됐어요.')).toBeInTheDocument();
  });

  it('shows the separate roster submission deadline when it blocks editing', () => {
    render(
      <TournamentRosterDeadlineCard
        deadlineAt={'2026-07-20T18:30:00'}
        isRosterLocked={false}
        isRosterEditBlockedByStatus={false}
        isRosterDeadlineBlocked
        nowMs={new Date('2026-07-20T17:00:00').getTime()}
      />,
    );

    expect(screen.getByText('제출 마감')).toBeInTheDocument();
    expect(screen.getByText('선수 명단 제출 기간이 종료됐어요.')).toBeInTheDocument();
  });
});
