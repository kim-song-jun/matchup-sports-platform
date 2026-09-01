import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScheduleContent } from './schedule-content';
import type { PublicTournamentScheduleResponse } from './types';

/**
 * 대회 일정 화면의 조별 순위표에서 팀명을 누르면 그 팀의 공개 전적
 * (/teams/:id/records)으로 이동해야 한다 — 오너 요청의 핵심 리그레션 지점.
 * 이전엔 <span> plain text였다.
 */
function makeData(overrides: Partial<PublicTournamentScheduleResponse> = {}): PublicTournamentScheduleResponse {
  return {
    tournamentId: 'tour-1',
    tournamentTitle: '테스트 대회',
    bracketPublished: true,
    items: [],
    unscheduled: [],
    standings: [],
    nextCursor: null,
    ...overrides,
  };
}

describe('ScheduleContent — 순위표 팀 링크', () => {
  it('순위표의 팀명을 누르면 /teams/:teamId/records 로 이동한다', () => {
    const data = makeData({
      standings: [
        {
          groupId: 'group-a',
          groupName: 'A조',
          registrationId: 'reg-77',
          teamId: 'team-77',
          teamName: '망원 FC',
          teamLogoUrl: '/uploads/team-77-logo.png',
          position: 1,
          points: 6,
          wins: 2,
          draws: 0,
          losses: 0,
          goalsFor: 5,
          goalsAgainst: 1,
        },
      ],
    });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    const link = screen.getByRole('link', { name: /망원 FC/ });
    expect(link).toHaveAttribute('href', '/teams/team-77/records');
  });

  /**
   * 회귀 방지: toStandingsRows 어댑터가 teamLogoUrl을 누락하면 실제 로고가
   * 있는 팀도 항상 identicon(<img> 없음)으로만 렌더된다 — 순위·대진표 탭
   * (bracket-page-client.tsx)과 시각적으로 어긋나는 버그였다.
   */
  it('팀에 등록된 로고가 있으면 순위표 아바타가 identicon 대신 실제 로고 이미지를 렌더한다', () => {
    const data = makeData({
      standings: [
        {
          groupId: 'group-a',
          groupName: 'A조',
          registrationId: 'reg-77',
          teamId: 'team-77',
          teamName: '망원 FC',
          teamLogoUrl: '/uploads/team-77-logo.png',
          position: 1,
          points: 6,
          wins: 2,
          draws: 0,
          losses: 0,
          goalsFor: 5,
          goalsAgainst: 1,
        },
      ],
    });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    const logoImg = screen.getByRole('link', { name: /망원 FC/ }).closest('tr')?.querySelector('img');
    expect(logoImg).not.toBeNull();
    expect(logoImg).toHaveAttribute('src', expect.stringContaining('team-77-logo.png'));
  });

  it('경기 일정이 없으면 안내 문구가 뜨고 오류처럼 보이지 않는다', () => {
    render(<ScheduleContent tournamentId="tour-1" data={makeData()} />);

    expect(screen.getByText('아직 확정된 일정이 없어요')).toBeInTheDocument();
  });
});

/**
 * alpha "452′" 실측 사고(2026-08) 회귀 방지. DB 실측값 그대로 재현한다:
 * `v1_game_events.clock_ms` GOAL 27,166,083ms(≈452분, 20분 피리어드 경기)
 * -- 공개 일정 화면(이 컴포넌트)에 내림값 `452′`가 경고 표식 없이 나갔던
 * 화면이다. 현재 계약은 초 단위를 올림한 `453′`와 경고 표식을 함께 보여준다.
 */
function fixtureEntry(overrides: Partial<import('./types').PublicScheduleEntry> = {}): import('./types').PublicScheduleEntry {
  return {
    fixtureId: 'fixture-1',
    round: '조별리그',
    fixtureNumber: 1,
    legNumber: 1,
    groupId: null,
    groupName: null,
    scheduledAt: '2026-08-01T10:00:00.000Z',
    venue: null,
    fieldId: null,
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
    scorers: [],
    cards: [],
    outcome: null,
    hasVideo: false,
    ...overrides,
  };
}

