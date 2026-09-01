'use client';

import { useCallback, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useModalA11y } from './use-modal-a11y';

interface BottomSheetBaseProps {
  /**
   * 열림·닫힘의 권위는 계속 URL 이다(A안 계약 1) — 이 값은 컴포넌트가 스스로 소유하는
   * 상태가 아니라, 부모가 URL(검색 파라미터 등)에서 유도해 매 렌더 내려주는 파생값이다.
   * false 가 되면 이 컴포넌트는 즉시 언마운트한다 — 별도 퇴장-지연은 두지 않는다.
   * (실제 소비처 5곳 전부 `.tm-filter-sheet-up` 진입 애니메이션만 쓰고, 퇴장은 URL
   * 이동으로 시트 자체가 걷히는 것으로 대신하는 현재 관행과 동일하다. 퇴장 애니메이션이
   * 필요한 시트 — 알림 상세, 취소 확인 모달 — 는 이 컴포넌트가 아니라 `useModalA11y` 의
   * `mounted`/`closing`을 직접 쓰는 별도 패턴을 그대로 유지한다.)
   */
  open: boolean;
  /**
   * 드래그가 임계치(시트 높이의 32%)를 넘겨 놓인 채 손을 뗐을 때, 또는 ESC 를 눌렀을 때
   * 불린다(A안 계약 2·4). **이 컴포넌트는 네비게이션을 하지 않는다** — 호출자가
   * `() => router.push(closeHref)` 처럼 URL 이동으로 구현해야 닫힘이 뒤로가기로 되돌아가고
   * 필터 상태가 담긴 URL 을 공유할 수 있는 성질이 유지된다.
   */
  onRequestClose: () => void;
  children: ReactNode;
}

/**
 * `title` 또는 `ariaLabel` 중 하나는 반드시 있어야 한다 — dialog 는 접근 가능한 이름이
 * 필수다(WCAG 4.1.2). 타입 레벨에서 강제해 소비처가 둘 다 빠뜨리는 걸 컴파일 타임에 막는다.
 * 5개 실사용처는 전부 자기 헤더(리셋 링크 포함)를 children 안에서 직접 그리므로 `ariaLabel`
 * 만 넘긴다 — `title` 은 헤더까지 이 컴포넌트가 그려줘야 하는 향후 소비처를 위해 남겨 둔다.
 */
export type BottomSheetProps = BottomSheetBaseProps &
  (
    | { title: string; ariaLabel?: string }
    | { title?: undefined; ariaLabel: string }
  );

// 시트 높이 대비 비율로 임계치를 잡는다(A안 계약 2) — 고정 px 값은 시트마다 실제 렌더
// 높이가 달라(필터 옵션 개수·폼 필드 개수 등) 체감 난이도가 들쭉날쭉해진다. 실측 높이의
// 32% 를 넘게 끌어야 닫힌다.
const DRAG_CLOSE_RATIO = 0.32;

// 시트 안의 버튼·링크·스크롤 가능한 입력 위에서 시작한 포인터는 드래그로 삼지 않는다 —
// 안 그러면 "적용하기" 버튼을 누르려는 손가락이 미세하게라도 움직일 때마다 시트가 따라
// 흔들리고, 실기기에서는 탭 인식 자체가 씹힌다.
const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"]';

/**
 * BottomSheet — URL 이 열림·닫힘을 소유하는 필터 시트에 드래그-닫기 손잡이를 더한
 * controlled 컴포넌트(A안). `.tm-filter-sheet` 의 기존 치수·모서리·그림자·진입 애니메이션은
 * 그대로 두고(globals.css), 드래그 중 손가락을 따라가는 동작과 임계치 판정만 더한다.
 *
 * scrim 은 이 컴포넌트가 그리지 않는다(A안 계약 4) — 호출자가
 * `<Link className="tm-filter-scrim" href={closeHref} aria-label="필터 닫기" />` 를
 * 이 컴포넌트와 형제로 직접 배치해야 한다. 그래야 backdrop 클릭 닫기도 JS 없이·뒤로가기로
 * 동작한다. 드래그 손잡이(`.tm-filter-sheet-handle`)도 마찬가지로 children 쪽에서 그린다 —
 * 5개 실사용처가 전부 그렇게 하고 있어 그 관행을 유지한다.
 *
 * 스냅 포인트(중간 정지)는 만들지 않는다(A안 계약 3) — 중간 상태는 URL 로 표현할 수
 * 없으므로 임계치 미만이면 무조건 원위치, 초과면 무조건 닫는다.
 */
export function BottomSheet(props: BottomSheetProps) {
  const { open, onRequestClose, children, title, ariaLabel } = props;
  const idPrefix = useId();
  const titleId = title ? `${idPrefix}-bottom-sheet-title` : undefined;

  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const activePointerIdRef = useRef<number | null>(null);

  // 마운트 자체는 이미 부모가(URL 에서 유도한 `open`) 통제하므로, 훅에는 항상 open:true
  // 로 고정해 훅 고유의 지연-언마운트(mounted/closing) 경로는 쓰지 않는다 — ESC·focus
  // trap·스크롤 잠금·초기 포커스만 그대로 재사용한다(모달 접근성 인프라는 이미 검증된
  // 자산이므로 새로 만들지 않는다). backdrop 클릭 닫기는 scrim 이 별도 `<Link>` 이므로
  // 훅의 onBackdropClick 은 쓰지 않는다.
  const { dialogRef, initialFocusRef } = useModalA11y<HTMLButtonElement, HTMLElement>({
    open: true,
    onClose: onRequestClose,
  });

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) return;
    startYRef.current = event.clientY;
    activePointerIdRef.current = event.pointerId;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    // 아래로만 끌린다 — 위로 당겨 늘어나면 안 된다(A안 계약 2).
    setDragOffset(Math.max(0, event.clientY - startYRef.current));
  }, []);

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      activePointerIdRef.current = null;
      setIsDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const sheetHeight = dialogRef.current?.getBoundingClientRect().height ?? 0;
      const crossedThreshold = sheetHeight > 0 && dragOffset > sheetHeight * DRAG_CLOSE_RATIO;
      if (crossedThreshold) {
        // 부모가 네비게이션으로 실제로 닫는다 — 이 오프셋 값은 그대로 둔다. 즉시 0 으로
        // 되돌리면 닫히기 직전 한 프레임 동안 시트가 제자리로 튀었다가 사라져 보인다.
        onRequestClose();
        return;
      }
      // 임계치 미달 — 제자리로 복귀한다. is-dragging 클래스를 뗀 지금부터 `.tm-filter-sheet`
      // 의 transition 이 다시 적용되므로 CSS 가 자연스럽게 되돌려준다.
      setDragOffset(0);
    },
    [dialogRef, dragOffset, onRequestClose],
  );

  if (!open) return null;

  return (
    <div className="tm-filter-layer">
      <section
        ref={dialogRef}
        className={`tm-filter-sheet${isDragging ? ' is-dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : ariaLabel}
        aria-labelledby={titleId}
        style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {title ? (
          <div className="tm-filter-sheet-head" style={{ marginBottom: 4 }}>
            <p id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
              {title}
            </p>
            <button
              ref={initialFocusRef}
              type="button"
              aria-label="닫기"
              onClick={onRequestClose}
              className="tm-btn tm-btn-icon tm-btn-ghost"
            >
              ✕
            </button>
          </div>
        ) : null}
        {children}
      </section>
    </div>
  );
}
