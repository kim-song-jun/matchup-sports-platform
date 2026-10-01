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
        tournamentStatus="completed"
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

  // Task 170 R: 아직 공개되지 않은 대회를 "종료·취소"로 안내하면 팀장이 원인을 잘못 읽는다.
  it('says the competition is not public yet instead of blaming an ended tournament', () => {
    render(
      <TournamentRosterDeadlineCard
        deadlineAt={null}
        isTournamentRosterClosed
        tournamentStatus="draft"
        isRosterLocked={false}
        isRosterEditBlockedByStatus={false}
        isRosterDeadlineBlocked={false}
      />,
    );

    expect(screen.getByText('수정 불가')).toBeInTheDocument();
    expect(screen.getByText('대회가 아직 공개되지 않아 선수 명단을 수정할 수 없어요.')).toBeInTheDocument();
  });

  // #1451: 마감 전이어도 대회가 끝났거나 취소됐으면 "신청 접수 중" 이 아니라 대회 상태를 보여 줘야 한다.
  describe('마감 전 대회의 상태 배지', () => {
    const renderCard = (tournamentStatus: string) =>
      render(
        <TournamentRosterDeadlineCard
          deadlineAt={'2026-07-20T18:30:00+09:00'}
          isTournamentRosterClosed={tournamentStatus !== 'open' && tournamentStatus !== 'in_progress'}
          tournamentStatus={tournamentStatus}
          isRosterLocked={false}
          isRosterEditBlockedByStatus={false}
          isRosterDeadlineBlocked={false}
          nowMs={new Date('2026-07-20T17:00:00+09:00').getTime()}
        />,
      );

    it.each([
      ['completed', '종료'],
      ['cancelled', '취소'],
      ['in_progress', '진행 중'],
    ])('%s 대회는 신청 접수 중 대신 "%s" 를 보여 준다', (status, label) => {
      renderCard(status);
      expect(screen.queryByText('신청 접수 중')).not.toBeInTheDocument();
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    it('대조군: 모집 중(open) 대회는 마감 전이면 기존대로 "신청 접수 중" 이다', () => {
      renderCard('open');
      expect(screen.getByText('신청 접수 중')).toBeInTheDocument();
    });
  });

  // F98: 정규 리그에는 신청 마감이 없다. 예전엔 그 자리가 항상 "일정 미정 · 일정 미정" 이었다.
  describe('정규 리그(season)', () => {
    const season = (status: 'in_progress' | 'completed' | 'cancelled') => ({
      // KST 2026-09-30 00:00 ~ 2026-11-30 23:59 — 서버가 내려주는 시즌 기간 그대로다.
      startAt: '2026-09-29T15:00:00.000Z',
      endAt: '2026-11-30T14:59:59.999Z',
      status,
    });

    it('진행 중 리그는 신청 마감 대신 리그 기간과 "진행 중" 을 보여 주고 종료 문구를 내지 않는다', () => {
      render(
        <TournamentRosterDeadlineCard
          deadlineAt={null}
          season={season('in_progress')}
          tournamentStatus="in_progress"
          isRosterLocked={false}
          isRosterEditBlockedByStatus={false}
          isRosterDeadlineBlocked={false}
        />,
      );

      expect(screen.getByText('리그 기간')).toBeInTheDocument();
      expect(screen.getByText('2026년 9월 30일 (수) ~ 2026년 11월 30일 (월)')).toBeInTheDocument();
      expect(screen.getByText('진행 중')).toBeInTheDocument();
      expect(screen.queryByText('대회 신청 마감')).not.toBeInTheDocument();
      expect(screen.queryByText('일정 미정')).not.toBeInTheDocument();
      expect(screen.getByText('수정 가능')).toBeInTheDocument();
      // 리그에는 "대회 신청 마감" 이 없으니 그와 "별개" 라는 안내도 말이 안 된다.
      expect(screen.getByText('운영진이 명단을 잠그기 전까지 수정할 수 있어요.')).toBeInTheDocument();
      expect(screen.queryByText(/종료/)).not.toBeInTheDocument();
    });

    it('시즌이 끝난 뒤 종료된 리그는 리그 말투로 종료를 알린다', () => {
      render(
        <TournamentRosterDeadlineCard
          deadlineAt={null}
          season={season('completed')}
          isTournamentRosterClosed
          tournamentStatus="completed"
          isRosterLocked={false}
          isRosterEditBlockedByStatus={false}
          isRosterDeadlineBlocked={false}
          nowMs={new Date('2026-12-15T00:00:00+09:00').getTime()}
        />,
      );

      expect(screen.getByText('리그 기간')).toBeInTheDocument();
      expect(screen.getByText('종료')).toBeInTheDocument();
      expect(
        screen.getByText('리그가 종료되었거나 취소돼 더 이상 선수 명단을 수정할 수 없어요.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/대회가/)).not.toBeInTheDocument();
    });

    it('시즌이 남았는데 종료된 리그는 종료 처리된 이유를 말한다', () => {
      render(
        <TournamentRosterDeadlineCard
          deadlineAt={null}
          season={season('completed')}
          isTournamentRosterClosed
          tournamentStatus="completed"
          isRosterLocked={false}
          isRosterEditBlockedByStatus={false}
          isRosterDeadlineBlocked={false}
          nowMs={new Date('2026-10-15T00:00:00+09:00').getTime()}
        />,
      );

      expect(screen.getByText('종료')).toBeInTheDocument();
      expect(
        screen.getByText('모든 경기 결과가 확정돼 리그가 종료 처리됐어요. 더 이상 선수 명단을 수정할 수 없어요.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/종료되었거나 취소돼/)).not.toBeInTheDocument();
    });

    it('대조군: season 을 안 넘기는 대회는 기존 신청 마감 표시 그대로다', () => {
      render(
        <TournamentRosterDeadlineCard
          deadlineAt={'2026-07-20T18:30:00+09:00'}
          isRosterLocked={false}
          isRosterEditBlockedByStatus={false}
          isRosterDeadlineBlocked={false}
          nowMs={new Date('2026-07-20T17:00:00+09:00').getTime()}
        />,
      );

      expect(screen.getByText('대회 신청 마감')).toBeInTheDocument();
      expect(screen.queryByText('리그 기간')).not.toBeInTheDocument();
      expect(screen.getByText('신청 접수 중')).toBeInTheDocument();
    });
  });
});
