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
          assist: null,
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
          assist: null,
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
        { assist: null, type: 'GOAL', cardColor: null, sideId: 'side-home', side: 'home', participantId: 'p-1', participantName: '김선수', profileHref: null, jerseyNumber: 9, period: 1, clockMs: 600_000 },
        { assist: null, type: 'GOAL', cardColor: null, sideId: 'side-away', side: 'away', participantId: 'p-2', participantName: '이선수', profileHref: null, jerseyNumber: 10, period: 2, clockMs: 300_000 },
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
        { assist: null, type: 'CARD', cardColor: 'YELLOW', sideId: 'side-home', side: 'home', participantId: 'p-3', participantName: '박선수', profileHref: null, jerseyNumber: 5, period: null, clockMs: null },
      ],
    });

    render(<MatchDetailContent data={data} />);

    expect(within(screen.getByRole('group', { name: '기타' })).getByText('박선수')).toBeInTheDocument();
  });
});

describe('MatchDetailContent — 단판 경기 구간 표기', () => {
  const goal = (side: 'home' | 'away', name: string, period: number | null, clockMs: number | null) =>
    ({ assist: null, type: 'GOAL', cardColor: null, sideId: `side-${side}`, side, participantId: name, participantName: name, profileHref: null, jerseyNumber: 9, period, clockMs }) as const;
  const events = [goal('home', '김선수', 1, 600_000), goal('away', '이선수', 1, 300_000), goal('home', '박선수', null, null)];

  it('단판이면 "경기 결과" 구간 하나에 시간대 없는 기록까지 목록 끝에 합치고 "전반"·"기타"가 없다', () => {
    render(<MatchDetailContent data={makeDetail({ periodCount: 1, events })} />);

    const group = screen.getByRole('group', { name: '경기 결과' });
    expect(screen.getAllByRole('group').filter((node) => node.getAttribute('aria-labelledby')?.startsWith('match-events-'))).toHaveLength(1);
    const text = group.textContent ?? '';
    expect(text.indexOf('김선수')).toBeLessThan(text.indexOf('이선수'));
    expect(text.indexOf('이선수')).toBeLessThan(text.indexOf('박선수'));
    expect(screen.queryByText('전반')).toBeNull();
    expect(screen.queryByText('기타')).toBeNull();
  });

  it.each([[2], [null], [undefined]])('periodCount=%s 이면 전반·기타 구간을 지금처럼 나눈다', (periodCount) => {
    render(<MatchDetailContent data={makeDetail({ periodCount, events })} />);

    expect(within(screen.getByRole('group', { name: '전반' })).getByText('김선수')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '기타' })).getByText('박선수')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '경기 결과' })).toBeNull();
  });

  it('전반에만 기록이 있는 2피리어드 경기를 단판으로 오인하지 않는다', () => {
    render(<MatchDetailContent data={makeDetail({ periodCount: 2, events: [events[0]] })} />);
    expect(screen.getByRole('group', { name: '전반' })).toBeInTheDocument();
  });
});

