'use client';

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';

/**
 * 모달 접근성 스캐폴딩 단일 소스 — focus 저장·복원(WCAG 2.4.3), 첫 컨트롤 포커스,
 * ESC 닫기, Tab focus trap, body 스크롤 잠금, backdrop 클릭 닫기.
 *
 * admin-reason-modal 을 기준으로 league-result-entry → league-dispute-resolve →
 * league-dispute-reject 가 같은 ~85줄을 "그대로 본떠" 복제해 왔다(각 파일 주석이 자인).
 * 결함 수정이 네 벌로 갈라지는 구조라 훅으로 모은다 — 마크업(패널·헤더·푸터)은
 * 모달마다 다른 것이 정상이므로 여기서는 동작만 담당한다.
 */
export interface ModalA11yOptions {
  open: boolean;
  onClose: () => void;
  /** true 동안 ESC·backdrop 닫기를 잠근다 — 제출 중 실수로 이탈해 입력을 잃지 않게 */
  pending?: boolean;
  /**
   * 퇴장 애니메이션 길이(ms). **CSS 의 .is-closing 길이와 같아야 한다.**
   * 기본값은 모달용 160ms 이고, 하단 시트처럼 더 긴 애니메이션을 쓰는 곳은
   * 그 값을 넘긴다(필터 시트 = 220ms).
   */
  exitMs?: number;
}

export interface ModalA11yHandles<
  TInitial extends HTMLElement = HTMLElement,
  TDialog extends HTMLElement = HTMLDivElement,
> {
  /** 모달 패널(role=dialog)에 붙인다 — focus trap 의 경계. 패널이 form 인 모달도 있어 제네릭 */
  dialogRef: RefObject<TDialog | null>;
  /** 열릴 때 포커스할 첫 컨트롤에 붙인다. 안 붙이면 패널 안 첫 focusable 로 폴백 */
  initialFocusRef: RefObject<TInitial | null>;
  /** backdrop div 의 onClick 에 그대로 넘긴다(패널 클릭은 닫지 않음) */
  onBackdropClick: (event: MouseEvent<HTMLElement>) => void;
  /**
   * 화면에 있어야 하는 동안 true — open 이 false 가 된 뒤에도 퇴장 애니메이션이
   * 재생될 시간만큼 유지된다. `if (!mounted) return null` 로 쓴다.
   *
   * **주의**: 닫히는 동안 모달의 데이터가 null 이 되는 구조라면(예: `item && <Modal>`)
   * 마지막 값을 ref 로 붙들어야 한다 — 안 그러면 애니메이션이 도는 사이 빈 모달이
   * 보인다. 알림 시트에서 실제로 그 버그가 났다.
   */
  mounted: boolean;
  /** 퇴장 애니메이션이 재생되는 동안 true. 패널·backdrop 에 is-closing 을 붙인다. */
  closing: boolean;
}

/**
 * 퇴장 애니메이션 길이. globals.css 의 `.tm-modal-scrim.is-closing` /
 * `.tm-modal-panel.is-closing` 과 **같은 값이어야 한다** — 바꿀 땐 양쪽을 함께 바꾼다.
 */
export const MODAL_EXIT_MS = 160;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function useModalA11y<
  TInitial extends HTMLElement = HTMLElement,
  TDialog extends HTMLElement = HTMLDivElement,
>({ open, onClose, pending = false, exitMs = MODAL_EXIT_MS }: ModalA11yOptions): ModalA11yHandles<TInitial, TDialog> {
  const dialogRef = useRef<TDialog | null>(null);
  const initialFocusRef = useRef<TInitial | null>(null);

  // ── 퇴장 지연 ───────────────────────────────────────────────────────
  // open 이 false 가 된 뒤에도 EXIT_MS 동안 렌더를 유지해 퇴장 애니메이션이
  // 재생될 틈을 준다. CSS 의 .is-closing 애니메이션 길이와 같아야 한다 —
  // 짧으면 잘리고, 길면 아무것도 안 보이는 빈 시간이 남는다.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;

    // 호출자가 `{open ? <Modal/> : null}` 로 DOM 을 이미 걷어낸 경우 — 훅이 부모에
    // 살아 있으면 여기까지 온다. 재생할 퇴장 UI 가 없는데 지연만 걸면 화면에
    // 아무것도 없는 채로 스크롤 잠금·ESC·트랩이 남는다. ref 가 비어 있는 것이
    // 그 상태의 정확한 신호다.
    if (!dialogRef.current) {
      setClosing(false);
      setMounted(false);
      return;
    }

    // 모션을 줄이도록 설정했으면 지연 자체를 없앤다 — CSS 의 animation:none 만으로는
    // 이 setTimeout 이 사라지지 않아 아무것도 안 보이는 지연만 남는다.
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setClosing(false);
      setMounted(false);
      return;
    }

    setClosing(true);
    exitTimerRef.current = setTimeout(() => {
      setMounted(false);
      setClosing(false);
      exitTimerRef.current = null;
    }, exitMs);
    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
    // mounted 는 닫힘 시작 판정에만 쓴다 — deps 에 넣으면 이 effect 가 스스로를
    // 다시 트리거한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 열릴 때 이전 포커스를 저장하고, 닫힐 때(ESC/backdrop/취소/제출 전 경로) 복원한다.
  // cleanup 기반이라 open 토글형 모달뿐 아니라 조건부 마운트형(열려 있는 채 언마운트)
  // 모달에서도 복원된다 — LogDetailModal 류가 후자다.
  // mounted 기준이다. open 으로 하면 퇴장 애니메이션이 도는 동안 모달은 화면에
  // 있는데 포커스만 뒤로 가서, 그 사이 Tab·ESC 가 모달 밖으로 샌다.
  useEffect(() => {
    if (!mounted) return;
    const previous = document.activeElement;
    return () => {
      if (previous && typeof (previous as HTMLElement).focus === 'function') {
        (previous as HTMLElement).focus();
      }
    };
  }, [mounted]);

  // 열리면 첫 컨트롤로 포커스 이동 (미지정 시 패널 안 첫 focusable).
  // 60ms 는 마운트 트랜지션 뒤로 미루기 위한 것 — 그 사이 사용자가 패널 안 다른 필드를
  // 먼저 클릭해 타이핑을 시작했다면 되채가지 않는다(GateConfirmModal 에서 온 가드 —
  // 안 그러면 입력이 중간에 엉뚱한 필드로 튄다).
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      if (dialogRef.current?.contains(document.activeElement)) return;
      const target =
        initialFocusRef.current ??
        dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
        null;
      target?.focus();
    }, 60);
    return () => clearTimeout(id);
  }, [open]);

  // ESC·focus trap·스크롤 잠금은 모달이 **화면에 있는 동안**(mounted) 유지한다.
  // 닫히는 중에 풀리면 그 사이 키 입력이 뒤 화면으로 새고 배경이 스크롤된다.
  useEffect(() => {
    if (!mounted) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mounted, onClose, pending]);

  // Tab focus trap
  useEffect(() => {
    if (!mounted) return;
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [mounted]);

  // 열려 있는 동안 body 스크롤 잠금
  useEffect(() => {
    if (mounted) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mounted]);

  const onBackdropClick = (event: MouseEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && !pending) onClose();
  };

  return { dialogRef, initialFocusRef, onBackdropClick, mounted, closing };
}
