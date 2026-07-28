'use client';

import { Card, EmptyState } from '@/components/v1-ui/primitives';
import { getSportAccent } from '@/lib/v1-sport-accent';
import type { V1ReviewReceivedSummaryResponse } from '@/types/api';

/**
 * 종목별 리뷰 집계 대시보드 — **개별 리뷰(누가 몇 점을 줬는지)는 절대 노출하지 않는다.**
 * 리뷰 익명화 요구사항의 핵심 컴포넌트: 평점 평균·건수·태그 빈도만 종목 단위로 보여준다.
 * Task 9(페이지 재구성)가 실제 리뷰 페이지에 마운트한다.
 */
export function ReviewsSummaryDashboard({
  summary,
  period,
  onPeriodChange,
  loading,
}: {
  summary: V1ReviewReceivedSummaryResponse | undefined;
  period: string | null;
  onPeriodChange: (period: string | null) => void;
  loading: boolean;
}) {
  const bySport = summary?.bySport ?? [];
  const availableMonths = summary?.availableMonths ?? [];

  return (
    <section>
      <div className="tm-review-summary-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="tm-my-section-label">리뷰 집계</div>
        <label className="tm-text-caption" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          기간
          <select
            aria-label="기간 선택"
            className="tm-create-input tm-create-select-control"
            value={period ?? 'all'}
            onChange={(event) => onPeriodChange(event.target.value === 'all' ? null : event.target.value)}
          >
            <option value="all">전체</option>
            {availableMonths.map((month) => (
              <option key={month} value={month}>{month}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="tm-review-skeleton" />
          <div className="tm-review-skeleton" />
        </div>
      ) : bySport.length === 0 ? (
        <EmptyState title="아직 집계된 리뷰가 없어요." sub="상대방이 리뷰를 함께 남기거나 72시간이 지나면 반영돼요." />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {bySport.map((sport) => {
            const accent = getSportAccent(sport.sportId);
            return (
              <Card key={sport.sportId} pad={16}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="tm-badge" style={{ background: accent.badgeBg, color: accent.badgeText }}>{accent.label}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span className="tm-text-subhead" style={{ fontWeight: 700 }}>{sport.ratingAvg ?? '-'}</span>
                    <span className="tm-text-caption">{sport.ratingCount}건</span>
                  </div>
                </div>
                {sport.tagRates.length > 0 ? (
                  <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                    {sport.tagRates.map((tag) => (
                      <div key={tag.tagCode} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="tm-text-caption">{tag.label}</span>
                        <span className="tm-text-caption" style={{ fontWeight: 600 }}>{Math.round(tag.rate * 100)}%</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
