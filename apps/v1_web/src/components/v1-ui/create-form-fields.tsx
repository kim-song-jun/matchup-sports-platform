'use client';

import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * matches-page.tsx / team-matches-page.tsx 생성 위저드에서 공유하는 필드 컴포넌트.
 * StateCard·ImageUploadField는 두 화면에서 톤 종류·라벨·"이미 이미지가 있음" 판단 로직이
 * 실제로 달라 여기 포함하지 않았다 — 강제로 합치면 한쪽의 시각·동작이 조용히 바뀐다.
 */

export function DraggableFilterSheet({
  closeHref,
  ariaLabel,
  children,
}: {
  closeHref: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const startYRef = useRef(0);
  const draggingRef = useRef(false);
  const [offsetY, setOffsetY] = useState(0);

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    startYRef.current = event.clientY;
    draggingRef.current = true;
    setOffsetY(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    setOffsetY(Math.max(0, event.clientY - startYRef.current));
  };

  const handlePointerEnd = (event: PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (offsetY > 72) {
      router.push(closeHref);
      return;
    }
    setOffsetY(0);
  };

  // a11y: ESC 키로 필터 시트 닫기 (드래그 동작과 독립적으로 동작)
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      router.push(closeHref);
    }
  };

  return (
    <div className="tm-filter-layer">
      {/* role="dialog" + aria-modal="true": 스크린리더가 시트를 대화상자로 인식하고
          배경 콘텐츠를 읽지 않도록 함. focus-trap은 드래그 인터랙션 충돌 위험으로 생략. */}
      <section
        className="tm-filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={{ transform: `translateY(${offsetY}px)` }}
      >
        {children}
      </section>
    </div>
  );
}

export function CreateField({
  label,
  value,
  placeholder,
  suffix,
  multiline,
  type = 'text',
  onChange,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  suffix?: string;
  multiline?: boolean;
  type?: string;
  onChange?: (value: string) => void;
}) {
  // date/time 인풋은 lang="ko"를 부여해 OS locale에 상관없이
  // 가능한 경우 한국어 포맷(yyyy.mm.dd 또는 HH:MM)으로 표시를 유도한다.
  // CSS(.tm-create-native-input[type="date" i] 등)에서 appearance:none +
  // ::-webkit-calendar-picker-indicator 처리로 OS 스피너/아이콘을 제거한다.
  const isDateLike = type === 'date' || type === 'time';
  return (
    <label className="tm-create-field">
      <div className="tm-text-label">{label}</div>
      <div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''}`}>
        {onChange ? (
          multiline ? (
            <textarea className="tm-create-native-input" value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
          ) : (
            <input
              className="tm-create-native-input"
              type={type}
              lang={isDateLike ? 'ko' : undefined}
              value={value ?? ''}
              placeholder={placeholder}
              onChange={(event) => onChange(event.target.value)}
            />
          )
        ) : (
          <span className="tm-text-body" style={{ color: value ? 'var(--text-strong)' : 'var(--text-caption)' }}>{value || placeholder || '입력'}</span>
        )}
        {suffix ? <span className="tm-text-caption">{suffix}</span> : null}
      </div>
    </label>
  );
}

export function GenderRuleSelector({ value, onChange }: { value: string; onChange?: (value: string) => void }) {
  return (
    <div className="tm-create-field">
      <div className="tm-text-label">성별 조건</div>
      <div className="tm-team-form-chip-row">
        {['성별 무관', '남', '여'].map((option) => (
          <button key={option} className={`tm-chip ${value === option ? 'tm-chip-active' : ''}`} type="button" aria-pressed={value === option} onClick={() => onChange?.(option)}>
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
