import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { GameSide } from '@/types/game-operations';

export interface ConsoleScoreCardProps {
  readonly sides: readonly GameSide[];
  readonly scoreBySideId: ReadonlyMap<string, number>;
  readonly foulCounts: Record<string, number>;
  readonly foulThreshold: number;
  /** 팀 파울 줄의 이름. 어느 경기 시간의 숫자인지는 단계 줄이 말한다. null 이면 팀 파울을 그리지 않는다. */
  readonly foulLabel: string | null;
  /** 상태 배지. 경기가 정상으로 흐르는 동안은 시계·단계 줄이 말하므로 null 로 숨긴다. */
  readonly stateLabel: string | null;
  readonly clock: ReactNode;
  readonly penaltyChip: ReactNode | null;
  /** 점수 아래 진행 단계 줄. */
  readonly progress: ReactNode | null;
  readonly caption: ReactNode | null;
  readonly footer: ReactNode | null;
  readonly stickyClass: string;
  /** 카드 바로 아래에 겹쳐 뜨는 것(토스트). 카드가 기준 상자라 카드와 같이 붙어 다닌다. */
  readonly overlay?: ReactNode;
}

/** 콘솔 머리: 점수 · 팀 파울 · 상태 · 시계를 한 장에 모은다. 스크롤해도 화면 위에 붙어 있다. */
export function ConsoleScoreCard({
  sides,
  scoreBySideId,
  foulCounts,
  foulThreshold,
  foulLabel,
  stateLabel,
  clock,
  penaltyChip,
  progress,
  caption,
  footer,
  stickyClass,
  overlay,
}: ConsoleScoreCardProps) {
  const [left, right] = sides;
  const chipRowVisible = stateLabel !== null || clock !== null || penaltyChip !== null;

  const teamColumn = (side: GameSide, align: 'start' | 'end') => {
    const sideWord = side.sideKey === 'HOME' ? '홈' : '원정';
    const fouls = foulCounts[side.id] ?? 0;
    const warning = foulLabel !== null && fouls >= foulThreshold;
    return (
      <div
        role="group"
        aria-label={`${sideWord} ${side.displayNameSnapshot}`}
        className={`flex min-w-0 flex-col gap-0.5 ${align === 'end' ? 'items-end text-right' : 'items-start'}`}
      >
        <span className="text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">{sideWord}</span>
        {/* 앞머리가 같은 긴 팀 이름도 구별되게 자르지 않고 줄바꿈한다. */}
        <span
          className="break-keep text-[length:var(--font-size-body-sm)] font-bold leading-snug text-[var(--text-strong)]"
          style={{ overflowWrap: 'anywhere' }}
        >
          {side.displayNameSnapshot}
        </span>
        {foulLabel !== null ? (
          <span
            className={`flex items-center gap-1 whitespace-nowrap text-[length:var(--font-size-caption)] tabular-nums ${
              warning ? 'font-bold text-[var(--orange700)]' : 'text-[var(--text-body)]'
            }`}
          >
            {warning ? <AlertTriangle size={12} aria-hidden="true" className="shrink-0" /> : null}
            <span>
              {foulLabel} {fouls}
            </span>
          </span>
        ) : null}
        {warning ? (
          <span className="text-[length:var(--font-size-caption)] font-semibold text-[var(--orange700)]">다음부터 10m 프리킥</span>
        ) : null}
      </div>
    );
  };

  return (
    <header
      data-console-guide="overview"
      className={['sticky z-10 border-b border-[var(--border)] bg-[var(--card-surface)] px-4 py-3', stickyClass].join(' ')}
    >
      {left === undefined ? (
        <p className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">경기 콘솔</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          {teamColumn(left, 'start')}
          <span
            className="flex items-center gap-2 text-4xl font-extrabold leading-none tabular-nums text-[var(--text-strong)]"
            aria-label={`스코어 ${sides.map((side) => `${side.displayNameSnapshot} ${scoreBySideId.get(side.id) ?? 0}점`).join(', ')}`}
          >
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--blue500)]" />
            {/* 점수는 한 텍스트 노드로 둔다 — 숫자 사이에 요소를 끼우면 읽는 쪽에서 하나의 값으로 잡히지 않는다. */}
            <span>{sides.map((side) => scoreBySideId.get(side.id) ?? 0).join(' : ')}</span>
            {right !== undefined ? (
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--orange500)]" />
            ) : null}
          </span>
          {right !== undefined ? teamColumn(right, 'end') : <span />}
        </div>
      )}
      <div className="mt-2 flex flex-col gap-2 border-t border-[var(--border)] pt-2">
        {progress}
        {chipRowVisible ? (
          <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
            {stateLabel !== null ? (
              <span className="rounded-full bg-[var(--blue50)] px-2 py-0.5 text-[length:var(--font-size-caption)] font-semibold text-[var(--blue700)]">
                {stateLabel}
              </span>
            ) : null}
            {clock}
            {penaltyChip}
          </div>
        ) : null}
      </div>
      {caption !== null ? <div className="mt-2">{caption}</div> : null}
      {footer !== null ? <div className="mt-3">{footer}</div> : null}
      {overlay}
    </header>
  );
}
