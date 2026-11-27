'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Activity, ChevronLeft, Ellipsis } from 'lucide-react';
import { ActionMenu } from '@/components/v1-ui/action-menu';
import type { ActionSheetAction } from '@/components/v1-ui/action-sheet';
import type { TournamentStatusAdvance } from './tournament-admin-context';

export interface TournamentDetailHeaderProps {
  title: string;
  /** 대회명 아래 한 줄(장소 · 일정 · 팀 수). */
  meta: string;
  listHref: string;
  statusMenu: ReactNode;
  /** 데스크톱 셸 폭에서만 넘긴다 — 폰·태블릿에서는 개요 카드가 이 버튼을 가진다. */
  primaryAction?: Omit<TournamentStatusAdvance, 'hint'>;
  /** 머리에 둘 때만 넘긴다. `reasonLabel` 이 있으면 비활성 버튼과 사유를 보인다. */
  liveOps?: { href: string; reasonLabel?: string };
  moreActions: readonly ActionSheetAction[];
}

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2';

/**
 * 대회 상세 머리 한 줄 — 뒤로 · 대회명 · 상태 칩 · 현장 운영 · 다음 단계 주 버튼 · ⋯.
 * 칩과 현장 운영은 DOM 에 한 번만 두고, 폰·태블릿에서는 둘째 줄로 내려가는 위치만 CSS `order` 로 바꾼다.
 */
export function TournamentDetailHeader({
  title,
  meta,
  listHref,
  statusMenu,
  primaryAction,
  liveOps,
  moreActions,
}: TournamentDetailHeaderProps) {
  // 데스크톱에서 오른쪽 묶음을 끝으로 미는 자동 여백은 그 묶음의 첫 컨트롤 하나에만 둔다(둘이면 여백이 갈라진다).
  const pushRight = (control: 'liveOps' | 'primary' | 'more') =>
    (liveOps ? 'liveOps' : primaryAction ? 'primary' : 'more') === control ? 'lg:ml-auto' : '';

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2 lg:flex-nowrap">
      <Link
        href={listHref}
        aria-label="대회 목록으로"
        className={`order-1 -ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] ${FOCUS_RING}`}
      >
        <ChevronLeft size={24} aria-hidden="true" />
      </Link>

      <div className="order-2 min-w-0 flex-1 lg:flex-initial">
        <h1 className="truncate text-[length:var(--font-size-subhead)] font-bold text-[var(--text-strong)] md:text-[length:var(--font-size-heading)]">
          {title}
        </h1>
        <p className="truncate text-[length:var(--font-size-label)] text-[var(--text-muted)]">{meta}</p>
      </div>

      {moreActions.length > 0 ? (
        <div className={`order-3 shrink-0 lg:order-5 ${pushRight('more')}`}>
          <ActionMenu
            label="대회 더 보기"
            align="end"
            actions={moreActions}
            trigger={({ onToggle, 'aria-expanded': expanded, 'aria-haspopup': haspopup }) => (
              <button
                type="button"
                aria-label="대회 더 보기"
                aria-expanded={expanded}
                aria-haspopup={haspopup}
                onClick={onToggle}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-strong)] text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] ${FOCUS_RING}`}
              >
                <Ellipsis size={18} aria-hidden="true" />
              </button>
            )}
          />
        </div>
      ) : null}

      <div className="order-4 flex w-full items-center gap-2 lg:contents">
        <div className="shrink-0 lg:order-3">{statusMenu}</div>
        {liveOps ? (
          <div className={`shrink-0 lg:order-4 ${pushRight('liveOps')}`}>
            <LiveOpsButton {...liveOps} />
          </div>
        ) : null}
        {primaryAction ? (
          <button
            type="button"
            disabled={primaryAction.busy}
            onClick={primaryAction.onClick}
            className={`tm-btn tm-btn-md whitespace-nowrap lg:order-4 ${pushRight('primary')} ${
              primaryAction.emphasis === 'primary' ? 'tm-btn-primary' : 'tm-btn-outline'
            }`}
          >
            {primaryAction.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LiveOpsButton({ href, reasonLabel }: { href: string; reasonLabel?: string }) {
  if (reasonLabel) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex min-h-[44px] flex-col items-start justify-center rounded-xl bg-[var(--surface-soft)] px-3 text-left text-[length:var(--font-size-label)] font-medium text-[var(--text-muted)]"
      >
        <span>현장 운영</span>
        <span className="text-[length:var(--font-size-micro)] font-normal">{reasonLabel}</span>
      </button>
    );
  }
  return (
    <Link href={href} className="tm-btn tm-btn-md tm-btn-outline whitespace-nowrap gap-1.5">
      <Activity size={16} aria-hidden="true" />
      현장 운영
    </Link>
  );
}