describe('ScheduleContent — 이상 클럭 경고 표식(alpha 452′ 사고)', () => {
  it('득점자의 clockMs가 이상값이면 분을 올림해 표시하고 경고 표식을 붙인다', () => {
    const data = { ...makeData(), items: [fixtureEntry({
      scorers: [{ side: 'home', participantName: '김선수', jerseyNumber: 9, period: 1, clockMs: 27_166_083 }],
    })] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    // 초 단위가 남아 있으므로 사용자 계약대로 453분으로 올림해 보인다.
    expect(screen.getByText(/453′/)).toBeInTheDocument();
    // 그 옆에 경고 표식이 붙는다.
    expect(screen.getByLabelText('비정상적으로 긴 경기 시각이에요. 확인이 필요해요.')).toBeInTheDocument();
  });

  it('정상 clockMs 득점자에는 경고 표식이 붙지 않는다', () => {
    const data = { ...makeData(), items: [fixtureEntry({
      scorers: [{ side: 'home', participantName: '김선수', jerseyNumber: 9, period: 1, clockMs: 649_891 }],
    })] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getByText(/11′/)).toBeInTheDocument();
    expect(screen.queryByLabelText('비정상적으로 긴 경기 시각이에요. 확인이 필요해요.')).not.toBeInTheDocument();
  });
});

/**
 * alpha 실측 정렬 사고(2026-08-13) 회귀 방지. 스코어 행은 `flex 1 / 64px / 1`,
 * 득점자 행은 `grid 1fr 20px 1fr`로 **축을 각자 따로** 들고 있어서, 390px에서
 * 홈 팀명 우단은 153px인데 홈 득점자 우단은 179px이었다(원정도 대칭으로 26px
 * 어긋남) -- 득점자 텍스트가 팀명 축을 벗어나 가운데 스코어 칸 밑으로 파고들었다.
 *
 * 그래서 이 테스트는 특정 열 폭 값을 단언하지 않는다(그건 구현 되읊기다). 두 행이
 * **같은 축을 쓴다는 불변식**만 본다 -- 누가 한쪽 행의 열 정의만 다시 손대면
 * 그 순간 이 테스트가 깨지고, 그게 정확히 사용자가 본 그 버그다.
 */
describe('ScheduleContent — 스코어 행과 득점자 행의 3열 축 일치', () => {
  it('득점자 행이 스코어 행과 완전히 같은 열 정의(축)를 공유한다', () => {
    const data = {
      ...makeData(),
      items: [fixtureEntry({
        scorers: [
          { side: 'home', participantName: '홈선수', jerseyNumber: 7, period: 1, clockMs: 645_886 },
          { side: 'away', participantName: '원정선수', jerseyNumber: 11, period: 2, clockMs: 48_263 },
        ],
      })],
    };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    const scoreRow = screen.getByText('1 : 0').parentElement;
    // 축을 쥐는 것은 이벤트 **행**이다 -- 한 이벤트가 한 행이고, 그 행이 스코어 행과
    // 같은 3열 축 위에 홈/아이콘/원정을 놓는다(요약 컨테이너 자체는 구간을 세로로
    // 쌓기만 한다). 행이 여러 개여도 전부 같은 상수를 쓰므로 첫 행으로 검사한다.
    const eventRows = screen.getAllByRole('listitem');

    expect(eventRows.length).toBeGreaterThan(0);
    // 축이 실제로 정의돼 있어야 한다 -- 양쪽 모두 빈 문자열이면 아래 단언은 공허하게 통과한다.
    expect(scoreRow?.style.gridTemplateColumns).not.toBe('');
    for (const row of eventRows) {
      expect(row.style.gridTemplateColumns).toBe(scoreRow?.style.gridTemplateColumns);
      expect(row.style.columnGap).toBe(scoreRow?.style.columnGap);
    }
  });
});

describe('ScheduleContent — 득점 기록 전·후반 구분', () => {
  it('입력 순서와 무관하게 전반을 위에, 후반을 아래에 각각 시간순으로 표시한다', () => {
    const data = { ...makeData(), items: [fixtureEntry({
      scorers: [
        { side: 'home', participantName: '후반 8분', jerseyNumber: 8, period: 2, clockMs: 480_000 },
        { side: 'home', participantName: '전반 12분', jerseyNumber: 12, period: 1, clockMs: 720_000 },
        { side: 'home', participantName: '전반 3분', jerseyNumber: 3, period: 1, clockMs: 180_000 },
        { side: 'home', participantName: '후반 2분', jerseyNumber: 2, period: 2, clockMs: 120_000 },
      ],
    })] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    const scorerSummary = screen.getByRole('list', { name: '경기 기록' });
    expect(Array.from(scorerSummary.querySelectorAll('[role="group"]')).map((group) => group.getAttribute('aria-label')))
      .toEqual(['전반 기록', '후반 기록']);
    expect(screen.getByRole('group', { name: '전반 기록' })).toHaveTextContent(/전반 3분.*전반 12분/);
    expect(screen.getByRole('group', { name: '후반 기록' })).toHaveTextContent(/후반 2분.*후반 8분/);
  });

  /**
   * 예전에는 이 자리에 점선 `role="separator"` 하나만 있었고, 기록이 한쪽 반에만 있어도
   * 그 선을 항상 그렸다 -- 화면에는 아무 이름 없는 선 하나뿐이라 그게 전·후반 경계인지
   * 다른 무엇인지 읽을 수 없었다(오너 지적: "레이아웃도 좀 아쉬운것같고"). 이제 각 구간에
   * **이름을 직접 적고**(전반/후반/기타), 기록이 있는 구간만 렌더한다 -- 없는 후반을
   * 그리지 않는 편이 정확하다.
   */
  it.each([
    ['전반만', [{ side: 'home' as const, participantName: '전반 선수', jerseyNumber: 7, period: 1, clockMs: 60_000 }], '전반 기록', '전반', '후반'],
    ['후반만', [{ side: 'away' as const, participantName: '후반 선수', jerseyNumber: 9, period: 2, clockMs: 60_000 }], '후반 기록', '후반', '전반'],
  ])('%s 기록이 있으면 그 구간만 이름과 함께 표시한다', (_case, scorers, groupName, shownLabel, hiddenLabel) => {
    render(<ScheduleContent tournamentId="tour-1" data={{ ...makeData(), items: [fixtureEntry({ scorers })] }} />);

    const group = screen.getByRole('group', { name: groupName });
    // 구간 경계를 선만으로 표시하지 않는다 — 이름이 실제 화면 텍스트로 있어야 한다.
    expect(group).toHaveTextContent(shownLabel);
    expect(screen.queryByText(hiddenLabel)).not.toBeInTheDocument();
  });

  /**
   * 레거시 대회 결과에서 복원된 골(`goal-event-backfill.ts`)은 원본에 전/후반이 아예
   * 없었다 -- 서버가 `period: null`("모름")로 내려준다. 예전 `period !== 1` 분기는 그
   * 골들을 전부 "후반 득점"으로 밀어넣어, 모른다고 내려온 값을 화면에서 단정으로
   * 바꿔놨다.
   */
  it('period가 null인 득점(전·후반 미상)은 후반이 아니라 별도 묶음으로 표시한다', () => {
    const data = { ...makeData(), items: [fixtureEntry({
      scorers: [
        { side: 'home', participantName: '후반 선수', jerseyNumber: 8, period: 2, clockMs: 480_000 },
        { side: 'home', participantName: '미상 선수', jerseyNumber: 11, period: null, clockMs: 720_000 },
      ],
    })] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getByRole('group', { name: '후반 기록' })).toHaveTextContent('후반 선수');
    expect(screen.getByRole('group', { name: '후반 기록' })).not.toHaveTextContent('미상 선수');
    expect(screen.getByRole('group', { name: '기타 기록' })).toHaveTextContent('미상 선수');
  });

  it('전·후반 미상 득점이 없으면 기타 묶음 자체를 렌더하지 않는다', () => {
    render(<ScheduleContent tournamentId="tour-1" data={{ ...makeData(), items: [fixtureEntry({
      scorers: [{ side: 'home', participantName: '전반 선수', jerseyNumber: 7, period: 1, clockMs: 60_000 }],
    })] }} />);

    expect(screen.queryByRole('group', { name: '기타 기록' })).not.toBeInTheDocument();
  });

  it('득점이 없으면 득점 영역과 구분선을 모두 표시하지 않는다', () => {
    render(<ScheduleContent tournamentId="tour-1" data={{ ...makeData(), items: [fixtureEntry()] }} />);

    expect(screen.queryByRole('list', { name: '경기 기록' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /기록$/ })).not.toBeInTheDocument();
  });
});

/**
 * 팀장이 이 화면에 들어왔을 때 "우리 팀 경기가 어느 것이고 라인업이 남았는지"를 바로
 * 알아야 한다. 예전에는 공개 일정만 있어서, 자기 팀 경기를 눈으로 찾아 하나씩 눌러
 * 들어가야 라인업 진입점을 만날 수 있었다.
 */
describe('ScheduleContent — 우리 팀 경기 강조', () => {
  const myFixtures = {
    teams: [
      {
        registrationId: 'reg-home',
        teamId: 'team-home',
        teamName: '홈팀',
        fixtures: [
          {
            fixtureId: 'fixture-1',
            gameId: 'game-1',
            sideId: 'side-1',
            round: '조별리그',
            legNumber: 1,
            groupName: null,
            scheduledAt: '2026-08-01T10:00:00.000Z',
            status: 'scheduled',
            isHome: true,
            opponentTeamName: '원정팀',
            lineupState: null,
          },
        ],
      },
    ],
  };

  it('내 팀 경기 행에 "우리 팀" 표시와 라인업 상태가 붙는다', () => {
    const data = { ...makeData(), items: [fixtureEntry()] };

    render(<ScheduleContent tournamentId="tour-1" data={data} myFixtures={myFixtures} />);

    expect(screen.getByText('우리 팀')).toBeInTheDocument();
    // 색만으로 상태를 전달하지 않는다 — 문구가 함께 있어야 한다.
    expect(screen.getAllByText('라인업 미작성').length).toBeGreaterThan(0);
    // [P1-d] '라인업 짜기' 링크 단언은 뺐다(경기별 라인업 화면 제거). **강조와 상태
    // 표시 계약은 그대로 남긴다** — 링크가 사라졌다고 함께 지우면 "우리 팀 경기가
    // 눈에 띄어야 한다"는 별개의 계약까지 커버리지가 없어진다.
    expect(screen.queryByRole('link', { name: '라인업 짜기' })).not.toBeInTheDocument();
  });

  /**
   * [P1-d] 여기 있던 두 테스트('요약이 남은 라인업 수를 보여준다', '제출을 마쳤으면
   * CTA 를 안 띄운다')는 화면 상단 **'우리 팀 라인업' 요약 패널** 전용이었다. 그 패널을
   * 통째로 걷어냈으므로 함께 지운다.
   *
   * 패널을 지운 이유(링크만 떼지 않은 이유): 경기별 라인업 화면이 사라지면 아무도 제출을
   * 할 수 없으므로 "라인업이 아직 정해지지 않은 경기가 N경기 있어요" 가 **영원히 해소되지
   * 않는 알림**이 된다. 갈 곳 없는 할 일을 계속 띄우는 것이 링크만 없는 것보다 나쁘다.
   */

  it('로그인하지 않았거나 참가팀이 아니면 화면이 종전 그대로다', () => {
    const data = { ...makeData(), items: [fixtureEntry()] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.queryByText('우리 팀')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /라인업/ })).not.toBeInTheDocument();
  });
});

