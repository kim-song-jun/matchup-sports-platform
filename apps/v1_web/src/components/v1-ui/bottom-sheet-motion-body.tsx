'use client';

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { motion, useAnimation, useReducedMotion, type PanInfo } from 'motion/react';
import { useModalA11y } from './use-modal-a11y';

// `motion` 패키지는 이 파일에서만 import 된다 — bottom-sheet.tsx 가 lazy() 로 이 청크를
// 지연 로드하므로, 시트를 한 번도 열지 않는 세션에는 이 파일 자체가 네트워크에 안 나간다.

interface BottomSheetMotionBodyProps {
  onClose: () => void;
  children: ReactNode;
  title?: string;
  ariaLabel?: string;
}

// 이 이상 끌리거나(px) 이 속도(px/s) 이상으로 손을 떼면 "닫으려는 제스처"로 판정한다.
// 오프셋과 속도를 OR 로 묶는 이유: 절반도 안 끌었어도 빠르게 튕기면 닫혀야 하고(관성),
// 느리더라도 충분히 끌었으면 속도와 무관하게 닫혀야 한다 — 흔한 바텀시트 관례.
const DRAG_CLOSE_OFFSET_PX = 120;
const DRAG_CLOSE_VELOCITY_PX_S = 600;
// 필터 시트(.tm-filter-sheet-up)의 진입 220ms 와 대칭되는 퇴장 길이.
const EXIT_DURATION_S = 0.22;
const ENTER_SPRING = { type: 'spring' as const, stiffness: 380, damping: 32 };
const SNAP_BACK_SPRING = { type: 'spring' as const, stiffness: 500, damping: 40 };

export default function BottomSheetMotionBody({ onClose, children, title, ariaLabel }: BottomSheetMotionBodyProps) {
  const idPrefix = useId();
  const titleId = title ? `${idPrefix}-bottom-sheet-title` : undefined;
  const controls = useAnimation();
  const reducedMotion = useReducedMotion();
  // 드래그 dismiss 도중 ESC/backdrop 이 겹쳐 눌리면 onClose 가 두 번 불릴 수 있어 가드한다.
  const closingRef = useRef(false);

  // 닫기 경로(드래그 dismiss·ESC·backdrop·닫기 버튼) 전부가 여기로 모인다: 화면 밖으로
  // 애니메이션을 먼저 재생하고, 그 애니메이션이 끝난 뒤에야 실제 onClose 를 부른다.
  // BottomSheet(부모)는 onClose 가 불리는 순간 open=false 로 즉시 언마운트하므로,
  // 애니메이션을 먼저 끝내 두지 않으면 화면 중간에서 잘려 보인다(bottom-sheet.tsx 주석 참조).
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    void controls
      .start({
        y: '100%',
        transition: reducedMotion ? { duration: 0 } : { duration: EXIT_DURATION_S, ease: [0.4, 0, 1, 1] },
      })
      .then(onClose);
  }, [controls, onClose, reducedMotion]);

  const { dialogRef, initialFocusRef, onBackdropClick } = useModalA11y<HTMLButtonElement, HTMLDivElement>({
    open: true,
    onClose: requestClose,
  });

  // 진입 애니메이션 — initial(y:100%) → 0. controls 로 구동하므로 드래그·닫기와 같은
  // 파이프라인을 공유한다(선언적 animate prop 과 명령형 controls 를 섞으면 서로 덮어써서
  // 충돌한다 — 그래서 진입도 controls.start 로 통일한다).
  useEffect(() => {
    void controls.start({ y: 0, transition: reducedMotion ? { duration: 0 } : ENTER_SPRING });
    // 마운트 시 1회만 재생 — reducedMotion 은 최초 렌더 시점 값으로 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDragEnd = useCallback(
    (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
      const shouldClose = info.offset.y > DRAG_CLOSE_OFFSET_PX || info.velocity.y > DRAG_CLOSE_VELOCITY_PX_S;
      if (shouldClose) {
        requestClose();
        return;
      }
      void controls.start({ y: 0, transition: reducedMotion ? { duration: 0 } : SNAP_BACK_SPRING });
    },
    [controls, reducedMotion, requestClose],
  );

  return (
    <div
      role="presentation"
      onClick={onBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        bottom: 'calc(var(--v1-shell-bottom-nav-height) + var(--v1-shell-safe-bottom))',
        left: '50%',
        width: 'min(100%, var(--v1-app-chrome-frame-width))',
        transform: 'translateX(-50%)',
        zIndex: 'var(--z-scrim)' as unknown as number,
        background: 'rgba(25, 31, 40, 0.18)',
      }}
    >
      {/* 패널은 위 scrim div 안에서 절대 위치를 잡는다 — 자체 translateX 를 쓰지 않는다.
          motion.div 는 transform 을 drag/animate 의 y 값으로 직접 관리하므로, style.transform
          을 여기서 또 지정하면 두 값이 충돌한다(센터링은 부모 scrim 이 이미 해 준다). */}
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : ariaLabel}
        aria-labelledby={titleId}
        initial={{ y: '100%' }}
        animate={controls}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.15, bottom: 1 }}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        onClick={(event) => event.stopPropagation()}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '12px var(--v1-shell-page-x) calc(20px + var(--v1-shell-safe-bottom))',
          borderTop: '1px solid var(--grey100)',
          borderTopLeftRadius: 'var(--radius-hero)',
          borderTopRightRadius: 'var(--radius-hero)',
          background: 'var(--bg)',
          boxShadow: '0 -16px 32px rgba(25, 31, 40, 0.14)',
          touchAction: 'none',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 42,
            height: 4,
            margin: '0 auto 16px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--grey300)',
          }}
        />
        {title ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 4,
            }}
          >
            <p id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
              {title}
            </p>
            <button
              ref={initialFocusRef}
              type="button"
              aria-label="닫기"
              onClick={requestClose}
              className="tm-btn tm-btn-icon tm-btn-ghost"
            >
              ✕
            </button>
          </div>
        ) : null}
        {children}
      </motion.div>
    </div>
  );
}
