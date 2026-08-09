'use client';

import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangleIcon, ChevronRightIcon } from '@/components/v1-ui/icons';
import { Card } from '@/components/v1-ui/primitives';

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
  id,
  error,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  suffix?: string;
  multiline?: boolean;
  type?: string;
  onChange?: (value: string) => void;
  /** 스텝 게이팅·결측 필드 안내(#1·#2)가 오류 발생 시 이 필드로 focus를 옮기는 데 쓰는 anchor. */
  id?: string;
  /** 설정되면 입력창을 orange로 강조하고 아래에 아이콘+문구를 병행 표시한다(색상 단독 전달 금지). */
  error?: string;
}) {
  // date/time 인풋은 lang="ko"를 부여해 OS locale에 상관없이
  // 가능한 경우 한국어 포맷(yyyy.mm.dd 또는 HH:MM)으로 표시를 유도한다.
  // CSS(.tm-create-native-input[type="date" i] 등)에서 appearance:none +
  // ::-webkit-calendar-picker-indicator 처리로 OS 스피너/아이콘을 제거한다.
  const isDateLike = type === 'date' || type === 'time';
  const errorId = id && error ? `${id}-error` : undefined;
  return (
    <label className="tm-create-field">
      <div className="tm-text-label">{label}</div>
      <div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''} ${error ? 'tm-create-input-error' : ''}`}>
        {onChange ? (
          multiline ? (
            <textarea
              id={id}
              className="tm-create-native-input"
              value={value ?? ''}
              placeholder={placeholder}
              aria-invalid={error ? true : undefined}
              aria-describedby={errorId}
              onChange={(event) => onChange(event.target.value)}
            />
          ) : (
            <input
              id={id}
              className="tm-create-native-input"
              type={type}
              lang={isDateLike ? 'ko' : undefined}
              value={value ?? ''}
              placeholder={placeholder}
              aria-invalid={error ? true : undefined}
              aria-describedby={errorId}
              onChange={(event) => onChange(event.target.value)}
            />
          )
        ) : (
          <span className="tm-text-body" style={{ color: value ? 'var(--text-strong)' : 'var(--text-caption)' }}>{value || placeholder || '입력'}</span>
        )}
        {suffix ? <span className="tm-text-caption">{suffix}</span> : null}
      </div>
      {error ? (
        <div id={errorId} className="tm-create-field-error" role="alert">
          <AlertTriangleIcon size={14} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
    </label>
  );
}

/**
 * CreateField가 아닌 선택 그룹(팀 카드, 종목 카드, 지역 select)에 쓰는 인라인 에러 —
 * CreateField 내부의 error 렌더와 같은 마크업(아이콘+문구, 색상 단독 전달 금지)을 공유한다.
 * id를 주면 스텝 게이팅의 focus-scroll anchor로도 쓸 수 있다(비-focusable 요소는 focus는
 * 실패해도 scrollIntoView는 동작).
 */
export function FieldErrorText({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <div id={id} className="tm-create-field-error" role="alert" tabIndex={-1}>
      <AlertTriangleIcon size={14} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

/**
 * #2: ConfirmStep(또는 edit 화면)에서 실제 결측 필드만 지목하는 배너. 이전에는 payload
 * 빌더가 null이면 "종목, 지역, 제목, 장소, 날짜를 모두 입력해 주세요" 같은 고정 문구를
 * 무조건 보여줬다(사용자가 겪은 사고의 직접 원인) — 이제는 buildXPayloadResult가 반환한
 * missingFields를 그대로 나열하고, 각 항목은 실제로 비어 있는 그 스텝으로 이동한다.
 */
export function MissingFieldsBanner<Step extends string>({
  missingFields,
  stepHref,
}: {
  missingFields: Array<{ field: string; label: string; step: Step }>;
  stepHref: (step: Step) => string;
}) {
  if (missingFields.length === 0) return null;
  return (
    <Card pad={14} style={{ marginTop: 14, background: 'var(--tint-orange)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <AlertTriangleIcon size={16} aria-hidden="true" />
        <div className="tm-text-label" style={{ color: 'var(--orange500)' }}>저장할 수 없어요</div>
      </div>
      <div className="tm-text-caption" style={{ marginTop: 5 }}>다음 항목을 채워야 만들 수 있어요.</div>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {missingFields.map((item) => (
          <Link
            key={`${item.step}:${item.field}`}
            className="tm-btn tm-btn-sm tm-btn-neutral"
            href={stepHref(item.step)}
            style={{ justifyContent: 'space-between' }}
          >
            {item.label}
            <ChevronRightIcon size={14} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </Card>
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
