'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ScopedLink as Link } from '@/components/providers/navigation-scope';
import { BoardCardStateBadge, WarningBadge } from '@/components/tournament-ops/badges';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useV1AssignFixtureField, useV1ClearFixtureField } from '@/hooks/use-v1-api';
import { formatAdminKstDateTime } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { overlayLinkClick } from '@/lib/overlay-history';
import type { V1TournamentField } from '@/types/api';
import type { BoardCard } from './ops-board-model';

interface MatchInfoSheetProps {
  card: BoardCard | null;
  /** 겹침 확인에 쓰는 보드 전체 카드. */
  allCards: readonly BoardCard[];
  fields: readonly V1TournamentField[];
  canAssignField: boolean;
  liveBase: string;
  consoleQuery: string;
  onClose: () => void;
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 pt-2 text-[length:var(--font-size-label)] text-[var(--text-muted)]">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center justify-end gap-1 pt-1 text-right text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">{children}</dd>
    </div>
  );
}

function MatchInfoBody({ card, allCards, fields, canAssignField, liveBase, consoleQuery, onClose }: MatchInfoSheetProps & { card: BoardCard }) {
  const pathname = usePathname();
  const tournamentId = card.item.tournamentId;
  const assign = useV1AssignFixtureField(tournamentId);
  const clear = useV1ClearFixtureField(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const serverValue = card.item.fieldId ?? '';
  const [chosen, setChosen] = useState<string | null>(null);
  const value = chosen ?? serverValue;
  const busy = assign.isPending || clear.isPending;

  useEffect(() => {
    if (chosen !== null && chosen === serverValue) setChosen(null);
  }, [chosen, serverValue]);

  function findClash(nextFieldId: string): BoardCard | null {
    const at = card.item.scheduledAt;
    if (!at) return null;
    const atMs = Date.parse(at);
    return (
      allCards.find(
        (other) =>
          other.fixtureId !== card.fixtureId &&
          other.item.fieldId === nextFieldId &&
          other.state !== 'cancelled' &&
          other.item.scheduledAt !== null &&
          Date.parse(other.item.scheduledAt) === atMs,
      ) ?? null
    );
  }

  async function handleFieldChange(next: string) {
    setError(null);
    if (next === serverValue) return;
    const clash = next === '' ? null : findClash(next);
    if (clash !== null) {
      const ok = await confirm({
        title: '시간·구장이 겹쳐요',
        message: `${clash.title} 경기와 시간·구장이 겹쳐요. 그대로 저장할까요?`,
        confirmLabel: '그대로 저장',
      });
      if (!ok) return;
    }
    setChosen(next);
    const onError = (err: unknown) => {
      setChosen(null);
      setError(extractErrorMessage(err, '구장을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.'));
    };
    if (next === '') clear.mutate({ fixtureId: card.fixtureId }, { onError });
    else assign.mutate({ fixtureId: card.fixtureId, fieldId: next }, { onError });
  }

  const consoleHref = `${liveBase}/fixtures/${encodeURIComponent(card.fixtureId)}/operate${consoleQuery}`;
  const selectId = `info-field-${card.fixtureId}`;

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <dl className="flex flex-col gap-2">
        <InfoRow label="시간">{card.item.scheduledAt ? formatAdminKstDateTime(card.item.scheduledAt) : '시간 미정'}</InfoRow>
        <InfoRow label="상태">
          <BoardCardStateBadge state={card.state} />
        </InfoRow>
        <InfoRow label="구장">
          {canAssignField ? (
            <>
              <label htmlFor={selectId} className="sr-only">
                {card.title} 구장
              </label>
              <select
                id={selectId}
                value={value}
                disabled={busy}
                onChange={(e) => void handleFieldChange(e.target.value)}
                className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--card-surface)] px-2 text-[length:var(--font-size-label)] text-[var(--text-body)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
              >
                <option value="">구장 미정</option>
                {fields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            (card.fieldName ?? '구장 미정')
          )}
        </InfoRow>
        {card.checks.length > 0 ? (
          <InfoRow label="확인할 것">
            {card.checks.map((code) => (
              <WarningBadge key={code} code={code} />
            ))}
          </InfoRow>
        ) : null}
      </dl>
      {error !== null ? (
        <p role="alert" className="text-[length:var(--font-size-caption)] text-[var(--red700)]">
          {error}
        </p>
      ) : null}
      <Link
        href={consoleHref}
        onClick={overlayLinkClick(consoleHref, pathname, onClose)}
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--button-fill-primary)] px-4 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--button-text-primary)] transition-colors hover:bg-[var(--button-fill-primary-hover)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
      >
        경기 콘솔 열기
      </Link>
      <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">시간은 대진 관리에서 바꿔요.</p>
      {ConfirmModal}
    </div>
  );
}

/** 보드 카드의 제목을 누르면 열리는 경기 정보. 구장 바꾸기만 여기서 하고, 시간은 대진 관리에서 바꾼다. */
export function MatchInfoSheet(props: MatchInfoSheetProps) {
  const { card, onClose } = props;
  return (
    <BottomSheet open={card !== null} onClose={onClose} title={card === null ? '경기 정보' : `${card.title} 경기 정보`}>
      {card === null ? null : <MatchInfoBody key={card.fixtureId} {...props} card={card} />}
    </BottomSheet>
  );
}
