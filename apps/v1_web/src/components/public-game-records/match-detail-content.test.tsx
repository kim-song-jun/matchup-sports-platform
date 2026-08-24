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
    outcome: null,
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
          jerseyNumber: 9, profileHref: null,
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
          jerseyNumber: 9, profileHref: null,
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
        { type: 'GOAL', cardColor: null, sideId: 'side-home', side: 'home', participantId: 'p-1', participantName: '김선수', profileHref: null, jerseyNumber: 9, period: 1, clockMs: 600_000 },
        { type: 'GOAL', cardColor: null, sideId: 'side-away', side: 'away', participantId: 'p-2', participantName: '이선수', profileHref: null, jerseyNumber: 10, period: 2, clockMs: 300_000 },
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
        { type: 'CARD', cardColor: 'YELLOW', sideId: 'side-home', side: 'home', participantId: 'p-3', participantName: '박선수', profileHref: null, jerseyNumber: 5, period: null, clockMs: null },
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
        { type: 'GOAL', cardColor: null, sideId: 'side-home', side: 'home', participantId: null, participantName: null, profileHref: null, jerseyNumber: null, period: 1, clockMs: 60_000 },
        { type: 'OWN_GOAL', cardColor: null, sideId: 'side-away', side: 'away', participantId: null, participantName: null, profileHref: null, jerseyNumber: null, period: 1, clockMs: 120_000 },
      ],
    });

    render(<MatchDetailContent data={data} />);

    expect(screen.getByText('익명')).toBeInTheDocument();
    expect(screen.getAllByText('OG')).toHaveLength(2);
  });

  it('옐로카드와 레드카드를 서로 다른 아이콘과 접근 가능한 이름으로 표시한다', () => {
    const data = makeDetail({
      events: [
        { type: 'CARD', cardColor: 'YELLOW', sideId: 'side-home', side: 'home', participantId: 'p-yellow', participantName: '옐로 선수', profileHref: null, jerseyNumber: 5, period: 1, clockMs: 300_000 },
        { type: 'CARD', cardColor: 'RED', sideId: 'side-away', side: 'away', participantId: 'p-red', participantName: '레드 선수', profileHref: null, jerseyNumber: 6, period: 1, clockMs: 600_000 },
      ],
    });

    render(<MatchDetailContent data={data} />);

    expect(screen.getByText('🟨')).toBeInTheDocument();
    expect(screen.getByText('옐로카드')).toHaveClass('sr-only');
    expect(screen.getByText('🟥')).toBeInTheDocument();
    expect(screen.getByText('레드카드')).toHaveClass('sr-only');
  });
  /**
   * BRACKET-6 — 몰수 0:0 과 실제 0:0 무승부가 관전자 화면에서 같아 보이면 안 된다.
   * 서버는 사유를 저장하고 공개 API 로도 내보내고 있었는데(alpha 실측 확인) 화면이
   * 그 값을 아예 읽지 않아, 운영자가 종료 다이얼로그에서 읽은 "사유는 공개 경기
   * 기록에 함께 남아요" 안내가 실제로는 지켜지지 않고 있었다.
   */
  describe('몰수·중단 종결 표기', () => {
    it('몰수로 끝난 경기는 사유 라벨과 사유 본문을 함께 보여준다', () => {
      const data = makeDetail({
        score: { home: 0, away: 0, penalties: null },
        outcome: { reason: 'FORFEIT', note: '원정팀이 킥오프 15분 경과까지 미출석' },
      });

      render(<MatchDetailContent data={data} />);

      expect(screen.getByText('몰수·기권으로 종료된 경기예요')).toBeInTheDocument();
      expect(screen.getByText('원정팀이 킥오프 15분 경과까지 미출석')).toBeInTheDocument();
    });

    it('경기 중단은 몰수와 다른 라벨로 구분한다', () => {
      const data = makeDetail({ outcome: { reason: 'ABANDONED', note: '폭우로 후반 중단' } });

      render(<MatchDetailContent data={data} />);

      expect(screen.getByText('경기 중단으로 종료된 경기예요')).toBeInTheDocument();
      expect(screen.queryByText('몰수·기권으로 종료된 경기예요')).not.toBeInTheDocument();
    });

    it('정상 종료 경기에는 아무 표기도 붙이지 않는다', () => {
      render(<MatchDetailContent data={makeDetail({ outcome: null })} />);

      expect(screen.queryByText(/종료된 경기예요/)).not.toBeInTheDocument();
    });

    it('사유가 비어 있으면 라벨만 보여주고 빈 줄을 남기지 않는다', () => {
      // 서버가 사유를 422 로 강제하기 전에 종료된 과거 경기.
      const data = makeDetail({ outcome: { reason: 'FORFEIT', note: '   ' } });

      render(<MatchDetailContent data={data} />);

      const notice = screen.getByText('몰수·기권으로 종료된 경기예요').parentElement;
      expect(notice).not.toBeNull();
      expect(within(notice as HTMLElement).getAllByText(/./)).toHaveLength(1);
    });
  });
});

