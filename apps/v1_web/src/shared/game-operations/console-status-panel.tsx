'use client';

import { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { Button } from '@/components/v1-ui/button';
import type { QueuedGameEvent } from '@/lib/game-operations-queue';
import type { ConsoleStatus, ConsoleStatusActionKind, ConsoleStatusItem } from './console-status';
import { QueueStatusPanel, hasUnsettledQueueItems } from './queue-status-panel';

/** `label` 은 「홈 · 팀명」. `count` 는 그 팀에서 기록에 고를 수 있는 선수 수다. */
export interface RosterRow {
  readonly sideId: string;
  readonly label: string;
  readonly count: number;
}

export interface ConsoleStatusPanelProps {
  readonly status: ConsoleStatus;
  /** 킥오프 전에는 null — 그때는 킥오프 준비 패널이 명단이다. */
  readonly roster: readonly RosterRow[] | null;
  readonly queue: {
    readonly items: readonly QueuedGameEvent[];
    onRetry(clientEventId: string): void;
    readonly disabled: boolean;
    isRetryableError(code: string, reason?: string | null): boolean;
  };
  readonly actions: { takeover(): void; retryCommand(): void; retryExpiry(): void };
  /** 보기 전용 기기에서도 「이 기기에서 기록하기」는 눌려야 해서 버튼마다 따로 잠근다. */
  readonly actionsDisabled: { readonly [kind in ConsoleStatusActionKind]?: boolean };
}

const TONE_CLASS: Record<ConsoleStatus['tone'], string> = {
  ok: 'bg-[var(--surface-soft)] text-[var(--text-body)]',
  info: 'bg-[var(--tint-blue)] text-[var(--blue700)]',
  warning: 'bg-[var(--tint-orange)] text-[var(--orange700)]',
  danger: 'bg-[var(--tint-red)] text-[var(--red700)]',
};

const TONE_ICON: Record<ConsoleStatus['tone'], typeof Info> = {
  ok: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  danger: AlertCircle,
};

const DETAIL_BUTTON_CLASS =
  'flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg px-2 text-[length:var(--font-size-body-sm)] font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)]';

/** 콘솔의 안내를 한 줄로 보여 주고, 나머지는 「자세히」 시트에 모은다. */
export function ConsoleStatusPanel({ status, roster, queue, actions, actionsDisabled }: ConsoleStatusPanelProps) {
  const [open, setOpen] = useState(false);
  const Icon = TONE_ICON[status.tone];
  const topAction = status.items[0]?.action;

  const run = (kind: ConsoleStatusActionKind) => {
    if (kind === 'takeover') actions.takeover();
    else if (kind === 'retry-command') actions.retryCommand();
    else actions.retryExpiry();
  };
  const actionButton = (action: NonNullable<ConsoleStatusItem['action']>) => (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="min-h-[44px] text-[length:var(--font-size-body-sm)]"
      disabled={actionsDisabled[action.kind] === true}
      onClick={() => run(action.kind)}
    >
      {action.label}
    </Button>
  );
  const detailButton = (
    <button type="button" aria-haspopup="dialog" className={DETAIL_BUTTON_CLASS} onClick={() => setOpen(true)}>
      자세히
    </button>
  );

  return (
    <>
      <div
        role={status.tone === 'danger' ? 'alert' : 'status'}
        className={`mx-4 flex flex-col rounded-xl px-3 py-1 text-[length:var(--font-size-body-sm)] font-medium ${TONE_CLASS[status.tone]}`}
      >
        <div className="flex items-center gap-2">
          <Icon size={16} aria-hidden="true" className="shrink-0" />
          <p className="min-w-0 flex-1 break-keep py-2">{status.headline}</p>
          {topAction ? null : detailButton}
        </div>
        {topAction ? (
          <div className="flex items-center justify-between gap-2 pb-1">
            {actionButton(topAction)}
            {detailButton}
          </div>
        ) : null}
      </div>

      {/* 닫혀 있을 때는 시트를 마운트하지 않는다 — 시트의 라우터 훅이 콘솔 첫 렌더에 끼지 않게. */}
      {open ? (
      <BottomSheet open title="경기 상태" onClose={() => setOpen(false)}>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pb-2">
          <section className="flex flex-col gap-2">
            <h3 className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
              {status.items.length > 0 ? `지금 확인할 것 ${status.items.length}개` : '지금 확인할 것이 없어요'}
            </h3>
            {status.items.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {status.items.map((item) => {
                  const ItemIcon = TONE_ICON[item.tone];
                  return (
                    <li key={item.key} className={`flex flex-col gap-2 rounded-xl px-3 py-3 ${TONE_CLASS[item.tone]}`}>
                      <div className="flex items-start gap-2">
                        <ItemIcon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="break-keep text-[length:var(--font-size-body-sm)] font-bold">{item.title}</p>
                          {item.body !== '' ? (
                            <p className="mt-1 break-keep text-[length:var(--font-size-body-sm)] leading-relaxed">{item.body}</p>
                          ) : null}
                        </div>
                      </div>
                      {item.action ? <div className="flex">{actionButton(item.action)}</div> : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          {hasUnsettledQueueItems(queue.items) ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">보낼 기록</h3>
              <QueueStatusPanel
                items={queue.items}
                onRetry={queue.onRetry}
                disabled={queue.disabled}
                isRetryableError={queue.isRetryableError}
              />
            </section>
          ) : null}

          <dl className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 text-[length:var(--font-size-body-sm)]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-[var(--text-muted)]">연결</dt>
              <dd className="text-right font-medium text-[var(--text-strong)]">{status.facts.connection}</dd>
            </div>
            {status.facts.recordingDevice !== null ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-[var(--text-muted)]">기록하는 기기</dt>
                <dd className="text-right font-medium text-[var(--text-strong)]">{status.facts.recordingDevice}</dd>
              </div>
            ) : null}
            {roster !== null ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-[var(--text-muted)]">출전 명단</dt>
                <dd className="flex flex-col gap-1 text-right font-medium text-[var(--text-strong)]">
                  {roster.map((row) => (
                    <span key={row.sideId} className="break-keep">
                      {row.label} {row.count}명{row.count === 0 ? ' · 선수 모름으로만 기록할 수 있어요' : ''}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </BottomSheet>
      ) : null}
    </>
  );
}
