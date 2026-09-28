'use client';

import { useEffect, useId, useState } from 'react';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import {
  useV1CreateMemberUnavailability,
  useV1MemberUnavailability,
  useV1RevokeMemberUnavailability,
  useV1TeamGameRosters,
  type V1MemberUnavailability,
  type V1TeamRosterMatrix,
} from '@/hooks/use-v1-game-roster';
import { formatExclusiveEndRangeShort } from '@/lib/date-utils';
import { DAY_MS, kstMidnightMs, toKstDateString } from '@/lib/kst-calendar';
import { gameRosterErrorMessage } from '@/lib/game-roster-errors';
import {
  MEMBER_UNAVAILABILITY_REASON_OPTIONS,
  gameRosterActorRoleLabel,
  gameRosterReasonLabel,
  type MemberUnavailabilityReason,
} from '@/lib/v1-status-labels';

/**
 * 결장 기간 등록 시트(Task 176 팀 C) — 팀장·매니저·플랫폼 운영자만 연다(본인 것은 서버가 막는다).
 * 기간은 KST 날짜 단위다: 시작일 0시(포함) ~ 마지막 날 다음 0시(미포함). 그 사이 시작하는
 * 대회·리그 경기에서 자동으로 빠지고, 나중에 잡히는 경기에도 걸린다.
 */
