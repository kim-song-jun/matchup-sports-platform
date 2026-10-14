import type { V1LeagueOverallStandingsResponse } from '@/types/api';

/** 상세와 리그 순위가 같은 서버 진행률을 같은 형태로 표시한다. */
export function LeagueProgress({ progress }: { progress: V1LeagueOverallStandingsResponse['progress'] }) {
  return (
    <div role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}
      aria-label={`전체 일정 진행률 ${progress.played} / ${progress.total}경기, ${progress.percent}%`}>
      <div className="tm-on-tint" style={{ height: 'var(--spacing-1)', background: 'var(--grey100)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%`, height: '100%', background: 'var(--blue500)' }} />
      </div>
      <div className="tm-text-caption tab-num" style={{ color: 'var(--text-caption)', marginTop: 'var(--spacing-2)' }}>
        {progress.played} / {progress.total} · {progress.percent}%
      </div>
    </div>
  );
}
