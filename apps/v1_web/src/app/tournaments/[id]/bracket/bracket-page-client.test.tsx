import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BracketPageContent } from './bracket-page-client';
import type { V1TournamentDetail, V1TournamentGroup } from '@/types/api';

/**
 * 조별/리그 순위표에서 팀명을 누르면 그 팀의 공개 전적(/teams/:id/records)으로
 * 이동해야 한다 — 오너 요청("순위·브래킷에서 팀을 눌렀을 때 히스토리가 안 나옴")의
 * 핵심 리그레션 지점. 이전엔 <span>plain text>였다.
 */
function makeTournament(overrides: Partial<V1TournamentDetail> & Pick<V1TournamentDetail, 'id' | 'status' | 'format'>): V1TournamentDetail {
  return {
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
    refundPolicyText: null,
    confirmedCount: 0,
    participantTeams: [],
    pendingPaymentCount: 0,
    groups: [],
    fixtures: [],
    announcements: [],
    sponsors: [],
    reviews: [],
    awards: [],
    popup: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeGroup(overrides: Partial<V1TournamentGroup> & Pick<V1TournamentGroup, 'id' | 'phase'>): V1TournamentGroup {
  return {
    name: overrides.phase,
    sortOrder: 0,
    advanceCount: null,
    groupTeams: [],
    standings: [],
    ...overrides,
  };
}

describe('BracketPageContent — 순위표 팀 링크', () => {
  it('리그 포맷: 순위표의 팀명을 누르면 /teams/:teamId/records 로 이동한다', () => {
    const tournament = makeTournament({
      id: 'tour-1',
      status: 'open',
      format: 'league',
      groups: [
        makeGroup({
          id: 'group-1',
          phase: 'league',
          standings: [
            {
              registrationId: 'reg-1',
              teamId: 'team-42',
              teamName: '성수 FC',
              teamLogoUrl: null,
              position: 1,
              points: 9,
              wins: 3,
              draws: 0,
              losses: 0,
              goalsFor: 10,
              goalsAgainst: 2,
              recalculatedAt: null,
            },
          ],
        }),
      ],
    });

    render(<BracketPageContent tournament={tournament} />);

    const link = screen.getByRole('link', { name: /성수 FC/ });
    expect(link).toHaveAttribute('href', '/teams/team-42/records');
  });

  it('조별리그 포맷: 조별 순위표의 팀명을 누르면 /teams/:teamId/records 로 이동한다', () => {
    const tournament = makeTournament({
      id: 'tour-2',
      status: 'open',
      format: 'group_knockout',
      groups: [
        makeGroup({
          id: 'group-a',
          phase: 'group',
          name: 'A조',
          advanceCount: 2,
          standings: [
            {
              registrationId: 'reg-2',
              teamId: 'team-99',
              teamName: '한강 유나이티드',
              teamLogoUrl: null,
              position: 1,
              points: 6,
              wins: 2,
              draws: 0,
              losses: 0,
              goalsFor: 5,
              goalsAgainst: 1,
              recalculatedAt: null,
            },
          ],
        }),
      ],
    });

    render(<BracketPageContent tournament={tournament} />);

    const link = screen.getByRole('link', { name: /한강 유나이티드/ });
    expect(link).toHaveAttribute('href', '/teams/team-99/records');
  });
});