describe('ScheduleContent — 스코어 아래 승부차기 보조 표기', () => {
  it('승부차기가 있으면 정규시간 스코어는 그대로 두고 아래에 "승부차기 4-3"을 붙인다', () => {
    const data = {
      ...makeData(),
      items: [fixtureEntry({ score: { home: 1, away: 1, penalties: { home: 4, away: 3 } } })],
    };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    // 큰 스코어가 승부차기 숫자로 덮이지 않는다 -- 승부차기는 보조 표기로만 나온다.
    expect(screen.getByText('1 : 1')).toBeInTheDocument();
    expect(screen.getByText('승부차기 4-3')).toBeInTheDocument();
    expect(screen.queryByText('4 : 3')).not.toBeInTheDocument();
  });

  it('승부차기가 없는 경기에는 보조 표기를 아예 렌더하지 않는다', () => {
    const data = { ...makeData(), items: [fixtureEntry({})] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getByText('1 : 0')).toBeInTheDocument();
    expect(screen.queryByText(/승부차기/)).not.toBeInTheDocument();
  });
});

/**
 * 오너 지적(2026-08-18): "경기기록에서는 이 카드랑 아이콘이 다 나오는데, 대회 상세에서는
 * 내용이 안나오네." 경기 상세 타임라인에는 경고/퇴장이 나오는데 대회 일정 카드 요약은
 * 골만 실어서, 같은 경기의 같은 카드가 화면에 따라 있다가 없다가 했다.
 */
