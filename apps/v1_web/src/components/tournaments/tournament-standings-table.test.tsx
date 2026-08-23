import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TournamentStandingsTable, type TournamentStandingsRow } from './tournament-standings-table';
import { renderBracketStandingsTab } from '@/app/tournaments/[id]/bracket/bracket-test-utils';
import { ScheduleContent } from '@/components/public-game-records/schedule-content';
import type { V1TournamentDetail, V1TournamentGroup } from '@/types/api';
import type { PublicTournamentScheduleResponse } from '@/components/public-game-records/types';

const ROW: TournamentStandingsRow = {
  key: 'reg-1',
  teamId: 'team-1',
  teamName: '성수 FC',
  teamLogoUrl: null,
  position: 1,
  points: 9,
  wins: 3,
  draws: 0,
  losses: 1,
  goalsFor: 10,
  goalsAgainst: 4,
};

describe('TournamentStandingsTable', () => {
  /* #374 — 경기 기록이 0건이어도 조 편성 팀은 보여야 한다. 전 지표가 0인 기준선 행을
     받았을 때 순위표는 팀을 모두 렌더하되, 성적이 아닌 편성 순서에 메달·진출 강조를
     붙이면 안 된다(1위처럼 보이는 오해를 만든다). */
  it('전 지표가 0이면 팀은 모두 보여주되 순위 강조는 하지 않는다', () => {
    const zeroRows: TournamentStandingsRow[] = [
      { ...ROW, key: 'r1', teamId: 't1', teamName: '한강 유나이티드', position: 1,
        points: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 },
      { ...ROW, key: 'r2', teamId: 't2', teamName: '마포 FC', position: 2,
        points: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 },
    ];

    render(<TournamentStandingsTable rows={zeroRows} advance={2} ariaLabel="테스트 순위표" />);

    // 편성된 팀이 빠짐없이 나온다
    expect(screen.getByText('한강 유나이티드')).toBeInTheDocument();
    expect(screen.getByText('마포 FC')).toBeInTheDocument();
    // 아직 성적이 아니라는 것을 문구로 알린다
    expect(screen.getByText(/아직 경기 기록이 없어요/)).toBeInTheDocument();
  });

  it('#/팀/전적/승점/득실 5개 컬럼을 렌더한다', () => {
    render(<TournamentStandingsTable rows={[ROW]} advance={null} ariaLabel="테스트 순위표" />);
    const table = screen.getByRole('table', { name: '테스트 순위표' });
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['#', '팀', '전적', '승점', '득실']);
  });

  it('승점은 "N점", 득실은 부호 있는 숫자로 보여준다', () => {
    render(<TournamentStandingsTable rows={[ROW]} advance={null} ariaLabel="테스트 순위표" />);
    expect(screen.getByText('9점')).toBeInTheDocument();
    expect(screen.getByText('+6')).toBeInTheDocument();
  });

  it('팀명을 누르면 /teams/:teamId/records 로 이동한다', () => {
    render(<TournamentStandingsTable rows={[ROW]} advance={null} ariaLabel="테스트 순위표" />);
    expect(screen.getByRole('link', { name: /성수 FC/ })).toHaveAttribute('href', '/teams/team-1/records');
  });

  it('advance가 null이 아니고 순위<=advance면 하이라이트 행을 렌더한다', () => {
    const { container } = render(
      <TournamentStandingsTable rows={[ROW]} advance={2} ariaLabel="테스트 순위표" />,
    );
    expect(container.querySelector('.tm-standings-row-highlight')).not.toBeNull();
  });

  it('advance가 null이면 순위가 낮아도 하이라이트하지 않는다', () => {
    const { container } = render(
      <TournamentStandingsTable rows={[ROW]} advance={null} ariaLabel="테스트 순위표" />,
    );
    expect(container.querySelector('.tm-standings-row-highlight')).toBeNull();
  });

  it('행이 없으면 빈 안내 문구를 보여준다', () => {
    render(<TournamentStandingsTable rows={[]} advance={null} ariaLabel="테스트 순위표" />);
    expect(screen.getByText('순위 집계 전이에요')).toBeInTheDocument();
  });
});

/**
 * §순위표 지표 통일 핵심 계약 — 같은 대회의 순위·대진표 탭(BracketPageContent)과
 * 경기 일정 탭(ScheduleContent)이 같은 순위 데이터를 서로 다른 컬럼으로 그리던
 * 문제를 고쳤다는 걸 "두 소비처가 같은 컬럼 집합을 렌더한다"로 직접 검증한다.
 */
