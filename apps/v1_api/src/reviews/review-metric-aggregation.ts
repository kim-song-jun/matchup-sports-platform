/**
 * 4항목 채점(SKILL·MANNER·PUNCTUALITY·SAFETY) 집계의 순수 계산부 (Task 155 후속).
 *
 * 이 파일이 생기기 전에는 스키마(V1PostEventReviewMetricScore, metric_* 컬럼)만 있고
 * **쓰는 코드가 없어서** 선수 카드의 SKI/MAN/PUN 해금(후기 3)과 방패 해금(후기 10)이
 * 어떤 정상 경로로도 도달 불가능했다(2026-08-25 적대 검증에서 확정). 집계 규칙:
 *
 * - 개인(매치·팀매치) 경로: reveal 된 후기 중 4항목이 달린 것만 센다. 평균은 항목별
 *   단순 평균 -- rating(mannerScore)과 같은 모집단 규칙(reveal)을 따르되 표본은
 *   "4항목이 달린 후기"로 좁힌다.
 * - 대회 경로: rating 집계와 같은 "대회 × 평가한 팀 = 1표" 접기를 항목별로 그대로
 *   적용한다. 상대 로스터 전원이 주는 수십 건이 한 팀의 의견이라는 원칙은 항목
 *   점수에도 동일하기 때문이다.
 */

export const REVIEW_METRICS = ['SKILL', 'MANNER', 'PUNCTUALITY', 'SAFETY'] as const;
export type ReviewMetric = (typeof REVIEW_METRICS)[number];

export interface MetricScoreRow {
  readonly reviewId: string;
  readonly metric: ReviewMetric;
  readonly score: number;
}

export interface MetricAggregate {
  readonly metricReviewCount: number;
  readonly skill: number | null;
  readonly manner: number | null;
  readonly punctuality: number | null;
  readonly safety: number | null;
}

const EMPTY: MetricAggregate = { metricReviewCount: 0, skill: null, manner: null, punctuality: null, safety: null };

function averageByMetric(groups: ReadonlyMap<string, MetricScoreRow[]>): Record<ReviewMetric, number[]> {
  const perMetric: Record<ReviewMetric, number[]> = { SKILL: [], MANNER: [], PUNCTUALITY: [], SAFETY: [] };
  for (const rows of groups.values()) {
    const byMetric = new Map<ReviewMetric, number[]>();
    for (const row of rows) {
      const list = byMetric.get(row.metric) ?? [];
      list.push(row.score);
      byMetric.set(row.metric, list);
    }
    for (const metric of REVIEW_METRICS) {
      const scores = byMetric.get(metric);
      if (scores?.length) perMetric[metric].push(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
  }
  return perMetric;
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/**
 * 개인(매치·팀매치) 집계 -- 표본 단위는 후기 1건.
 * `revealedReviewIds` 밖의 행은 상호 공개 전이므로 세지 않는다(rating 과 같은 규칙).
 */
export function aggregatePersonalMetricScores(
  revealedReviewIds: ReadonlySet<string>,
  rows: readonly MetricScoreRow[],
): MetricAggregate {
  const revealedRows = rows.filter((row) => revealedReviewIds.has(row.reviewId));
  if (revealedRows.length === 0) return EMPTY;
  // 후기 1건 = 그룹 1개 -- 대회 집계와 같은 함수를 태우기 위한 자명한 접기다.
  const groups = new Map<string, MetricScoreRow[]>();
  for (const row of revealedRows) {
    const list = groups.get(row.reviewId) ?? [];
    list.push(row);
    groups.set(row.reviewId, list);
  }
  const perMetric = averageByMetric(groups);
  return {
    metricReviewCount: groups.size,
    skill: mean(perMetric.SKILL),
    manner: mean(perMetric.MANNER),
    punctuality: mean(perMetric.PUNCTUALITY),
    safety: mean(perMetric.SAFETY),
  };
}

/**
 * 대회 집계 -- 표본 단위는 "대회 × 평가한 팀"(rating 집계와 동일한 접기).
 * `revealedGroupKeyByReviewId` 는 reveal 된 후기 id → 접기 키("<대회>:<팀>") 맵이다.
 */
export function aggregateTournamentMetricScores(
  revealedGroupKeyByReviewId: ReadonlyMap<string, string>,
  rows: readonly MetricScoreRow[],
): MetricAggregate {
  const groups = new Map<string, MetricScoreRow[]>();
  for (const row of rows) {
    const key = revealedGroupKeyByReviewId.get(row.reviewId);
    if (key === undefined) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  if (groups.size === 0) return EMPTY;
  const perMetric = averageByMetric(groups);
  return {
    metricReviewCount: groups.size,
    skill: mean(perMetric.SKILL),
    manner: mean(perMetric.MANNER),
    punctuality: mean(perMetric.PUNCTUALITY),
    safety: mean(perMetric.SAFETY),
  };
}
