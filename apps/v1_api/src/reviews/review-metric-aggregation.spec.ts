import { aggregatePersonalMetricScores, aggregateTournamentMetricScores, type MetricScoreRow } from './review-metric-aggregation';

/**
 * 4항목 채점 집계 (Task 155 후속).
 *
 * 이 계약이 깨지면 선수 카드의 SKI/MAN/PUN 값과 해금 카운트(후기 3 / 방패 10)가
 * 틀린다 -- 특히 reveal 규칙 무시(비공개 후기가 세어짐)와 대회 접기 붕괴(로스터
 * 전원의 몰아주기가 표 수로 세어짐)는 화면에서는 원인이 안 보이는 종류라 여기서 잡는다.
 */

const row = (reviewId: string, metric: MetricScoreRow['metric'], score: number): MetricScoreRow => ({ reviewId, metric, score });

const fullReview = (reviewId: string, scores: [number, number, number, number]): MetricScoreRow[] => [
  row(reviewId, 'SKILL', scores[0]),
  row(reviewId, 'MANNER', scores[1]),
  row(reviewId, 'PUNCTUALITY', scores[2]),
  row(reviewId, 'SAFETY', scores[3]),
];

describe('aggregatePersonalMetricScores', () => {
  it('reveal 된 후기의 4항목만 평균 낸다 -- 비공개 후기는 세지 않는다', () => {
    const rows = [...fullReview('r1', [5, 4, 3, 2]), ...fullReview('r2', [1, 2, 3, 4]), ...fullReview('hidden', [1, 1, 1, 1])];

    const result = aggregatePersonalMetricScores(new Set(['r1', 'r2']), rows);

    expect(result.metricReviewCount).toBe(2);
    expect(result.skill).toBe(3);
    expect(result.manner).toBe(3);
    expect(result.punctuality).toBe(3);
    expect(result.safety).toBe(3);
  });

  it('4항목이 없는(legacy) 후기는 카운트에 잡히지 않는다', () => {
    // reveal 은 됐지만 항목 행이 없는 후기 -- 별점만 남긴 기존 후기가 여기 해당한다.
    const result = aggregatePersonalMetricScores(new Set(['legacy', 'r1']), fullReview('r1', [4, 4, 4, 4]));

    expect(result.metricReviewCount).toBe(1);
    expect(result.skill).toBe(4);
  });

  it('표본이 없으면 0 과 null 을 돌려준다 -- 0 점으로 지어내지 않는다', () => {
    const result = aggregatePersonalMetricScores(new Set(), []);

    expect(result).toEqual({ metricReviewCount: 0, skill: null, manner: null, punctuality: null, safety: null });
  });
});

describe('aggregateTournamentMetricScores', () => {
  it('같은 팀의 몰아주기는 팀 평균 1표로 접는다 -- rating 집계와 같은 규칙', () => {
    // A팀 로스터 두 명이 SKILL 5·5 를 몰아줘도(팀 평균 5), B팀 한 명의 1 과 함께 2표다.
    const revealed = new Map([
      ['a1', 't1:teamA'],
      ['a2', 't1:teamA'],
      ['b1', 't1:teamB'],
    ]);
    const rows = [...fullReview('a1', [5, 5, 5, 5]), ...fullReview('a2', [5, 5, 5, 5]), ...fullReview('b1', [1, 1, 1, 1])];

    const result = aggregateTournamentMetricScores(revealed, rows);

    expect(result.metricReviewCount).toBe(2);
    expect(result.skill).toBe(3);
    expect(result.manner).toBe(3);
  });

  it('reveal 맵에 없는 후기는 무시한다', () => {
    const result = aggregateTournamentMetricScores(new Map([['a1', 't1:teamA']]), [
      ...fullReview('a1', [4, 4, 4, 4]),
      ...fullReview('unrevealed', [1, 1, 1, 1]),
    ]);

    expect(result.metricReviewCount).toBe(1);
    expect(result.skill).toBe(4);
  });
});
