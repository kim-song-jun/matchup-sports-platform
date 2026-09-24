import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TournamentParticipantSection } from './tournament-event-hub-sections';
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
