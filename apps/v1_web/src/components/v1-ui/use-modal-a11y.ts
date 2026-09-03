'use client';

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';

/**
 * 모달 접근성 스캐폴딩 단일 소스 — focus 저장·복원(WCAG 2.4.3), 첫 컨트롤 포커스,
 * ESC 닫기, Tab focus trap, body 스크롤 잠금, backdrop 클릭 닫기.
 *
 * admin-reason-modal 을 기준으로 여러 어드민 모달이 같은 ~85줄을 "그대로 본떠"
 * 복제해 왔다(각 파일 주석이 자인). 그중 리그 결과 입력·이의 모달 셋은 Task 165·166
 * 이 그 기능들을 없애며 함께 사라졌다.
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

// disabled 는 button 뿐 아니라 input·select·textarea 전부에서 걸러야 한다. 하나라도
// 빠뜨리면 그 요소가 DOM 마지막에 있을 때 트랩의 last 가 **영원히 포커스를 받지
// 못하는 요소**가 되어 되감기가 발동하지 않고 Tab 이 밖으로 샌다 — 라디오 그룹
// 문제와 같은 구조다. 실제로 걸리는 곳이 있다: 팀 연락처의 textarea(저장 중
// disabled), 승부차기 패널의 라디오.
// 소비처에서도 쓸 수 있게 내보낸다 — 콘텐츠가 통째로 갈리는 모달(액션 대상 선택의
// SUBSTITUTION 2단계처럼)은 자기 파일에서 포커스를 다시 잡아야 하는데, 그때 이 선택자를
// 복사해 두면 위 주석이 경고하는 drift(disabled 누락 등)가 그대로 재발한다.
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 실제로 Tab 이 멈추는 요소만 추린다.
 *
 * 라디오 그룹은 DOM 에 여러 개가 있어도 tab stop 은 **하나뿐**이다 — 체크된 것이
 * 있으면 그것, 없으면 그룹의 첫 번째. 나머지는 화살표 키로만 이동한다.
 * 이 규칙을 반영하지 않고 querySelectorAll 결과를 그대로 쓰면 트랩의 `last` 가
 * **영원히 포커스를 받지 못하는 라디오**가 되어 되감기가 발동하지 않고, Tab 이
 * 다이얼로그 밖으로 새어 나간다 — 트랩을 걸어 두고 다른 방향으로 뚫리는 셈이다.
 *
 * penalty-shootout-panel 이 자기 파일 안에서 먼저 풀어 둔 것을 여기로 올렸다.
 * 이 훅을 쓰면서 라디오 그룹을 가진 모달이 이미 3곳 있다(수상 선택·팀 연락처·
 * 비정상 종료) — 그쪽 트랩이 같은 이유로 새고 있었다.
 */
function tabbableElements(dialog: HTMLElement): HTMLElement[] {
  const all = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  const radiosByGroup = new Map<string, HTMLInputElement[]>();
  for (const el of all) {
    if (el instanceof HTMLInputElement && el.type === 'radio') {
      const group = radiosByGroup.get(el.name) ?? [];
      group.push(el);
      radiosByGroup.set(el.name, group);
    }
  }
  return all.filter((el) => {
    if (!(el instanceof HTMLInputElement) || el.type !== 'radio') return true;
    const group = radiosByGroup.get(el.name) ?? [];
    return el === (group.find((radio) => radio.checked) ?? group[0]);
  });
}

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
      const focusable = tabbableElements(dialog);
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

  // 열려 있는 동안 body 스크롤 잠금.
  //
  // 닫힌 상태에서는 body 를 아예 건드리지 않는다. 예전에는 mounted=false 일 때
  // overflow 를 '' 로 밀었는데, 이 훅을 쓰는 모달이 화면에 계속 마운트돼 있으면
  // (퇴장 애니메이션을 위해 그렇게 쓴다) **닫혀 있는 모달의 리렌더만으로 다른
  // 오버레이(어드민 drawer 등)의 잠금이 풀린다.** cleanup 도 '' 로 고정하면
  // 모달이 겹쳐 열렸다 하나가 닫힐 때 남은 모달의 잠금까지 함께 풀린다.
  // 이전 값을 저장했다 되돌리면 중첩이 성립한다.
  useEffect(() => {
    if (!mounted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mounted]);

  const onBackdropClick = (event: MouseEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && !pending) onClose();
  };

  return { dialogRef, initialFocusRef, onBackdropClick, mounted, closing };
}
