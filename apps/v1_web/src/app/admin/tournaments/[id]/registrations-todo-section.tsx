'use client';

import { ListChecks } from 'lucide-react';
import { useId, useState } from 'react';
import { AdminStatusPill } from '@/components/admin/admin-status-pill';
import { Button } from '@/components/v1-ui/button';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { CancelReasonLines, registrationMetaText } from './registration-row-parts';
import { RegistrationRowMenu } from './registration-row-menu';
import { CancelRequestChoice } from './registrations-cancel-request';
import {
  REGISTRATIONS_WIDE_MEDIA_QUERY,
  isBulkSelectable,
  registrationPrimaryAction,
  registrationStatusLabel,
  registrationTodoHint,
  type RegistrationHandlers,
  type RegistrationViewContext,
} from './registrations-model';

type Registration = V1AdminTournamentRegistration;
type Layout = 'wide' | 'narrow' | 'select';

const CARD_CLASS =
  'rounded-[var(--radius-container)] border shadow-[var(--shadow-card)]';
const CHECKBOX_CLASS =
  'mt-0.5 h-5 w-5 cursor-pointer rounded accent-[var(--blue500)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2';
const TODO_META = ['roster', 'autoConfirmed', 'depositor', 'applied', 'cancelRequested', 'payment'] as const;
const NOT_SELECTABLE_NOTE = '한꺼번에 처리할 수 없어요. 고르기를 끝내고 따로 처리해요.';

/** 운영자가 지금 손댈 신청 — 행마다 다음 할 일 버튼 하나, 나머지는 ⋯ 메뉴. 입금 대기 행은 여러 팀을 한꺼번에 확인할 수 있다. */
export function RegistrationsTodoSection({
  rows,
  ctx,
  handlers,
  selectedIds,
  onToggleSelected,
  onClearSelected,
  onBatchConfirm,
}: {
  rows: readonly Registration[];
  ctx: RegistrationViewContext;
  handlers: RegistrationHandlers;
  selectedIds: ReadonlySet<string>;
  onToggleSelected: (id: string) => void;
  onClearSelected: () => void;
  onBatchConfirm: () => void;
}) {
  const wide = useMediaQuery(REGISTRATIONS_WIDE_MEDIA_QUERY);
  const baseId = useId();
  const [selecting, setSelecting] = useState(false);
  const [choiceOpenId, setChoiceOpenId] = useState<string | null>(null);

  const selectable = rows.filter(isBulkSelectable);
  // 새로고침으로 상태가 바뀌어 더는 고를 수 없는 행은 선택이 남아 있어도 세지 않는다.
  const selectedCount = selectable.filter((row) => selectedIds.has(row.id)).length;
  const canSelect = ctx.canWrite && selectable.length > 0;
  // 고를 행이 없어지면 모드도 함께 닫는다 — 안 그러면 새 입금 대기 팀이 들어올 때 모드가 되살아난다.
  if (!canSelect && selecting) setSelecting(false);
  const phoneSelecting = !wide && canSelect && selecting;
  const layout: Layout = wide ? 'wide' : phoneSelecting ? 'select' : 'narrow';
  const showBar = canSelect && selectedCount > 0 && (wide || phoneSelecting);
  const headingId = `${baseId}-todo`;

  const stopSelecting = () => {
    setSelecting(false);
    onClearSelected();
  };
  const bar = (
    <SelectionBar
      count={selectedCount}
      ctx={ctx}
      fixed={!wide}
      onClear={onClearSelected}
      onConfirm={onBatchConfirm}
    />
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2.5">
      <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-2">
        <h2
          id={headingId}
          className="m-0 flex items-center gap-2 text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]"
        >
          처리할 것
          <span className={`tm-badge ${rows.length > 0 ? 'tm-badge-orange' : 'tm-badge-grey'}`}>{rows.length}건</span>
        </h2>
        {wide && showBar ? bar : null}
        {!wide && canSelect ? (
          <Button variant="ghost" size="sm" onClick={phoneSelecting ? stopSelecting : () => setSelecting(true)}>
            {phoneSelecting ? null : <ListChecks size={16} aria-hidden="true" />}
            {phoneSelecting ? '그만 고르기' : '골라서 처리'}
          </Button>
        ) : null}
      </div>
      {phoneSelecting ? (
        <p aria-live="polite" className="m-0 text-[length:var(--font-size-label)] text-[var(--text-muted)]">
          체크할 수 있는 팀만 한꺼번에 처리해요 · {selectedCount}팀 선택했어요
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="m-0 flex min-h-[52px] items-center rounded-[var(--radius-container)] border border-dashed border-[var(--border-strong)] px-4 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
          지금 처리할 신청이 없어요
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((row) => (
            <TodoRow
              key={row.id}
              registration={row}
              ctx={ctx}
              handlers={handlers}
              layout={layout}
              hasSelectColumn={wide && canSelect}
              selected={selectedIds.has(row.id)}
              onToggleSelected={() => onToggleSelected(row.id)}
              choiceId={`${baseId}-choice-${row.id}`}
              choiceOpen={choiceOpenId === row.id}
              onToggleChoice={() => setChoiceOpenId((current) => (current === row.id ? null : row.id))}
              onCloseChoice={() => setChoiceOpenId(null)}
            />
          ))}
        </ul>
      )}
      {!wide && phoneSelecting && showBar ? (
        <>
          <div aria-hidden="true" className="h-24" />
          {bar}
        </>
      ) : null}
    </section>
  );
}

