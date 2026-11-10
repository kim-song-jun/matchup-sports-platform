'use client';

import { useId, useRef, useState } from 'react';
import { Lock, Minus, Plus } from 'lucide-react';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { Button } from '@/components/v1-ui/button';
import { formatMatchClock } from '@/lib/game-operations-clock';
import {
  MINUTE_STEP_MS,
  SECOND_STEP_MS,
  correctionCtaLabel,
  correctionRangeError,
  correctionRangeHint,
  eventTimeCorrectionErrorMessage,
  isClockInRange,
  parseTypedClock,
} from '@/lib/event-time-correction';

export const EVENT_TIME_REASON_MAX_LENGTH = 200;

type SheetTab = 'time' | 'cancel';

export interface EventTimeCorrectionSheetProps {
  readonly open: boolean;
  /** `operator`: 확정 전 운영 콘솔 / `admin`: 확정 뒤 플랫폼 어드민(사유 필수). */
  readonly mode: 'operator' | 'admin';
  /** 시트 제목 — 예: "옐로카드 기록 수정". */
  readonly title: string;
  /** 요약 한 줄 — 예: "2 한달 · 오렌지 FS". */
  readonly summary: string;
  /** 정정은 같은 피리어드 안에서만 된다 — "전반"·"후반"·"경기". */
  readonly periodLabel: string;
  /** 지금 유효한 기록 시각(ms). CTA 의 "→ 앞" 값이다. */
  readonly currentClockMs: number;
  /** 정정 상한(ms). 모르면 null — 서버가 판정한다. */
  readonly maxClockMs: number | null;
  /** 정정 저장. 실패하면 throw — 시트가 해요체 안내를 보여 주고 열어 둔다. */
  readonly onSubmit: (input: { clockMs: number; reason: string }) => Promise<void>;
  /** 운영 콘솔 전용: "기록 취소" 탭의 실행. 없으면 탭 없이 시간 정정만 보인다. */
  readonly onRequestCancelRecord?: () => void;
  readonly onClose: () => void;
}

function clampToRange(clockMs: number, maxClockMs: number | null): number {
  const floored = Math.max(0, clockMs);
  return maxClockMs === null ? floored : Math.min(floored, maxClockMs);
}

/**
 * MD-QA #187 — 기록된 사건의 시각 정정 바텀시트(사용자 선택: B안).
 *
 * 큰 시각 + 44px 둥근 ± 버튼(분 1 / 초 10)으로 맞추고, 큰 폭 이동은 시각을 탭해 숫자로 직접
 * 입력한다. 범위 밖이거나 그대로면 CTA 가 비활성이고 안내 문구가 오류색·오류 문장으로 바뀐다.
 * 컬러만으로 전하지 않는다 — 문장이 함께 바뀌고 `aria-invalid`·`aria-describedby` 로 이어 둔다.
 */
