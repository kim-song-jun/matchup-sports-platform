'use client';

import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { formatPenaltyShootout, readGameResultScore } from '@/lib/game-result-score';
import type { GameResultRevision, TournamentGameDetail } from '@/hooks/use-tournament-result-review';

export interface ConsoleResultCardProps {
  readonly game: TournamentGameDetail;
  /** 가장 최근 리비전. 아직 없으면 `null`. */
  readonly latest: GameResultRevision | null;
  /** 확정 권한이 없는 역할(서버 `actorRole` 기준) — 확정 카드 대신 안내만 보인다. */
  readonly readOnly: boolean;
  readonly missingAssists: number;
  /** 감독관이 확정 기능을 쓸 수 있는 상태인지(서버 게이트가 꺼져 있으면 버튼을 숨긴다). */
  readonly officializeVisible: boolean;
  readonly officializeGateClosed: boolean;
  readonly officializing: boolean;
  readonly errorMessage: string | null;
  readonly onOfficialize: () => void;
  readonly onResubmit: () => void;
  readonly onRetryGate: () => void;
  /** 확정된 뒤 이어질 곳(순위표·다음 경기). 콘솔이 아는 라우트라서 밖에서 받는다. */
  readonly confirmedFooter?: ReactNode;
}

/**
 * 경기가 끝난 직후 콘솔이 그 자리에서 보여주는 결과 확정 카드.
 *
 * 확정할 스코어를 맨 위에 크게 둔다. 확정 권한(`canActOnResultReview`)이 없는 역할에는
 * 카드 대신 "제출했어요, 운영자가 확인해요" 안내만 보이고, 어느 쪽이든 실제 확정은 서버가
 * 역할을 다시 검사한다(화면 숨김은 편의일 뿐 권한 경계가 아니다).
 */
export function ConsoleResultCard({
  game,
  latest,
  readOnly,
  missingAssists,
  officializeVisible,
  officializeGateClosed,
  officializing,
  errorMessage,
  onOfficialize,
  onResubmit,
  onRetryGate,
  confirmedFooter,
}: ConsoleResultCardProps) {
  if (latest === null) {
    return <AlertBanner tone="info" message="제출된 결과를 아직 찾지 못했어요. 잠시 뒤 다시 확인해 주세요." />;
  }
  if (latest.state === 'VOID') {
    return <AlertBanner tone="error" message="무효 처리된 결과예요." />;
  }

  const home = game.sides.find((side) => side.sideKey === 'HOME');
  const away = game.sides.find((side) => side.sideKey === 'AWAY');
  const score = readGameResultScore(latest.score);
  const scoreText = score === null ? '기록 없음' : `${score.home} : ${score.away}`;
  const penaltyText = score?.penalties ? formatPenaltyShootout(score.penalties) : null;

  if (latest.state === 'OFFICIAL') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] px-4 py-3">
        <CheckCircle2 size={20} aria-hidden="true" className="shrink-0 text-[var(--green500)]" />
        <p className="tm-text-label min-w-0 flex-1" style={{ lineHeight: 1.5 }}>
          {scoreText} 공식 결과로 확정했어요.
        </p>
        {confirmedFooter}
      </div>
    );
  }

  // 확정 대기(SUBMITTED)만 카드 대상이다 — 정정 초안(DRAFT) 등은 결과 정정 화면의 몫이다.
  if (latest.state !== 'SUBMITTED') return null;

  if (readOnly) {
    return (
      <AlertBanner
        tone="info"
        message={
          game.actorRole === 'field_operator'
            ? '결과를 제출했어요. 운영자가 확인해요.'
            : '결과가 제출됐어요. 운영자가 확인해요.'
        }
      />
    );
  }

  return (
    <section className="tm-card" style={{ padding: 20 }} aria-label="결과 확정">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3 className="tm-text-label" style={{ fontWeight: 600 }}>결과 확정</h3>
        <span className="tm-badge tm-badge-orange">확정 전</span>
      </div>
      <div className="flex items-center justify-center gap-5 pb-3 pt-4">
        <p className="min-w-0 flex-1 text-right text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
          {home?.displayNameSnapshot ?? '홈'}
        </p>
        <p
          className="tab-num shrink-0 text-[length:var(--font-size-heading)] font-extrabold leading-none text-[var(--text-strong)]"
          aria-label={`스코어 ${scoreText}`}
        >
          {scoreText}
        </p>
        <p className="min-w-0 flex-1 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
          {away?.displayNameSnapshot ?? '원정'}
        </p>
      </div>
      {penaltyText ? (
        <p className="tm-text-caption tab-num pb-3 text-center" style={{ color: 'var(--text-caption)' }}>
          {penaltyText}
        </p>
      ) : null}
      {missingAssists > 0 ? (
        <div className="mb-3">
          <AlertBanner
            tone="info"
            message={`어시스트 미기입 ${missingAssists}건 — 확정에는 영향 없어요. 기록된 이벤트에서 “어시스트”로 넣을 수 있어요.`}
          />
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {officializeVisible ? (
          <Button variant="primary" size="md" loading={officializing} onClick={onOfficialize}>
            {scoreText} 결과 확정
          </Button>
        ) : null}
        <Button variant="outline" size="md" disabled={officializing} onClick={onResubmit}>
          고치고 확정
        </Button>
      </div>
      <p className="tm-text-caption" style={{ marginTop: 12, lineHeight: 1.5, color: 'var(--text-muted)' }}>
        확정하면 순위표와 전적에 반영돼요. 그 뒤에는 결과 정정에서만 고칠 수 있어요.
      </p>
      {officializeGateClosed ? (
        <div className="mt-3 flex flex-col gap-2">
          <AlertBanner
            tone="warning"
            message="결과 확정 기능이 아직 활성화되지 않았어요. 플랫폼 운영팀에 문의해 주세요."
          />
          <Button variant="ghost" size="sm" onClick={onRetryGate}>
            다시 확인
          </Button>
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-3">
          <AlertBanner tone="error" message={`${errorMessage} 다시 시도해 주세요.`} />
        </div>
      ) : null}
    </section>
  );
}
