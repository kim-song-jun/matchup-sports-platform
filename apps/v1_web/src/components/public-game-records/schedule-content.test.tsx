import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScheduleContent } from './schedule-content';
import type { PublicTournamentScheduleResponse } from './types';

/**
 * 대회 일정 화면의 조별 순위표에서 팀명을 누르면 그 팀의 공개 전적
 * (/teams/:id/records)으로 이동해야 한다 — 오너 요청의 핵심 리그레션 지점.
 * 이전엔 <span> plain text였다.
 */
function makeData(overrides: Partial<PublicTournamentScheduleResponse> = {}): PublicTournamentScheduleResponse {
  return {
    tournamentId: 'tour-1',
    tournamentTitle: '테스트 대회',
    bracketPublished: true,
    items: [],
    unscheduled: [],
    standings: [],
    nextCursor: null,
    ...overrides,
  };
}

describe('ScheduleContent — 순위표 팀 링크', () => {
  it('순위표의 팀명을 누르면 /teams/:teamId/records 로 이동한다', () => {
    const data = makeData({
      standings: [
        {
          groupId: 'group-a',
          groupName: 'A조',
          teamId: 'team-77',
          teamName: '망원 FC',
          teamLogoUrl: '/uploads/team-77-logo.png',
          position: 1,
          points: 6,
          wins: 2,
          draws: 0,
          losses: 0,
          goalsFor: 5,
          goalsAgainst: 1,
        },
      ],
    });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    const link = screen.getByRole('link', { name: /망원 FC/ });
    expect(link).toHaveAttribute('href', '/teams/team-77/records');
  });

  /**
   * 회귀 방지: toStandingsRows 어댑터가 teamLogoUrl을 누락하면 실제 로고가
   * 있는 팀도 항상 identicon(<img> 없음)으로만 렌더된다 — 순위·대진표 탭
   * (bracket-page-client.tsx)과 시각적으로 어긋나는 버그였다.
   */
  it('팀에 등록된 로고가 있으면 순위표 아바타가 identicon 대신 실제 로고 이미지를 렌더한다', () => {
    const data = makeData({
      standings: [
        {
          groupId: 'group-a',
          groupName: 'A조',
          teamId: 'team-77',
          teamName: '망원 FC',
          teamLogoUrl: '/uploads/team-77-logo.png',
          position: 1,
          points: 6,
          wins: 2,
          draws: 0,
          losses: 0,
          goalsFor: 5,
          goalsAgainst: 1,
        },
      ],
    });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    const logoImg = screen.getByRole('link', { name: /망원 FC/ }).closest('tr')?.querySelector('img');
    expect(logoImg).not.toBeNull();
    expect(logoImg).toHaveAttribute('src', expect.stringContaining('team-77-logo.png'));
  });

  it('경기 일정이 없으면 안내 문구가 뜨고 오류처럼 보이지 않는다', () => {
    render(<ScheduleContent tournamentId="tour-1" data={makeData()} />);

    expect(screen.getByText('아직 확정된 일정이 없어요')).toBeInTheDocument();
  });
});