describe('ScheduleContent — 일정 카드에 경고·퇴장도 함께 표시한다', () => {
  it('카드 이벤트를 골과 같은 구간 안에 시간순으로 놓고, 색을 텍스트로도 알린다', () => {
    const data = { ...makeData(), items: [fixtureEntry({
      scorers: [{ side: 'home', participantName: '득점 선수', jerseyNumber: 9, period: 2, clockMs: 60_000 }],
      cards: [
        { side: 'away', cardColor: 'YELLOW', participantName: '경고 선수', jerseyNumber: 4, period: 2, clockMs: 30_000 },
        { side: 'away', cardColor: 'RED', participantName: '퇴장 선수', jerseyNumber: 5, period: 2, clockMs: 120_000 },
      ],
    })] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    const secondHalf = screen.getByRole('group', { name: '후반 기록' });
    // 시간순: 경고(0:30) → 골(1:00) → 퇴장(2:00). 골만 따로 모아 올리지 않는다.
    expect(secondHalf).toHaveTextContent(/경고 선수[\s\S]*득점 선수[\s\S]*퇴장 선수/);
    // 색만으로 경고/퇴장을 구분하지 않는다(접근성 규칙) — 스크린리더용 텍스트가 함께 있어야 한다.
    expect(secondHalf).toHaveTextContent('옐로카드');
    expect(secondHalf).toHaveTextContent('레드카드');
  });

  it('색을 알 수 없는 과거 카드 기록도 색을 지어내지 않고 그대로 보여준다', () => {
    const data = { ...makeData(), items: [fixtureEntry({
      cards: [{ side: 'home', cardColor: null, participantName: '미상 카드', jerseyNumber: 3, period: 1, clockMs: 60_000 }],
    })] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    const firstHalf = screen.getByRole('group', { name: '전반 기록' });
    expect(firstHalf).toHaveTextContent('미상 카드');
    expect(firstHalf).toHaveTextContent('카드 색상 확인 필요');
    expect(firstHalf).not.toHaveTextContent('옐로카드');
    expect(firstHalf).not.toHaveTextContent('레드카드');
  });

  it('골이 없고 카드만 있어도 요약 줄을 렌더한다', () => {
    const data = { ...makeData(), items: [fixtureEntry({
      cards: [{ side: 'home', cardColor: 'YELLOW', participantName: '경고 선수', jerseyNumber: 4, period: 1, clockMs: 60_000 }],
    })] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getByRole('list', { name: '경기 기록' })).toBeInTheDocument();
  });
});

/**
 * alpha 실측 회귀(2026-08-18). "우리 팀" 행의 파란 배경을 절제하며 `--grey50`으로
 * 바꿨는데, 스코어 칸 pill이 이미 `--grey50`이라 **두 색이 정확히 같아져 스코어가
 * 배경에 통째로 녹았다**(실측: rowBg === pillBg === rgb(249,250,251)). 스코어는 이
 * 카드에서 가장 먼저 읽히는 값이라 그게 사라지면 강조를 절제한 게 아니라 정보를
 * 지운 것이다. 색 값 자체를 단언하지 않고(그건 구현 되읊기다) **두 배경이 서로
 * 달라야 한다는 불변식**만 본다.
 */
describe('ScheduleContent — 우리 팀 행에서도 스코어가 배경에 묻히지 않는다', () => {
  it('내 팀 경기 행의 배경과 스코어 칸 배경이 같은 색이 아니다', () => {
    const myFixtures = {
      teams: [
        {
          registrationId: 'reg-1',
          teamId: 'team-1',
          teamName: '우리팀',
          fixtures: [
            { fixtureId: 'fixture-1', lineupState: 'SUBMITTED', scheduledAt: null, opponentTeamName: '상대팀' },
          ],
        },
      ],
    } as unknown as Parameters<typeof ScheduleContent>[0]['myFixtures'];

    render(
      <ScheduleContent
        tournamentId="tour-1"
        data={{ ...makeData(), items: [fixtureEntry()] }}
        myFixtures={myFixtures}
      />,
    );

    const scorePill = screen.getByText('1 : 0');
    const row = scorePill.closest('a');
    const highlighted = row?.parentElement;

    // 양쪽 모두 실제로 배경을 갖고 있어야 한다 — 둘 다 빈 문자열이면 아래 단언이 공허하게 통과한다.
    expect(highlighted?.style.background).not.toBe('');
    expect(scorePill.style.background).not.toBe('');
    expect(highlighted?.style.background).not.toBe(scorePill.style.background);
  });
});

/**
 * **경기 하나가 카드 하나**다. 예전엔 카드 한 장을 grid 로 쪼개서 화면에는 한 장을 반으로
 * 자른 것처럼 보였고 경기마다 테두리가 없었다(오너 지적: "각각 카드로 나눠져야하는데
 * 지금은 하나의 카드를 2개로 나눈거잖아"). 테두리는 **클래스**로 그린다 — 인라인 style 로
 * 되돌아가면 데스크톱 열 배치를 다루는 미디어쿼리가 특이도에서 진다.
 */
describe('ScheduleContent — 경기 하나가 카드 하나다', () => {
  it('경기마다 카드 클래스를 갖고, 인라인 border 를 직접 들고 있지 않다', () => {
    render(
      <ScheduleContent
        tournamentId="tour-1"
        data={{ ...makeData(), items: [fixtureEntry(), fixtureEntry({ fixtureId: 'fixture-2' })] }}
      />,
    );

    const rows = screen.getAllByRole('link').filter((a) => /\/matches\//.test(a.getAttribute('href') ?? ''));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toHaveClass('tm-schedule-card');
      expect(row.style.borderTop).toBe('');
      expect(row.style.border).toBe('');
    }
  });
});

describe('ScheduleContent — 시간 미정 경기', () => {
  /**
   * 오너 지적("조도 중복되고"): 예전엔 이 목록을 한 줄로 흘려보내서, 같은 조의 경기가
   * 여러 개면 카드마다 `A조` 가 그대로 반복됐다. 일정이 잡힌 목록은 이미 제목 한 번 +
   * 카드 라벨 생략으로 처리하고 있었다 — 여기도 같은 모양이어야 한다.
   */
  it('같은 조의 미정 경기가 여러 개여도 조 이름은 한 번만 나온다', () => {
    const data = makeData({
      unscheduled: [
        fixtureEntry({ fixtureId: 'u-1', scheduledAt: null, groupName: 'A조', fixtureNumber: 1 }),
        fixtureEntry({ fixtureId: 'u-2', scheduledAt: null, groupName: 'A조', fixtureNumber: 2 }),
      ],
    });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getAllByText('A조')).toHaveLength(1);
  });

  it('조가 다르면 각각 제목이 선다', () => {
    const data = makeData({
      unscheduled: [
        fixtureEntry({ fixtureId: 'u-1', scheduledAt: null, groupName: 'A조', fixtureNumber: 1 }),
        fixtureEntry({ fixtureId: 'u-2', scheduledAt: null, groupName: 'B조', fixtureNumber: 2 }),
      ],
    });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getAllByText('A조')).toHaveLength(1);
    expect(screen.getAllByText('B조')).toHaveLength(1);
  });

  /**
   * 오너 지적("미정 vs 미정"): 양쪽이 다 미정인 자리에 `미정  - : -  미정` 을 그리면
   * 같은 말이 반복되고 스코어 pill 도 빈 채로 남아 고장난 카드처럼 읽힌다.
   */
  it('양쪽 팀이 다 미정이면 가짜 스코어라인 대신 "대진 확정 전" 한 줄만 보여준다', () => {
    const data = makeData({
      unscheduled: [
        fixtureEntry({
          fixtureId: 'u-1',
          scheduledAt: null,
          groupName: null,
          round: '4강',
          home: null,
          away: null,
          score: null,
          scoreStatus: 'unavailable',
          status: 'scheduled',
          resultState: 'pending',
        }),
      ],
    });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getByText('대진 확정 전')).toBeInTheDocument();
    expect(screen.queryByText('미정')).not.toBeInTheDocument();
    expect(screen.queryByText('- : -')).not.toBeInTheDocument();
  });

  /** 한쪽만 미정인 경우는 실제로 알려주는 정보다 — 접지 않는다. */
  it('한쪽 팀만 미정이면 상대 팀명과 함께 그대로 보여준다', () => {
    const data = makeData({
      unscheduled: [
        fixtureEntry({
          fixtureId: 'u-1',
          scheduledAt: null,
          round: '4강',
          groupName: null,
          away: null,
          score: null,
          scoreStatus: 'unavailable',
          status: 'scheduled',
          resultState: 'pending',
        }),
      ],
    });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getByText('홈팀')).toBeInTheDocument();
    expect(screen.getByText('미정')).toBeInTheDocument();
    expect(screen.queryByText('대진 확정 전')).not.toBeInTheDocument();
  });
});

