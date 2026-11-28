import type { FieldColumn } from './ops-board-model';

interface FieldChipsProps {
  columns: readonly FieldColumn[];
  /** single: 「전체」 + 구장 하나. multi: 구장 여러 곳(최대 `maxSelected`). */
  mode: 'single' | 'multi';
  /** 구장 열의 key. single 에서 빈 배열은 「전체」다. */
  selected: readonly string[];
  maxSelected?: number;
  onChange: (keys: string[]) => void;
  ariaLabel: string;
}

const CHIP =
  'inline-flex min-h-11 items-center rounded-lg border px-3 text-[length:var(--font-size-label)] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const CHIP_ON = 'border-[var(--blue500)] bg-[var(--blue50)] text-[var(--blue700)]';
const CHIP_OFF = 'border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-body)] hover:bg-[var(--surface-soft)]';

export function FieldChips({ columns, mode, selected, maxSelected, onChange, ariaLabel }: FieldChipsProps) {
  const atMax = mode === 'multi' && maxSelected !== undefined && selected.length >= maxSelected;

  function toggle(key: string) {
    if (mode === 'single') {
      onChange([key]);
      return;
    }
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  }

  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {mode === 'single' ? (
        <button type="button" aria-pressed={selected.length === 0} onClick={() => onChange([])} className={`${CHIP} ${selected.length === 0 ? CHIP_ON : CHIP_OFF}`}>
          전체
        </button>
      ) : null}
      {columns.map((column) => {
        const on = selected.includes(column.key);
        const blocked = atMax && !on;
        return (
          <button
            key={column.key}
            type="button"
            aria-pressed={on}
            disabled={blocked}
            title={blocked ? `최대 ${maxSelected}곳까지 고를 수 있어요` : undefined}
            onClick={() => toggle(column.key)}
            className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
          >
            {column.name}
          </button>
        );
      })}
    </div>
  );
}
