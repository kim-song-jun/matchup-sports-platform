'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { AdminStatusPill } from '@/components/admin/admin-status-pill';
import { Button } from '@/components/v1-ui/button';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { CancelReasonLines, registrationMetaText } from './registration-row-parts';
import { RegistrationRowMenu } from './registration-row-menu';
import {
  registrationStatusLabel,
  type RegistrationHandlers,
  type RegistrationViewContext,
} from './registrations-model';

type Registration = V1AdminTournamentRegistration;

const HEADING_CLASS = 'm-0 text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]';
const LIST_CLASS =
  'm-0 flex list-none flex-col overflow-hidden rounded-[var(--radius-container)] border border-[var(--border)] bg-[var(--card-surface)] p-0';
const ROW_CLASS = 'flex min-h-[60px] items-center gap-1.5 border-b border-[var(--border)] py-2 pl-4 pr-1 last:border-b-0';

/** 기본 접힌 묶음 — 머리 전체가 펼침 버튼이다. */
function Disclosure({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-[44px] w-full items-center gap-2 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          <span className={HEADING_CLASS}>{title}</span>{' '}
          <span className="tm-badge tm-badge-grey">{count}</span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`ml-auto text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>
      {open ? (
        <div id={panelId} className="flex flex-col gap-2.5">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function RowTitle({ registration, ctx }: { registration: Registration; ctx: RegistrationViewContext }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="min-w-0 break-words text-[length:var(--font-size-body)] font-semibold text-[var(--text-strong)]">
        {registration.teamName ?? registration.teamId}
      </span>
      <AdminStatusPill status={registration.status} label={registrationStatusLabel(registration, ctx.isFreeEntry)} />
    </div>
  );
}

/** 대기 중이거나 취소된 신청 — 할 일이 없는 묶음이라 접어 둔다. 대기 팀만 자리가 나면 바로 확정할 수 있다. */
export function RegistrationsWaitlistCancelledSection({
  rows,
  ctx,
  handlers,
}: {
  rows: readonly Registration[];
  ctx: RegistrationViewContext;
  handlers: RegistrationHandlers;
}) {
  if (rows.length === 0) {
    return (
      <section className="flex flex-col gap-2.5">
        <h2 className="m-0 flex min-h-[44px] items-center gap-2">
          <span className={HEADING_CLASS}>대기·취소</span>
          <span className="tm-badge tm-badge-grey">0</span>
        </h2>
        <p className="m-0 flex min-h-[52px] items-center rounded-[var(--radius-container)] border border-dashed border-[var(--border-strong)] px-4 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
          대기하거나 취소된 신청이 없어요.
        </p>
      </section>
    );
  }
  return (
    <Disclosure title="대기·취소" count={rows.length}>
      <ul className={LIST_CLASS}>
        {rows.map((row) => {
          // 쓰기 권한이 있을 때만 대기 팀을 확정할 수 있다.
          const confirmable = ctx.canWrite && row.status === 'waitlisted';
          return (
            <li key={row.id} className={ROW_CLASS}>
              <div className="min-w-0 flex-1">
                <RowTitle registration={row} ctx={ctx} />
                <p className="m-0 mt-0.5 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                  {registrationMetaText(row, ['applied'])}
                </p>
                {row.status === 'cancelled' ? <CancelReasonLines registration={row} /> : null}
              </div>
              {confirmable ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={ctx.busy || ctx.admissionsBlockedReason !== null}
                  onClick={() => handlers.onConfirm(row)}
                >
                  확정
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => handlers.onViewRoster(row)}>
                  명단 보기
                </Button>
              )}
              <RegistrationRowMenu registration={row} ctx={ctx} handlers={handlers} />
            </li>
          );
        })}
      </ul>
    </Disclosure>
  );
}

/** 팀이 아직 제출하지 않은 신청 — 운영자가 할 일이 없어 있을 때만 접힌 한 줄로 둔다. */
export function RegistrationsDraftSection({
  rows,
  ctx,
  handlers,
}: {
  rows: readonly Registration[];
  ctx: RegistrationViewContext;
  handlers: RegistrationHandlers;
}) {
  if (rows.length === 0) return null;
  return (
    <Disclosure title="작성 중" count={rows.length}>
      <p className="m-0 text-[length:var(--font-size-label)] text-[var(--text-muted)]">팀이 아직 제출하지 않은 신청이에요</p>
      <ul className={LIST_CLASS}>
        {rows.map((row) => (
          <li key={row.id} className={ROW_CLASS}>
            <div className="min-w-0 flex-1">
              <RowTitle registration={row} ctx={ctx} />
              <p className="m-0 mt-0.5 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                {registrationMetaText(row, ['applied'])}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => handlers.onViewRoster(row)}>
              명단 보기
            </Button>
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}
