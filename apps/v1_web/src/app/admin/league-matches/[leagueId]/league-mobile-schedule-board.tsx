'use client';

import { BracketCanvasMobile, type BracketCanvasMobileProps } from '@/components/admin/bracket-canvas/bracket-canvas-mobile';
import { LeagueWeekSummaryLines, leagueWeekHeading } from '@/components/admin/bracket-canvas/league-schedule-board';
import { AlertBanner, EmptyState } from '@/components/v1-ui/primitives';
import type { LeagueBoardColumn } from '@/lib/league-board-model';

interface LeagueMobileScheduleBoardProps extends Omit<BracketCanvasMobileProps, 'competitionId' | 'scope' | 'onEditFixture' | 'renderRoundHeader'> {
  leagueId: string;
  replaceExisting: boolean;
  templateBlockedReason: string | null;
  /** 종료된 리그의 경기 편집 제한은 기존 결과 정정 권한과 분리해요. */
  canEditFixture: boolean;
  onOpenTemplate: () => void;
  onEditFixture: (fixtureId: string) => void;
  /** 라운드(주차) 키와 같은 key 의 주차 칸 — 탭 아래에 날짜·요약을 보인다. */
  weeks: readonly LeagueBoardColumn[];
  /** 참가팀 목록을 받았는지 — 받기 전에는 쉬는 팀을 세지 않는다. */
  teamsKnown: boolean;
  /** 주차의 '이 주에 경기 추가'. 없으면 버튼을 그리지 않는다. */
  onAddToWeek?: (week: LeagueBoardColumn) => void;
}

export function LeagueMobileScheduleBoard({
  leagueId,
  replaceExisting,
  templateBlockedReason,
  canEditFixture,
  onOpenTemplate,
  onEditFixture,
  weeks,
  teamsKnown,
  onAddToWeek,
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
        renderRoundHeader={(roundKey) => {
          const week = weeks.find((candidate) => candidate.key === roundKey);
          if (week === undefined) return null;
          return (
            <div className="flex flex-col gap-1">
              <p className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">{leagueWeekHeading(week)}</p>
              <LeagueWeekSummaryLines column={week} teamsKnown={teamsKnown} />
              {onAddToWeek ? (
                <button
                  type="button"
                  onClick={() => onAddToWeek(week)}
                  aria-label={`${week.weekNumber}주차에 경기 추가`}
                  className="tm-btn tm-btn-md tm-btn-outline mt-1 w-full"
                  style={{ minHeight: 'var(--size-touch-min)' }}
                >
                  + 이 주에 경기 추가
                </button>
              ) : null}
            </div>
          );
        }}
      />
    </section>
  );
}
