import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeagueFixtureCard, leagueFixtureHeader } from './league-fixture-card';
import type { V1LeagueFixture } from '@/types/league-match';

/**
 * 이 스펙이 잡는 것은 **대회 어휘가 리그 카드로 새는 것**이다.
 *
 * 두 축의 `status` 는 이름도 타입도 같은데 값 영역이 다르다
 * (대회 `scheduled | completed` / 리그 `matched | completed | cancelled | ...`).
 * 그래서 대회 카드의 판정을 그대로 재사용하면 **타입은 통과하는데 모든 리그 경기에서
 * 조용히 틀린다.** 아래 케이스들은 전부 "리그에서만 나타나는 값"이다.
 */

const BASE: V1LeagueFixture = {
  teamMatchId: 'tm-1',
  title: '1R A vs B',
  homeTeamId: 'team-a',
  awayTeamId: 'team-b',
  startAt: '2026-08-31T05:00:00.000Z', // KST 14:00
  placeName: '올림픽공원 풋살장 A',
  status: 'matched',
};

function renderCard(overrides: Partial<V1LeagueFixture> = {}) {
  return render(
    <LeagueFixtureCard fixture={{ ...BASE, ...overrides }} homeLabel="강남 유나이티드" awayLabel="종로 FC" />,
  );
}

describe('LeagueFixtureCard', () => {
  it('헤더 왼쪽은 회차가 아니라 날짜, 캡션은 KST 시각이다', () => {
    // 리그 대진엔 대회의 round·fixtureNumber 가 없다 — 서버가 주지 않는다.
    // 그 자리에 날짜를 넣는 결정이 이 함수 하나에 모여 있다.
    expect(leagueFixtureHeader(BASE)).toEqual({ label: '8월 31일 (월)', caption: '14:00' });
  });

  it('취소된 대진은 점수가 있어도 점수를 보여주지 않는다', () => {
    // 순위표는 취소 대진을 통째로 제외한다(R8). 일정 카드에만 "1 : 0" 이 남으면
    // 한 화면 안의 두 집계가 서로 다른 말을 한다.
    renderCard({ status: 'cancelled', homeScore: 1, awayScore: 0 });
    expect(screen.queryByText('1 : 0')).toBeNull();
    expect(screen.getByText('집계 제외')).toBeInTheDocument();
    expect(screen.getByText('취소됨')).toBeInTheDocument();
  });

  it("킥오프가 지난 matched 는 '예정'이 아니라 '결과 대기'다", () => {
    // 이 저장소의 리그 대진은 결과가 제출돼야 completed 로 바뀐다 — 치렀지만 아직
    // 입력 전인 구간이 매 대진마다 최소 하루는 정상적으로 발생한다.
    renderCard({ startAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() });
    expect(screen.getByText('결과 대기')).toBeInTheDocument();
    expect(screen.queryByText('예정')).toBeNull();
  });

  it("킥오프 전 matched 는 가운데에 'vs' 를 그리고 '결과 대기' 를 적지 않는다", () => {
    renderCard({ startAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() });
    expect(screen.getByText('vs')).toBeInTheDocument();
    expect(screen.queryByText('결과 대기')).toBeNull();
  });

  it('몰수는 점수를 지우지 않고 뱃지와 문구로 가른다 — 강조도 빼앗는다', () => {
    // 몰수는 1:0 으로 기록돼 실제 1:0 승리와 화면에서 완전히 같아 보인다.
    renderCard({ status: 'completed', homeScore: 1, awayScore: 0, isForfeit: true });
    const score = screen.getByText('1 : 0');
    expect(score).toBeInTheDocument();
    expect(score).toHaveStyle({ fontWeight: '400' });
    expect(screen.getByText('몰수')).toBeInTheDocument();
    expect(screen.getByText('(관례 스코어)')).toBeInTheDocument();
  });

  it('실제로 치른 결과는 굵게 강조한다 — 몰수와 같은 무게로 읽히면 안 된다', () => {
    renderCard({ status: 'completed', homeScore: 1, awayScore: 0 });
    expect(screen.getByText('1 : 0')).toHaveStyle({ fontWeight: '700' });
    expect(screen.queryByText('몰수')).toBeNull();
  });

  it.each([
    ['recruiting', '모집 중'],
    ['closed', '마감'],
    ['matched', '매칭됨'],
    ['completed', '완료'],
    ['expired', '기한 만료'],
  ])('배지는 리그 상태 %s 를 "%s" 로 적는다 — 대회의 3분기로 뭉개지 않는다', (status, label) => {
    renderCard({ status });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('상대팀·장소가 없어도 자리를 비우지 않는다', () => {
    render(
      <LeagueFixtureCard
        fixture={{ ...BASE, awayTeamId: null, placeName: '' }}
        homeLabel="강남 유나이티드"
        awayLabel="상대팀 미정"
      />,
    );
    // 대진 그룹의 aria-label 은 두 팀 이름을 그대로 읽는다.
    expect(screen.getByRole('group', { name: '강남 유나이티드 대 상대팀 미정' })).toBeInTheDocument();
    expect(screen.queryByText('올림픽공원 풋살장 A')).toBeNull();
  });
});
