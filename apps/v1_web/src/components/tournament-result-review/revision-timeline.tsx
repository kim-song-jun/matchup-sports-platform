'use client';

import type { GameResultRevision } from '@/hooks/use-tournament-result-review';
import { REVISION_STATE_BADGE_TONE, REVISION_STATE_LABELS } from './result-review-copy';
import { formatAdminDateTime } from '@/lib/date-utils';
import { formatGameResultScoreWithPenalties } from '@/lib/game-result-score';

// `.home`/`.away` 를 직접 읽으면 백필된 경기(중첩 `{regulation:{…}}` 형태)가
// `undefined:undefined` 로 나온다 — 알파 실측 사고("처리 이력"에 실제로 이렇게 떴다).
// 승부차기 병기 문구는 여기서 조립하던 것을 `lib/game-result-score` 로 올려, 스태프
// 화면 전체(운영 보드·운영 콘솔·결과 검수)가 같은 한 문구를 쓴다.
function scoreText(score: GameResultRevision['score']): string {
  return formatGameResultScoreWithPenalties(score);
}

/**
 * RevisionTimeline -- append-only audit trail of a game's result revisions,
 * newest first (matches `GET /games/:gameId/result-revisions`'s own
 * ordering). Every row shows actor/reason/before-after score diff against
 * the revision it supersedes, satisfying "correction always captures reason
 * and diff" for the read side of that requirement (the write side is
 * `ResultEditModal`'s own diff summary).
 */
export function RevisionTimeline({ revisions }: { revisions: readonly GameResultRevision[] }) {
  const byId = new Map(revisions.map((revision) => [revision.id, revision]));

  if (revisions.length === 0) {
    return (
      <p className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
        아직 제출된 결과가 없어요.
      </p>
    );
  }

  return (
    <ol style={{ display: 'flex', flexDirection: 'column', gap: 12, listStyle: 'none', padding: 0, margin: 0 }}>
      {revisions.map((revision) => {
        const previous = revision.supersedesId ? byId.get(revision.supersedesId) : undefined;
        const scoreChanged = previous && scoreText(previous.score) !== scoreText(revision.score);
        const tone = REVISION_STATE_BADGE_TONE[revision.state];
        return (
          <li key={revision.id} className="tm-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span className={`tm-badge tm-badge-${tone}`}>{REVISION_STATE_LABELS[revision.state]}</span>
              {/* [알파 감사 C] tm-text-micro(11px)는 R-T2 하한(12px) 미달 — 처리
                  이력의 날짜가 알파 실측에서 지적됐다. 한 단계 위 캡션
                  토큰으로 교체. */}
              <span className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>
                {revision.submittedAt
                  ? formatAdminDateTime(revision.submittedAt)
                  : formatAdminDateTime(revision.createdAt)}
              </span>
            </div>
            <p className="tab-num" style={{ fontSize: 20, fontWeight: 700, marginTop: 8, color: 'var(--text-strong)' }}>
              {scoreText(revision.score)}
            </p>
            {scoreChanged && previous ? (
              <p className="tm-text-caption" style={{ color: 'var(--blue700)', marginTop: 2 }}>
                이전 {scoreText(previous.score)} → {scoreText(revision.score)}
              </p>
            ) : null}
            {revision.missingScorer ? (
              <p className="tm-text-caption" style={{ color: 'var(--orange700)', marginTop: 4 }}>
                득점자 정보가 없는 골이 있어요
              </p>
            ) : null}
            {revision.reason ? (
              <p className="tm-text-label" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                사유: {revision.reason}
              </p>
            ) : null}
            {/* [알파 감사 C] "담당자 처리 · 리비전 #N" — 알파 실측 지적 항목. 11px → 12px. */}
            <p className="tm-text-caption" style={{ color: 'var(--text-caption)', marginTop: 8 }}>
              {revision.createdByActorType === 'SYSTEM'
                ? `자동 처리(${revision.createdBySystemActor ?? '시스템'})`
                : '담당자 처리'}
              {' · '}리비전 #{revision.revision}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
