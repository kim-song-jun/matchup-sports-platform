import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MatchDetailContent } from './match-detail-content';
import type { PublicMatchDetail } from './types';

/**
 * alpha "452′" 실측 사고(2026-08) 회귀 방지 — 경기 상세 타임라인
 * (`EventRow`, mm:ss `formatClock`)도 스케줄 카드와 동일한 이상 클럭
 * 경고 표식을 붙여야 한다. DB 실측값 그대로 재현한다.
 */
function makeDetail(overrides: Partial<PublicMatchDetail> = {}): PublicMatchDetail {
  return {
    tournamentId: 'tour-1',
    tournamentTitle: '테스트 대회',
    fixtureId: 'fixture-1',
    gameId: 'game-1',
    round: '조별리그',
    fixtureNumber: 1,
    legNumber: 1,
    groupId: null,
    groupName: null,
    scheduledAt: '2026-08-01T10:00:00.000Z',
    venue: null,
    fieldName: null,
    home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '홈팀' },
    away: { registrationId: 'reg-away', teamId: 'team-away', teamName: '원정팀' },
    visibilityMode: 'live',
    status: 'ended',
    resultState: 'official',
    scoreStatus: 'official',
    score: { home: 1, away: 0, penalties: null },
    clock: null,
    lineup: null,
    events: [],
    mvp: null,
    pendingProjection: false,
    history: [],
    videos: [],
    nextMatch: null,
    ...overrides,
  };
}

describe('MatchDetailContent — 이상 클럭 경고 표식(alpha 452′ 사고)', () => {
  it('이벤트의 clockMs가 이상값이면 mm:ss 표시는 그대로 두고 경고 표식을 붙인다', () => {
    const data = makeDetail({
      events: [
        {
          type: 'GOAL',
          sideId: 'side-home',
          side: 'home',
          participantId: 'p-1',
          participantName: '김선수',
          jerseyNumber: 9,
          period: 1,
          clockMs: 27_166_083,
        },
      ],
    });

    render(<MatchDetailContent data={data} />);

    // 숫자 자체(452:46)는 조작·은폐되지 않고 그대로 보인다.
    expect(screen.getByText('452:46')).toBeInTheDocument();
    expect(screen.getByLabelText('비정상적으로 긴 경기 시각이에요. 확인이 필요해요.')).toBeInTheDocument();
  });

  it('정상 clockMs 이벤트에는 경고 표식이 붙지 않는다', () => {
    const data = makeDetail({
      events: [
        {
          type: 'CARD',
          sideId: 'side-home',
          side: 'home',
          participantId: 'p-1',
          participantName: '김선수',
          jerseyNumber: 9,
          period: 1,
          clockMs: 649_891,
        },
      ],
    });

    render(<MatchDetailContent data={data} />);

    expect(screen.getByText('10:49')).toBeInTheDocument();
    expect(screen.queryByLabelText('비정상적으로 긴 경기 시각이에요. 확인이 필요해요.')).not.toBeInTheDocument();
  });
});
