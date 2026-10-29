'use client';

import { Plus, X } from 'lucide-react';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { GroupedPrizes } from '@/components/tournaments/grouped-prizes';
import {
  PRIZE_CATEGORIES,
  prizeCategoryOf,
  type PrizeCategory,
  formatPrizeRowValue,
  prizeAmountDigits,
  serializePrizeRows,
} from '@/lib/prize-breakdown';
import { formatWithComma } from '@/lib/number-format';

export type TournamentPrizeRow = {
  id: string;
  category?: PrizeCategory;
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
  'h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body)] text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

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
    onChange(rows.map((row) => (row.id === id ? { ...row, category: prizeCategoryOf(row), ...patch } : row)));
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <label htmlFor="tournament-prize-pool" className="text-[length:var(--font-size-body)] font-semibold text-[var(--text-body)]">
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
          <p className="text-[length:var(--font-size-body)] font-semibold text-[var(--text-body)]">상금 배분</p>
          <p className="mt-0.5 text-[length:var(--font-size-caption)] leading-5 text-[var(--text-caption)]">
            숫자는 원 단위로 자동 정리되고 트로피·상품권 같은 물품도 입력할 수 있어요.
          </p>
        </div>
        {PRIZE_CATEGORIES.map((category, categoryIndex) => (
          <section key={category} aria-label={`${category} 입력`} className="grid gap-3 py-3">
            <SectionTitle title={category} compact />
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-caption)]">상 이름을 직접 입력해도 {category} 구역에 저장돼요.</p>
            {rows.map((row, index) => prizeCategoryOf(row) === category ? (
              <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_44px] gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_44px]">
                <input
                  type="text"
                  list={`tournament-prize-label-presets-${categoryIndex}`}
                  value={row.label}
                  onChange={(event) => updateRow(row.id, { label: event.target.value.replaceAll('/', '·') })}
                  disabled={disabled}
                  maxLength={20}
                  aria-label={`상금 항목 ${index + 1} 이름`}
                  placeholder={category === '팀 시상' ? '예: 우승' : category === '개인 시상' ? '예: 베스트 골키퍼' : '예: 참가상'}
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
                  className={`${fieldClass} col-span-2 col-start-1 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1`}
                />
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((candidate) => candidate.id !== row.id))}
                  disabled={disabled}
                  aria-label={`상금 항목 ${index + 1} 삭제`}
                  className="col-start-2 row-start-1 grid h-[44px] w-[44px] place-items-center rounded-xl text-[var(--text-caption)] transition-colors hover:bg-[var(--red50)] hover:text-[var(--red500)] disabled:opacity-50 sm:col-start-3"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>
            ) : null)}
            <datalist id={`tournament-prize-label-presets-${categoryIndex}`}>
              {(category === '팀 시상' ? ['우승', '준우승', '3위'] : category === '개인 시상' ? ['MVP', '득점왕', '도움왕'] : ['참가상', '특별상']).map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => onChange([...rows, { id: createPrizeRowId(), category, label: '', value: '' }])}
              disabled={disabled || rows.length >= 12}
              className="inline-flex min-h-[44px] w-fit items-center gap-2 rounded-xl bg-[var(--blue50)] px-4 text-[length:var(--font-size-body)] font-semibold text-[var(--blue700)] transition-colors hover:bg-[var(--blue100)] disabled:opacity-50"
            >
              <Plus size={16} aria-hidden="true" />
              {category} 추가
            </button>
          </section>
        ))}
        <p className="text-[length:var(--font-size-caption)] text-[var(--text-caption)]">전체 시상 항목은 최대 12개까지 등록할 수 있어요.</p>
        <div className="flex flex-wrap items-center gap-2">
          {total > 0 ? (
            <span className={`text-[length:var(--font-size-caption)] ${mismatch ? 'font-semibold text-[var(--orange700)]' : 'text-[var(--text-caption)]'}`}>
              배분 합계 {formatWithComma(String(total))}원{mismatch ? ' · 총상금과 달라요' : ''}
            </span>
          ) : null}
          {mismatch ? (
            <button
              type="button"
              onClick={() => onPrizePoolChange(String(total))}
              disabled={disabled}
              className="min-h-[44px] rounded-xl bg-[var(--grey150)] px-4 text-[length:var(--font-size-caption)] font-semibold text-[var(--text-body)]"
            >
              합계를 총상금으로
            </button>
          ) : null}
        </div>
      </div>

      <div className="tm-on-tint rounded-xl border border-[var(--border)] bg-[var(--grey50)] p-4">
        <p className="text-[length:var(--font-size-caption)] font-semibold text-[var(--text-caption)]">공개 페이지 미리보기</p>
        <div className="mt-2 grid gap-2">
          {rows.some((row) => row.label.trim()) ? (
            <GroupedPrizes rows={rows
              .filter((row) => row.label.trim())
              .map((row) => ({ label: row.label, amount: row.value, category: prizeCategoryOf(row) }))} />
          ) : (
            <p className="text-[length:var(--font-size-body)] text-[var(--text-caption)]">상금 항목을 추가하면 여기에 바로 보여요.</p>
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
      category: prizeCategoryOf(row),
      amount: formatPrizeRowValue(row.value),
    })),
  );
}
