import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentFixture } from '@/types/api';
import { FixtureCard } from './tournament-detail-client';

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
