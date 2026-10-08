'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useV1UpdateLeagueEntryFee } from '@/hooks/use-v1-api';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import { formatWithComma, onlyDigits } from '@/lib/number-format';
import type { V1AdminLeagueDetail, V1UpdateLeagueEntryFeePayload } from '@/types/league-match';

const MAX_ENTRY_FEE = 100_000_000;
const FEE_ERROR = '참가비는 0원~1억 원 사이의 정수여야 해요.';
const BANK_ERROR = '유료 리그는 은행명, 계좌번호, 예금주를 모두 입력해 주세요.';
const REASON_REQUIRED_CODE = 'LEAGUE_ENTRY_FEE_REASON_REQUIRED';

export type LeagueFeeSource = Pick<
  V1AdminLeagueDetail,
  'entryFee' | 'entryFeeConfiguredAt' | 'bankName' | 'bankAccount' | 'bankHolder' | 'activeRegistrationCount'
>;

interface FormValues {
  fee: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
}

interface PendingChange {
  payload: V1UpdateLeagueEntryFeePayload;
  feeChanged: boolean;
  bankChanged: boolean;
}

const money = (n: number) => `${n.toLocaleString('ko-KR')}원`;

function valuesOf(league: LeagueFeeSource): FormValues {
  return {
    fee: String(league.entryFee),
    bankName: league.bankName ?? '',
    bankAccount: league.bankAccount ?? '',
    bankHolder: league.bankHolder ?? '',
  };
}

const sameValues = (a: FormValues, b: FormValues) =>
  a.fee === b.fee && a.bankName === b.bankName && a.bankAccount === b.bankAccount && a.bankHolder === b.bankHolder;

/** 서버가 안 보내면 현재 값을 유지하므로(계좌는 비우는 길이 없다) 빈 칸은 payload 에서 뺀다. */
function buildPayload(values: FormValues): V1UpdateLeagueEntryFeePayload {
  const payload: V1UpdateLeagueEntryFeePayload = { entryFee: Number(values.fee) };
  if (values.bankName.trim()) payload.bankName = values.bankName.trim();
  if (values.bankAccount.trim()) payload.bankAccount = values.bankAccount.trim();
  if (values.bankHolder.trim()) payload.bankHolder = values.bankHolder.trim();
  return payload;
}

function describeChange(payload: V1UpdateLeagueEntryFeePayload, league: LeagueFeeSource): PendingChange {
  const differs = (next: string | undefined, current: string | null) => next !== undefined && next !== (current ?? '');
  return {
    payload,
    feeChanged: payload.entryFee !== league.entryFee,
    bankChanged:
      differs(payload.bankName, league.bankName) ||
      differs(payload.bankAccount, league.bankAccount) ||
      differs(payload.bankHolder, league.bankHolder),
  };
}

function changeTitle({ feeChanged, bankChanged }: PendingChange) {
  if (feeChanged && !bankChanged) return '참가비를 바꿀까요?';
  if (bankChanged && !feeChanged) return '입금 계좌를 바꿀까요?';
  return '참가비·입금 계좌를 바꿀까요?';
}

/**
 * 리그 참가비·입금 계좌. 신청 열기 전에 정하는 카드이고, 신청이 들어온 뒤 금액·계좌를 바꾸면
 * 사유를 받는다(기존 신청의 금액은 신청 당시 값 그대로 — 서버 계약).
 */
