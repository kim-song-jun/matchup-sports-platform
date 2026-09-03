import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fetchPublicV1 } from '@/lib/seo';
import {
  formatScoreline,
  presentParticipantName,
  resultStateLabel,
  teamRecordResultLabel,
  userRecordResultLabel,
  WITHHELD_IDENTITY_LABEL,
} from '@/components/public-game-records/format';
import { MatchDetailContent } from '@/components/public-game-records/match-detail-content';
import { ScheduleContent } from '@/components/public-game-records/schedule-content';
import { TeamRecordsContent } from '@/components/public-game-records/team-records-content';
import { UserRecordsContent } from '@/components/public-game-records/user-records-content';
import { queryImageBySrc } from '@/test/next-image';
import type {
  PublicMatchDetail,
  PublicTeamRecordEvent,
  PublicTeamRecordsResponse,
  PublicTournamentScheduleResponse,
  PublicUserRecordsResponse,
} from '@/components/public-game-records/types';
import TournamentSchedulePage from './tournaments/[id]/schedule/page';
import TournamentMatchPage from './tournaments/[id]/matches/[fixtureId]/page';
import TeamRecordsPage from './teams/[id]/records/page';
import UserRecordsPage from './users/[id]/records/page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/seo', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/seo')>();
  return {
    ...original,
    fetchPublicV1: vi.fn(),
  };
});

vi.mock('./tournaments/[id]/schedule/schedule-page-client', () => ({
  SchedulePageClient: () => null,
}));
vi.mock('./tournaments/[id]/matches/[fixtureId]/match-page-client', () => ({
  MatchPageClient: () => null,
}));
vi.mock('./teams/[id]/records/team-records-page-client', () => ({
  TeamRecordsPageClient: () => null,
}));
vi.mock('./users/[id]/records/user-records-page-client', () => ({
  UserRecordsPageClient: () => null,
}));

const MISSING_ID = '00000000-0000-4000-8000-ffffffffffff';

/* ── 순수 함수: format.ts ── */

describe('presentParticipantName', () => {
  it('동의 철회/미동의로 서버가 null을 내려주면 고정된 익명 라벨을 보여준다 (실명을 암시하지 않음)', () => {
    expect(presentParticipantName(null)).toBe(WITHHELD_IDENTITY_LABEL);
  });

  it('닉네임 스냅샷이 있으면 그대로 보여준다', () => {
    expect(presentParticipantName('홍길동')).toBe('홍길동');
  });
});

describe('resultStateLabel / formatScoreline', () => {
  it('void/corrected 상태는 서로 다른 라벨을 갖는다 (같은 라벨로 뭉개지지 않음)', () => {
    expect(resultStateLabel('void')).not.toBe(resultStateLabel('corrected'));
    expect(resultStateLabel('official')).not.toBe(resultStateLabel('pending'));
  });

  it('scoreStatus가 unavailable이면 score가 있어도 숫자를 절대 보여주지 않는다', () => {
    expect(formatScoreline({ home: 3, away: 1, penalties: null }, 'unavailable')).toBe('- : -');
  });

  it('official 스코어는 그대로 숫자로 렌더한다', () => {
    expect(formatScoreline({ home: 2, away: 0, penalties: null }, 'official')).toBe('2 : 0');
  });
});

describe('teamRecordResultLabel / userRecordResultLabel', () => {
  it('팀 전적 결과 코드를 한국어로 매핑한다', () => {
    expect(teamRecordResultLabel('WON')).toBe('승');
    expect(teamRecordResultLabel('LOST')).toBe('패');
    expect(teamRecordResultLabel('DRAWN')).toBe('무');
  });

  it('개인 기록 result가 null이면(스코어 미해결) 대시로 떨어진다', () => {
    expect(userRecordResultLabel(null)).toBe('-');
    expect(userRecordResultLabel('WON')).toBe('승');
  });
});

/* ── 컴포넌트: consent-withheld identity 렌더링 ── */

