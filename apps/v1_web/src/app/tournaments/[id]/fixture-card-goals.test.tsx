import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentFixture } from '@/types/api';
import { FixtureCard } from './tournament-detail-client';

function makeFixture(overrides: Partial<V1TournamentFixture> = {}): V1TournamentFixture {
  return {
    id: 'fixture-1',
    groupId: null,
    round: 'final',
    fixtureNumber: 1,
    legNumber: 1,
    scheduledAt: null,
    venue: null,
    status: 'completed',
    homeRegistrationId: 'reg-home',
    homeTeamId: 'team-home',
    homeTeamName: '서울 유나이티드',
    homeTeamLogoUrl: null,
    awayRegistrationId: 'reg-away',
    awayTeamId: 'team-away',
    awayTeamName: '부산 FC',
    awayTeamLogoUrl: null,
    result: null,
    videos: [],
    ...overrides,
  };
}

/**
 * 이 카드는 **대회 상세 페이지의 일정 섹션** 전용이다. 한때 점수와 득점자까지 실었지만
 * 오너가 실제 화면을 보고 걷어내라고 판단했다: "몇 대 몇인지랑 누가 넣었는지 그건 빼주고
 * 장소랑 누가 누구 하는지만". 대회 상세는 "언제·어디서·누가 붙는지"를 훑는 자리이고,
 * 결과와 득점 기록은 `/bracket` 의 경기 일정 탭과 경기 상세가 담당한다.
 *
 * 아래 테스트는 그 결정이 조용히 되돌려지는 걸 막는다 — 결과가 있어도 이 카드에는
 * 점수도 득점자도 나오면 안 된다.
 */
describe('FixtureCard — 대회 상세 카드는 점수·득점자를 싣지 않는다', () => {
  it('결과가 있어도 점수와 득점자를 렌더하지 않고 대진(vs)만 보여준다', () => {
    render(
      <FixtureCard
        fixture={makeFixture({
          result: {
            homeScore: 2,
            awayScore: 1,
            hasPenalty: false,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            note: null,
            recordedAt: '2026-07-16T00:00:00.000Z',
            goals: [
              { id: 'goal-1', team: 'home', playerId: 'player-1', playerName: '홍길동', minute: 23 },
              { id: 'goal-2', team: 'away', playerId: null, playerName: '대타 선수', minute: 67 },
            ],
          },
        })}
      />,
    );

    expect(screen.queryByText(/홍길동/)).not.toBeInTheDocument();
    expect(screen.queryByText(/대타 선수/)).not.toBeInTheDocument();
    expect(screen.queryByText(/23′/)).not.toBeInTheDocument();
    expect(screen.queryByText('2 : 1')).not.toBeInTheDocument();
    expect(screen.getByText('vs')).toBeInTheDocument();
  });

  it('renders nothing for the goal list when the result has no goals recorded', () => {
    render(
      <FixtureCard
        fixture={makeFixture({
          result: {
            homeScore: 0,
            awayScore: 0,
            hasPenalty: false,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            note: null,
            recordedAt: '2026-07-16T00:00:00.000Z',
            goals: [],
          },
        })}
      />,
    );

    expect(screen.queryByRole('list', { name: '득점자' })).not.toBeInTheDocument();
  });
});
