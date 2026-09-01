'use client';

import { useEffect } from 'react';

const KEYBOARD_OPEN_THRESHOLD_PX = 80;
const FOCUS_MARGIN_PX = 16;

function isTextEntryElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.matches('textarea, select, [contenteditable="true"]')) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(element.type);
}

export function KeyboardViewportBridge() {
  useEffect(() => {
    const root = document.documentElement;
    let focusFrame = 0;

    const keepFocusedFieldVisible = () => {
      cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!isTextEntryElement(active)) return;
        const viewport = window.visualViewport;
        const visibleTop = (viewport?.offsetTop ?? 0) + FOCUS_MARGIN_PX;
        const visibleBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - FOCUS_MARGIN_PX;
        const rect = active.getBoundingClientRect();
        if (
          (rect.top < visibleTop || rect.bottom > visibleBottom)
          && typeof active.scrollIntoView === 'function'
        ) {
          active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        }
      });
    };

    const updateViewport = () => {
      const viewport = window.visualViewport;
      const viewportHeight = Math.round(viewport?.height ?? window.innerHeight);
      const viewportOffsetTop = Math.round(viewport?.offsetTop ?? 0);
      const occludedHeight = Math.max(0, Math.round(window.innerHeight - viewportHeight - viewportOffsetTop));
      const keyboardOpen = isTextEntryElement(document.activeElement) && occludedHeight >= KEYBOARD_OPEN_THRESHOLD_PX;

      root.style.setProperty('--teameet-visual-viewport-height', `${viewportHeight}px`);
      root.style.setProperty('--teameet-keyboard-inset', `${keyboardOpen ? occludedHeight : 0}px`);
      root.classList.toggle('tm-keyboard-open', keyboardOpen);
      if (keyboardOpen) keepFocusedFieldVisible();
    };

    const handleFocusChange = () => requestAnimationFrame(updateViewport);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    document.addEventListener('focusin', handleFocusChange);
    document.addEventListener('focusout', handleFocusChange);
    updateViewport();

    return () => {
      cancelAnimationFrame(focusFrame);
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      document.removeEventListener('focusin', handleFocusChange);
      document.removeEventListener('focusout', handleFocusChange);
      root.style.removeProperty('--teameet-visual-viewport-height');
      root.style.removeProperty('--teameet-keyboard-inset');
      root.classList.remove('tm-keyboard-open');
    };
  }, []);

  return null;
}