/**
 * 선수 이름 → 공개 프로필 링크(B-2).
 *
 * 열어도 되는지는 **서버가 판단해서** `profileHref` 로 내려준다. 화면은 있으면 링크,
 * 없으면 그냥 글자다. 이 테스트가 지키는 것은 그 계약 하나 — 화면이 동의·계정 유무를
 * 다시 따지기 시작하면 서버와 갈린다.
 */
describe('MatchDetailContent — 선수 이름 프로필 링크', () => {
  it('profileHref 가 있으면 라인업 이름을 링크로 만든다', () => {
    const data = makeDetail({
      lineup: {
        home: [{ participantId: 'p-1', displayName: '김도윤', jerseyNumber: 7, position: 'GK', profileHref: '/users/u-1' }],
        away: [],
      },
    });

    render(<MatchDetailContent data={data} />);

    expect(screen.getByRole('link', { name: '김도윤' })).toHaveAttribute('href', '/users/u-1');
  });

  it('profileHref 가 없으면 링크를 만들지 않는다 (이름은 그대로 보인다)', () => {
    const data = makeDetail({
      lineup: {
        home: [{ participantId: 'p-2', displayName: '박서준', jerseyNumber: 9, position: null, profileHref: null }],
        away: [],
      },
    });

    render(<MatchDetailContent data={data} />);

    expect(screen.getByText('박서준')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '박서준' })).not.toBeInTheDocument();
  });

  it('이름이 가려진 참가자는 링크도 없다', () => {
    // 서버가 이 조합(displayName=null 인데 profileHref 있음)을 내리지 않는 것이 계약이지만,
    // 화면이 "비공개 선수"에 링크를 거는 일이 없다는 것 자체를 고정한다.
    const data = makeDetail({
      lineup: {
        home: [{ participantId: 'p-3', displayName: null, jerseyNumber: null, position: null, profileHref: null }],
        away: [],
      },
    });

    render(<MatchDetailContent data={data} />);

    expect(screen.getByText('비공개 선수')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '비공개 선수' })).not.toBeInTheDocument();
  });

  it('이벤트 타임라인의 득점자도 링크가 된다', () => {
    const data = makeDetail({
      events: [
        { type: 'GOAL', cardColor: null, sideId: 'side-home', side: 'home', participantId: 'p-1', participantName: '김도윤', jerseyNumber: 7, profileHref: '/users/u-1', period: 1, clockMs: 600_000 },
      ],
    });

    render(<MatchDetailContent data={data} />);

    expect(screen.getByRole('link', { name: '김도윤' })).toHaveAttribute('href', '/users/u-1');
  });

  it('MVP 도 링크가 된다', () => {
    const data = makeDetail({ mvp: { participantId: 'p-1', displayName: '김도윤', profileHref: '/users/u-1' } });

    render(<MatchDetailContent data={data} />);

    expect(screen.getByRole('link', { name: '김도윤' })).toHaveAttribute('href', '/users/u-1');
  });
});
