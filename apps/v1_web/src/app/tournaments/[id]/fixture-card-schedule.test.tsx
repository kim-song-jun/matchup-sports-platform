import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentFixture } from '@/types/api';
import { FixtureCard, partitionTournamentSections } from './tournament-detail-client';

function makeGroupFixture(scheduledAt: string | null, round = 'group'): V1TournamentFixture {
  return {
    id: 'group-fixture-1',
    groupId: 'group-a',
    round,
    fixtureNumber: 1,
    legNumber: 1,
    scheduledAt,
    venue: null,
    status: 'scheduled',
    liveStatus: 'scheduled',
    homeRegistrationId: 'reg-home',
    homeTeamId: 'team-home',
    homeTeamName: '서울 유나이티드',
    homeTeamLogoUrl: null,
    awayRegistrationId: 'reg-away',
    awayTeamId: 'team-away',
    awayTeamName: '부산 FC',
    awayTeamLogoUrl: null,
    homeSlotLabel: null,
    awaySlotLabel: null,
    result: null,
    videos: [],
  };
}

describe('FixtureCard 조별 일정 시간', () => {
  it('경기 날짜와 시간을 함께 표시한다', () => {
    // `new Date(2026, 7, 7, 20, 30)` 는 **실행 머신 로컬**의 20:30 을 뜻해서, 화면이
    // KST 로 고정 렌더하는 이상 러너 타임존에 따라 기대값이 흔들린다(KST 머신은 통과,
    // UTC 러너는 8/8 05:30 이 되어 실패). 경기 시각은 KST 계약이므로 오프셋을 박는다.
    const scheduledAt = new Date('2026-08-07T20:30:00+09:00').toISOString();

    render(<FixtureCard fixture={makeGroupFixture(scheduledAt)} />);

    expect(screen.getByText(/8\/7 .* 20:30/)).toBeInTheDocument();
  });

  it('경기 시간이 아직 정해지지 않았으면 시간 미정을 표시한다', () => {
    render(<FixtureCard fixture={makeGroupFixture(null)} />);

    expect(screen.getByText('시간 미정')).toBeInTheDocument();
  });
});

// 어드민에서 경기 제목·번호를 고치면 일정·대진표처럼 대회 상세 조별 일정에도 그대로 보여야 한다.
describe('FixtureCard 경기 제목', () => {
  it('운영자가 정한 경기 제목이 있으면 라운드 이름 대신 그것을 보여준다', () => {
    render(<FixtureCard fixture={{ ...makeGroupFixture(null, 'league_r1'), displayTitle: '풀리그 1라운드' }} groupName="A조" />);

    expect(screen.getByText('풀리그 1라운드')).toBeInTheDocument();
    expect(screen.queryByText('A조 · 조별리그 1라운드')).not.toBeInTheDocument();
  });

  it.each([[null], [''], ['  ']])('제목이 %j 이면 라운드·조 이름으로 만든 이름을 쓴다', (displayTitle) => {
    render(<FixtureCard fixture={{ ...makeGroupFixture(null, 'league_r1'), displayTitle }} groupName="A조" />);

    expect(screen.getByText('A조 · 조별리그 1라운드')).toBeInTheDocument();
  });
});

describe('partitionTournamentSections 조별 일정 순서', () => {
  const group = { id: 'group-a', name: 'A조', phase: 'group' } as never;
  const fixture = (id: string, fixtureNumber: number, round: string): V1TournamentFixture => ({ ...makeGroupFixture(null, round), id, fixtureNumber });

  it('서버가 준 라운드 순서가 아니라 경기 번호 순으로 정렬한다', () => {
    // 서버는 league_r1…league_r5 순으로 내려주지만 운영자가 마지막 라운드 경기를 1번으로 바꾼 경우.
    const { groupFixtures } = partitionTournamentSections(
      'league_knockouts',
      [fixture('r1', 2, 'league_r1'), fixture('r2', 3, 'league_r2'), fixture('r5', 1, 'league_r5')],
      [group],
    );

    expect(groupFixtures.map((item) => item.id)).toEqual(['r5', 'r1', 'r2']);
  });

  it('입력 배열은 바꾸지 않는다', () => {
    const input = [fixture('r1', 2, 'league_r1'), fixture('r5', 1, 'league_r5')];

    partitionTournamentSections('league_knockouts', input, [group]);

    expect(input.map((item) => item.id)).toEqual(['r1', 'r5']);
  });
});

// W8-V3 — 조별리그 대진 생성기의 라운드 키(`league_r1`)가 카드 머리에 그대로 보였다.
describe('FixtureCard 라운드 이름', () => {
  it('생성기 라운드 키는 서버 알림과 같은 이름으로 보인다', () => {
    render(<FixtureCard fixture={makeGroupFixture(null, 'league_r2')} />);

    expect(screen.getByText('조별리그 2라운드')).toBeInTheDocument();
    expect(screen.queryByText(/league_r/)).not.toBeInTheDocument();
  });

  it('대조군: 운영자가 한국어로 넣은 라운드는 그대로 둔다', () => {
    render(<FixtureCard fixture={makeGroupFixture(null, '준결승')} />);

    expect(screen.getByText('준결승')).toBeInTheDocument();
  });
});
