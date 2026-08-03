'use client';

import type { GameResultRevision } from '@/hooks/use-tournament-result-review';
import { REVISION_STATE_BADGE_TONE, REVISION_STATE_LABELS } from './result-review-copy';
import { formatAdminDateTime } from '@/lib/date-utils';

function scoreText(score: GameResultRevision['score']): string {
  const base = `${score.home}:${score.away}`;
  if (!score.penalties) return base;
  return `${base} (승부차기 ${score.penalties.home}:${score.penalties.away})`;
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
    <ol style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
      {revisions.map((revision) => {
        const previous = revision.supersedesId ? byId.get(revision.supersedesId) : undefined;
        const scoreChanged = previous && scoreText(previous.score) !== scoreText(revision.score);
        const tone = REVISION_STATE_BADGE_TONE[revision.state];
        return (
          <li key={revision.id} className="tm-card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span className={`tm-badge tm-badge-${tone}`}>{REVISION_STATE_LABELS[revision.state]}</span>
              <span className="tm-text-micro" style={{ color: 'var(--text-caption)' }}>
                {revision.submittedAt
                  ? formatAdminDateTime(revision.submittedAt)
                  : formatAdminDateTime(revision.createdAt)}
              </span>
            </div>
            <p className="tab-num" style={{ fontSize: 20, fontWeight: 700, marginTop: 8, color: 'var(--text-strong)' }}>
              {scoreText(revision.score)}
            </p>
            {scoreChanged && previous ? (
              <p className="tm-text-caption" style={{ color: 'var(--blue500)', marginTop: 2 }}>
                이전 {scoreText(previous.score)} → {scoreText(revision.score)}
              </p>
            ) : null}
            {revision.missingScorer ? (
              <p className="tm-text-caption" style={{ color: 'var(--orange500)', marginTop: 4 }}>
                득점자 정보가 없는 골이 있어요
              </p>
            ) : null}
            {revision.reason ? (
              <p className="tm-text-label" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                사유: {revision.reason}
              </p>
            ) : null}
            <p className="tm-text-micro" style={{ color: 'var(--text-caption)', marginTop: 6 }}>
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