export function LeagueFeeCard({
  league,
  leagueId,
  focusRequest,
}: {
  league: LeagueFeeSource;
  leagueId: string;
  /** 값이 바뀔 때마다 참가비 입력으로 포커스를 옮긴다(열기 전 확인창의 "참가비 먼저 정할게요"). */
  focusRequest: number;
}) {
  const ids = useId();
  const feeId = `${ids}-fee`;
  const bankId = `${ids}-bank`;
  const accountId = `${ids}-account`;
  const holderId = `${ids}-holder`;
  const feeErrorId = `${ids}-fee-error`;
  const bankErrorId = `${ids}-bank-error`;
  const canWrite = useAdminCanWrite();
  const updateFee = useV1UpdateLeagueEntryFee(leagueId);
  const feeRef = useRef<HTMLInputElement>(null);

  const serverValues = valuesOf(league);
  const [base, setBase] = useState<FormValues>(serverValues);
  const [form, setForm] = useState<FormValues>(serverValues);
  const dirty = !sameValues(form, base);
  // 폼이 손대지 않은 상태일 때만 서버 값(새로고침·다른 탭의 저장)을 따라간다.
  if (!dirty && !sameValues(base, serverValues)) {
    setBase(serverValues);
    setForm(serverValues);
  }

  const [errors, setErrors] = useState<{ fee?: string; bank?: string }>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [reason, setReason] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  const lastFocusRequest = useRef(focusRequest);
  useEffect(() => {
    if (focusRequest === lastFocusRequest.current) return;
    lastFocusRequest.current = focusRequest;
    feeRef.current?.focus();
    feeRef.current?.scrollIntoView?.({ block: 'center' });
  }, [focusRequest]);

  const configured = league.entryFeeConfiguredAt !== null;
  const inherited = !configured && league.entryFee > 0;
  const edit = (patch: Partial<FormValues>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setSaved(false);
    setSaveError(null);
  };

  const send = (change: PendingChange, withReason: string | null) => {
    const submittedValues = form;
    updateFee.mutate(withReason ? { ...change.payload, reason: withReason } : change.payload, {
      onSuccess: () => {
        setPending(null);
        setReason('');
        setModalError(null);
        setBase(submittedValues);
        setSaved(true);
      },
      onError: (error) => {
        const message = extractErrorMessage(error, '참가비를 저장하지 못했어요.');
        if (pending) setModalError(message);
        else if (extractErrorCode(error) === REASON_REQUIRED_CODE) setPending(change);
        else setSaveError(message);
      },
    });
  };

  const submit = () => {
    const next: { fee?: string; bank?: string } = {};
    const fee = Number(form.fee);
    if (form.fee === '' || !Number.isInteger(fee) || fee > MAX_ENTRY_FEE) next.fee = FEE_ERROR;
    const banks = [form.bankName, form.bankAccount, form.bankHolder];
    if (!next.fee && fee > 0 && banks.some((v) => v.trim() === '')) next.bank = BANK_ERROR;
    setErrors(next);
    if (next.fee || next.bank) return;

    const change = describeChange(buildPayload(form), league);
    if (league.activeRegistrationCount > 0 && (change.feeChanged || change.bankChanged)) {
      setPending(change);
      return;
    }
    send(change, null);
  };

  const inputCls =
    'mt-2 block min-h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-label)] text-[var(--text-strong)] disabled:opacity-60';
  const labelCls = 'text-[length:var(--font-size-caption)] font-semibold text-[var(--text-strong)]';
  const disabled = !canWrite || updateFee.isPending;
  const saveDisabled = disabled || (configured && !dirty);
  const bankInvalid = errors.bank !== undefined;
  const bankProps = (value: string) => ({
    disabled,
    'aria-invalid': bankInvalid && value.trim() === '' ? true : undefined,
    'aria-describedby': bankInvalid && value.trim() === '' ? bankErrorId : undefined,
    className: inputCls,
  });

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <p id={`${ids}-title`} className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)]">
          참가비·입금 계좌
        </p>
        {configured ? (
          <span className="tm-badge tm-badge-green">설정됨</span>
        ) : inherited ? (
          <span className="tm-badge tm-badge-orange">직전 시즌 설정을 이어받았어요</span>
        ) : (
          <span className="tm-badge tm-badge-grey">미설정</span>
        )}
      </div>
      <p className="mb-4 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
        신청 열기 전에 먼저 정해 주세요. 팀장 신청 화면의 입금 안내에 그대로 나와요.
        {inherited ? ' 금액과 계좌가 맞는지 확인하고 저장해 주세요.' : ''}
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr_1fr_1fr_auto] md:items-end">
        <div>
          <label htmlFor={feeId} className={labelCls}>팀당 참가비 (원)</label>
          <input
            id={feeId}
            ref={feeRef}
            type="text"
            inputMode="numeric"
            value={formatWithComma(form.fee)}
            onChange={(e) => edit({ fee: onlyDigits(e.target.value) })}
            disabled={disabled}
            aria-invalid={errors.fee ? true : undefined}
            aria-describedby={errors.fee ? feeErrorId : undefined}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor={bankId} className={labelCls}>은행</label>
          <input
            id={bankId}
            type="text"
            value={form.bankName}
            maxLength={60}
            onChange={(e) => edit({ bankName: e.target.value })}
            {...bankProps(form.bankName)}
          />
        </div>
        <div>
          <label htmlFor={accountId} className={labelCls}>계좌번호</label>
          <input
            id={accountId}
            type="text"
            value={form.bankAccount}
            maxLength={60}
            onChange={(e) => edit({ bankAccount: e.target.value })}
            {...bankProps(form.bankAccount)}
          />
        </div>
        <div>
          <label htmlFor={holderId} className={labelCls}>예금주</label>
          <input
            id={holderId}
            type="text"
            value={form.bankHolder}
            maxLength={60}
            onChange={(e) => edit({ bankHolder: e.target.value })}
            {...bankProps(form.bankHolder)}
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={saveDisabled}
          className="tm-btn tm-btn-sm tm-btn-primary"
          style={{ minHeight: 44 }}
        >
          {updateFee.isPending ? '저장 중…' : '저장'}
        </button>
      </div>
      {errors.fee ? <p id={feeErrorId} role="alert" className="mt-3 text-[length:var(--font-size-caption)] text-[var(--red700)]">{errors.fee}</p> : null}
      {errors.bank ? <p id={bankErrorId} role="alert" className="mt-3 text-[length:var(--font-size-caption)] text-[var(--red700)]">{errors.bank}</p> : null}
      {saveError ? <p role="alert" className="mt-3 text-[length:var(--font-size-caption)] text-[var(--red700)]">{saveError}</p> : null}
      {saved ? <p role="status" className="mt-3 text-[length:var(--font-size-caption)] text-[var(--green700)]">참가비를 저장했어요.</p> : null}
      {!canWrite ? (
        <p className="mt-3 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">현재 계정은 참가비를 바꿀 권한이 없어요.</p>
      ) : null}

      <ConfirmModal
        open={pending !== null}
        title={pending ? changeTitle(pending) : ''}
        message="바꾼 내용은 감사 기록에 남아요."
        details={pending ? <ChangeDetails change={pending} league={league} /> : null}
        reasonField={{ label: '사유', value: reason, onChange: setReason, required: true, maxLength: 500, hint: '감사 기록에 남아요.' }}
        confirmLabel="바꾸기"
        busy={updateFee.isPending}
        error={modalError}
        onConfirm={() => pending && send(pending, reason.trim())}
        onCancel={() => {
          setPending(null);
          setReason('');
          setModalError(null);
        }}
      />
    </section>
  );
}

function ChangeDetails({ change, league }: { change: PendingChange; league: LeagueFeeSource }) {
  const count = league.activeRegistrationCount;
  return (
    <>
      {change.feeChanged ? (
        <div className="tm-info-row">
          <div className="tm-text-label">참가비</div>
          <div>{money(league.entryFee)} → {money(change.payload.entryFee)}</div>
        </div>
      ) : null}
      <p className="mt-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
        {change.feeChanged
          ? `직접 신청한 ${count}팀은 신청할 때의 금액이 그대로 유지돼요. 새로 신청하는 팀부터 ${money(change.payload.entryFee)}이에요.`
          : '입금 대기 중인 팀에게도 새 계좌가 보여요.'}
      </p>
    </>
  );
}
