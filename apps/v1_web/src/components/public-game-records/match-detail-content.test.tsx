import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MatchDetailContent } from './match-detail-content';
import type { PublicMatchDetail } from './types';

/**
 * alpha "452′" 실측 사고(2026-08) 회귀 방지 — 경기 상세 타임라인
 * (`EventRow`, 분 올림 `formatClock`)도 스케줄 카드와 동일한 이상 클럭
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
    periodBreak: null,
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
  it('이벤트의 clockMs가 이상값이면 분을 올림해 표시하고 경고 표식을 붙인다', () => {
    const data = makeDetail({
      events: [
        {
          type: 'GOAL',
          cardColor: null,
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

    expect(screen.getByText('453′')).toBeInTheDocument();
    expect(screen.getByLabelText('비정상적으로 긴 경기 시각이에요. 확인이 필요해요.')).toBeInTheDocument();
  });

  it('정상 clockMs 이벤트에는 경고 표식이 붙지 않는다', () => {
    const data = makeDetail({
      events: [
        {
          type: 'CARD',
          cardColor: 'YELLOW',
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

    expect(screen.getByText('11′')).toBeInTheDocument();
    expect(screen.queryByLabelText('비정상적으로 긴 경기 시각이에요. 확인이 필요해요.')).not.toBeInTheDocument();
  });
});

describe('MatchDetailContent — 전반/후반 섹션 분리', () => {
  it('전반과 후반 이벤트가 각각 자기 구간에만 들어간다 (시간 역전 버그 회귀)', () => {
    const data = makeDetail({
      events: [
        { type: 'GOAL', cardColor: null, sideId: 'side-home', side: 'home', participantId: 'p-1', participantName: '김선수', jerseyNumber: 9, period: 1, clockMs: 600_000 },
        { type: 'GOAL', cardColor: null, sideId: 'side-away', side: 'away', participantId: 'p-2', participantName: '이선수', jerseyNumber: 10, period: 2, clockMs: 300_000 },
      ],
    });

    render(<MatchDetailContent data={data} />);

    const firstHalf = screen.getByRole('group', { name: '전반' });
    const secondHalf = screen.getByRole('group', { name: '후반' });
    expect(within(firstHalf).getByText('김선수')).toBeInTheDocument();
    expect(within(firstHalf).queryByText('이선수')).not.toBeInTheDocument();
    expect(within(secondHalf).getByText('이선수')).toBeInTheDocument();
    expect(within(secondHalf).queryByText('김선수')).not.toBeInTheDocument();
  });

  it('period가 null인 이벤트는 "기타" 구간에 담겨 유실되지 않는다', () => {
    const data = makeDetail({
      events: [
        { type: 'CARD', cardColor: 'YELLOW', sideId: 'side-home', side: 'home', participantId: 'p-3', participantName: '박선수', jerseyNumber: 5, period: null, clockMs: null },
      ],
    });

    render(<MatchDetailContent data={data} />);

    expect(within(screen.getByRole('group', { name: '기타' })).getByText('박선수')).toBeInTheDocument();
  });
});

describe('MatchDetailContent — 카드 색상', () => {
  it('익명 골은 "익명", 익명 자책골은 "OG"로 표시한다', () => {
    const data = makeDetail({
      events: [
        { type: 'GOAL', cardColor: null, sideId: 'side-home', side: 'home', participantId: null, participantName: null, jerseyNumber: null, period: 1, clockMs: 60_000 },
        { type: 'OWN_GOAL', cardColor: null, sideId: 'side-away', side: 'away', participantId: null, participantName: null, jerseyNumber: null, period: 1, clockMs: 120_000 },
      ],
    });

    render(<MatchDetailContent data={data} />);

    expect(screen.getByText('익명')).toBeInTheDocument();
    expect(screen.getAllByText('OG')).toHaveLength(2);
  });

  it('옐로카드와 레드카드를 서로 다른 아이콘과 접근 가능한 이름으로 표시한다', () => {
    const data = makeDetail({
      events: [
        { type: 'CARD', cardColor: 'YELLOW', sideId: 'side-home', side: 'home', participantId: 'p-yellow', participantName: '옐로 선수', jerseyNumber: 5, period: 1, clockMs: 300_000 },
        { type: 'CARD', cardColor: 'RED', sideId: 'side-away', side: 'away', participantId: 'p-red', participantName: '레드 선수', jerseyNumber: 6, period: 1, clockMs: 600_000 },
      ],
    });

    render(<MatchDetailContent data={data} />);

    expect(screen.getByText('🟨')).toBeInTheDocument();
    expect(screen.getByText('옐로카드')).toHaveClass('sr-only');
    expect(screen.getByText('🟥')).toBeInTheDocument();
    expect(screen.getByText('레드카드')).toHaveClass('sr-only');
  });
});
