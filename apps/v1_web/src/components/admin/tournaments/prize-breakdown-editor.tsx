'use client';

import { Plus, X } from 'lucide-react';
import {
  PRIZE_LABEL_PRESETS,
  formatPrizeRowValue,
  prizeAmountDigits,
  serializePrizeRows,
} from '@/lib/prize-breakdown';
import { formatWithComma } from '@/lib/number-format';

export type TournamentPrizeRow = {
  id: string;
  label: string;
  value: string;
};

type PrizeBreakdownEditorProps = {
  rows: TournamentPrizeRow[];
  onChange: (rows: TournamentPrizeRow[]) => void;
  prizePool: string;
  onPrizePoolChange: (value: string) => void;
  disabled?: boolean;
};

const fieldClass =
  'h-[44px] w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

export function PrizeBreakdownEditor({
  rows,
  onChange,
  prizePool,
  onPrizePoolChange,
  disabled = false,
}: PrizeBreakdownEditorProps) {
  const total = rows.reduce((sum, row) => sum + (prizeAmountDigits(row.value) ?? 0), 0);
  const pool = prizePool ? Number(prizePool) : null;
  const mismatch = total > 0 && pool !== null && total !== pool;

  const updateRow = (id: string, patch: Partial<Omit<TournamentPrizeRow, 'id'>>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="tournament-prize-pool" className="text-sm font-semibold text-[var(--text-body)]">
          총상금
        </label>
        <input
          id="tournament-prize-pool"
          type="text"
          inputMode="numeric"
          value={formatWithComma(prizePool)}
          onChange={(event) => onPrizePoolChange(event.target.value.replace(/\D/g, ''))}
          disabled={disabled}
          placeholder="예: 1,000,000"
          className={fieldClass}
        />
      </div>

      <div className="grid gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--text-body)]">상금 배분</p>
          <p className="mt-0.5 text-xs leading-5 text-[var(--text-caption)]">
            숫자는 원 단위로 자동 정리되고 트로피·상품권 같은 물품도 입력할 수 있어요.
          </p>
        </div>
        {rows.map((row, index) => (
          <div key={row.id} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_44px] gap-2">
            <input
              type="text"
              list="tournament-prize-label-presets"
              value={row.label}
              onChange={(event) => updateRow(row.id, { label: event.target.value.replaceAll('/', '·') })}
              disabled={disabled}
              maxLength={20}
              aria-label={`상금 항목 ${index + 1} 이름`}
              placeholder="예: 1위"
              className={fieldClass}
            />
            <input
              type="text"
              value={row.value}
              onChange={(event) => updateRow(row.id, { value: event.target.value.replaceAll('/', '·') })}
              disabled={disabled}
              maxLength={80}
              aria-label={`상금 항목 ${index + 1} 내용`}
              placeholder="예: 600,000원 또는 우승 트로피"
              className={fieldClass}
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((candidate) => candidate.id !== row.id))}
              disabled={disabled}
              aria-label={`상금 항목 ${index + 1} 삭제`}
              className="grid h-[44px] w-[44px] place-items-center rounded-xl text-[var(--text-caption)] transition-colors hover:bg-red-50 hover:text-[var(--red500)] disabled:opacity-50"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        ))}
        <datalist id="tournament-prize-label-presets">
          {PRIZE_LABEL_PRESETS.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const used = new Set(rows.map((row) => row.label));
              const label = PRIZE_LABEL_PRESETS.find((candidate) => !used.has(candidate)) ?? '';
              onChange([...rows, { id: createPrizeRowId(), label, value: '' }]);
            }}
            disabled={disabled || rows.length >= 12}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-blue-50 px-4 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-100 disabled:opacity-50"
          >
            <Plus size={16} aria-hidden="true" />
            항목 추가
          </button>
          {total > 0 ? (
            <span className={`text-xs ${mismatch ? 'font-semibold text-amber-700' : 'text-[var(--text-caption)]'}`}>
              배분 합계 {formatWithComma(String(total))}원{mismatch ? ' · 총상금과 달라요' : ''}
            </span>
          ) : null}
          {mismatch ? (
            <button
              type="button"
              onClick={() => onPrizePoolChange(String(total))}
              disabled={disabled}
              className="min-h-[44px] rounded-xl bg-[var(--grey100)] px-4 text-xs font-semibold text-[var(--text-body)]"
            >
              합계를 총상금으로
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--grey50)] p-4">
        <p className="text-xs font-semibold text-[var(--text-caption)]">공개 페이지 미리보기</p>
        <div className="mt-2 grid gap-2">
          {rows.some((row) => row.label.trim() && row.value.trim()) ? (
            rows
              .filter((row) => row.label.trim() && row.value.trim())
              .map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-[var(--text-body)]">{row.label.trim()}</span>
                  <span className="text-right font-bold text-[var(--text-strong)]">
                    {formatPrizeRowValue(row.value)}
                  </span>
                </div>
              ))
          ) : (
            <p className="text-sm text-[var(--text-caption)]">상금 항목을 추가하면 여기에 바로 보여요.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function createPrizeRowId() {
  return `prize-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function serializeTournamentPrizeRows(rows: TournamentPrizeRow[]) {
  return serializePrizeRows(
    rows.map((row) => ({
      label: row.label,
      amount: formatPrizeRowValue(row.value),
    })),
  );
}