export function MemberUnavailabilitySheet({
  open,
  teamId,
  userId,
  displayName,
  onClose,
}: {
  open: boolean;
  teamId: string;
  userId: string;
  displayName: string;
  onClose: () => void;
}) {
  const list = useV1MemberUnavailability(teamId, userId, { enabled: open });
  const matrix = useV1TeamGameRosters(teamId, { enabled: open });
  const create = useV1CreateMemberUnavailability(teamId, userId);
  const revoke = useV1RevokeMemberUnavailability(teamId, userId);
  const pending = create.isPending || revoke.isPending;
  const [reason, setReason] = useState<MemberUnavailabilityReason | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; message: string } | null>(null);
  const titleId = useId();
  const startId = useId();
  const endId = useId();
  const { dialogRef, initialFocusRef, onBackdropClick, mounted, closing } = useModalA11y<HTMLButtonElement, HTMLElement>({
    open,
    onClose,
    pending,
    exitMs: 220, // .tm-filter-sheet.is-closing 과 같은 길이.
  });

  useEffect(() => {
    if (!open) return;
    const today = toKstDateString(new Date());
    setReason(null);
    setStartDate(today);
    setEndDate(today);
    setNotice(null);
  }, [open, userId]);

  if (!mounted) return null;

  const period = toPeriod(startDate, endDate);
  const affected = period === null ? null : countAffectedGames(matrix.data, userId, period);
  const active = (list.data?.items ?? []).filter((item) => isActive(item));

  async function submit() {
    if (period === null) return;
    setNotice(null);
    try {
      await create.mutateAsync({
        startsAt: new Date(period.startsAtMs).toISOString(),
        endsAt: new Date(period.endsAtMs).toISOString(),
        ...(reason === null ? {} : { reason }),
      });
      setReason(null);
      setNotice({ tone: 'info', message: '결장 기간을 등록했어요.' });
    } catch (caught) {
      setNotice({ tone: 'error', message: gameRosterErrorMessage(caught, '결장 기간을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.') });
    }
  }

  async function cancel(item: V1MemberUnavailability) {
    setNotice(null);
    try {
      await revoke.mutateAsync(item.id);
      setNotice({ tone: 'info', message: '결장 기간을 취소했어요. 그 기간 경기에 다시 출전으로 들어가요.' });
    } catch (caught) {
      setNotice({ tone: 'error', message: gameRosterErrorMessage(caught, '결장 기간을 취소하지 못했어요. 잠시 후 다시 시도해 주세요.') });
    }
  }

  return (
    <>
      <div aria-hidden="true" className={`tm-filter-scrim${closing ? ' is-closing' : ''}`} onClick={onBackdropClick} />
      <div className="tm-filter-layer">
        <section
          ref={dialogRef}
          className={`tm-filter-sheet${closing ? ' is-closing' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="tm-filter-sheet-handle" />
          <div className="tm-filter-sheet-head">
            <h2 id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0, overflowWrap: 'anywhere' }}>
              결장 기간 · {displayName}
            </h2>
            <button
              ref={initialFocusRef}
              type="button"
              aria-label="닫기"
              onClick={onClose}
              disabled={pending}
              className="tm-btn tm-btn-icon tm-btn-ghost"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          {active.length > 0 ? (
            <ul aria-label="등록된 결장 기간" style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {active.map((item) => (
                <li key={item.id} style={activeRowStyle}>
                  <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                    <div className="tm-text-label">{formatExclusiveEndRangeShort(item.startsAt, item.endsAt) ?? '결장 기간'}</div>
                    <div className="tm-text-caption" style={{ marginTop: 2 }}>
                      {[gameRosterReasonLabel(item.reason), `${gameRosterActorRoleLabel(item.actor.role) ?? ''} ${item.actor.displayName} 등록`.trim()]
                        .filter((part) => part !== null)
                        .join(' · ')}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => void cancel(item)}
                    aria-label={`${formatExclusiveEndRangeShort(item.startsAt, item.endsAt) ?? ''} 결장 취소`.trim()}
                  >
                    취소
                  </Button>
                </li>
              ))}
            </ul>
          ) : list.isError ? (
            <p className="tm-text-caption" style={{ margin: '8px 0 0' }}>
              등록된 결장 기간을 불러오지 못했어요.
            </p>
          ) : null}

          <div role="group" aria-label="결장 사유(선택)" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {MEMBER_UNAVAILABILITY_REASON_OPTIONS.map((option) => {
              const selected = reason === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`tm-chip${selected ? ' tm-chip-active' : ''}`}
                  aria-pressed={selected}
                  onClick={() => setReason(selected ? null : option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
            <div>
              <label htmlFor={startId} className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                시작일
              </label>
              <input
                id={startId}
                className="tm-input"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor={endId} className="tm-text-label" style={{ display: 'block', marginBottom: 6 }}>
                마지막 날
              </label>
              <input
                id={endId}
                className="tm-input"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            {period === null ? (
              <AlertBanner tone="warning" message="마지막 날은 시작일과 같거나 뒤여야 해요." />
            ) : (
              <AlertBanner
                tone="info"
                message={`${affected === null ? '이 기간 대회·리그 경기에서' : `이 기간 대회·리그 경기 ${affected}개에서`} 빠져요. 나중에 잡히는 경기도 자동으로 빠져요.`}
              />
            )}
          </div>
          {notice !== null ? (
            <div style={{ marginTop: 12 }}>
              <AlertBanner tone={notice.tone} message={notice.message} />
            </div>
          ) : null}
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" size="lg" block loading={create.isPending} disabled={period === null || pending} onClick={() => void submit()}>
              결장 등록
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

type Period = { startsAtMs: number; endsAtMs: number };

/** KST 날짜 두 개 → [시작일 0시, 마지막 날 다음 0시). 비었거나 거꾸로면 null. */
export function toPeriod(startDate: string, endDate: string): Period | null {
  if (startDate === '' || endDate === '') return null;
  const startsAtMs = kstMidnightMs(startDate);
  const endsAtMs = kstMidnightMs(endDate) + DAY_MS;
  if (Number.isNaN(startsAtMs) || Number.isNaN(endsAtMs) || endsAtMs <= startsAtMs) return null;
  return { startsAtMs, endsAtMs };
}

/**
 * 이 기간에 시작하는 시작 전 경기 중 이 선수가 기준 명단에 있는 경기 수(서버 규칙과 같은 반열림 구간).
 * 팀 표를 아직 못 받았으면 null — 호출부가 숫자 없는 문구를 쓴다.
 */
export function countAffectedGames(matrix: V1TeamRosterMatrix | undefined, userId: string, period: Period): number | null {
  if (matrix === undefined) return null;
  const player = matrix.players.find((row) => row.userId === userId);
  return matrix.games.filter((game, index) => {
    if (game.gameState !== 'SCHEDULED' || game.scheduledAt === null) return false;
    const at = Date.parse(game.scheduledAt);
    if (!(period.startsAtMs <= at && at < period.endsAtMs)) return false;
    return player !== undefined && player.cells[index]?.status !== 'NOT_IN_ROSTER';
  }).length;
}

/** 취소되지 않았고 아직 끝나지 않은 기간. */
export function isActive(item: V1MemberUnavailability, now: number = Date.now()): boolean {
  return item.revokedAt === null && Date.parse(item.endsAt) > now;
}

const activeRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 0',
  borderBottom: '1px solid var(--border)',
};
