import { fixtureTitle, type CanonicalTournamentFixture } from './tournament-fixture-review-mappers';

function fixture(round: string): CanonicalTournamentFixture {
  return {
    tournament: { title: '봄 대회' },
    tournamentDetails: { round, fixtureNumber: 3 },
  } as unknown as CanonicalTournamentFixture;
}

// W8-V3 후속 — 리뷰 화면 제목이 "봄 대회 · league_r1 3경기" 로 라운드 키 원값을 보였다.
describe('fixtureTitle', () => {
  it('생성기 라운드 키는 화면 이름으로 바꾼다', () => {
    expect(fixtureTitle(fixture('league_r1'))).toBe('봄 대회 · 조별리그 1라운드 3경기');
  });

  it('대조군: 운영자가 한국어로 넣은 라운드는 그대로다', () => {
    expect(fixtureTitle(fixture('예선'))).toBe('봄 대회 · 예선 3경기');
  });
});