/**
 * 일정 목록에서 몰수 0:0 과 실제 0:0 무승부가 같아 보이면, 순위표에 무승부로 집계된
 * 이유를 관전자가 목록에서 추적할 수 없다(alpha 실측: 세 팀이 나란히 2점인데 그중 두
 * 경기가 몰수라는 사실이 목록 어디에도 없었다).
 */
describe('ScheduleContent — 몰수·중단 배지', () => {
  it('몰수로 끝난 경기 카드에 사유 라벨을 붙인다', () => {
    const data = makeData({
      items: [fixtureEntry({ score: { home: 0, away: 0, penalties: null }, outcome: { reason: 'FORFEIT', note: '원정팀 미출석' } })],
    });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getByText('몰수·기권')).toBeInTheDocument();
  });

  it('경기 중단은 몰수와 다른 라벨로 구분한다', () => {
    const data = makeData({ items: [fixtureEntry({ outcome: { reason: 'ABANDONED', note: null } })] });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getByText('경기 중단')).toBeInTheDocument();
    expect(screen.queryByText('몰수·기권')).not.toBeInTheDocument();
  });

  it('정상 종료 경기에는 배지를 붙이지 않는다', () => {
    const data = makeData({ items: [fixtureEntry({ outcome: null })] });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.queryByText('몰수·기권')).not.toBeInTheDocument();
    expect(screen.queryByText('경기 중단')).not.toBeInTheDocument();
  });

  it('사유 본문은 카드에 넣지 않는다 — 카드는 한 줄 요약이 계약이다', () => {
    const data = makeData({ items: [fixtureEntry({ outcome: { reason: 'FORFEIT', note: '원정팀이 킥오프 15분 경과까지 미출석' } })] });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.queryByText(/킥오프 15분 경과까지 미출석/)).not.toBeInTheDocument();
  });
});

