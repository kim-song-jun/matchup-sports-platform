'use client';

import type {
  GameActorRole,
  GameResultRevisionState,
  GameResultScore,
  TournamentGameDetail,
} from '@/hooks/use-tournament-result-review';
import { ACTOR_ROLE_LABELS } from './result-review-copy';
import { formatGameResultScore } from '@/lib/game-result-score';

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
 *
 * `currentRevision` is the revision `game.currentOfficialRevisionId` points
 * at (or `null` if the game has never had an official result). Per
 * `docs/api/domains/tournament-operations.md`'s void contract, that pointer
 * is only ever repointed to a revision whose state is `OFFICIAL` (via
 * officialize) or `VOID` (via void) -- there is no third reachable state for
 * this pointer. The header must distinguish those two explicitly: a `VOID`
 * pointer is NOT a confirmed score and must never render as one (the defect
 * this replaced showed the void revision's score as a plain "confirmed"
 * number with no void indication, because callers used to pass a pre-
 * formatted label without a state check).
 */
export function GameSummaryHeader({
  game,
  currentRevision,
}: {
  game: TournamentGameDetail;
  currentRevision: { score: GameResultScore; state: GameResultRevisionState } | null;
}) {
  const home = game.sides.find((side) => side.sideKey === 'HOME');
  const away = game.sides.find((side) => side.sideKey === 'AWAY');
  const roleLabel: GameActorRole | undefined = game.actorRole;
  // 백필된 경기의 score 는 중첩(`{regulation:{home,away}}`) 형태라 `.home` 을 직접
  // 읽으면 `undefined:undefined` 가 된다(알파 실측 사고). lib/game-result-score 참조.
  const confirmedScoreLabel =
    currentRevision && currentRevision.state === 'OFFICIAL'
      ? formatGameResultScore(currentRevision.score, '기록 없음')
      : null;
  const isVoided = currentRevision?.state === 'VOID';

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
      {confirmedScoreLabel ? (
        <p className="tab-num" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)' }}>
          {confirmedScoreLabel}
        </p>
      ) : isVoided ? (
        <span className="tm-badge tm-badge-red">무효 처리됨</span>
      ) : (
        <span className="tm-badge tm-badge-grey">공식 결과 없음</span>
      )}
    </div>
  );
}
