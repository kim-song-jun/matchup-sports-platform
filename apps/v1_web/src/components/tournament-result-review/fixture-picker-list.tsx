'use client';

import type { TournamentOperationsBoardItem } from '@/hooks/use-tournament-result-review';
import { EmptyState } from '@/components/v1-ui/primitives';
import { formatGameResultScoreWithPenalties, readGameResultScore } from '@/lib/game-result-score';
// 라벨은 운영 보드 배지와 같은 출처를 쓴다 — 같은 경고 코드가 화면마다 다른 뜻으로
// 번역되던 문제(MISSING_SCORER: '기록자 없음' vs '득점자 미기재')를 막는다.
import { WARNING_LABELS } from '@/components/tournament-ops/badges';

function scoreLabel(item: TournamentOperationsBoardItem): string | null {
  // `.home` 을 직접 읽으면 백필된 경기(중첩 `{regulation:{…}}` 형태)가
  // `undefined:undefined` 로 나온다 — 알파 실측 사고. lib/game-result-score 참조.
  // 승부차기까지 병기해야 결선 무승부 경기가 목록에서 "0:0"으로만 보이지 않는다.
  // 점수가 없는 경기는 라벨 자체를 안 그린다(호출부가 null 을 그렇게 쓴다) — 그래서
  // 포맷터의 "기록 없음" 폴백을 쓰지 않고 null 판정을 먼저 한다.
  if (readGameResultScore(item.currentScore) === null) return null;
  return formatGameResultScoreWithPenalties(item.currentScore);
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
  teamNamesByFixtureId,
}: {
  items: readonly TournamentOperationsBoardItem[];
  selectedFixtureId: string | null;
  onSelect: (item: TournamentOperationsBoardItem) => void;
  emptyTitle: string;
  emptySub: string;
  /** fixtureId → 팀 이름. 운영 보드와 같은 소스(useV1Tournament().fixtures)에서 만든다.
   *  보드 API 응답에는 팀 이름이 없어서, 이게 없으면 "어느 경기인지" 알 수 없다. */
  teamNamesByFixtureId?: ReadonlyMap<string, { home: string; away: string }>;
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} sub={emptySub} />;
  }

  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item) => {
        const selected = item.fixtureId === selectedFixtureId;
        const score = scoreLabel(item);
        const names = teamNamesByFixtureId?.get(item.fixtureId);
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
                  {names ? `${names.home} vs ${names.away}` : `${item.fixtureNumber}번 경기`}
                </p>
                <p className="tm-text-caption" style={{ color: 'var(--text-weak)', marginTop: 2 }}>
                  {item.round} · {item.fixtureNumber}번 경기
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
