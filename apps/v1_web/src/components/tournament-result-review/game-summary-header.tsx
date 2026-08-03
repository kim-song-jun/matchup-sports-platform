'use client';

import type { GameActorRole, TournamentGameDetail } from '@/hooks/use-tournament-result-review';
import { ACTOR_ROLE_LABELS } from './result-review-copy';

const GAME_STATE_LABELS: Record<TournamentGameDetail['state'], string> = {
  SCHEDULED: '예정',
  LIVE: '진행 중',
  PAUSED: '일시 중지',
  ENDED: '종료',
  CANCELLED: '취소됨',
};

/**
 * GameSummaryHeader -- sticky context bar (`position: sticky`) so the
 * fixture/side/state identity stays visible while the operator scrolls a
 * long revision history on tablet(768)/desktop(1440) -- see this task's
 * acceptance criterion "tablet/desktop focus and sticky context work".
 */
export function GameSummaryHeader({
  game,
  currentScoreLabel,
}: {
  game: TournamentGameDetail;
  currentScoreLabel: string | null;
}) {
  const home = game.sides.find((side) => side.sideKey === 'HOME');
  const away = game.sides.find((side) => side.sideKey === 'AWAY');
  const roleLabel: GameActorRole | undefined = game.actorRole;

  return (
    <div
      className="tm-card"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        padding: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <p className="tm-text-body-lg" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
          {home?.displayNameSnapshot ?? '홈'} vs {away?.displayNameSnapshot ?? '원정'}
        </p>
        <p className="tm-text-caption" style={{ color: 'var(--text-caption)', marginTop: 4 }}>
          {GAME_STATE_LABELS[game.state]}
          {roleLabel ? ` · ${ACTOR_ROLE_LABELS[roleLabel]}` : ''}
        </p>
      </div>
      {currentScoreLabel ? (
        <p className="tab-num" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)' }}>
          {currentScoreLabel}
        </p>
      ) : (
        <span className="tm-badge tm-badge-grey">공식 결과 없음</span>
      )}
    </div>
  );
}