/**
 * **리그 어휘(2026-09-01 사용자 확정 — B안).**
 *
 * 리그 대진은 `round` 가 'N주차' 라 `isGroupStage` 가 false 가 되어 **전부 `knockout` 단계로
 * 분류된다.** 그 단계 이름이 필터 칩과 `section aria-label` 로 **보이는데**, 대회 어휘인
 * '결선' 은 리그에 존재하지 않는 단계다.
 *
 * ⚠️ 이 describe 는 **변이로 구멍을 확인하고 나서** 썼다: `LEAGUE_PHASE_LABELS.knockout` 을
 * '결선' 으로 되돌려도 프론트 308개가 전부 통과했다. 사용자가 고른 바로 그 문구를 아무도
 * 지키지 않고 있었다.
 *
 * 상수만 보는 순수 함수 테스트로는 부족하다 — `ScheduleContent` 가 `phaseLabels` 를 넘기지
 * 않으면 상수가 맞아도 화면엔 '결선' 이 뜬다. 그래서 **렌더해서 본다.**
 */
describe('ScheduleContent — 정규 리그 단계 어휘', () => {
  const leagueData = () =>
    makeData({ items: [fixtureEntry({ round: '1주차', groupName: null })] });

  it('리그면 단계 칩을 "정규 라운드" 로 부른다 — 리그엔 결선이 없다', () => {
    render(<ScheduleContent tournamentId="league-1" data={leagueData()} isRegularLeague />);

    expect(screen.getByRole('tab', { name: '정규 라운드' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '결선' })).not.toBeInTheDocument();
  });

  it('대조군: 대회는 "결선" 그대로 — 리그 방식 대회 7건의 문구를 바꾸지 않는다', () => {
    render(<ScheduleContent tournamentId="tour-1" data={leagueData()} />);

    expect(screen.getByRole('tab', { name: '결선' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '정규 라운드' })).not.toBeInTheDocument();
  });

  /**
   * 칩만 보면 놓치는 자리 — 단계 제목은 `phases.length > 1` 이라 화면에서 숨겨지는데
   * `section aria-label` 로는 **항상** 나간다. 스크린리더 사용자에게만 '결선' 이 들린다.
   */
  it('section aria-label 에도 리그 어휘가 들어간다 — 눈에 안 보이는 자리', () => {
    render(<ScheduleContent tournamentId="league-1" data={leagueData()} isRegularLeague />);

    expect(screen.getByRole('region', { name: '정규 라운드' })).toBeInTheDocument();
  });
});

