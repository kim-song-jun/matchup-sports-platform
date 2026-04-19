'use client';

/**
 * Toggle (switch) component that meets WCAG 2.1 AA minimum 44x44px touch target.
 *
 * Visual track remains h-[30px] w-[52px]; the outer button uses padding to
 * expand the interactive area to min-h-[44px] min-w-[44px] (Option B).
 */
export interface ToggleProps {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Accessible label — used in aria-label as "{label} {켜짐|꺼짐}" */
  label: string;
}

export function Toggle({ enabled, onToggle, disabled, label }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={`${label} ${enabled ? '켜짐' : '꺼짐'}`}
      role="switch"
      aria-checked={enabled}
      className={[
        // Touch target: pad to 44x44 while keeping visual track size (Option B)
        'flex items-center justify-center shrink-0',
        'min-h-[44px] min-w-[44px]',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'relative h-[30px] w-[52px] rounded-full transition-colors duration-200',
          enabled ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-600',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-[3px] left-[3px] h-[24px] w-[24px] rounded-full bg-white dark:bg-gray-800 shadow-sm transition-transform duration-200',
            enabled ? 'translate-x-[22px]' : 'translate-x-0',
          ].join(' ')}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}
