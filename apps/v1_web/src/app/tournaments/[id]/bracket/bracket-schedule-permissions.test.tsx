import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BracketScheduleTab } from './bracket-page-client';

const scheduleMock = vi.fn();
const myFixturesMock = vi.fn();

vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicTournamentSchedule: (...args: unknown[]) => scheduleMock(...args),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1MyTournamentFixtures: (...args: unknown[]) => myFixturesMock(...args),
  useV1Tournament: vi.fn(),
}));

describe('BracketScheduleTab — 내 팀 경기와 라인업 권한', () => {
  beforeEach(() => {
    scheduleMock.mockReturnValue({
      data: {
        pages: [{
          tournamentId: 'tour-1',
          tournamentTitle: '테스트 대회',
          bracketPublished: true,
          items: [{
            fixtureId: 'fixture-1',
            round: '조별리그',
            fixtureNumber: 1,
            legNumber: 1,
            groupId: null,
            groupName: null,
            scheduledAt: '2026-08-15T10:00:00.000Z',
            venue: '테스트 구장',
            fieldName: null,
            home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '우리 팀' },
            away: { registrationId: 'reg-away', teamId: 'team-away', teamName: '상대 팀' },
            visibilityMode: 'live',
            status: 'scheduled',
            resultState: null,
            scoreStatus: 'unavailable',
            score: null,
            clock: null,
            periodBreak: null,
            scorers: [],
            hasVideo: false,
          }],
          unscheduled: [],
          standings: [],
          nextCursor: null,
        }],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
    myFixturesMock.mockReturnValue({
      data: {
        teams: [{
          registrationId: 'reg-home',
          teamId: 'team-home',
          teamName: '우리 팀',
          fixtures: [{
            fixtureId: 'fixture-1',
            gameId: 'game-1',
            sideId: 'side-home',
            round: '조별리그',
            legNumber: 1,
            groupName: null,
            scheduledAt: '2026-08-15T10:00:00.000Z',
            status: 'scheduled',
            isHome: true,
            opponentTeamName: '상대 팀',
            lineupState: null,
          }],
        }],
      },
    });
  });

  it('bracket 일정 탭에서 내 팀 경기를 강조하되, 대회엔 라인업 상태를 붙이지 않는다', () => {
    const { container } = render(<BracketScheduleTab tournamentId="tour-1" />);

    // [P1-d] 라인업 링크 단언은 뺐다(경기별 라인업 화면 제거). **강조 계약은 남긴다** --
    // 이 탭에서 내 팀 경기가 눈에 띄어야 한다는 것은 링크와 별개의 계약이다.
    // 강조는 행 카드가 `tm-schedule-card-mine` 을 다는 것으로 확인한다 — 이 픽스처의
    // 팀 이름이 하필 '우리 팀'이라 문구로 찾으면 뱃지인지 팀 이름인지 갈리지 않는다.
    const myCard = container.querySelector('.tm-schedule-card-mine');
    expect(myCard).not.toBeNull();
    expect(screen.queryByRole('link', { name: '라인업 짜기' })).not.toBeInTheDocument();
    // 대회 축엔 라인업 제출 단계가 없다 — 여기 뱃지가 뜨면 팀장에게 할 수 없는 일을
    // 안 했다고 말하는 것이고, 끝난 경기 위에도 남았다(alpha 실측).
    expect(within(myCard as HTMLElement).queryByText('라인업 미작성')).not.toBeInTheDocument();
  });
});
