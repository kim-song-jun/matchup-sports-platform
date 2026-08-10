'use client';

import type { TournamentOperationsBoardItem } from '@/hooks/use-tournament-result-review';
import { EmptyState } from '@/components/v1-ui/primitives';
import { readGameResultScore } from '@/lib/game-result-score';

const WARNING_LABELS: Record<string, string> = {
  MISSING_SCORER: '득점자 미기재',
  RESULT_REVIEW_OVERDUE: '검토 기한 초과',
  NO_FIELD_ASSIGNED: '경기장 미배정',
};

function scoreLabel(item: TournamentOperationsBoardItem): string | null {
  // `.home` 을 직접 읽으면 백필된 경기(중첩 `{regulation:{…}}` 형태)가
  // `undefined:undefined` 로 나온다 — 알파 실측 사고. lib/game-result-score 참조.
  const score = readGameResultScore(item.currentScore);
  return score === null ? null : `${score.home}:${score.away}`;
}

/**
 * FixturePickerList -- left-hand (or top, on mobile) fixture list shared by
 * both the result-review and records/corrections screens. Each screen
 * passes its own already-filtered `items` (see `result-review-page-client
 * .tsx`/`corrections-page-client.tsx`) so this component stays a pure
 * presentational list + selection callback.
 */
export function FixturePickerList({
  items,
  selectedFixtureId,
  onSelect,
  emptyTitle,
  emptySub,
}: {
  items: readonly TournamentOperationsBoardItem[];
  selectedFixtureId: string | null;
  onSelect: (item: TournamentOperationsBoardItem) => void;
  emptyTitle: string;
  emptySub: string;
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} sub={emptySub} />;
  }

  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item) => {
        const selected = item.fixtureId === selectedFixtureId;
        const score = scoreLabel(item);
        return (
          <li key={item.fixtureId}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              disabled={!item.gameId}
              className="tm-list-row tm-pressable"
              aria-current={selected ? 'true' : undefined}
              style={{
                width: '100%',
                textAlign: 'left',
                minHeight: 44,
                border: selected ? '2px solid var(--blue500)' : '1px solid transparent',
                borderRadius: 12,
                cursor: item.gameId ? 'pointer' : 'not-allowed',
                opacity: item.gameId ? 1 : 0.55,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="tm-text-body" style={{ color: 'var(--text-strong)' }}>
                  {item.round} · {item.fixtureNumber}경기
                </p>
                {item.warnings.length > 0 ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {item.warnings.map((warning) => (
                      <span key={warning} className="tm-badge tm-badge-orange">
                        {WARNING_LABELS[warning] ?? warning}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)', flexShrink: 0 }}>
                {score ?? '결과 대기'}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
