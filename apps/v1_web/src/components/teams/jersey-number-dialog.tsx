'use client';

import { useEffect, useId, useState } from 'react';

import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';

type JerseyNumberDialogProps = {
  open: boolean;
  memberName: string;
  /** 지금 지정돼 있는 번호. 없으면 null. */
  current: number | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  /** null이면 등번호 해제. */
  onSave: (jerseyNumber: number | null) => void;
};

/**
 * 팀 고정 등번호를 지정·해제하는 다이얼로그.
 *
 * 라인업 화면에서 고치는 등번호와 다르다. 이쪽은 팀의 **영구 번호**라 다음 경기에도
 * 계속 따라오고, 라인업에서 한 경기만 다르게 단다고 해서 바뀌지 않는다.
 */
export function JerseyNumberDialog({
  open,
  memberName,
  current,
  saving,
  error,
  onClose,
  onSave,
}: JerseyNumberDialogProps) {
  const idPrefix = useId();
  const titleId = `${idPrefix}-jersey-title`;
  const inputId = `${idPrefix}-jersey-input`;
  const [value, setValue] = useState('');

  // focus 저장/복원 · ESC 닫기 · Tab focus trap · body 스크롤 잠금 · backdrop 클릭 닫기는
  // 공용 훅(useModalA11y)에 위임한다. 이 다이얼로그는 퇴장 애니메이션이 없어
  // mounted/closing 은 쓰지 않고 open 조건부 렌더를 그대로 둔다. 저장 중(saving)에는
  // ESC·backdrop 으로 실수 이탈하지 않게 pending 으로 잠근다.
  const { dialogRef, initialFocusRef, onBackdropClick } = useModalA11y<HTMLInputElement, HTMLDivElement>({
    open,
    onClose,
    pending: saving,
  });

  useEffect(() => {
    if (open) setValue(current === null ? '' : String(current));
  }, [open, current]);

  if (!open) return null;

  const trimmed = value.trim();
  const parsed = trimmed === '' ? null : Number(trimmed);
  const invalid = parsed !== null && (!Number.isInteger(parsed) || parsed < 0 || parsed > 999);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
      style={{ background: 'rgba(25,31,40,0.45)' }}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[340px] rounded-2xl overflow-hidden"
        style={{ background: 'var(--card-surface, #fff)', boxShadow: '0 8px 32px rgba(20,28,45,0.14)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: '24px 20px 16px', display: 'grid', gap: 12 }}>
          <p id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
            {memberName}님 등번호
          </p>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: 0 }}>
            팀에서 계속 쓰는 번호예요. 라인업을 짤 때 자동으로 채워지고, 한 경기만 다른 번호를
            달아도 이 값은 그대로예요.
          </p>

          <label htmlFor={inputId} className="tm-text-caption" style={{ fontWeight: 600 }}>
            등번호 (비우면 해제)
          </label>
          <input
            ref={initialFocusRef}
            id={inputId}
            type="number"
            inputMode="numeric"
            min={0}
            max={999}
            className="tm-input"
            placeholder="예: 7"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !invalid && !saving) onSave(parsed);
            }}
          />

          {invalid ? (
            <p className="tm-text-caption" style={{ color: 'var(--orange700)', margin: 0 }}>
              0부터 999 사이의 숫자를 넣어 주세요.
            </p>
          ) : null}
          {error !== null ? (
            <p className="tm-text-caption" role="alert" style={{ color: 'var(--red700)', margin: 0 }}>
              {error}
            </p>
          ) : null}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 20px 20px' }}>
          <button type="button" className="tm-btn tm-btn-lg tm-btn-neutral" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-primary"
            disabled={invalid || saving}
            onClick={() => onSave(parsed)}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
