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
  /** 시계 줄 오른쪽의 버튼(일시 중지, 넓은 화면에서는 진행 버튼까지). */
  readonly actions?: ReactNode;
  /** 점수 아래 진행 단계 줄. */
  readonly progress: ReactNode | null;
  readonly caption: ReactNode | null;
  readonly footer: ReactNode | null;
  readonly stickyClass: string;
  /** 카드 바로 아래에 겹쳐 뜨는 것(토스트). 카드가 기준 상자라 카드와 같이 붙어 다닌다. */
  readonly overlay?: ReactNode;
}

/**
 * 팀 파울 표시 단계. 기준에 이르면 예고(notice), 기준을 넘는 파울부터 세컨 파울(second)이다.
 * 색(주황 → 빨강)만으로 구분하지 않고 문구도 다르다.
 */
const FOUL_STAGE_TONE = {
  none: { color: 'text-[var(--text-body)]', message: null },
  notice: { color: 'text-[var(--orange700)]', message: '다음부터 10m 프리킥' },
  second: { color: 'text-[var(--red700)]', message: '세컨 파울 · 10m 프리킥' },
} as const;

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
  actions = null,
  progress,
  caption,
  footer,
  stickyClass,
  overlay,
}: ConsoleScoreCardProps) {
  const [left, right] = sides;
  const chipRowVisible = stateLabel !== null || clock !== null || penaltyChip !== null || actions !== null;
  // 안내 문구는 시계 줄이 있으면 그 줄의 칩 옆에 이어 붙인다 — 폰에서 기록 버튼이 진행 바 위에 남고,
  // 넓은 화면의 하프타임처럼 왼쪽이 빈 줄에서 진행 버튼이 혼자 떠 있지 않다.
  const captionInRow = chipRowVisible && caption !== null;

  const teamColumn = (side: GameSide, align: 'start' | 'end') => {
    const sideWord = side.sideKey === 'HOME' ? '홈' : '원정';
    const fouls = foulCounts[side.id] ?? 0;
    const stage = foulLabel === null || fouls < foulThreshold ? 'none' : fouls === foulThreshold ? 'notice' : 'second';
    const tone = FOUL_STAGE_TONE[stage];
    return (
      <div
        role="group"
        aria-label={`${sideWord} ${side.displayNameSnapshot}`}
        className={`flex min-w-0 flex-col gap-1 ${align === 'end' ? 'items-end text-right' : 'items-start'}`}
      >
        <span className="text-[length:var(--font-size-caption)] font-medium text-[var(--text-muted)]">{sideWord}</span>
        {/* 앞머리가 같은 긴 팀 이름도 구별되게 자르지 않고 줄바꿈한다. */}
        <span
          className="break-keep text-[length:var(--font-size-body)] font-bold leading-snug text-[var(--text-strong)]"
          style={{ overflowWrap: 'anywhere' }}
        >
          {side.displayNameSnapshot}
        </span>
        {foulLabel !== null ? (
          <span
            className={`flex items-center gap-1 whitespace-nowrap text-[length:var(--font-size-caption)] tabular-nums ${
              stage === 'none' ? 'font-medium' : 'font-bold'
            } ${tone.color}`}
          >
            {stage !== 'none' ? <AlertTriangle size={12} aria-hidden="true" className="shrink-0" /> : null}
            <span>
              {foulLabel} {fouls}
            </span>
          </span>
        ) : null}
        {tone.message !== null ? (
          <span className={`text-[length:var(--font-size-caption)] font-semibold ${tone.color}`}>{tone.message}</span>
        ) : null}
      </div>
    );
  };

  return (
    <header
      data-console-guide="overview"
      className={['sticky z-10 rounded-[var(--radius-container)] bg-[var(--card-surface)] p-4', stickyClass].join(' ')}
    >
      {left === undefined ? (
        <p className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">경기 콘솔</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          {teamColumn(left, 'start')}
          <span
            className="text-4xl font-extrabold leading-none tabular-nums text-[var(--text-strong)]"
            aria-label={`스코어 ${sides.map((side) => `${side.displayNameSnapshot} ${scoreBySideId.get(side.id) ?? 0}점`).join(', ')}`}
          >
            {/* 점수는 한 텍스트 노드로 둔다 — 숫자 사이에 요소를 끼우면 읽는 쪽에서 하나의 값으로 잡히지 않는다. */}
            <span>{sides.map((side) => scoreBySideId.get(side.id) ?? 0).join(' : ')}</span>
          </span>
          {right !== undefined ? teamColumn(right, 'end') : <span />}
        </div>
      )}
      {progress !== null || chipRowVisible ? (
        <div className="mt-3 flex flex-col gap-3">
          {progress}
          {chipRowVisible ? (
            <div className={`flex items-center justify-between gap-3 ${actions === null ? '' : 'min-h-11'}`}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                {stateLabel !== null ? (
                  <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[length:var(--font-size-caption)] font-semibold text-[var(--text-body)]">
                    {stateLabel}
                  </span>
                ) : null}
                {clock}
                {penaltyChip}
                {captionInRow ? caption : null}
              </div>
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      {caption !== null && !captionInRow ? <div className="mt-3">{caption}</div> : null}
      {footer !== null ? <div className="mt-3">{footer}</div> : null}
      {overlay}
    </header>
  );
}