function makeMatch(overrides: Partial<PublicMatchDetail> = {}): PublicMatchDetail {
  return {
    tournamentId: 'tournament-1',
    tournamentTitle: '테스트 대회',
    fixtureId: 'fixture-1',
    gameId: 'game-1',
    round: '결승',
    fixtureNumber: 1,
    legNumber: 1,
    groupId: null,
    groupName: null,
    scheduledAt: '2026-08-10T09:00:00.000Z',
    venue: null,
    fieldName: null,
    home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '서울 유나이티드' },
    away: { registrationId: 'reg-away', teamId: 'team-away', teamName: '부산 FC' },
    visibilityMode: 'official_only',
    status: 'ended',
    resultState: 'official',
    scoreStatus: 'official',
    score: { home: 2, away: 1, penalties: null },
    clock: null,
    periodBreak: null,
    lineup: {
      home: [{ participantId: 'p-1', displayName: null, jerseyNumber: 7, position: 'FW', profileHref: null }],
      away: [{ participantId: 'p-2', displayName: '이몽룡', jerseyNumber: 10, position: 'MF', profileHref: null }],
    },
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

describe('MatchDetailContent — 동의 게이트된 신원 표시', () => {
  it('displayName이 null인 라인업 슬롯은 실명을 암시하지 않는 고정 익명 라벨로 렌더한다', () => {
    render(<MatchDetailContent data={makeMatch()} />);
    expect(screen.getByText(WITHHELD_IDENTITY_LABEL)).toBeInTheDocument();
  });

  it('동의가 있는 참가자는 실제 닉네임 스냅샷을 그대로 보여준다', () => {
    render(<MatchDetailContent data={makeMatch()} />);
    expect(screen.getByText('이몽룡')).toBeInTheDocument();
  });

  it('MVP도 동일한 규칙을 따른다 -- displayName null이면 익명 라벨', () => {
    render(
      <MatchDetailContent
        data={makeMatch({ mvp: { participantId: 'p-1', displayName: null, profileHref: null } })}
      />,
    );
    // 라인업(p-1)과 MVP 카드 두 곳 모두 익명 라벨이 노출된다
    expect(screen.getAllByText(WITHHELD_IDENTITY_LABEL).length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * 배지를 `role="status"` 로 찾지 않는다 — 이 배지들은 렌더 후 변하지 않는 정적 텍스트라
 * live region 을 떼어냈다(스크린리더가 상태 변경으로 오인해 공지하는 문제). role 로 찾던
 * 단언을 그대로 두면 세 번째 테스트("배지를 렌더하지 않는다")가 **role 이 없다는 이유만으로
 * 항상 통과**해 버려, 배지가 잘못 뜨는 회귀를 못 잡는다. 표시 텍스트로 고정한다.
 */
describe('MatchDetailContent — 정정/무효 상태 표시', () => {
  it('void 상태는 무효 처리 배지를 보여준다', () => {
    render(<MatchDetailContent data={makeMatch({ resultState: 'void' })} />);
    expect(screen.getByText('무효 처리')).toBeInTheDocument();
  });

  it('corrected 상태는 정정된 결과 배지를 보여준다', () => {
    render(<MatchDetailContent data={makeMatch({ resultState: 'corrected' })} />);
    expect(screen.getByText('정정된 결과')).toBeInTheDocument();
  });

  it('official/pending 상태는 배지를 렌더하지 않는다', () => {
    render(<MatchDetailContent data={makeMatch({ resultState: 'official' })} />);
    expect(screen.queryByText('무효 처리')).not.toBeInTheDocument();
    expect(screen.queryByText('정정된 결과')).not.toBeInTheDocument();
  });

  it('정정 이력(history)의 정정 여부(isCorrection)에 따라 라벨이 갈린다', () => {
    render(
      <MatchDetailContent
        data={makeMatch({
          history: [
            { revision: 1, state: 'OFFICIAL', officialAt: '2026-08-10T11:00:00.000Z', reason: null, isCorrection: false },
            { revision: 2, state: 'OFFICIAL', officialAt: '2026-08-11T11:00:00.000Z', reason: '오심 정정', isCorrection: true },
          ],
        })}
      />,
    );
    expect(screen.getByText('확정 · 1차')).toBeInTheDocument();
    expect(screen.getByText('정정 · 2차')).toBeInTheDocument();
    expect(screen.getByText('오심 정정')).toBeInTheDocument();
  });
});

/* ── 컴포넌트: 팀/개인 기록 행 ── */

function makeTeamRecords(overrides: Partial<PublicTeamRecordsResponse> = {}): PublicTeamRecordsResponse {
  return {
    teamId: 'team-1',
    teamName: '서울 유나이티드',
    teamLogoUrl: '/uploads/teams/seoul.png',
    availableSeasons: ['2026'],
    summary: {
      played: 1,
      won: 1,
      drawn: 0,
      lost: 0,
      goalsFor: 2,
      goalsAgainst: 1,
      byType: {
        league: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
        tournament: { played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1 },
        friendly: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
      },
    },
    items: [
      {
        gameId: 'game-1',
        teamMatchId: null,
        tournamentId: 'tournament-1',
        tournamentTitle: '테스트 대회',
        leagueId: null,
        leagueTitle: null,
        type: 'tournament',
        opponentTeamId: 'team-away',
        opponentTeamName: '부산 FC',
        opponentTeamLogoUrl: '/uploads/teams/busan.png',
        result: 'WON',
        goalsFor: 2,
        goalsAgainst: 1,
        penalties: null,
        events: [],
        playedAt: '2026-08-09T02:00:00.000Z',
      },
    ],
    nextCursor: null,
    ...overrides,
  };
}

function makeTeamRecordEvent(overrides: Partial<PublicTeamRecordEvent> = {}): PublicTeamRecordEvent {
  return {
    id: 'event-1',
    type: 'GOAL',
    side: 'own',
    profileHref: null,
    participantName: '홍길동',
    jerseyNumber: 9,
    period: 1,
    clockMs: 12 * 60_000,
    cardColor: null,
    ...overrides,
  };
}

describe('TeamRecordsContent — 팀 로고', () => {
  it('현재 팀과 상대 팀의 저장된 로고를 표시한다', () => {
    const { container } = render(<TeamRecordsContent data={makeTeamRecords()} />);

    // next/image 전환(U15) 이후 실제 DOM src는 `/_next/image?url=...`로 재작성된다 —
    // 원본 경로는 그 url 쿼리 파라미터를 디코딩해야 확인할 수 있다.
    expect(queryImageBySrc(container, '/uploads/teams/seoul.png')).not.toBeNull();
    expect(queryImageBySrc(container, '/uploads/teams/busan.png')).not.toBeNull();
  });
});

/**
 * U2 -- 탭이 요약(KPI)과 목록을 함께 전환한다(B안). 서버는 `summary.byType`를
 * `type` 필터와 무관하게 항상 전체 기준으로 내려주므로(백엔드 계약), 탭 전환은
 * 새 계산 없이 이 맵에서 값을 그대로 꺼내는 것으로 끝나야 한다 -- 계산이 섞이면
 * 서버가 낸 숫자와 화면이 보여주는 숫자가 갈릴 수 있다.
 */
describe('TeamRecordsContent — 종류 탭 (U2)', () => {
  // 득실차(played - X 아님, goalsFor-goalsAgainst)가 played 와 우연히 같은 값이
  // 되지 않도록 의도적으로 서로 다른 숫자를 골랐다 -- KPIStat 은 값만 렌더하고
  // 단위가 없는 카드(득실차)도 있어서, 두 카드가 같은 숫자면 `getByText` 가
  // "여러 요소 매치"로 실패한다.
  function withByType(overrides: Partial<PublicTeamRecordsResponse['summary']['byType']> = {}) {
    return makeTeamRecords({
      summary: {
        played: 12,
        won: 6,
        drawn: 3,
        lost: 3,
        goalsFor: 25,
        goalsAgainst: 11, // diff = 14
        byType: {
          league: { played: 4, won: 2, drawn: 1, lost: 1, goalsFor: 9, goalsAgainst: 4 }, // diff = 5
          tournament: { played: 5, won: 3, drawn: 1, lost: 1, goalsFor: 12, goalsAgainst: 5 }, // diff = 7
          friendly: { played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 4, goalsAgainst: 2 }, // diff = 2
          ...overrides,
        },
      },
    });
  }

  it('앱 여정 순서대로 전체, 대회, 리그, 친선 탭을 배치한다', () => {
    render(<TeamRecordsContent data={withByType()} activeType="all" onChangeType={vi.fn()} />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '전체',
      '대회',
      '리그',
      '친선',
    ]);
  });

  it('정규 리그 탭을 고르면 KPI가 summary.byType.league 값으로 바뀐다 (전체 기준으로 새로 계산하지 않는다)', () => {
    render(<TeamRecordsContent data={withByType()} activeType="league" onChangeType={vi.fn()} />);

    // 전체 기준(12경기)이 아니라 리그 기준(4경기) 값이어야 한다.
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2·1·1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // 득실차 9-4
    expect(screen.queryByText('12')).not.toBeInTheDocument();
    expect(screen.queryByText('6·3·3')).not.toBeInTheDocument();
  });

  it('전체 탭이면 KPI가 summary(전체 기준) 그대로다', () => {
    render(<TeamRecordsContent data={withByType()} activeType="all" onChangeType={vi.fn()} />);

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('6·3·3')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument(); // 득실차 25-11
  });

  it('탭 클릭이 onChangeType으로 선택된 종류를 그대로 전달한다', () => {
    const onChangeType = vi.fn();
    render(<TeamRecordsContent data={withByType()} activeType="all" onChangeType={onChangeType} />);

    fireEvent.click(screen.getByRole('tab', { name: '대회' }));

    expect(onChangeType).toHaveBeenCalledWith('tournament');
  });

  it('활성 탭은 색만이 아니라 aria-selected로도 표시된다', () => {
    render(<TeamRecordsContent data={withByType()} activeType="friendly" onChangeType={vi.fn()} />);

    expect(screen.getByRole('tab', { name: '친선' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '전체' })).toHaveAttribute('aria-selected', 'false');
  });

  it('선택한 종류에 경기가 0건이면 안내 문구를 보여주되 KPI는 0을 그대로 보여준다', () => {
    const data = withByType({ tournament: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 } });
    render(<TeamRecordsContent data={{ ...data, items: [] }} activeType="tournament" onChangeType={vi.fn()} />);

    expect(screen.getByText('아직 대회 경기가 없어요')).toBeInTheDocument();
    // EmptyState 로 대체되지 않고 KPI 카드는 여전히 0을 보여준다.
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.getByText('0·0·0')).toBeInTheDocument();
  });
});

/**
 * 시즌 드롭다운 -- 선택지는 하드코딩 연도 목록이 아니라 응답의 `availableSeasons`
 * 그대로 렌더돼야 한다(과제 지시: "선택지 소스: ... 하드코딩 연도 목록 금지").
 */
describe('TeamRecordsContent — 시즌 드롭다운', () => {
  it('onChangeSeason 미전달 시 드롭다운을 렌더하지 않는다', () => {
    render(<TeamRecordsContent data={makeTeamRecords()} />);

    expect(screen.queryByLabelText('시즌')).not.toBeInTheDocument();
  });

  it('선택지가 하드코딩이 아니라 응답의 availableSeasons 그대로 렌더된다', () => {
    const data = makeTeamRecords({ availableSeasons: ['2026', '2025', '2024'] });
    render(<TeamRecordsContent data={data} onChangeSeason={vi.fn()} />);

    const select = screen.getByLabelText('시즌') as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((option) => option.textContent);
    expect(optionLabels).toEqual(['전체 시즌', '2026시즌', '2025시즌', '2024시즌']);
  });

  it('시즌이 1개뿐이어도 드롭다운을 숨기지 않는다', () => {
    const data = makeTeamRecords({ availableSeasons: ['2026'] });
    render(<TeamRecordsContent data={data} onChangeSeason={vi.fn()} />);

    expect(screen.getByLabelText('시즌')).toBeInTheDocument();
  });

  it('기본값은 "전체 시즌"(activeSeason 미전달)이다', () => {
    const data = makeTeamRecords({ availableSeasons: ['2026'] });
    render(<TeamRecordsContent data={data} onChangeSeason={vi.fn()} />);

    expect((screen.getByLabelText('시즌') as HTMLSelectElement).value).toBe('all');
  });

  it('시즌 선택이 onChangeSeason으로 선택된 연도를 그대로 전달한다', () => {
    const onChangeSeason = vi.fn();
    const data = makeTeamRecords({ availableSeasons: ['2026', '2025'] });
    render(<TeamRecordsContent data={data} activeSeason="2026" onChangeSeason={onChangeSeason} />);

    fireEvent.change(screen.getByLabelText('시즌'), { target: { value: '2025' } });

    expect(onChangeSeason).toHaveBeenCalledWith('2025');
  });

  it('"전체 시즌" 재선택 시 onChangeSeason이 undefined로 호출된다', () => {
    const onChangeSeason = vi.fn();
    const data = makeTeamRecords({ availableSeasons: ['2026'] });
    render(<TeamRecordsContent data={data} activeSeason="2026" onChangeSeason={onChangeSeason} />);

    fireEvent.change(screen.getByLabelText('시즌'), { target: { value: 'all' } });

    expect(onChangeSeason).toHaveBeenCalledWith(undefined);
  });
});

describe('TeamRecordsContent — 승부차기 보조 표기', () => {
  it('penalties가 있으면 정규시간 스코어 아래에 "승부차기 N-M" 을 보여준다', () => {
    const data = makeTeamRecords({
      items: [{ ...makeTeamRecords().items[0], goalsFor: 1, goalsAgainst: 1, penalties: { for: 4, against: 3 } }],
    });
    render(<TeamRecordsContent data={data} />);

    // 정규시간 스코어(1 : 1)는 그대로 남아있고, 승부차기 스코어로 대체되지 않는다.
    expect(screen.getByText('1 : 1')).toBeInTheDocument();
    expect(screen.getByText('승부차기 4-3')).toBeInTheDocument();
  });

  it('penalties가 null이면 승부차기 보조 텍스트를 렌더하지 않는다', () => {
    render(<TeamRecordsContent data={makeTeamRecords()} />);
    expect(screen.queryByText(/승부차기/)).not.toBeInTheDocument();
  });
});

/**
 * 팀 전적의 골/카드 이름도 공개 프로필로 잇는다(#707 의 경기 상세와 같은 규칙).
 * 열어도 되는지는 서버가 `profileHref` 로 판단해 내려주므로 화면은 있으면 링크, 없으면
 * 그냥 글자다 — 화면이 동의·계정 유무를 다시 따지기 시작하면 서버와 갈린다.
 */
describe('TeamRecordsContent — 선수 이름 프로필 링크', () => {
  function withEvents(events: PublicTeamRecordEvent[]) {
    return makeTeamRecords({ items: [{ ...makeTeamRecords().items[0], events }] });
  }

  it('profileHref 가 있으면 이름을 링크로 만든다', () => {
    render(<TeamRecordsContent data={withEvents([makeTeamRecordEvent({ participantName: '홍길동', profileHref: '/users/u-1' })])} />);

    fireEvent.click(screen.getByRole('button', { name: /전 경기 기록 펼치기/ }));

    expect(screen.getByRole('link', { name: '홍길동' })).toHaveAttribute('href', '/users/u-1');
  });

  it('profileHref 가 없으면 링크를 만들지 않는다 (이름은 그대로 보인다)', () => {
    render(<TeamRecordsContent data={withEvents([makeTeamRecordEvent({ participantName: '홍길동', profileHref: null })])} />);

    fireEvent.click(screen.getByRole('button', { name: /전 경기 기록 펼치기/ }));

    expect(screen.getByText('홍길동')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '홍길동' })).not.toBeInTheDocument();
  });
});

describe('TeamRecordsContent — 경기 기록 아코디언', () => {
  it('이벤트가 없는 행은 펼치기 버튼을 렌더하지 않는다', () => {
    render(<TeamRecordsContent data={makeTeamRecords()} />);
    expect(screen.queryByRole('button', { name: /전 경기 기록/ })).not.toBeInTheDocument();
  });

  it('펼치기 전에는 골/카드 타임라인이 보이지 않고, 버튼을 누르면 보이며 aria-expanded가 바뀐다', () => {
    const data = makeTeamRecords({
      items: [
        {
          ...makeTeamRecords().items[0],
          events: [
            makeTeamRecordEvent({ id: 'g1', type: 'GOAL', side: 'own', participantName: '홍길동', clockMs: 12 * 60_000 }),
            makeTeamRecordEvent({ id: 'c1', type: 'CARD', side: 'opponent', cardColor: 'YELLOW', participantName: '김철수', clockMs: 20 * 60_000 }),
          ],
        },
      ],
    });
    render(<TeamRecordsContent data={data} />);

    const toggle = screen.getByRole('button', { name: /부산 FC 전 경기 기록 펼치기/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('홍길동')).not.toBeInTheDocument();
    expect(screen.queryByText('김철수')).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText('12′')).toBeInTheDocument();
    expect(screen.getByText('김철수')).toBeInTheDocument();
    expect(screen.getByText('20′')).toBeInTheDocument();
  });

  it('행 전체를 감싼 상세 링크는 그대로 유지된다(펼치기와 별개)', () => {
    const data = makeTeamRecords({
      items: [{ ...makeTeamRecords().items[0], events: [makeTeamRecordEvent()] }],
    });
    const { container } = render(<TeamRecordsContent data={data} />);
    const link = container.querySelector('a[href="/tournaments/tournament-1"]');
    expect(link).toBeInTheDocument();
    // 버튼은 <a> 안이 아니라 형제 요소여야 한다(a 안에 button 중첩 금지).
    expect(link?.querySelector('button')).toBeNull();
  });

  it('결과 정정 시각이 아니라 실제 경기 일자를 표시한다', () => {
    render(<TeamRecordsContent data={makeTeamRecords()} />);
    expect(screen.getByText(/8\/9 \(일\)/)).toBeInTheDocument();
  });
});

function makeUserRecords(overrides: Partial<PublicUserRecordsResponse> = {}): PublicUserRecordsResponse {
  return {
    userId: 'user-1',
    nickname: '홍길동',
    // 기본값은 **타인 조회** 형태다 — 서버는 이때 `consentGranted` 키를 아예 싣지 않으므로
    // 픽스처도 그 형태를 그대로 따른다. 여기에 값을 넣어두면 "타인에게도 동의 상태가
    // 보인다"는 잘못된 계약을 테스트가 정상으로 통과시킨다.
    viewerIsOwner: false,
    summary: {
      appearances: 1,
      goals: 1,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      mvpCount: 1,
      matchMvpCount: 1,
      tournamentAwardCount: 0,
      // 이 픽스처의 유일한 아이템이 대회 경기다 — 합이 전체와 맞아야 화면의 탭 KPI 가
      // 실제 데이터와 어긋나지 않는다.
      byType: {
        tournament: { appearances: 1, goals: 1, assists: 0, yellowCards: 0, redCards: 0, mvpCount: 1 },
        league: { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, mvpCount: 0 },
        friendly: { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, mvpCount: 0 },
      },
    },
    tournamentAwards: [],
    items: [
      {
        id: 'result-1',
        gameId: 'game-1',
        type: 'tournament',
        matchType: 'tournament',
        tournamentId: 'tournament-1',
        tournamentTitle: '테스트 대회',
        leagueId: null,
        leagueTitle: null,
        round: '결승',
        teamId: 'team-1',
        teamName: '서울 유나이티드',
        opponentTeamId: 'team-away',
        opponentTeamName: '부산 FC',
        result: 'WON',
        goals: 1,
        cards: { yellow: 0, red: 0 },
        minutesPlayed: 90,
        started: true,
        goalkeeper: false,
        mvp: true,
        officialAt: '2026-08-10T11:00:00.000Z',
      },
    ],
    nextCursor: null,
    ...overrides,
  };
}

describe('UserRecordsContent — 종류 탭 (Task 166 BE-4)', () => {
  // KPI 카드가 값만 렌더하므로 탭별 숫자를 서로 다르게 골라야 `getByText` 가
  // "여러 요소 매치" 로 실패하지 않는다(팀 전적 탭 스펙과 같은 이유).
  function withByType() {
    return makeUserRecords({
      summary: {
        appearances: 12,
        goals: 7,
        assists: 3,
        yellowCards: 1,
        redCards: 0,
        mvpCount: 2,
        matchMvpCount: 2,
        tournamentAwardCount: 1,
        byType: {
          league: { appearances: 4, goals: 6, assists: 1, yellowCards: 0, redCards: 0, mvpCount: 1 },
          tournament: { appearances: 5, goals: 4, assists: 2, yellowCards: 1, redCards: 0, mvpCount: 1 },
          friendly: { appearances: 3, goals: 1, assists: 0, yellowCards: 0, redCards: 0, mvpCount: 0 },
        },
      },
    });
  }

  it('팀 전적과 같은 순서로 전체·대회·리그·친선 탭을 배치한다', () => {
    render(<UserRecordsContent data={withByType()} activeType="all" onChangeType={vi.fn()} />);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '전체',
      '대회',
      '리그',
      '친선',
    ]);
  });

  it('리그 탭을 고르면 KPI 가 summary.byType.league 값으로 바뀐다 (전체로 새로 계산하지 않는다)', () => {
    render(<UserRecordsContent data={withByType()} activeType="league" onChangeType={vi.fn()} />);
    // 숫자는 서로 겹치지 않게 골랐다 — KPIStat 이 값만 렌더해서, 다른 카드(매치 MVP 2,
    // 대회 수상 1)와 같은 숫자면 getByText 가 "여러 요소 매치" 로 실패한다.
    expect(screen.getByText('4')).toBeInTheDocument(); // 엔트리 = byType.league.appearances
    expect(screen.getByText('6')).toBeInTheDocument(); // 골 = byType.league.goals
    // 전체 기준 숫자가 남아 있으면 탭이 아무것도 안 한 것이다.
    expect(screen.queryByText('12')).not.toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  });

  it('전체 탭이면 KPI 가 summary(전체 기준) 그대로다', () => {
    render(<UserRecordsContent data={withByType()} activeType="all" onChangeType={vi.fn()} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('탭을 고른 상태에서 그 종류가 0건이면 그 종류를 짚는 빈 상태를 보여준다', () => {
    // 전체 문구("아직 등록된 경기 기록이 없어요")를 그대로 쓰면, 다른 종류의 기록이
    // 있는데도 "기록이 없다" 로 읽힌다.
    render(
      <UserRecordsContent data={makeUserRecords({ items: [] })} activeType="friendly" onChangeType={vi.fn()} />,
    );
    expect(screen.getByText('아직 친선 경기가 없어요')).toBeInTheDocument();
  });

  it('onChangeType 을 안 넘기면 탭을 그리지 않는다 — 탭 없이 쓰는 화면 회귀', () => {
    render(<UserRecordsContent data={withByType()} />);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});

describe('UserRecordsContent — 기록 행', () => {
  it('출전·골·매치 MVP·대회 수상을 구분하고 실제 수상명을 표시한다', () => {
    render(
      <UserRecordsContent
        data={makeUserRecords({
          summary: {
            ...makeUserRecords().summary,
            tournamentAwardCount: 1,
          },
          tournamentAwards: [
            {
              id: 'award-1',
              tournamentId: 'tournament-1',
              tournamentTitle: '여름 챔피언십',
              awardType: 'best_playmaker',
              awardLabel: '베스트 플레이메이커',
              iconKey: 'star',
              teamName: '서울 유나이티드',
              note: null,
              awardedAt: '2026-08-10T11:00:00.000Z',
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('매치 MVP')).toBeInTheDocument();
    expect(screen.getAllByText('대회 수상').length).toBeGreaterThan(0);
    expect(screen.getByText('베스트 플레이메이커')).toBeInTheDocument();
    expect(screen.getByText(/여름 챔피언십/)).toBeInTheDocument();
  });

  it('MVP 행은 MVP 배지를 보여준다', () => {
    render(<UserRecordsContent data={makeUserRecords()} />);
    // KPI 요약 카드에도 "MVP" 라벨이 있어 텍스트만으로는 모호하다 -- 기록 행(목록) 안의
    // 배지(<span>)만 특정해서 확인한다.
    expect(screen.getByText('MVP', { selector: 'section span' })).toBeInTheDocument();
  });

  // F6 -- 리그 경기가 친선 팀매치와 구분 없이 이름 없는 행으로 남던 결함.
  it('정규 리그 대진 행은 대회 경기와 같은 표기로 리그명을 보여준다', () => {
    const base = makeUserRecords().items[0];
    render(
      <UserRecordsContent
        data={makeUserRecords({
          items: [
            {
              ...base,
              type: 'league',
              matchType: 'team_match',
              tournamentId: null,
              tournamentTitle: null,
              leagueId: 'league-1',
              leagueTitle: '2026 가을 정규 리그',
            },
          ],
        })}
      />,
    );

    expect(screen.getByText(/· 2026 가을 정규 리그/)).toBeInTheDocument();
  });

  it('리그가 아닌 친선 팀매치 행에는 대회·리그 이름이 붙지 않는다', () => {
    const base = makeUserRecords().items[0];
    render(
      <UserRecordsContent
        data={makeUserRecords({
          items: [
            {
              ...base,
              type: 'friendly',
              matchType: 'team_match',
              tournamentId: null,
              tournamentTitle: null,
              leagueId: null,
              leagueTitle: null,
            },
          ],
        })}
      />,
    );

    // 캡션은 날짜 하나로만 끝난다 -- ` · 이름` 꼬리가 붙지 않는다(회귀 금지).
    expect(screen.getByText(/^\d{1,2}\/\d{1,2} \(.\)$/)).toBeInTheDocument();
    expect(screen.queryByText(/· 테스트 대회/)).toBeNull();
  });
});

describe('UserRecordsContent — 본인 전용 공개 안내 배너', () => {
  it('본인 + 미동의(viewerIsOwner=true, consentGranted=false)면 배너를 보여준다', () => {
    render(
      <UserRecordsContent data={makeUserRecords({ viewerIsOwner: true, consentGranted: false })} />,
    );
    expect(screen.getByText('이 기록은 아직 나에게만 보여요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '경기 기록 공개 설정하기' })).toHaveAttribute(
      'href',
      '/my/settings/record-consent',
    );
  });

  it('본인 + 동의(viewerIsOwner=true, consentGranted=true)면 배너를 보여주지 않는다', () => {
    render(
      <UserRecordsContent data={makeUserRecords({ viewerIsOwner: true, consentGranted: true })} />,
    );
    expect(screen.queryByText('이 기록은 아직 나에게만 보여요')).not.toBeInTheDocument();
  });

  it('타인이 볼 때(viewerIsOwner=false)는 본인 동의 상태와 무관하게 배너를 보여주지 않는다', () => {
    render(
      <UserRecordsContent data={makeUserRecords({ viewerIsOwner: false, consentGranted: false })} />,
    );
    expect(screen.queryByText('이 기록은 아직 나에게만 보여요')).not.toBeInTheDocument();
  });

  it('본인 + 미동의여도 items가 0건이면(대회 라인업 연결 자체가 없음) 배너 대신 빈 상태만 보여준다', () => {
    render(
      <UserRecordsContent
        data={makeUserRecords({ viewerIsOwner: true, consentGranted: false, items: [] })}
      />,
    );
    // "숨겨진 기록이 있다"는 배너와 "기록이 아예 없다"는 EmptyState가 동시에 뜨면 모순된다.
    expect(screen.queryByText('이 기록은 아직 나에게만 보여요')).not.toBeInTheDocument();
    expect(screen.getByText('아직 등록된 경기 기록이 없어요')).toBeInTheDocument();
  });
});

/* ── 컴포넌트: 대회 일정의 hidden/void/corrected 배지 ── */

function makeSchedule(overrides: Partial<PublicTournamentScheduleResponse> = {}): PublicTournamentScheduleResponse {
  return {
    tournamentId: 'tournament-1',
    tournamentTitle: '테스트 대회',
    bracketPublished: true,
    items: [
      {
        fixtureId: 'fixture-1',
        round: '결승',
        fixtureNumber: 1,
        legNumber: 1,
        groupId: null,
        groupName: null,
        scheduledAt: '2026-08-10T09:00:00.000Z',
        venue: null,
        fieldId: null,
        fieldName: null,
        home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '서울 유나이티드' },
        away: { registrationId: 'reg-away', teamId: 'team-away', teamName: '부산 FC' },
        visibilityMode: 'official_only',
        status: 'ended',
        resultState: 'void',
        scoreStatus: 'unavailable',
        score: null,
        clock: null,
        periodBreak: null,
        scorers: [],
        cards: [],
        outcome: null,
        hasVideo: false,
      },
    ],
    unscheduled: [],
    standings: [],
    nextCursor: null,
    ...overrides,
  };
}

describe('ScheduleContent — hidden 픽스처는 목록 자체에 나타나지 않는다', () => {
  it('서버가 애초에 hidden 픽스처를 items에서 제외하므로, 여기 있는 항목은 전부 결과 상태 배지를 안전하게 보여줄 수 있다', () => {
    render(<ScheduleContent tournamentId="tournament-1" data={makeSchedule()} />);
    // void 상태 픽스처는 무효 처리 배지 + 스코어 비공개("- : -")를 함께 보여준다
    expect(screen.getByText('무효 처리')).toBeInTheDocument();
    expect(screen.getByText('- : -')).toBeInTheDocument();
  });

  it('대진표가 아직 공개되지 않았으면 목록 대신 안내 문구를 보여준다', () => {
    render(<ScheduleContent tournamentId="tournament-1" data={makeSchedule({ bracketPublished: false, items: [] })} />);
    expect(screen.getByText('대진표가 아직 공개되지 않았어요')).toBeInTheDocument();
    expect(screen.queryByText('무효 처리')).not.toBeInTheDocument();
  });
});

describe('ScheduleContent — 경기 일정에 시각과 구장을 함께 보여준다 (D-12)', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Asia/Seoul';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('scheduledAt은 M/D (요일) HH:MM 형식으로, venue·fieldName은 별도 줄로 보여준다', () => {
    const data = makeSchedule({
      items: [
        {
          fixtureId: 'fixture-2',
          round: '조별 A',
          fixtureNumber: 1,
          legNumber: 1,
          groupId: 'group-a',
          groupName: '조별 A',
          scheduledAt: '2026-08-07T11:00:00.000Z',
          venue: '잠실종합운동장',
          fieldId: null,
          fieldName: 'A구장',
          home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '서울 유나이티드' },
          away: { registrationId: 'reg-away', teamId: 'team-away', teamName: '부산 FC' },
          visibilityMode: 'official_only',
          status: 'scheduled',
          resultState: 'pending',
          scoreStatus: 'unavailable',
          score: null,
          clock: null,
          periodBreak: null,
          scorers: [],
          cards: [],
          outcome: null,
          hasVideo: false,
        },
      ],
    });
    render(<ScheduleContent tournamentId="tournament-1" data={data} />);
    expect(screen.getByText(/8\/7 \(금\) 20:00/)).toBeInTheDocument();
    expect(screen.getByText('잠실종합운동장 (A구장)')).toBeInTheDocument();
  });

  it('venue·fieldName이 모두 없으면 null/undefined 문자열을 노출하지 않는다', () => {
    // 기본 factory 항목(makeSchedule())은 venue: null, fieldName: null 이다.
    render(<ScheduleContent tournamentId="tournament-1" data={makeSchedule()} />);
    expect(screen.queryByText(/null|undefined/i)).not.toBeInTheDocument();
  });
});

/* ── Lane 1: 진행 중 경기의 실시간 스코어/경과 시간 ──
 * 알파 그린 FC 실사고(2026-08) 재현: 진행 중 경기는 공식 확정 전이라도
 * scoreStatus='live' + 숫자 스코어 + LIVE 배지 + 경과 시간이 함께 보여야 한다.
 * 이 테스트가 깨지면 "진행 중인데 스코어가 - : - 로 보인다" 회귀를 잡는다. */
describe('ScheduleContent — 진행 중 경기의 라이브 스코어/경과 시간', () => {
  const liveEntry = {
    fixtureId: 'fixture-live',
    round: '결승',
    fixtureNumber: 1,
    legNumber: 1,
    groupId: null,
    groupName: null,
    scheduledAt: '2026-08-10T09:00:00.000Z',
    venue: null,
    fieldId: null,
    fieldName: null,
    home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '알파 그린 FC' },
    away: { registrationId: 'reg-away', teamId: 'team-away', teamName: '알파 블루 FC' },
    visibilityMode: 'live' as const,
    status: 'live',
    resultState: 'pending' as const,
    scoreStatus: 'live' as const,
    score: { home: 2, away: 0, penalties: null },
    clock: { periodNumber: 2, elapsedMs: 23 * 60_000, isPaused: false },
    periodBreak: null,
    scorers: [],
    cards: [],
    outcome: null,
    hasVideo: false,
  };

  it('공식 결과 확정 전이라도 진행 중이면 실시간 스코어를 숫자로 보여준다', () => {
    render(<ScheduleContent tournamentId="tournament-1" data={makeSchedule({ items: [liveEntry] })} />);
    expect(screen.getByText('2 : 0')).toBeInTheDocument();
  });

  it('LIVE 배지와 현재 피리어드·경과 시간을 함께 보여준다', () => {
    render(<ScheduleContent tournamentId="tournament-1" data={makeSchedule({ items: [liveEntry] })} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('후반 23:00')).toBeInTheDocument();
  });

  it('일시 중지 중이면 LIVE 대신 일시중지 상태를 보여준다', () => {
    render(
      <ScheduleContent
        tournamentId="tournament-1"
        data={makeSchedule({
          items: [{ ...liveEntry, clock: { periodNumber: 2, elapsedMs: 23 * 60_000, isPaused: true } }],
        })}
      />,
    );
    expect(screen.getByText('일시중지')).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });

  it('경과 시간 정보가 없으면(clock=null) 배지만 보여주고 시간은 생략한다', () => {
    render(
      <ScheduleContent
        tournamentId="tournament-1"
        data={makeSchedule({ items: [{ ...liveEntry, clock: null }] })}
      />,
    );
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.queryByText(/후반|전반/)).not.toBeInTheDocument();
  });
});

/* ── 득점자 타임라인 + 영상 링크 (관전자에게 노출) ── */

describe('MatchDetailContent — 골/카드 타임라인의 이름·팀 귀속', () => {
  it('참가자 이름이 있으면 그대로 보여주고, null 골은 익명으로 보여준다', () => {
    render(
      <MatchDetailContent
        data={makeMatch({
          lineup: null, // 라인업 슬롯의 익명 라벨과 섞이지 않도록 이 테스트는 라인업을 비운다.
          events: [
            { type: 'GOAL', cardColor: null, sideId: 'side-home', side: 'home', participantId: 'p-1', participantName: '김철수', jerseyNumber: 7, profileHref: null, period: 1, clockMs: 600_000 },
            { type: 'GOAL', cardColor: null, sideId: 'side-away', side: 'away', participantId: null, participantName: null, jerseyNumber: null, profileHref: null, period: 1, clockMs: 900_000 },
          ],
        })}
      />,
    );
    expect(screen.getByText('김철수')).toBeInTheDocument();
    expect(screen.getByText('익명')).toBeInTheDocument();
  });

  it('라인업이 null(미공개)이어도 이벤트의 이름은 그대로 보인다 -- 라인업 게이트와 독립인 계약', () => {
    render(
      <MatchDetailContent
        data={makeMatch({
          lineup: null,
          events: [
            { type: 'GOAL', cardColor: null, sideId: 'side-home', side: 'home', participantId: 'p-1', participantName: '김철수', jerseyNumber: 7, profileHref: null, period: 1, clockMs: 600_000 },
          ],
        })}
      />,
    );
    expect(screen.getByText('김철수')).toBeInTheDocument();
  });
});

describe('MatchDetailContent — 라인업/영상 섹션은 데이터가 없으면 통째로 생략된다', () => {
  it('lineup이 null이면 라인업 섹션이 렌더되지 않는다(빈 상태 문구로 자리 차지하지 않음)', () => {
    render(<MatchDetailContent data={makeMatch({ lineup: null })} />);
    expect(screen.queryByText('라인업')).not.toBeInTheDocument();
  });

  it('lineup이 있으면 라인업 섹션이 렌더된다', () => {
    render(<MatchDetailContent data={makeMatch()} />);
    expect(screen.getByText('라인업')).toBeInTheDocument();
  });

  it('videos가 빈 배열이면 경기 영상 섹션이 렌더되지 않는다', () => {
    render(<MatchDetailContent data={makeMatch({ videos: [] })} />);
    expect(screen.queryByText('경기 영상')).not.toBeInTheDocument();
  });

  it('videos가 있으면 경기 영상 섹션이 렌더된다', () => {
    render(
      <MatchDetailContent
        data={makeMatch({ videos: [{ id: 'v-1', title: null, url: 'https://youtu.be/abc123' }] })}
      />,
    );
    expect(screen.getByText('경기 영상')).toBeInTheDocument();
  });
});

describe('ScheduleContent — 일정 카드 득점자 요약', () => {
  it('골이 있는 픽스처는 득점자 요약 줄을 보여준다', () => {
    render(
      <ScheduleContent
        tournamentId="tournament-1"
        data={makeSchedule({
          items: [
            {
              ...makeSchedule().items[0],
              scorers: [{ side: 'home', participantName: '김철수', jerseyNumber: 7, period: 1, clockMs: 600_000 }],
            },
          ],
        })}
      />,
    );
    expect(screen.getByRole('list', { name: '경기 기록' })).toBeInTheDocument();
    expect(screen.getByText(/10′/)).toBeInTheDocument();
    expect(screen.getByText(/김철수/)).toBeInTheDocument();
  });

  it('골이 없으면 득점자 요약 줄 자체를 렌더하지 않는다', () => {
    render(<ScheduleContent tournamentId="tournament-1" data={makeSchedule()} />);
    expect(screen.queryByRole('list', { name: '경기 기록' })).not.toBeInTheDocument();
  });

  it('참가자 이름이 null(동의 없음)이면 이름을 지어내지 않고 시간만 보여준다', () => {
    render(
      <ScheduleContent
        tournamentId="tournament-1"
        data={makeSchedule({
          items: [
            {
              ...makeSchedule().items[0],
              scorers: [{ side: 'away', participantName: null, jerseyNumber: null, period: 2, clockMs: 300_000 }],
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/5′/)).toBeInTheDocument();
    // 익명 플레이스홀더조차 지어내지 않는다 -- 매치 상세와 달리 이 카드는 시간만 남긴다.
    expect(screen.queryByText(WITHHELD_IDENTITY_LABEL)).not.toBeInTheDocument();
  });
});

describe('MatchDetailContent — 진행 중 경기의 라이브 스코어/경과 시간', () => {
  it('scoreStatus가 live이면 숫자 스코어와 LIVE 배지·경과 시간을 함께 보여준다', () => {
    render(
      <MatchDetailContent
        data={makeMatch({
          visibilityMode: 'live',
          status: 'live',
          resultState: 'pending',
          scoreStatus: 'live',
          score: { home: 1, away: 0, penalties: null },
          clock: { periodNumber: 1, elapsedMs: 12 * 60_000 + 30_000, isPaused: false },
        })}
      />,
    );
    expect(screen.getByText('1 : 0')).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('전반 12:30')).toBeInTheDocument();
  });
});

/* ── page.tsx: hidden/존재하지 않는 픽스처는 실제 존재하지 않는 것과 동일한 404 ──
 * 백엔드는 hidden 픽스처·미발행 대진표·존재하지 않는 tournament/fixture를 전부
 * 같은 404(`TOURNAMENT_MATCH_NOT_FOUND`)로 응답한다(`fetchPublicV1` -> null).
 * 프론트는 그 null을 `notFound()` 호출로 이어가야 하며, 이 게이트가 사라지면
 * 아래 각 테스트는 실패한다.
 */

describe('공개 서브라우트의 404 게이트', () => {
  it('대회 일정: tournament를 찾을 수 없으면 진짜 404', async () => {
    vi.mocked(fetchPublicV1).mockResolvedValue(null);
    await expect(
      TournamentSchedulePage({ params: Promise.resolve({ id: MISSING_ID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('경기 상세: hidden 픽스처와 존재하지 않는 픽스처가 동일한 404로 처리된다', async () => {
    vi.mocked(fetchPublicV1).mockResolvedValue(null);
    await expect(
      TournamentMatchPage({ params: Promise.resolve({ id: MISSING_ID, fixtureId: 'fixture-x' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('팀 전적: team을 찾을 수 없으면 진짜 404', async () => {
    vi.mocked(fetchPublicV1).mockResolvedValue(null);
    await expect(
      TeamRecordsPage({ params: Promise.resolve({ id: MISSING_ID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('개인 활동 기록: user를 찾을 수 없으면 진짜 404', async () => {
    vi.mocked(fetchPublicV1).mockResolvedValue(null);
    await expect(
      UserRecordsPage({ params: Promise.resolve({ id: MISSING_ID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