export function EventTimeCorrectionSheet({
  open,
  mode,
  title,
  summary,
  periodLabel,
  currentClockMs,
  maxClockMs,
  onSubmit,
  onRequestCancelRecord,
  onClose,
}: EventTimeCorrectionSheetProps) {
  const idPrefix = useId();
  const hintId = `${idPrefix}-hint`;
  const reasonId = `${idPrefix}-reason`;
  const tabIdTime = `${idPrefix}-tab-time`;
  const tabIdCancel = `${idPrefix}-tab-cancel`;
  const panelId = `${idPrefix}-panel`;
  const [tab, setTab] = useState<SheetTab>('time');
  const [clockMs, setClockMs] = useState(currentClockMs);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftInvalid, setDraftInvalid] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typedInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const showTabs = mode === 'operator' && onRequestCancelRecord !== undefined;
  const inRange = isClockInRange(clockMs, maxClockMs);
  const unchanged = clockMs === currentClockMs;
  const trimmedReason = reason.trim();
  const reasonMissing = mode === 'admin' && trimmedReason.length === 0;
  const canSubmit = inRange && !unchanged && !reasonMissing && !pending;
  const isAdmin = mode === 'admin';

  const step = (deltaMs: number) => {
    setError(null);
    setClockMs((value) => clampToRange(value + deltaMs, maxClockMs));
  };

  const beginTyping = () => {
    if (pending) return;
    setDraft('');
    setDraftInvalid(false);
    setEditing(true);
    // 입력창이 그려진 다음 프레임에 포커스한다.
    window.requestAnimationFrame(() => typedInputRef.current?.focus());
  };

  const commitTyping = () => {
    const parsed = parseTypedClock(draft);
    if (draft.trim().length > 0 && parsed === null) {
      setDraftInvalid(true);
      return;
    }
    if (parsed !== null) {
      setError(null);
      // 범위 밖 값도 그대로 보여 준다 — 눌러서 지워 버리면 무엇이 틀렸는지 알 수 없다. CTA 가 막고 안내가 말한다.
      setClockMs(parsed);
    }
    setEditing(false);
    setDraftInvalid(false);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        clockMs,
        reason: isAdmin
          ? trimmedReason
          : `경기 중 기록 시각 정정 (${formatMatchClock(currentClockMs)} → ${formatMatchClock(clockMs)})`,
      });
      onClose();
    } catch (err) {
      setError(eventTimeCorrectionErrorMessage(err));
      setPending(false);
    }
  };

  const hintIsError = !inRange;
  const roundButton =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-strong)] transition-colors hover:bg-[var(--card-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)] disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <BottomSheet open onClose={pending ? () => undefined : onClose} title={title}>
      <div className="flex flex-col gap-3.5 pt-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)]">
            {summary}
          </p>
          {isAdmin ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[length:var(--font-size-caption)] font-bold text-[var(--text-strong)]">
              <Lock size={11} aria-hidden="true" />
              확정된 결과
            </span>
          ) : (
            <span className="shrink-0 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
              기록 {periodLabel} {formatMatchClock(currentClockMs)}
            </span>
          )}
        </div>

        {showTabs ? (
          <div
            role="tablist"
            aria-label="기록 수정 방법"
            className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] bg-[var(--surface-soft)] p-1"
          >
            {(
              [
                ['time', tabIdTime, '시간 정정'],
                ['cancel', tabIdCancel, '기록 취소'],
              ] as const
            ).map(([key, id, label]) => (
              <button
                key={key}
                id={id}
                type="button"
                role="tab"
                aria-selected={tab === key}
                aria-controls={panelId}
                tabIndex={tab === key ? 0 : -1}
                disabled={pending}
                onClick={() => setTab(key)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                    event.preventDefault();
                    setTab(key === 'time' ? 'cancel' : 'time');
                  }
                }}
                className={`min-h-[44px] rounded-[var(--radius-chip)] text-[length:var(--font-size-body-sm)] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)] ${
                  tab === key
                    ? 'bg-[var(--card-surface)] text-[var(--text-strong)]'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <div
          id={panelId}
          role={showTabs ? 'tabpanel' : undefined}
          aria-labelledby={showTabs ? (tab === 'time' ? tabIdTime : tabIdCancel) : undefined}
          className="flex flex-col gap-3.5"
        >
          {tab === 'cancel' && showTabs ? (
            <div className="flex flex-col gap-3">
              <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-body)]">
                시각이 아니라 기록 자체가 잘못됐다면 취소하고 올바른 기록을 다시 입력해 주세요. 취소 기록이 감사 로그에 남아요.
              </p>
              <Button variant="danger" size="lg" block onClick={() => onRequestCancelRecord?.()}>
                이 기록 취소하기
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-3.5 pt-1.5">
                <span className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-muted)]">
                  {periodLabel}
                </span>
                {editing ? (
                  <div className="flex flex-col items-center gap-1">
                    <input
                      ref={typedInputRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      enterKeyHint="done"
                      value={draft}
                      maxLength={6}
                      aria-label="정정할 시각 숫자로 입력 (예: 930은 9분 30초)"
                      aria-invalid={draftInvalid}
                      placeholder={formatMatchClock(clockMs)}
                      onChange={(event) => {
                        setDraft(event.target.value.replace(/\D/g, ''));
                        setDraftInvalid(false);
                      }}
                      onBlur={commitTyping}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitTyping();
                        }
                      }}
                      className="h-14 w-40 rounded-xl border border-[var(--blue500)] bg-[var(--card-surface)] text-center text-[length:var(--font-size-heading)] font-extrabold tabular-nums text-[var(--text-strong)] outline-none"
                    />
                    <span
                      className={`text-[length:var(--font-size-caption)] ${draftInvalid ? 'font-semibold text-[var(--red700)]' : 'text-[var(--text-muted)]'}`}
                    >
                      {draftInvalid ? '초는 59까지만 쓸 수 있어요.' : '숫자만 입력해요. 예) 930 → 9:30'}
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={beginTyping}
                    disabled={pending}
                    aria-label={`정정할 시각 ${formatMatchClock(clockMs)}. 눌러서 숫자로 직접 입력`}
                    className="min-h-[56px] rounded-xl px-3 text-[length:calc(var(--font-size-heading)*1.75)] font-extrabold leading-none tracking-tight tabular-nums text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)]"
                  >
                    {formatMatchClock(clockMs)}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
                <button type="button" className={roundButton} aria-label="1분 빼기" disabled={pending || clockMs <= 0} onClick={() => step(-MINUTE_STEP_MS)}>
                  <Minus size={20} aria-hidden="true" />
                </button>
                <span className="text-center text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">분</span>
                <button type="button" className={roundButton} aria-label="1분 더하기" disabled={pending || (maxClockMs !== null && clockMs >= maxClockMs)} onClick={() => step(MINUTE_STEP_MS)}>
                  <Plus size={20} aria-hidden="true" />
                </button>
              </div>
              <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
                <button type="button" className={roundButton} aria-label="10초 빼기" disabled={pending || clockMs <= 0} onClick={() => step(-SECOND_STEP_MS)}>
                  <Minus size={20} aria-hidden="true" />
                </button>
                <span className="text-center text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">초 (10초 단위)</span>
                <button type="button" className={roundButton} aria-label="10초 더하기" disabled={pending || (maxClockMs !== null && clockMs >= maxClockMs)} onClick={() => step(SECOND_STEP_MS)}>
                  <Plus size={20} aria-hidden="true" />
                </button>
              </div>

              <p
                id={hintId}
                className={`text-[length:var(--font-size-caption)] ${hintIsError ? 'font-semibold text-[var(--red700)]' : 'text-[var(--text-muted)]'}`}
              >
                {hintIsError ? correctionRangeError(periodLabel, maxClockMs) : correctionRangeHint(periodLabel, maxClockMs)}
              </p>

              {isAdmin ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={reasonId} className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">
                    정정 사유 <span className="font-medium text-[var(--text-muted)]">(필수)</span>
                  </label>
                  <textarea
                    id={reasonId}
                    value={reason}
                    maxLength={EVENT_TIME_REASON_MAX_LENGTH}
                    rows={2}
                    disabled={pending}
                    placeholder="예) 심판 기록지 대조 결과 9분 경고"
                    onChange={(event) => setReason(event.target.value)}
                    className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)]"
                  />
                  <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                    공개 화면과 결과 변경 이력에 반영돼요. 점수·카드 수는 바뀌지 않아요.
                  </p>
                </div>
              ) : null}

              {error !== null ? (
                <p role="alert" className="text-[length:var(--font-size-caption)] font-semibold text-[var(--red700)]">
                  {error}
                </p>
              ) : null}

              <Button
                variant="primary"
                size="lg"
                block
                disabled={!canSubmit}
                loading={pending}
                aria-describedby={hintId}
                onClick={() => void submit()}
              >
                {unchanged ? '시각을 바꾸면 정정할 수 있어요' : correctionCtaLabel(currentClockMs, clockMs)}
              </Button>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