describe('MatchDetailContent — 카드 색상', () => {
  it('익명 골은 "익명", 익명 자책골은 "OG"로 표시한다', () => {
    const data = makeDetail({
      events: [
        { assist: null, type: 'GOAL', cardColor: null, sideId: 'side-home', side: 'home', participantId: null, participantName: null, profileHref: null, jerseyNumber: null, period: 1, clockMs: 60_000 },
        { assist: null, type: 'OWN_GOAL', cardColor: null, sideId: 'side-away', side: 'away', participantId: null, participantName: null, profileHref: null, jerseyNumber: null, period: 1, clockMs: 120_000 },
      ],
    });

    render(<MatchDetailContent data={data} />);

    expect(screen.getByText('익명')).toBeInTheDocument();
    expect(screen.getAllByText('OG')).toHaveLength(2);
  });

  it('옐로카드와 레드카드를 서로 다른 아이콘과 접근 가능한 이름으로 표시한다', () => {
    const data = makeDetail({
      events: [
        { assist: null, type: 'CARD', cardColor: 'YELLOW', sideId: 'side-home', side: 'home', participantId: 'p-yellow', participantName: '옐로 선수', profileHref: null, jerseyNumber: 5, period: 1, clockMs: 300_000 },
        { assist: null, type: 'CARD', cardColor: 'RED', sideId: 'side-away', side: 'away', participantId: 'p-red', participantName: '레드 선수', profileHref: null, jerseyNumber: 6, period: 1, clockMs: 600_000 },
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
        { assist: null, type: 'GOAL', cardColor: null, sideId: 'side-home', side: 'home', participantId: 'p-1', participantName: '김도윤', jerseyNumber: 7, profileHref: '/users/u-1', period: 1, clockMs: 600_000 },
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

/**
 * **선수 이름은 프로필로 눌리는데 팀 이름은 아무 데도 못 갔다**(alpha 실측). 관전자가
 * 이 경기에서 팀으로 갈 수 있는 자리가 여기뿐인데 막혀 있었다.
 */
describe('MatchDetailContent — 팀 이름 진입점', () => {
  it('팀 이름을 누르면 팀 페이지로 간다', () => {
    render(<MatchDetailContent data={makeDetail()} />);

    expect(screen.getByRole('link', { name: '홈팀' })).toHaveAttribute('href', '/teams/team-home');
    expect(screen.getByRole('link', { name: '원정팀' })).toHaveAttribute('href', '/teams/team-away');
  });

  // 공유 기록 페이지 등 from을 받은 자리에서는 팀 상세에서 뒤로가면 이 기록 화면으로 돌아온다.
  it('from을 받으면 팀 링크에 출처를 이어 싣는다', () => {
    render(<MatchDetailContent data={makeDetail()} from="/league-matches/lg-1/fixtures/fx-1" />);

    const from = encodeURIComponent('/league-matches/lg-1/fixtures/fx-1');
    expect(screen.getByRole('link', { name: '홈팀' })).toHaveAttribute('href', `/teams/team-home?from=${from}`);
    expect(screen.getByRole('link', { name: '원정팀' })).toHaveAttribute('href', `/teams/team-away?from=${from}`);
  });

  /**
   * `registrationId` 가 있으면 참가팀은 존재하지만 이름만 가려진 상태다. 이 경우 실제
   * TBD인 `side: null`과 같은 '미정'으로 표시하면 공개 상태를 오해하게 만든다.
   */
  it('"다음 경기" 카드는 from을 받으면 출처를 이어 싣고, 없으면 그대로 둔다', () => {
    const nextMatch = {
      fixtureId: 'fixture-2',
      round: '2라운드',
      scheduledAt: null,
      home: { teamId: 'team-home', teamName: '홈팀' },
      away: { teamId: 'team-away', teamName: '원정팀' },
    };
    const { rerender } = render(<MatchDetailContent data={makeDetail({ nextMatch })} />);
    expect(screen.getByRole('link', { name: /다음 경기/ })).toHaveAttribute('href', '/tournaments/tour-1/matches/fixture-2');

    rerender(<MatchDetailContent data={makeDetail({ nextMatch })} from="/league-matches/lg-1/fixtures/fx-1" />);
    expect(screen.getByRole('link', { name: /다음 경기/ })).toHaveAttribute(
      'href',
      `/tournaments/tour-1/matches/fixture-2?from=${encodeURIComponent('/league-matches/lg-1/fixtures/fx-1')}`,
    );
  });

  it.each([null, 'team-id'])('이름이 가려졌으면 팀 ID %s와 무관하게 참가팀 비공개로 표시한다', (teamId) => {
    const data = makeDetail({
      home: { registrationId: 'reg-home', teamId, teamName: null },
      away: { registrationId: 'reg-away', teamId, teamName: null },
    });

    render(<MatchDetailContent data={data} />);

    expect(screen.getAllByText('참가팀 비공개')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: '참가팀 비공개' })).not.toBeInTheDocument();
  });

  it('실제 TBD side는 미정으로 표시하고 링크로 만들지 않는다', () => {
    const data = makeDetail({
      home: null,
      away: null,
    });

    render(<MatchDetailContent data={data} />);

    // 아직 배정되지 않은 팀에 링크를 만들지 않는다.
    expect(screen.queryByRole('link', { name: '미정' })).not.toBeInTheDocument();
    expect(screen.getAllByText('미정').length).toBeGreaterThan(0);
  });
});

describe('MatchDetailContent — status-only 이력 privacy', () => {
  it('status-only에서는 공개 결과 변경 사유를 렌더링하지 않는다', () => {
    render(<MatchDetailContent data={makeDetail({
      visibilityMode: 'status_only',
      history: [{
        revision: 2,
        state: 'OFFICIAL',
        officialAt: '2026-09-05T11:00:00.000Z',
        reason: '운영자 내부 정정 사유',
        isCorrection: true,
      }],
    })} />);

    expect(screen.getByText('결과 변경 이력')).toBeInTheDocument();
    expect(screen.queryByText('운영자 내부 정정 사유')).not.toBeInTheDocument();
  });
});

describe('MatchDetailContent — official-only pending result guidance', () => {
  it('공식 결과 확정 전에는 점수와 기록 공개 정책을 안내한다', () => {
    render(<MatchDetailContent data={makeDetail({
      visibilityMode: 'official_only',
      resultState: 'pending',
      scoreStatus: 'pending',
    })} />);

    expect(screen.getByText('공식 결과가 확정되면 점수와 기록이 공개돼요.')).toBeInTheDocument();
  });

  it('실시간 공개 정책의 pending 결과에는 확정 안내를 붙이지 않는다', () => {
    render(<MatchDetailContent data={makeDetail({
      visibilityMode: 'live',
      resultState: 'pending',
      scoreStatus: 'pending',
      status: 'live',
    })} />);

    expect(screen.queryByText('공식 결과가 확정되면 점수와 기록이 공개돼요.')).not.toBeInTheDocument();
  });

  it('이미 공식 결과인 official-only 경기에는 pending 안내를 붙이지 않는다', () => {
    render(<MatchDetailContent data={makeDetail({
      visibilityMode: 'official_only',
      resultState: 'official',
      scoreStatus: 'official',
    })} />);

    expect(screen.queryByText('공식 결과가 확정되면 점수와 기록이 공개돼요.')).not.toBeInTheDocument();
  });
});

describe('MatchDetailContent — 공식 확정 대기 문구', () => {
  const pendingText = '경기 결과가 공식 확정을 기다리고 있어요.';

  it('경기 중(live)에는 pendingProjection 이어도 확정 대기 문구를 보이지 않는다', () => {
    render(<MatchDetailContent data={makeDetail({ status: 'live', pendingProjection: true })} />);

    expect(screen.queryByText(pendingText)).not.toBeInTheDocument();
  });

  it('경기가 끝난 뒤 pendingProjection 이면 확정 대기 문구를 보인다', () => {
    render(<MatchDetailContent data={makeDetail({ status: 'ended', pendingProjection: true })} />);

    expect(screen.getByText(pendingText)).toBeInTheDocument();
  });

  it('pendingProjection 이 아니면 끝난 경기에도 문구가 없다', () => {
    render(<MatchDetailContent data={makeDetail({ status: 'ended', pendingProjection: false })} />);

    expect(screen.queryByText(pendingText)).not.toBeInTheDocument();
  });
});

describe('MatchDetailContent — 득점자 아래 도움 줄', () => {
  const scorer = {
    type: 'GOAL',
    cardColor: null,
    sideId: 'side-home',
    side: 'home' as const,
    participantId: 'p-1',
    participantName: '김득점',
    jerseyNumber: 9,
    profileHref: null,
    period: 1,
    clockMs: 360_000,
  };

  it('도움이 있는 골은 득점자 아래에 "도움 · 등번호 이름"을 보이고, 프로필 링크가 있으면 이름이 링크다', () => {
    const data = makeDetail({
      events: [
        { ...scorer, assist: { participantName: '이도움', jerseyNumber: 3, profileHref: '/users/user-3' } },
        // 도움을 기입하지 않은 다른 골 -- 도움 줄이 통째로 없어야 한다(빈 "도움 ·" 금지).
        { ...scorer, participantId: 'p-2', participantName: '박득점', clockMs: 720_000, assist: null },
      ],
    });

    render(<MatchDetailContent data={data} />);

    const assistLines = screen.getAllByText(/^도움 ·/);
    expect(assistLines).toHaveLength(1);
    expect(assistLines[0]).toHaveTextContent('도움 · 3 이도움');
    expect(screen.getByRole('link', { name: '이도움' })).toHaveAttribute('href', '/users/user-3');
    // 득점자 이름은 도움 줄과 별개로 그대로다.
    expect(screen.getByText('김득점')).toBeInTheDocument();
  });

  it('가려진 도움 선수는 득점자와 같은 "비공개 선수" 표기이고, 도움 줄 자체는 남는다', () => {
    const data = makeDetail({
      events: [{ ...scorer, assist: { participantName: null, jerseyNumber: null, profileHref: null } }],
    });

    render(<MatchDetailContent data={data} />);

    expect(screen.getByText(/^도움 ·/)).toHaveTextContent('도움 · 비공개 선수');
    // 익명 득점("익명")과 섞이지 않는다.
    expect(screen.queryByText('익명')).not.toBeInTheDocument();
  });

  it('assist 필드가 없는 옛 서버 응답에서도 깨지지 않고 도움 줄이 없다', () => {
    const legacyEvent = { ...scorer } as unknown as PublicMatchDetail['events'][number];

    render(<MatchDetailContent data={makeDetail({ events: [legacyEvent] })} />);

    expect(screen.getByText('김득점')).toBeInTheDocument();
    expect(screen.queryByText(/도움/)).not.toBeInTheDocument();
  });

  it('원정 골의 도움도 같은 줄 구조로 원정 열에 붙는다', () => {
    const data = makeDetail({
      events: [
        { ...scorer, side: 'away', sideId: 'side-away', assist: { participantName: '최도움', jerseyNumber: null, profileHref: null } },
      ],
    });

    render(<MatchDetailContent data={data} />);

    const row = screen.getByRole('listitem');
    // 홈 열(첫 자식)은 비고, 원정 열(마지막 자식)에 득점자와 도움이 함께 있다.
    expect(row.firstElementChild).toBeEmptyDOMElement();
    expect(within(row.lastElementChild as HTMLElement).getByText('김득점')).toBeInTheDocument();
    expect(within(row.lastElementChild as HTMLElement).getByText(/^도움 ·/)).toHaveTextContent('도움 · 최도움');
  });
});
