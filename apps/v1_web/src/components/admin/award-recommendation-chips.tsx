'use client';

import type { V1AdminTournamentPlayerRecordRow } from '@/types/api';

/**
 * 회고 STATS-3 — 수상 탭의 추천 근거 chip (프레젠테이셔널).
 *
 * "득점왕이 누구인지"를 어드민이 스코어시트를 수작업으로 세지 않아도 되게, 공식
 * 결과 집계의 상위 후보를 chip으로 보여주고 탭하면 수상 항목이 미리 채워진 채
 * 추가된다. 데이터는 **비게이팅 어드민 랭킹**(`useV1AdminTournamentPlayerRecords`)
 * — 공개 랭킹을 쓰면 미동의 1위가 조용히 빠져 틀린 추천이 된다.
 *
 * 기존 수동 입력 경로는 그대로 두고 추가만 한다(감사 보고서의 원 설계).
 */
export type AwardRecommendation = {
  kind: 'goals' | 'assists';
  row: V1AdminTournamentPlayerRecordRow;
};

const TOP_N = 3;

export function AwardRecommendationChips({
  goals,
  assists,
  onPick,
}: {
  goals: V1AdminTournamentPlayerRecordRow[] | undefined;
  assists: V1AdminTournamentPlayerRecordRow[] | undefined;
  onPick: (recommendation: AwardRecommendation) => void;
}) {
  const groups: Array<{ kind: 'goals' | 'assists'; label: string; unit: string; rows: V1AdminTournamentPlayerRecordRow[] }> = [
    { kind: 'goals' as const, label: '득점 상위', unit: '골', rows: (goals ?? []).slice(0, TOP_N) },
    { kind: 'assists' as const, label: '도움 상위', unit: '도움', rows: (assists ?? []).slice(0, TOP_N) },
  ].filter((group) => group.rows.length > 0);
  if (groups.length === 0) return null;

  return (
    <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3">
      <p className="text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)] mb-2">
        추천 근거 — 공식 결과 집계 기준, 탭하면 항목이 미리 채워져요
      </p>
      <div className="flex flex-col gap-2">
        {groups.map((group) => (
          <div key={group.kind} className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-[var(--text-strong)] mr-1">{group.label}</span>
            {group.rows.map((row, index) => (
              <button
                key={`${row.userId ?? row.name}-${index}`}
                type="button"
                onClick={() => onPick({ kind: group.kind, row })}
                className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg border border-[var(--tint-blue-border)] bg-[var(--card-surface)] text-xs text-[var(--text-strong)] hover:bg-[var(--blue50)]"
                aria-label={`${group.label} ${index + 1}위 ${row.name} ${group.kind === 'goals' ? row.goals : row.assists}${group.unit}${row.teamName ? ` (${row.teamName})` : ''} — 수상 항목으로 추가`}
              >
                <span className="font-bold text-[var(--blue700)]">{index + 1}위</span>
                <span>{row.name}</span>
                <span className="text-[var(--text-muted)]">
                  {group.kind === 'goals' ? row.goals : row.assists}{group.unit}
                  {row.teamName ? ` · ${row.teamName}` : ''}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
