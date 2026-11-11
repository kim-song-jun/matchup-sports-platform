'use client';

import { useEffect, useId, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { extractErrorMessage } from '@/lib/error-message';
import type {
  V1AdminTournamentPlayer,
  V1PlayerEligibilityMethod,
  V1PlayerEligibilityStatus,
  V1UpdatePlayerEligibilityPayload,
} from '@/types/api';
import { PLAYER_ELIGIBILITY_LABEL, PLAYER_ELIGIBILITY_METHOD_LABEL } from '@/lib/v1-status-labels';
import {
  ELIGIBILITY_METHODS,
  JOINKFA_PRIVACY_NOTE,
  JoinKfaLink,
  eligibilityDeclarationMismatch,
  formatEvidenceDate,
  formatEvidenceFullDate,
} from '@/components/tournaments/player-eligibility';

/**
 * 어드민 명단 검토의 선출 판정(MD-QA #192 B안).
 *
 * 예전엔 select 를 바꾸는 즉시 `{eligibilityStatus}` 만 저장했다 — 잘못 누르면 그대로 저장되고,
 * 무엇으로 확인했는지는 어디에도 남지 않았다. 이제 판정 + 확인 방법 + 메모를 한 패널에서 고르고
 * "판정 저장" 한 번으로 보낸다. 확인일·확인자는 서버가 채운다.
 */

export type EligibilityFilter = 'all' | 'unreviewed' | 'pro' | 'self_declared_only';

const FILTER_LABEL: Record<EligibilityFilter, string> = {
  all: '전체',
  unreviewed: '확인 전',
  pro: '선출',
  self_declared_only: '본인 신고만',
};

/** 판정 여부는 서버의 `eligibilityAdminReviewed` 가 정본이다(옛 판정은 감사 로그로만 안다). */
export function isEligibilityReviewed(player: V1AdminTournamentPlayer): boolean {
  return player.eligibilityAdminReviewed ?? Boolean(player.eligibilityVerifiedAt);
}

export function matchesEligibilityFilter(player: V1AdminTournamentPlayer, filter: EligibilityFilter): boolean {
  switch (filter) {
    case 'unreviewed':
      return !isEligibilityReviewed(player);
    case 'pro':
      return player.eligibilityStatus === 'pro';
    case 'self_declared_only':
      // 본인 신고만 근거로 판정한 선수 — 근거가 가장 약해 다시 볼 대상이다.
      return player.eligibilityVerificationMethod === 'self_declared';
    default:
      return true;
  }
}

export function EligibilityFilterChips({
  players,
  value,
  onChange,
}: {
  players: readonly V1AdminTournamentPlayer[];
  value: EligibilityFilter;
  onChange: (next: EligibilityFilter) => void;
}) {
  const reviewed = players.filter(isEligibilityReviewed).length;
  return (
    <div className="mb-2">
      <p className="mb-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{`선출 확인 ${reviewed}/${players.length}명`}</p>
      <div role="group" aria-label="선출 판정 필터" className="flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABEL) as EligibilityFilter[]).map((key) => {
          const count = players.filter((player) => matchesEligibilityFilter(player, key)).length;
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              className={`tm-chip${active ? ' tm-chip-active' : ''}`}
              aria-pressed={active}
              onClick={() => onChange(key)}
            >
              {FILTER_LABEL[key]}
              <span className="tab-num">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 행 아래 근거 줄 — "JoinKFA 확인 · 11.10 · 확인자 운영김" / 팀장 선택·본인 신고·불일치 표시. */
export function EligibilityEvidence({ player }: { player: V1AdminTournamentPlayer }) {
  const reviewed = isEligibilityReviewed(player);
  const method = player.eligibilityVerificationMethod ?? null;
  const verifiedAt = player.eligibilityVerifiedAt ?? null;
  const selfDeclared = player.selfDeclaredStatus ?? null;
  // 판정 전 eligibilityStatus 는 팀장이 고른 값이다. 판정 뒤에는 운영진 판정이 덮어써 팀장 선택이 남지 않는다.
  const mismatch = eligibilityDeclarationMismatch(player.eligibilityStatus, selfDeclared);
  return (
    <div className="mt-1 flex flex-col gap-0.5 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
      {reviewed ? (
        <p className="m-0">
          {method ? `${PLAYER_ELIGIBILITY_METHOD_LABEL[method]} 확인` : '운영진 확인'}
          {verifiedAt ? ` · ${formatEvidenceDate(verifiedAt)}` : ''}
          {player.eligibilityVerifiedByName ? ` · 확인자 ${player.eligibilityVerifiedByName}` : ''}
        </p>
      ) : (
        <p className="m-0">아직 확인 전이에요</p>
      )}
      {player.eligibilityNote ? <p className="m-0 break-words">메모 {player.eligibilityNote}</p> : null}
      <p className="m-0">
        {reviewed ? '' : `팀장 선택 ${PLAYER_ELIGIBILITY_LABEL[player.eligibilityStatus]} · `}
        {selfDeclared ? `본인 신고 ${PLAYER_ELIGIBILITY_LABEL[selfDeclared]}` : '본인 신고 없음'}
      </p>
      {mismatch ? (
        <p className="m-0 inline-flex items-center gap-1 font-semibold text-[var(--orange700)]">
          <AlertTriangle size={12} aria-hidden="true" />
          {reviewed ? '판정과 본인 신고가 달라요' : '팀장 선택과 본인 신고가 달라요'}
        </p>
      ) : null}
    </div>
  );
}

/** 이전 대회·리그 판정 제안 — 자동으로 적용하지 않고 운영자가 "이전 판정 유지" 를 눌러야 한다. */
export function PreviousEligibilityRuling({
  player,
  canWrite,
  isPending,
  onKeep,
}: {
  player: V1AdminTournamentPlayer;
  canWrite: boolean;
  isPending: boolean;
  onKeep: () => void;
}) {
  const previous = player.previousEligibilityRuling;
  if (!previous || isEligibilityReviewed(player)) return null;
  const method = previous.verificationMethod ? `${PLAYER_ELIGIBILITY_METHOD_LABEL[previous.verificationMethod]} 확인 · ` : '';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--surface-soft)] px-3 py-2">
      <p className="m-0 min-w-0 flex-1 break-words text-[length:var(--font-size-caption)] text-[var(--text-body)]">
        {`이전 판정: ${PLAYER_ELIGIBILITY_LABEL[previous.eligibilityStatus]} · ${method}${formatEvidenceFullDate(previous.verifiedAt)} · ${previous.competitionTitle}`}
      </p>
      <button
        type="button"
        onClick={onKeep}
        disabled={!canWrite || isPending}
        aria-label={`${player.realName} 이전 판정 유지`}
        className="h-[44px] shrink-0 rounded-xl border border-[var(--border)] px-3 text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--card-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
      >
        이전 판정 유지
      </button>
    </div>
  );
}

