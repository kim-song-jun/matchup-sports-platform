import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamAssignmentDisplay } from '../team-assignment-display';
import type { Team, MatchParticipant } from '@/types/api';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const teamA: Team = { id: 'team-a', matchId: 'm1', name: 'A팀', color: '#2563EB' };
const teamB: Team = { id: 'team-b', matchId: 'm1', name: 'B팀', color: '#4F46E5' };

function makeParticipant(overrides: Partial<MatchParticipant>): MatchParticipant {
  return {
    id: 'p1',
    matchId: 'm1',
    userId: 'u1',
    teamId: null,
    status: 'confirmed',
    paymentStatus: 'completed',
    user: { id: 'u1', nickname: '김철수', profileImageUrl: null },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TeamAssignmentDisplay', () => {
  it('returns_null_when_teams_empty — renders nothing with empty teams', () => {
    const { container } = render(
      <TeamAssignmentDisplay teams={[]} participants={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders_team_names — shows each team name header', () => {
    render(
      <TeamAssignmentDisplay
        teams={[teamA, teamB]}
        participants={[]}
      />,
    );
    expect(screen.getByText('A팀')).toBeInTheDocument();
    expect(screen.getByText('B팀')).toBeInTheDocument();
  });

  it('derives_members_from_participants_by_teamId — nicknames appear under correct team', () => {
    const p1 = makeParticipant({ id: 'p1', userId: 'u1', teamId: 'team-a', user: { id: 'u1', nickname: '김철수', profileImageUrl: null } });
    const p2 = makeParticipant({ id: 'p2', userId: 'u2', teamId: 'team-b', user: { id: 'u2', nickname: '이영희', profileImageUrl: null } });
    const p3 = makeParticipant({ id: 'p3', userId: 'u3', teamId: null, user: { id: 'u3', nickname: '박민수', profileImageUrl: null } });

    render(
      <TeamAssignmentDisplay
        teams={[teamA, teamB]}
        participants={[p1, p2, p3]}
      />,
    );

    expect(screen.getByText('김철수')).toBeInTheDocument();
    expect(screen.getByText('이영희')).toBeInTheDocument();
    // p3 has no team assignment — not rendered inside team cards
    expect(screen.queryByText('박민수')).not.toBeInTheDocument();
  });

  it('shows_empty_member_message_when_no_participants_in_team', () => {
    render(
      <TeamAssignmentDisplay
        teams={[teamA]}
        participants={[]}
      />,
    );
    expect(screen.getByText('배정된 참가자 없음')).toBeInTheDocument();
  });

  it('section_heading_visible — "팀 구성" heading renders', () => {
    render(
      <TeamAssignmentDisplay
        teams={[teamA]}
        participants={[]}
      />,
    );
    expect(screen.getByText('팀 구성')).toBeInTheDocument();
  });

  it('three_or_more_teams_all_render', () => {
    const teamC: Team = { id: 'team-c', matchId: 'm1', name: 'C팀', color: '#0369A1' };
    render(
      <TeamAssignmentDisplay
        teams={[teamA, teamB, teamC]}
        participants={[]}
      />,
    );
    expect(screen.getByText('A팀')).toBeInTheDocument();
    expect(screen.getByText('B팀')).toBeInTheDocument();
    expect(screen.getByText('C팀')).toBeInTheDocument();
  });
});
