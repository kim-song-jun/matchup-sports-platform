'use client';

import type {
  GameActorRole,
  GameResultRevisionState,
  GameResultScore,
  TournamentGameDetail,
} from '@/hooks/use-tournament-result-review';
import { ACTOR_ROLE_LABELS } from './result-review-copy';
import { formatGameResultScore, formatPenaltyShootout, readGameResultScore } from '@/lib/game-result-score';

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
  // 결선 무승부는 승부차기로만 승자가 갈린다 — 정규시간 점수만 그리면 확정된 결승이
  // "0:0"으로만 보여 승자가 없는 결과로 읽힌다(알파 실측: 서버에는 승부차기 2:0이
  // 있는데 이 헤더에는 안 나왔다).
  const confirmedPenalties =
    currentRevision && currentRevision.state === 'OFFICIAL'
      ? (readGameResultScore(currentRevision.score)?.penalties ?? null)
      : null;
  // 문구 조립은 `formatPenaltyShootout` 하나로 모은다 — 여기서 손으로 조립하면 선축이
  // 빠져, 같은 화면 아래 리비전 타임라인(`formatGameResultScoreWithPenalties`)에는
  // `선축 원정`이 뜨는데 이 헤더에는 안 뜨는 어긋남이 생긴다.
  const confirmedPenaltyLabel = confirmedPenalties ? formatPenaltyShootout(confirmedPenalties) : null;
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
        /* 승부차기는 큰 숫자에 섞지 않고 바로 아래 캡션으로 병기한다 — 26px 한 줄에
           "0:0 (승부차기 2:0)"을 넣으면 모바일에서 줄바꿈되고, 무엇보다 "정규시간
           점수"와 "승부차기 점수"는 다른 값이라 같은 위계로 읽히면 안 된다(공개
           결과 화면도 스코어 밑 작은 `PK 4:3` 배치를 쓴다). */
        <div style={{ textAlign: 'right' }}>
          <p className="tab-num" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)' }}>
            {confirmedScoreLabel}
          </p>
          {confirmedPenaltyLabel ? (
            <p className="tm-text-caption tab-num" style={{ color: 'var(--text-caption)', marginTop: 2 }}>
              {confirmedPenaltyLabel}
            </p>
          ) : null}
        </div>
      ) : isVoided ? (
        <span className="tm-badge tm-badge-red">무효 처리됨</span>
      ) : (
        <span className="tm-badge tm-badge-grey">공식 결과 없음</span>
      )}
    </div>
  );
}
