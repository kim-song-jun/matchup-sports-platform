'use client';

import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
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
  onFocus,
  onBlur,
  children,
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
  /** #3: 포커스 시 최근 사용 장소 칩(RecentVenueChips) 등 보조 UI를 열고 싶을 때. */
  onFocus?: () => void;
  onBlur?: () => void;
  /** 입력창 아래·에러 위에 끼워 넣는 보조 UI(예: RecentVenueChips). */
  children?: ReactNode;
}) {
  // date/time 인풋은 lang="ko"를 부여해 OS locale에 상관없이
  // 가능한 경우 한국어 포맷(yyyy.mm.dd 또는 HH:MM)으로 표시를 유도한다.
  // CSS(.tm-create-native-input[type="date" i] 등)에서 appearance:none +
  // ::-webkit-calendar-picker-indicator 처리로 OS 스피너/아이콘을 제거한다.
  const isDateLike = type === 'date' || type === 'time';
  // id는 옵션(스텝 게이팅 focus-scroll anchor 용도라 호출부 상당수가 생략한다) — 생략돼도
  // <label htmlFor>가 매달릴 곳 없이 undefined가 되면 라벨-입력 연결이 완전히 끊긴다
  // (Testing Library getByLabelText 실패로 CI에서 실측: "종료 시간" 등 id 없는 필드).
  // useId()로 항상 유효한 id를 보장한다.
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    // div(label 아님): children(RecentVenueChips 등)에 버튼이 섞여 들어올 수 있는데,
    // <label>이 연결 대상 컨트롤 외의 labelable 요소(button)까지 감싸면 유효하지 않은
    // 마크업이 되어 클릭 시 예기치 않게 포커스/클릭이 전파될 수 있다 — 텍스트 라벨만
    // htmlFor로 명시 연결한다.
    <div className="tm-create-field">
      <label htmlFor={fieldId} className="tm-text-label">{label}</label>
      <div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''} ${error ? 'tm-create-input-error' : ''}`}>
        {onChange ? (
          multiline ? (
            <textarea
              id={fieldId}
              className="tm-create-native-input"
              value={value ?? ''}
              placeholder={placeholder}
              aria-invalid={error ? true : undefined}
              aria-describedby={errorId}
              onChange={(event) => onChange(event.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          ) : (
            <input
              id={fieldId}
              className="tm-create-native-input"
              type={type}
              lang={isDateLike ? 'ko' : undefined}
              value={value ?? ''}
              placeholder={placeholder}
              aria-invalid={error ? true : undefined}
              aria-describedby={errorId}
              onChange={(event) => onChange(event.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          )
        ) : (
          <span className="tm-text-body" style={{ color: value ? 'var(--text-strong)' : 'var(--text-caption)' }}>{value || placeholder || '입력'}</span>
        )}
        {suffix ? <span className="tm-text-caption">{suffix}</span> : null}
      </div>
      {children}
      {error ? (
        <div id={errorId} className="tm-create-field-error" role="alert">
          <AlertTriangleIcon size={14} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
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
 * #3 1단계: 장소 입력창 포커스 시 이 팀(팀매치)·나(개인매치)가 과거에 실제로 입력했던
 * 장소를 칩으로 보여주고 탭 한 번으로 채운다. 새 Venue 테이블 없이 과거 입력값
 * distinct 조회 결과를 그대로 쓴다(백엔드: matches/team-matches recentVenues,
 * league-match recentVenues). 칩 버튼에 onMouseDown preventDefault를 걸어
 * 클릭이 입력창 blur보다 먼저 처리되게 한다 — EntityPicker 드롭다운과 동일한 패턴.
 *
 * 개인/팀매치 생성 위저드와 리그 대진 일괄생성 폼(관리자) 양쪽이 공유한다 — 두 화면
 * 모두 tm-chip 토큰을 쓰고, 선택 상태를 aria-pressed와 tm-chip-active(채움+테두리색,
 * 컬러 단독 아님) 양쪽으로 표시한다.
 */
export function RecentVenueChips({
  items,
  selectedValue,
  onSelect,
}: {
  items: Array<{ placeName: string; addressText?: string | null }>;
  /** 현재 입력창 값. items 중 placeName이 이 값과 같은 칩을 선택 상태로 강조한다. */
  selectedValue?: string;
  onSelect: (venue: { placeName: string; addressText?: string | null }) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div role="group" aria-label="최근 사용한 장소" style={{ marginTop: 8 }}>
      <div className="tm-text-caption" style={{ marginBottom: 6 }}>최근 사용한 장소</div>
      <div className="tm-team-form-chip-row">
        {items.map((item, index) => {
          const isSelected = selectedValue !== undefined && selectedValue === item.placeName;
          return (
            <button
              // index를 섞는다: placeName 단독 key는 items에 동일 placeName이 중복될 때
              // (백엔드 dedup 전제가 깨지는 극단 상황) key 충돌로 리렌더·선택 상태가 꼬인다.
              key={`${item.placeName}-${index}`}
              type="button"
              className={`tm-chip ${isSelected ? 'tm-chip-active' : ''}`}
              aria-pressed={isSelected}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(item)}
            >
              {item.placeName}
            </button>
          );
        })}
      </div>
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
        <div className="tm-text-label" style={{ color: 'var(--orange700)' }}>저장할 수 없어요</div>
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

/**
 * 단일선택 보기(칩) + 선택적 "직접입력" 자유텍스트. 경기조건 필드들(경기방식/유니폼 색상)이
 * 자유 입력으로 방치돼 있던 걸(피드백 1) 성별 조건(GenderRuleSelector)과 같은 방식으로
 * 구조화하되, 프리셋이 못 덮는 값(구장 크기별 변형, 줄무늬 등)은 여전히 받을 수 있어야 해서
 * allowFreeText 옵션을 둔다. grade처럼 닫힌 보기가 필요하면 allowFreeText를 생략한다.
 */
export function PresetChipSelector({
  label,
  options,
  value,
  allowFreeText,
  freeTextPlaceholder,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
  onChange: (value: string) => void;
}) {
  const isPreset = options.includes(value);
  const [customMode, setCustomMode] = useState(Boolean(allowFreeText) && value !== '' && !isPreset);

  // 외부에서(예: 수정 화면 hydrate) value가 프리셋 값으로 바뀌면 직접입력 모드를 풀어준다.
  useEffect(() => {
    if (isPreset) setCustomMode(false);
  }, [isPreset]);

  return (
    <div className="tm-create-field">
      <div className="tm-text-label">{label}</div>
      <div className="tm-team-form-chip-row" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`tm-chip ${!customMode && value === option ? 'tm-chip-active' : ''}`}
            aria-pressed={!customMode && value === option}
            onClick={() => {
              setCustomMode(false);
              onChange(option);
            }}
          >
            {option}
          </button>
        ))}
        {allowFreeText ? (
          <button
            type="button"
            className={`tm-chip ${customMode ? 'tm-chip-active' : ''}`}
            aria-pressed={customMode}
            onClick={() => {
              setCustomMode(true);
              if (isPreset) onChange('');
            }}
          >
            직접입력
          </button>
        ) : null}
      </div>
      {allowFreeText && customMode ? (
        <input
          className="tm-create-native-input"
          style={{ marginTop: 8, width: '100%' }}
          aria-label={`${label} 직접입력`}
          value={value}
          placeholder={freeTextPlaceholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
    </div>
  );
}

/**
 * 다중선택 보기(칩) + 선택적 "직접입력" 자유텍스트 한 칸. 경기 스타일처럼 여러 값을 동시에
 * 고를 수 있어야 하는 필드용(친선이면서 매너 중시를 동시에 원하는 팀이 있을 수 있음).
 * 프리셋 밖 값은 텍스트 입력 한 칸에 몰아 저장한다 — 프리셋 다중선택 + 커스텀 항목 여러 개를
 * 동시에 받는 UI는 이 화면 규모에 비해 과한 복잡도라 커스텀은 1건으로 스코프를 좁혔다.
 */
export function MultiPresetChipSelector({
  label,
  options,
  values,
  allowFreeText,
  freeTextPlaceholder,
  maxItems,
  onChange,
}: {
  label: string;
  options: readonly string[];
  values: string[];
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
  /** 설정하면 총 선택 개수를 이 값으로 제한한다(예: 경기 스타일 최대 3개 — 서로 상충하는
   * 조합·배지 난립을 막으려는 사용자 확정 결정). 조용히 무시하는 대신 초과 시도를
   * limitMessage로 즉시 안내한다. */
  maxItems?: number;
  onChange: (values: string[]) => void;
}) {
  const presetSet = new Set(options);
  // 비프리셋 값을 전부 이어 보여준다. 예전에는 find() 로 첫 번째만 표시했는데, 레거시
  // rulesText 를 파싱해 넘어온 값처럼 비프리셋 토큰이 둘 이상이면 나머지가 화면에서 사라져
  // 사용자에게는 값이 없어진 것처럼 보이고, 그 상태로 저장하면 실제로 없어진다.
  const customValue = values.filter((item) => !presetSet.has(item)).join(', ');
  const atLimit = maxItems !== undefined && values.length >= maxItems;
  const [limitMessage, setLimitMessage] = useState<string | null>(null);

  // 선택 해제 등으로 한도 아래로 내려가면 이전 안내 문구를 치운다 — 더 이상 사실이 아닌
  // 경고가 화면에 남아있지 않도록.
  useEffect(() => {
    if (!atLimit) setLimitMessage(null);
  }, [atLimit]);

  const toggleOption = (option: string) => {
    const isSelected = values.includes(option);
    if (!isSelected && atLimit) {
      setLimitMessage(`최대 ${maxItems}개까지 선택할 수 있어요. 다른 항목을 선택 해제한 뒤 다시 선택해 주세요.`);
      return;
    }
    setLimitMessage(null);
    onChange(isSelected ? values.filter((item) => item !== option) : [...values, option]);
  };

  const applyCustom = (text: string) => {
    const withoutOldCustom = values.filter((item) => presetSet.has(item));
    const trimmed = text.trim();
    if (trimmed && maxItems !== undefined && withoutOldCustom.length >= maxItems) {
      setLimitMessage(`최대 ${maxItems}개까지 선택할 수 있어요. 다른 항목을 선택 해제한 뒤 다시 입력해 주세요.`);
      return;
    }
    setLimitMessage(null);
    onChange(trimmed ? [...withoutOldCustom, trimmed] : withoutOldCustom);
  };

  return (
    <div className="tm-create-field">
      <div className="tm-text-label">{label}</div>
      <div className="tm-team-form-chip-row" role="group" aria-label={label}>
        {options.map((option) => {
          const isSelected = values.includes(option);
          // 색상 단독 전달 금지: 한도 도달 시 미선택 칩은 aria-disabled + 낮은 불투명도로도
          // 표시한다. 다만 클릭은 계속 받는다 — disabled로 막으면 "왜 안 눌리지?"에 답할
          // 방법이 없어진다(눌러야 limitMessage가 뜬다).
          const softDisabled = !isSelected && atLimit;
          return (
            <button
              key={option}
              type="button"
              className={`tm-chip ${isSelected ? 'tm-chip-active' : ''}`}
              aria-pressed={isSelected}
              aria-disabled={softDisabled || undefined}
              onClick={() => toggleOption(option)}
            >
              {option}
            </button>
          );
        })}
      </div>
      {allowFreeText ? (
        <input
          className="tm-create-native-input"
          style={{ marginTop: 8, width: '100%' }}
          aria-label={`${label} 직접입력`}
          value={customValue}
          placeholder={freeTextPlaceholder}
          onChange={(event) => applyCustom(event.target.value)}
        />
      ) : null}
      <FieldErrorText message={limitMessage ?? undefined} />
    </div>
  );
}