function PillRadio<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  labelOf,
}: {
  name: string;
  legend: string;
  options: readonly T[];
  value: T | null;
  onChange: (next: T) => void;
  labelOf: (value: T) => string;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)]">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const id = `${name}-${option}`;
          const selected = value === option;
          return (
            <label
              key={option}
              htmlFor={id}
              className={`tm-chip cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--blue500)]${selected ? ' tm-chip-active' : ''}`}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={option}
                checked={selected}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              {labelOf(option)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** 판정 패널 — 판정 + 확인 방법 + 메모를 한 번에 저장한다. */
export function EligibilityRulingPanel({
  player,
  isSaving,
  onCancel,
  onSave,
}: {
  player: V1AdminTournamentPlayer;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (body: V1UpdatePlayerEligibilityPayload) => Promise<void>;
}) {
  const baseId = useId();
  const [status, setStatus] = useState<V1PlayerEligibilityStatus>(player.eligibilityStatus);
  const [method, setMethod] = useState<V1PlayerEligibilityMethod | null>(player.eligibilityVerificationMethod ?? null);
  const [note, setNote] = useState(player.eligibilityNote ?? '');
  const [error, setError] = useState<string | null>(null);

  // 다른 선수로 패널이 바뀌면 그 선수 값으로 다시 채운다.
  useEffect(() => {
    setStatus(player.eligibilityStatus);
    setMethod(player.eligibilityVerificationMethod ?? null);
    setNote(player.eligibilityNote ?? '');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 선수가 바뀔 때만 초기화한다(저장 중 갱신이 입력을 지우지 않게).
  }, [player.id]);

  async function handleSave() {
    if (isSaving) return;
    if (status !== 'needs_review' && !method) {
      setError('무엇으로 확인했는지 골라 주세요.');
      return;
    }
    setError(null);
    const originalNote = player.eligibilityNote ?? '';
    try {
      await onSave({
        eligibilityStatus: status,
        ...(method ? { verificationMethod: method } : {}),
        // 메모는 바꾼 경우에만 보낸다 — 생략하면 서버가 기존 메모를 그대로 둔다.
        ...(note !== originalNote ? { note } : {}),
      });
    } catch (err) {
      setError(extractErrorMessage(err, '판정을 저장하지 못했어요.'));
    }
  }

  const noteId = `${baseId}-note`;
  return (
    <section
      aria-label={`${player.realName} 선출 판정`}
      className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-3"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)]">
          {player.jerseyNumber !== null ? `${player.jerseyNumber} ` : ''}
          {player.realName} · 선출 판정
        </p>
        <JoinKfaLink label="JoinKFA 열기" />
      </div>
      <div className="flex flex-col gap-3">
        <PillRadio
          name={`${baseId}-status`}
          legend="판정"
          options={['non_pro', 'pro', 'needs_review'] as const}
          value={status}
          onChange={setStatus}
          labelOf={(value) => PLAYER_ELIGIBILITY_LABEL[value]}
        />
        <PillRadio
          name={`${baseId}-method`}
          legend="무엇으로 확인했나요"
          options={ELIGIBILITY_METHODS}
          value={method}
          onChange={setMethod}
          labelOf={(value) => PLAYER_ELIGIBILITY_METHOD_LABEL[value]}
        />
        <div>
          <label htmlFor={noteId} className="mb-1 block text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)]">
            메모 <span className="font-normal text-[var(--text-muted)]">(선택 · 500자)</span>
          </label>
          <textarea
            id={noteId}
            value={note}
            maxLength={500}
            rows={2}
            onChange={(event) => setNote(event.target.value)}
            placeholder="예: 소속내역에 동호인 팀만 있어요"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 py-2 text-[length:var(--font-size-label)] text-[var(--text-strong)] transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <p className="m-0 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          확인일과 확인자는 저장할 때 자동으로 남아요. 캡처·증명서 파일은 올리지 않아요.
        </p>
        <p className="m-0 text-[length:var(--font-size-caption)] text-[var(--text-caption)]">{JOINKFA_PRIVACY_NOTE}</p>
        {error ? (
          <p role="alert" className="m-0 text-[length:var(--font-size-caption)] text-[var(--red700)]">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="h-[44px] flex-1 rounded-xl bg-[var(--surface-soft)] text-[length:var(--font-size-label)] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--grey300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="h-[44px] flex-1 rounded-xl bg-blue-500 text-[length:var(--font-size-label)] font-semibold text-white transition-colors hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
          >
            {isSaving ? '저장 중…' : '판정 저장'}
          </button>
        </div>
      </div>
    </section>
  );
}
