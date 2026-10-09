'use client';

import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button } from '@/components/v1-ui/button';
import { needsPenalties, parseQuickScore, type QuickScoreInputs } from '@/lib/bracket-quick-score';
import type { V1QuickResultScore } from '@/types/api';

export type BracketQuickResultFormProps = {
  homeLabel: string;
  awayLabel: string;
  isKnockout: boolean;
  initial?: V1QuickResultScore;
  submitLabel: string;
  pending: boolean;
  errorMessage?: string | null;
  onSubmit: (score: V1QuickResultScore) => void;
  onCancel?: () => void;
};

function toInputs(initial: V1QuickResultScore | undefined): QuickScoreInputs {
  return {
    home: initial === undefined ? '' : String(initial.home),
    away: initial === undefined ? '' : String(initial.away),
    penaltyHome: initial?.penalties === undefined ? '' : String(initial.penalties.home),
    penaltyAway: initial?.penalties === undefined ? '' : String(initial.penalties.away),
  };
}

export function BracketQuickResultForm({
  homeLabel,
  awayLabel,
  isKnockout,
  initial,
  submitLabel,
  pending,
  errorMessage,
  onSubmit,
  onCancel,
}: BracketQuickResultFormProps) {
  const idPrefix = useId();
  const [inputs, setInputs] = useState<QuickScoreInputs>(() => toInputs(initial));
  const [validationError, setValidationError] = useState<string | null>(null);
  const showPenalties = needsPenalties(inputs, isKnockout);
  const shownError = validationError ?? errorMessage ?? null;

  const change = (key: keyof QuickScoreInputs) => (event: ChangeEvent<HTMLInputElement>) => {
    setValidationError(null);
    setInputs((current) => ({ ...current, [key]: event.target.value }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseQuickScore(inputs, isKnockout);
    if (!parsed.ok) {
      setValidationError(parsed.error);
      return;
    }
    onSubmit(parsed.score);
  };

  const field = (key: keyof QuickScoreInputs, label: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${idPrefix}-${key}`} className="tm-text-caption truncate" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <input
        id={`${idPrefix}-${key}`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={inputs[key]}
        onChange={change(key)}
        disabled={pending}
        className="tm-input tab-num"
        style={{ minHeight: 44 }}
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <div className="grid grid-cols-2 gap-3">
        {field('home', `${homeLabel} 점수`)}
        {field('away', `${awayLabel} 점수`)}
      </div>
      {showPenalties ? (
        <div className="flex flex-col gap-2">
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            정규시간이 무승부라 승부차기 점수가 필요해요.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {field('penaltyHome', `${homeLabel} 승부차기`)}
            {field('penaltyAway', `${awayLabel} 승부차기`)}
          </div>
        </div>
      ) : null}
      {shownError !== null ? (
        <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>
          {shownError}
        </p>
      ) : null}
      <div className="flex gap-2">
        {onCancel ? (
          <Button type="button" variant="neutral" size="md" className="flex-1" onClick={onCancel} disabled={pending}>
            취소
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="md" className="flex-1" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
