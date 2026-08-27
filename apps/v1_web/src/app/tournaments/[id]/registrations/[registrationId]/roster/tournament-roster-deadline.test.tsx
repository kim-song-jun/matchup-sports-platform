import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TournamentRosterDeadlineCard } from './tournament-roster-client';

// 픽스처의 시각에 오프셋(+09:00)을 명시한다. 타임존 없는 '2026-07-20T18:30:00' 은
// `new Date()` 가 **실행 머신의 로컬 시간**으로 해석하므로, 같은 문자열이 KST 개발
// 머신에서는 18:30 KST 로, UTC CI 러너에서는 18:30 UTC(= KST 익일 03:30)로 달라진다.
// 화면은 대회 시각을 항상 KST 로 고정해 렌더하므로(date-utils.ts getTournamentKstParts),
// 입력이 모호하면 기대 문자열이 러너 타임존에 따라 흔들린다 — 실제로 로컬은 통과하고
// CI(UTC)만 깨졌다. 오프셋을 박아 어느 타임존에서 돌려도 같은 순간을 가리키게 한다.

describe('TournamentRosterDeadlineCard', () => {
  it('shows a closed registration deadline while keeping an unlocked roster editable', () => {
    render(
      <TournamentRosterDeadlineCard
        deadlineAt={'2026-07-20T18:30:00+09:00'}
        isRosterLocked={false}
        isRosterEditBlockedByStatus={false}
        isRosterDeadlineBlocked={false}
        nowMs={new Date('2026-07-20T19:00:00+09:00').getTime()}
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
        deadlineAt={'2026-07-20T18:30:00+09:00'}
        isRosterLocked
        isRosterEditBlockedByStatus={false}
        isRosterDeadlineBlocked={false}
        nowMs={new Date('2026-07-20T17:00:00+09:00').getTime()}
      />,
    );

    expect(screen.getByText('신청 접수 중')).toBeInTheDocument();
    expect(screen.getByText('명단 마감')).toBeInTheDocument();
    expect(screen.getByText('선수 명단이 운영진에 의해 마감됐어요.')).toBeInTheDocument();
  });

  it('shows the separate roster submission deadline when it blocks editing', () => {
    render(
      <TournamentRosterDeadlineCard
        deadlineAt={'2026-07-20T18:30:00+09:00'}
        isRosterLocked={false}
        isRosterEditBlockedByStatus={false}
        isRosterDeadlineBlocked
        nowMs={new Date('2026-07-20T17:00:00+09:00').getTime()}
      />,
    );

    expect(screen.getByText('제출 마감')).toBeInTheDocument();
    expect(screen.getByText('선수 명단 제출 기간이 종료됐어요.')).toBeInTheDocument();
  });

  // 감사 finding #1: 대회가 종료·취소되면 잠금·마감 예외와 무관하게 아무도 명단을 못 고친다
  // (서버 assertRosterMutable의 첫 번째 검사). 이 값이 최우선으로 반영돼야 한다.
  it('shows the tournament-closed state even when the deadline exception would otherwise allow editing', () => {
    render(
      <TournamentRosterDeadlineCard
        deadlineAt={'2026-07-20T18:30:00+09:00'}
        isTournamentRosterClosed
        isRosterLocked={false}
        isRosterEditBlockedByStatus={false}
        isRosterDeadlineBlocked={false}
        nowMs={new Date('2026-07-20T19:00:00+09:00').getTime()}
      />,
    );

    expect(screen.getByText('수정 불가')).toBeInTheDocument();
    expect(
      screen.getByText('대회가 종료되었거나 취소돼 더 이상 선수 명단을 수정할 수 없어요.'),
    ).toBeInTheDocument();
  });
});