/**
 * **alpha 실측으로 잡힌 어휘 결함(2026-09-01).** 리그 화면의 순위 제목이 대회 말인
 * **"조별 순위"** 로 떠 있었다 — B안 어휘 정리에서 빠진 자리다.
 *
 * 그리고 그냥 "리그 순위" 로 바꾸면 **두 번 적힌다**: 바깥 제목과 안쪽 그룹 라벨이 같은
 * 말이 된다(티어가 없는 단발 리그의 `groupName` 이 "리그 순위" 다). 그래서 그룹이 하나뿐일
 * 때는 안쪽 라벨을 끈다 — 티어가 있으면(1부·2부) 그건 다른 말이라 그대로 둔다.
 */
describe('ScheduleContent — 정규 리그 순위 제목', () => {
  const leagueStandings = (groupName: string, groupId: string, teamName: string) => ({
    groupId,
    groupName,
    teamId: `team-${groupId}`,
    teamName,
    teamLogoUrl: null,
    position: 1,
    points: 3,
    wins: 1,
    draws: 0,
    losses: 0,
    goalsFor: 2,
    goalsAgainst: 1,
  });

  it('리그에는 "조별 순위" 라고 쓰지 않는다 — 리그엔 조가 없다', () => {
    const data = makeData({ standings: [leagueStandings('리그 순위', 'lg-1', '성수 FC')] as never });
    render(<ScheduleContent tournamentId="lg-1" data={data} isRegularLeague />);

    expect(screen.getByRole('heading', { name: '리그 순위' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '조별 순위' })).not.toBeInTheDocument();
  });

  it('대조군: 대회는 "조별 순위" 그대로', () => {
    const data = makeData({ standings: [leagueStandings('A조', 'g-1', '망원 FC')] as never });
    render(<ScheduleContent tournamentId="t-1" data={data} />);

    expect(screen.getByRole('heading', { name: '조별 순위' })).toBeInTheDocument();
  });

  it('단발 리그는 안쪽 그룹 라벨을 숨긴다 — 제목과 같은 말이 두 번 적힌다', () => {
    const data = makeData({ standings: [leagueStandings('리그 순위', 'lg-1', '성수 FC')] as never });
    render(<ScheduleContent tournamentId="lg-1" data={data} isRegularLeague />);

    // 제목(h3) 하나만 남고 그룹 라벨 div 는 안 그려진다 — 라벨을 켜면 2가 된다.
    expect(screen.getAllByText('리그 순위')).toHaveLength(1);
  });

  it('티어가 있는 리그는 안쪽 라벨을 그린다 — "1부"·"2부" 는 제목과 다른 말이다', () => {
    const data = makeData({
      standings: [
        leagueStandings('1부', 'lg-1', '성수 FC'),
        leagueStandings('2부', 'lg-2', '왕십리 FC'),
      ] as never,
    });
    render(<ScheduleContent tournamentId="lg-1" data={data} isRegularLeague />);

    expect(screen.getByText('1부')).toBeInTheDocument();
    expect(screen.getByText('2부')).toBeInTheDocument();
  });
});
