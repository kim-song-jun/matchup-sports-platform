import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TournamentApplicationGuideSection, TournamentParticipantSection } from './tournament-event-hub-sections';
import type { V1TournamentParticipantTeam } from '@/types/api';

const TEAM: V1TournamentParticipantTeam = {
  registrationId: 'reg-1',
  teamId: 'team-1',
  teamName: '성수 FC',
  teamLogoUrl: null,
  teamRegionName: null,
  status: 'confirmed',
  confirmedAt: '2026-01-01T00:00:00.000Z',
  players: [],
};

describe('TournamentParticipantSection — 참가팀 → 팀 상세 링크', () => {
  it('fromHref가 없으면 기존처럼 쿼리 없는 링크를 유지한다', () => {
    render(
      <TournamentParticipantSection
        teams={[TEAM]}
        teamCount={8}
        status="closed"
        confirmedCount={1}
      />,
    );
    expect(screen.getByRole('link', { name: /성수 FC/ })).toHaveAttribute('href', '/teams/team-1');
  });

  it('fromHref가 있으면 팀 링크에 ?from=이 붙어 대회 상세로 되돌아온다', () => {
    render(
      <TournamentParticipantSection
        teams={[TEAM]}
        teamCount={8}
        status="closed"
        confirmedCount={1}
        fromHref="/tournaments/tour-1"
      />,
    );
    expect(screen.getByRole('link', { name: /성수 FC/ })).toHaveAttribute(
      'href',
      `/teams/team-1?from=${encodeURIComponent('/tournaments/tour-1')}`,
    );
  });
});

describe('TournamentApplicationGuideSection — 참가비 유무에 따른 안내 (#1428)', () => {
  it('무료 대회에는 입금·2시간 자동 취소 안내가 없고 입금 절차가 없다고 말한다', () => {
    const { container } = render(<TournamentApplicationGuideSection isFreeEntry />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('입금 확인');
    expect(text).not.toContain('2시간');
    expect(text).toContain('입금 절차는 없어요');
  });

  it('대조군: 유료 대회는 기존대로 2시간 내 입금 확인 안내를 보여 준다', () => {
    render(<TournamentApplicationGuideSection isFreeEntry={false} />);
    expect(screen.getByText('2시간 내 입금 확인')).toBeInTheDocument();
  });
});
