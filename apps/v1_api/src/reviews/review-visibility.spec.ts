import { isReviewRevealed, REVEAL_FALLBACK_HOURS, reviewRevealScope } from './review-visibility';

describe('reviewRevealScope', () => {
  it('경기 단위 후기는 sourceId 그대로 쓴다', () => {
    expect(reviewRevealScope({ sourceType: 'match', sourceId: 'match-1', sourceGroupId: null })).toBe('match-1');
    expect(reviewRevealScope({ sourceType: 'team_match', sourceId: 'tm-1', sourceGroupId: null })).toBe('tm-1');
  });

  // 대회 후기는 중복 방지 스코프가 대회 단위라, 서로 다른 경기에서 주고받은 짝이 픽스처
  // 기준으로는 절대 맞지 않는다 — 그러면 상호 공개 경로가 죽고 72시간 폴백만 남는다.
  it('대회 후기는 서로 다른 경기여도 같은 대회면 같은 스코프다', () => {
    const fromQualifier = reviewRevealScope({ sourceType: 'tournament_fixture', sourceId: 'fixture-1', sourceGroupId: 'cup-1' });
    const fromFinal = reviewRevealScope({ sourceType: 'tournament_fixture', sourceId: 'fixture-9', sourceGroupId: 'cup-1' });
    expect(fromQualifier).toBe(fromFinal);
    expect(fromQualifier).not.toBe(reviewRevealScope({ sourceType: 'tournament_fixture', sourceId: 'fixture-1', sourceGroupId: 'cup-2' }));
  });

  // sourceGroupId가 비어 있는(백필 전 등) 대회 행까지 한 스코프로 뭉치면 서로 무관한 대회의
  // 후기가 짝으로 매칭돼 아직 안 열려야 할 후기가 공개된다.
  it('대회 행이지만 sourceGroupId가 없으면 sourceId로 되돌아간다', () => {
    expect(reviewRevealScope({ sourceType: 'tournament_fixture', sourceId: 'fixture-1', sourceGroupId: null })).toBe('fixture-1');
  });
});

describe('isReviewRevealed', () => {
  const baseReview = {
    sourceId: 'match-1',
    reviewerUserId: 'user-a',
    targetUserId: 'user-b',
    submittedAt: new Date('2026-07-19T00:00:00Z'),
  };

  it('상대(user-b→user-a, 같은 sourceId)가 이미 제출했으면 즉시 공개', () => {
    const reverseReviews = [{ sourceId: 'match-1', reviewerUserId: 'user-b', targetUserId: 'user-a' }];
    const now = new Date('2026-07-19T00:10:00Z'); // 10분 후
    expect(isReviewRevealed(baseReview, reverseReviews, now)).toBe(true);
  });

  it('상대가 안 냈고 72시간 미만이면 비공개', () => {
    const now = new Date('2026-07-21T23:59:00Z'); // 71시간 59분 후
    expect(isReviewRevealed(baseReview, [], now)).toBe(false);
  });

  it('상대가 안 냈어도 72시간 지나면 공개', () => {
    const now = new Date('2026-07-22T00:01:00Z'); // 72시간 1분 후
    expect(isReviewRevealed(baseReview, [], now)).toBe(true);
  });

  it('reverseReviews에 다른 sourceId나 다른 사람 리뷰가 섞여 있어도 정확히 매칭한다', () => {
    const reverseReviews = [
      { sourceId: 'match-2', reviewerUserId: 'user-b', targetUserId: 'user-a' }, // 다른 매치
      { sourceId: 'match-1', reviewerUserId: 'user-c', targetUserId: 'user-a' }, // 다른 사람
    ];
    const now = new Date('2026-07-19T00:10:00Z');
    expect(isReviewRevealed(baseReview, reverseReviews, now)).toBe(false);
  });
});