function SelectionBar({
  count,
  ctx,
  fixed,
  onClear,
  onConfirm,
}: {
  count: number;
  ctx: RegistrationViewContext;
  fixed: boolean;
  onClear: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="선택한 신청 한꺼번에 처리"
      className={
        fixed
          ? 'fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--card-surface)] px-4 pb-[calc(0.75rem+var(--v1-shell-safe-bottom,0px))] pt-3'
          : 'flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--tint-blue-border)] bg-[var(--tint-blue)] py-1 pl-3.5 pr-1'
      }
    >
      {fixed ? null : (
        <span className="mr-2 text-[length:var(--font-size-body-sm)] text-[var(--blue700)]">{count}팀 선택했어요</span>
      )}
      <Button variant="ghost" size="sm" onClick={onClear}>
        선택 해제
      </Button>
      <Button variant="primary" size="sm" disabled={ctx.busy} onClick={onConfirm} className={fixed ? 'flex-1' : ''}>
        선택한 {count}팀 {ctx.confirmNoun}
      </Button>
    </div>
  );
}

function TodoRow({
  registration,
  ctx,
  handlers,
  layout,
  hasSelectColumn,
  selected,
  onToggleSelected,
  choiceId,
  choiceOpen,
  onToggleChoice,
  onCloseChoice,
}: {
  registration: Registration;
  ctx: RegistrationViewContext;
  handlers: RegistrationHandlers;
  layout: Layout;
  hasSelectColumn: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  choiceId: string;
  choiceOpen: boolean;
  onToggleChoice: () => void;
  onCloseChoice: () => void;
}) {
  const teamName = registration.teamName ?? registration.teamId;
  const bulkSelectable = ctx.canWrite && isBulkSelectable(registration);
  const showChoice = layout === 'wide' && choiceOpen && registrationPrimaryAction(registration.status) === 'handle-cancel';

  const body = (
    <>
      <p className="m-0 text-[length:var(--font-size-body-sm)] text-[var(--text)]">
        {registrationTodoHint(registration, ctx.isFreeEntry)}
      </p>
      <p className="m-0 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
        {registrationMetaText(registration, TODO_META)}
      </p>
      {registration.status === 'cancel_requested' ? <CancelReasonLines registration={registration} /> : null}
    </>
  );
  const title = (
    <h3 className="m-0 flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--font-size-body-lg)] font-bold leading-snug text-[var(--text-strong)]">
      <span className="min-w-0 break-words">{teamName}</span>
      <AdminStatusPill status={registration.status} label={registrationStatusLabel(registration, ctx.isFreeEntry)} />
    </h3>
  );
  const checkbox = (
    <input
      type="checkbox"
      checked={selected}
      onChange={onToggleSelected}
      aria-label={`${teamName} 일괄 선택`}
      className={CHECKBOX_CLASS}
    />
  );
  const menu = <RegistrationRowMenu registration={registration} ctx={ctx} handlers={handlers} />;
  const primary = (
    <PrimaryButton
      registration={registration}
      ctx={ctx}
      handlers={handlers}
      wide={layout === 'wide'}
      choiceOpen={showChoice}
      choiceId={choiceId}
      onToggleChoice={onToggleChoice}
      block={layout === 'narrow'}
    />
  );

  if (layout === 'select') {
    const tinted = selected && bulkSelectable;
    return (
      <li
        className={`${CARD_CLASS} flex ${tinted ? 'tm-on-tint border-[var(--blue500)] bg-[var(--blue50)]' : bulkSelectable ? 'border-[var(--border)] bg-[var(--card-surface)]' : 'tm-on-tint border-[var(--border)] bg-[var(--surface-soft)] shadow-none'}`}
      >
        {bulkSelectable ? (
          <label className="flex w-[52px] shrink-0 cursor-pointer items-start justify-center pt-4">{checkbox}</label>
        ) : (
          <span aria-hidden="true" className="w-[52px] shrink-0" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-3.5 pr-4 pt-1.5">
          <div className="flex min-h-[44px] items-center">{title}</div>
          {body}
          {bulkSelectable ? null : (
            <p className="m-0 mt-1.5 text-[length:var(--font-size-label)] text-[var(--text-muted)]">{NOT_SELECTABLE_NOTE}</p>
          )}
        </div>
      </li>
    );
  }

  if (layout === 'narrow') {
    return (
      <li className={`${CARD_CLASS} border-[var(--border)] bg-[var(--card-surface)]`}>
        <div className="flex flex-col gap-0.5 pb-3.5 pl-4 pr-1.5 pt-1.5">
          <div className="flex min-h-[44px] items-center gap-1">
            {title}
            {menu}
          </div>
          {body}
          <div className="mr-2.5 mt-2.5">{primary}</div>
        </div>
      </li>
    );
  }

  const tinted = selected && bulkSelectable;
  return (
    <li
      className={`${CARD_CLASS} grid items-start ${hasSelectColumn ? 'grid-cols-[52px_minmax(0,1fr)_auto]' : 'grid-cols-[16px_minmax(0,1fr)_auto]'} ${tinted ? 'tm-on-tint border-[var(--blue500)] bg-[var(--blue50)]' : 'border-[var(--border)] bg-[var(--card-surface)]'}`}
    >
      {hasSelectColumn && bulkSelectable ? (
        <label className="flex cursor-pointer items-start justify-center self-stretch rounded-l-[var(--radius-container)] pt-4 hover:bg-[var(--surface-soft)]">
          {checkbox}
        </label>
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="flex min-w-0 flex-col gap-0.5 py-3.5">
        <div className="flex min-h-[28px] items-center">{title}</div>
        {body}
      </div>
      <div className="flex items-center gap-1 self-center py-2.5 pl-4 pr-3">
        {primary}
        {menu}
      </div>
      {showChoice ? (
        <div className="col-span-3 px-4 pb-4">
          <CancelRequestChoice
            id={choiceId}
            busy={ctx.busy}
            onApprove={() => {
              onCloseChoice();
              handlers.onApproveCancel(registration);
            }}
            onKeep={() => {
              onCloseChoice();
              handlers.onKeepRegistration(registration);
            }}
          />
        </div>
      ) : null}
    </li>
  );
}

function PrimaryButton({
  registration,
  ctx,
  handlers,
  wide,
  choiceOpen,
  choiceId,
  onToggleChoice,
  block,
}: {
  registration: Registration;
  ctx: RegistrationViewContext;
  handlers: RegistrationHandlers;
  wide: boolean;
  choiceOpen: boolean;
  choiceId: string;
  onToggleChoice: () => void;
  block: boolean;
}) {
  // 쓰기 권한이 없으면 어느 상태든 볼 수만 있다.
  const action = ctx.canWrite ? registrationPrimaryAction(registration.status) : 'view-roster';
  const className = block ? 'w-full' : 'min-w-[120px]';
  switch (action) {
    case 'confirm-payment':
      return (
        <Button size="sm" variant="primary" className={className} disabled={ctx.busy} onClick={() => handlers.onConfirmPayment(registration)}>
          {ctx.confirmNoun}
        </Button>
      );
    case 'confirm':
      return (
        <Button
          size="sm"
          variant="primary"
          className={className}
          disabled={ctx.busy || ctx.admissionsBlockedReason !== null}
          onClick={() => handlers.onConfirm(registration)}
        >
          확정
        </Button>
      );
    case 'handle-cancel':
      return (
        <Button
          size="sm"
          variant="outline"
          className={className}
          aria-expanded={wide ? choiceOpen : undefined}
          aria-controls={wide && choiceOpen ? choiceId : undefined}
          aria-haspopup={wide ? undefined : 'dialog'}
          onClick={wide ? onToggleChoice : () => handlers.onOpenCancelSheet(registration)}
        >
          취소 처리
        </Button>
      );
    default:
      return (
        <Button size="sm" variant="outline" className={className} onClick={() => handlers.onViewRoster(registration)}>
          명단 보기
        </Button>
      );
  }
}