describe('순위표 컬럼 통일 — 두 소비처(bracket 탭 vs schedule 탭)가 같은 컬럼을 렌더한다', () => {
  function makeTournament(): V1TournamentDetail {
    const group: V1TournamentGroup = {
      id: 'group-a',
      name: 'A조',
      phase: 'group',
      sortOrder: 0,
      advanceCount: 2,
      groupTeams: [],
      standings: [
        {
          registrationId: 'reg-1',
          teamId: 'team-1',
          teamName: '성수 FC',
          teamLogoUrl: null,
          position: 1,
          points: 9,
          wins: 3,
          draws: 0,
          losses: 0,
          goalsFor: 10,
          goalsAgainst: 4,
          recalculatedAt: null,
        },
      ],
    };
    return {
      id: 'tour-1',
      status: 'in_progress',
      format: 'group_knockout',
      sportId: 'sport-futsal',
      sport: { code: 'futsal', name: '풋살' },
      title: '테스트 대회',
      registrationDeadlineAt: null,
      rosterDeadlineAt: null,
      bracketPublishedAt: '2026-01-01T00:00:00.000Z',
      bracketPublishScheduledAt: null,
      scheduledAt: null,
      scheduledEndAt: null,
      venue: null,
      latitude: null,
      longitude: null,
      coverImageUrl: null,
      teamCount: 8,
      minPlayers: 5,
      maxPlayers: 10,
      genderCategory: null,
      genderMinMale: null,
      genderMaxMale: null,
      genderMinFemale: null,
      genderMaxFemale: null,
      entryFee: 0,
      prizePool: null,
      prizeSummary: null,
      prizeBreakdown: null,
      promoHomeEnabled: false,
      promoHomeTitle: null,
      promoHomeSubtitle: null,
      promoHomeImageUrl: null,
      promoHomeBadgeText: null,
      promoHomeDateText: null,
      promoHomeTeamsText: null,
      promoHomeLocationText: null,
      promoHomePrizeText: null,
      promoHomePriority: 0,
      promoListEnabled: false,
      promoListTitle: null,
      promoListSubtitle: null,
      promoListImageUrl: null,
      promoListBadgeText: null,
      promoListDateText: null,
      promoListTeamsText: null,
      promoListLocationText: null,
      promoListPrizeText: null,
      promoListPriority: 0,
      campaignSlug: null,
      rulesText: null,
      yellowAccumulationLimit: null,
      redCardSuspensionMatches: null,
      refundPolicyText: null,
      confirmedCount: 0,
      participantTeams: [],
      pendingPaymentCount: 0,
      groups: [group],
      fixtures: [
        { id: 'fx-1', groupId: 'group-a', round: 'group', fixtureNumber: 1, legNumber: 1, scheduledAt: null, venue: null, homeRegistrationId: null, homeTeamId: 'team-1', homeTeamName: '성수 FC', homeTeamLogoUrl: null, awayRegistrationId: null, awayTeamId: 'team-2', awayTeamName: '한강 유나이티드', awayTeamLogoUrl: null, status: 'completed', liveStatus: 'ended', result: null, videos: [] },
      ],
      announcements: [],
      sponsors: [],
      reviews: [],
      awards: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  function makeScheduleData(): PublicTournamentScheduleResponse {
    return {
      tournamentId: 'tour-1',
      tournamentTitle: '테스트 대회',
      bracketPublished: true,
      items: [],
      unscheduled: [],
      standings: [
        {
          groupId: 'group-a',
          groupName: 'A조',
          registrationId: 'reg-1',
          teamId: 'team-1',
          teamName: '성수 FC',
          teamLogoUrl: null,
          position: 1,
          points: 9,
          wins: 3,
          draws: 0,
          losses: 0,
          goalsFor: 10,
          goalsAgainst: 4,
        },
      ],
      nextCursor: null,
    };
  }

  it('두 컴포넌트가 렌더하는 순위표 헤더가 완전히 같다', () => {
    const { container: bracketContainer } = renderBracketStandingsTab(makeTournament());
    const { container: scheduleContainer } = render(
      <ScheduleContent tournamentId="tour-1" data={makeScheduleData()} />,
    );

    const bracketHeaders = Array.from(bracketContainer.querySelectorAll('.tm-standings-table th')).map(
      (h) => h.textContent,
    );
    const scheduleHeaders = Array.from(scheduleContainer.querySelectorAll('.tm-standings-table th')).map(
      (h) => h.textContent,
    );

    expect(bracketHeaders).toEqual(['#', '팀', '전적', '승점', '득실']);
    expect(scheduleHeaders).toEqual(['#', '팀', '전적', '승점', '득실']);
    expect(bracketHeaders).toEqual(scheduleHeaders);
  });
});
