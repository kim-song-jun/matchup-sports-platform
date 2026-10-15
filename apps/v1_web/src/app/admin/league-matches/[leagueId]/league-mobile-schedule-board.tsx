'use client';

import { BracketCanvasMobile, type BracketCanvasMobileProps } from '@/components/admin/bracket-canvas/bracket-canvas-mobile';
import { AlertBanner, EmptyState } from '@/components/v1-ui/primitives';

interface LeagueMobileScheduleBoardProps extends Omit<BracketCanvasMobileProps, 'competitionId' | 'scope' | 'onEditFixture'> {
  leagueId: string;
  replaceExisting: boolean;
  templateBlockedReason: string | null;
  /** 종료된 리그의 경기 편집 제한은 기존 결과 정정 권한과 분리해요. */
  canEditFixture: boolean;
  onOpenTemplate: () => void;
  onEditFixture: (fixtureId: string) => void;
}

export function LeagueMobileScheduleBoard({
  leagueId,
  replaceExisting,
  templateBlockedReason,
  canEditFixture,
  onOpenTemplate,
  onEditFixture,
  ...canvasProps
}: LeagueMobileScheduleBoardProps) {
  const canApplyTemplate = canvasProps.canWrite && templateBlockedReason === null;

  if (canvasProps.rounds.length === 0) {
    return (
      <EmptyState
        title="아직 일정이 없어요"
        sub={canvasProps.canWrite
          ? templateBlockedReason ?? '템플릿으로 빈 경기를 먼저 만들고, 경기에서 팀과 일정을 정할 수 있어요.'
          : '아직 만들어진 일정이 없어요.'}
        cta={canApplyTemplate ? '템플릿으로 시작' : undefined}
        onCta={onOpenTemplate}
      />
    );
  }

  return (
    <section aria-label="리그 일정 관리" className="flex flex-col gap-3">
      {canApplyTemplate ? (
        <button
          type="button"
          className="tm-btn tm-btn-md tm-btn-outline w-full"
          style={{ minHeight: 'var(--size-touch-min)' }}
          onClick={onOpenTemplate}
        >
          {replaceExisting ? '템플릿으로 다시 만들기' : '템플릿으로 시작'}
        </button>
      ) : canvasProps.canWrite && templateBlockedReason ? (
        <AlertBanner tone="info" message={templateBlockedReason} />
      ) : null}
      <BracketCanvasMobile
        {...canvasProps}
        competitionId={leagueId}
        scope="league"
        onEditFixture={canEditFixture ? onEditFixture : undefined}
      />
    </section>
  );
}
