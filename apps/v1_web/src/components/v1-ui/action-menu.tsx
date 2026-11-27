'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { ActionMenuPopover } from './action-menu-popover';
import { ActionSheet, type ActionSheetAction } from './action-sheet';
import { FOCUSABLE_SELECTOR } from './use-modal-a11y';

/** 팝오버로 바뀌는 폭 — 이보다 좁으면 같은 항목을 `ActionSheet` 로 띄운다. */
export const ACTION_MENU_DESKTOP_QUERY = '(min-width: 768px)';

export interface ActionMenuTriggerProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly 'aria-expanded': boolean;
  readonly 'aria-haspopup': 'menu';
}

export interface ActionMenuProps {
  /** 메뉴 제목 겸 접근 이름 — 폰 시트의 제목, 데스크톱 팝오버의 `aria-label`. */
  readonly label: string;
  readonly actions: readonly ActionSheetAction[];
  readonly trigger: (props: ActionMenuTriggerProps) => ReactNode;
  /** 데스크톱 팝오버를 트리거의 어느 쪽 가장자리에 맞출지. */
  readonly align?: 'start' | 'end';
  /** 제목 아래·항목 위의 읽기 전용 영역. */
  readonly header?: ReactNode;
  /** 제목 아래 한 줄 설명. */
  readonly subtitle?: string;
}

/**
 * ⋯ 더보기 메뉴 — 768px 이상은 트리거 아래 팝오버, 미만은 `ActionSheet`.
 *
 * 항목을 고르면 메뉴를 **먼저** 닫은 뒤 `onSelect` 를 부른다 — 이어서 `useConfirm` 창이 떠도 메뉴와 겹치지 않는다.
 */
export function ActionMenu({ label, actions, trigger, align = 'start', header, subtitle }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const desktop = useMediaQuery(ACTION_MENU_DESKTOP_QUERY);
  const close = useCallback(() => setOpen(false), []);
  const focusTrigger = useCallback(() => {
    anchorRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus({ preventScroll: true });
  }, []);

  // 폭이 갈리면 열려 있던 쪽 표면은 사라지므로 닫아 둔다 — 되돌아와도 저절로 다시 열리지 않게.
  const [lastDesktop, setLastDesktop] = useState(desktop);
  if (lastDesktop !== desktop) {
    setLastDesktop(desktop);
    setOpen(false);
  }

  const shown = open && actions.length > 0;
  const onToggle = () => {
    if (actions.length > 0) setOpen((value) => !value);
  };
  const wrapped = wrapActions(actions, close, focusTrigger);

  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        {trigger({ open: shown, onToggle, 'aria-expanded': shown, 'aria-haspopup': 'menu' })}
      </span>
      {shown && desktop ? (
        <ActionMenuPopover
          label={label}
          subtitle={subtitle}
          actions={wrapped}
          header={header}
          align={align}
          anchorRef={anchorRef}
          focusTrigger={focusTrigger}
          onClose={close}
        />
      ) : null}
      {shown && !desktop ? (
        <ActionSheet open title={label} subtitle={subtitle} header={header} actions={wrapped} onClose={close} />
      ) : null}
    </>
  );
}

/**
 * 항목을 고르면 포커스를 트리거로 먼저 옮긴다 — 뒤이어 뜨는 확인 창이 사라질 메뉴 항목이 아니라
 * 트리거를 복원 대상으로 잡아야 창을 닫은 뒤 포커스가 `body` 로 떨어지지 않는다.
 */
function wrapActions(
  actions: readonly ActionSheetAction[],
  close: () => void,
  focusTrigger: () => void,
): readonly ActionSheetAction[] {
  return actions.map((action) => {
    if (action.onSelect === undefined) return action;
    const { onSelect } = action;
    return {
      ...action,
      onSelect: () => {
        focusTrigger();
        close();
        onSelect();
      },
    };
  });
}
