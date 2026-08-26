'use client';

import { useEffect, useRef, type MouseEvent, type RefObject } from 'react';

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
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function useModalA11y<
  TInitial extends HTMLElement = HTMLElement,
  TDialog extends HTMLElement = HTMLDivElement,
>({ open, onClose, pending = false }: ModalA11yOptions): ModalA11yHandles<TInitial, TDialog> {
  const dialogRef = useRef<TDialog | null>(null);
  const initialFocusRef = useRef<TInitial | null>(null);

  // 열릴 때 이전 포커스를 저장하고, 닫힐 때(ESC/backdrop/취소/제출 전 경로) 복원한다.
  // cleanup 기반이라 open 토글형 모달뿐 아니라 조건부 마운트형(열려 있는 채 언마운트)
  // 모달에서도 복원된다 — LogDetailModal 류가 후자다.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    return () => {
      if (previous && typeof (previous as HTMLElement).focus === 'function') {
        (previous as HTMLElement).focus();
      }
    };
  }, [open]);

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

  // ESC 닫기 (pending 중엔 잠금)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, pending]);

  // Tab focus trap
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  // 열려 있는 동안 body 스크롤 잠금
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const onBackdropClick = (event: MouseEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && !pending) onClose();
  };

  return { dialogRef, initialFocusRef, onBackdropClick };
}
