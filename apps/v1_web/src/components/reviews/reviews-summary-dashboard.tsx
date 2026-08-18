'use client';

import { Card } from '@/components/v1-ui/primitives';
import { getSportAccent } from '@/lib/v1-sport-accent';
import type { V1ReviewReceivedSummaryResponse } from '@/types/api';

/**
 * 받은 리뷰 요약 — **개별 리뷰(누가 몇 점을 줬는지)는 절대 노출하지 않는다.**
 * 종목별 평균 평점·건수·태그 빈도만 보여준다.
 *
 * 예전에는 이 컴포넌트가 화면 맨 위를 차지하는 큰 대시보드였다(제목 + 기간 드롭다운 + 종목
 * 카드 목록). 개별 익명 리뷰를 아래에 함께 보여주게 된 뒤로는 같은 내용을 두 번 말하는 꼴이라,
 * 한 줄짜리 요약 바로 접고 개별 목록을 주인공으로 두도록 바꿨다. 종목별 평균·태그는 목록만으로는
 * 안 보이는 정보라 버리지 않고 접힌 형태로 유지한다.
 *
 * 집계가 0건이면 아무것도 렌더하지 않는다 — 걸 대상이 없는데 기간 필터만 덩그러니 남는
 * 빈 상태가 화면 맨 위에 있었다.
 */
export function ReviewsSummaryDashboard({
  summary,
  period,
  onPeriodChange,
  loading,
  title,
}: {
  summary: V1ReviewReceivedSummaryResponse | undefined;
  period: string | null;
  onPeriodChange: (period: string | null) => void;
  loading: boolean;
  /** 이 요약이 무엇의 집계인지 — 페이지가 따로 라벨을 달지 않도록 여기서 받는다. */
  title: string;
}) {
  const bySport = summary?.bySport ?? [];
  const availableMonths = summary?.availableMonths ?? [];

  if (loading) {
    return <div className="tm-review-skeleton" />;
  }
  if (bySport.length === 0) {
    return null;
  }

  const totalCount = bySport.reduce((sum, sport) => sum + sport.ratingCount, 0);
  // 종목별 평균을 건수로 가중해 전체 평균을 낸다 — 단순 평균이면 1건짜리 종목이 과대 대표된다.
  const weighted = bySport.reduce((sum, sport) => sum + (sport.ratingAvg ?? 0) * sport.ratingCount, 0);
  const overallAvg = totalCount > 0 ? (weighted / totalCount).toFixed(1) : null;

  return (
    <Card pad={16}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="tm-text-label" style={{ fontWeight: 600 }}>{title}</div>
          <div className="tm-text-caption" style={{ marginTop: 2, color: 'var(--text-muted)' }}>
            평균 <span className="tab-num" style={{ fontWeight: 700, color: 'var(--text-body)' }}>{overallAvg ?? '-'}</span>
            점 · <span className="tab-num">{totalCount}</span>개 리뷰
          </div>
        </div>
        {availableMonths.length > 0 ? (
          <select
            aria-label={`${title} 기간 선택`}
            className="tm-create-input tm-create-select-control"
            style={{ flexShrink: 0, width: 'auto', minHeight: 44 }}
            value={period ?? 'all'}
            onChange={(event) => onPeriodChange(event.target.value === 'all' ? null : event.target.value)}
          >
            <option value="all">전체 기간</option>
            {availableMonths.map((month) => (
              <option key={month} value={month}>{month}</option>
            ))}
          </select>
        ) : null}
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {bySport.map((sport) => {
          // sportId 는 UUID 다 — 배지 매핑 키는 v1Sport.code(sportCode).
          const accent = getSportAccent(sport.sportCode ?? '');
          const topTags = sport.tagRates.slice(0, 3);
          return (
            <div key={sport.sportId} style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span className="tm-badge" style={{ background: accent.badgeBg, color: accent.badgeText }}>{accent.label}</span>
                <div className="tm-text-caption">
                  <span className="tab-num" style={{ fontWeight: 700, color: 'var(--text-body)' }}>{sport.ratingAvg ?? '-'}</span>
                  점 · <span className="tab-num">{sport.ratingCount}</span>개
                </div>
              </div>
              {topTags.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {topTags.map((tag) => (
                    <span key={tag.tagCode} className="tm-badge" style={{ background: 'var(--grey100)', color: 'var(--text-caption)' }}>
                      {tag.label}{' '}
                      <span className="tab-num">{Math.round(tag.rate * 100)}%</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
