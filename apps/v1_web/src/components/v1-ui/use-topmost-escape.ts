'use client';

import { useEffect, useRef } from 'react';

// Overlays in the order they opened. ESC closes only the topmost one, so nested overlays close one at a time.
const escapeStack: object[] = [];
// React may commit between listeners and reshuffle the stack — one key press closes at most one overlay.
const handledEscapes = new WeakSet<Event>();

export interface TopmostEscapeOptions {
  /** While true the overlay holds a slot in the ESC stack. */
  open: boolean;
  /** While true the ESC listener is attached. Defaults to `open`; modals pass `mounted` to cover the exit animation. */
  listening?: boolean;
  onEscape: () => void;
  /** While true ESC does nothing (e.g. a submit is in flight). */
  disabled?: boolean;
}

/** The single ESC path for every overlay. Custom overlays must use this instead of their own keydown handler. */
export function useTopmostEscape({ open, listening = open, onEscape, disabled = false }: TopmostEscapeOptions): void {
  const tokenRef = useRef<object>({});
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    if (!open) return;
    const token = tokenRef.current;
    escapeStack.push(token);
    return () => {
      const index = escapeStack.lastIndexOf(token);
      if (index !== -1) escapeStack.splice(index, 1);
    };
  }, [open]);

  useEffect(() => {
    if (!listening) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || disabledRef.current || handledEscapes.has(event)) return;
      // A closing overlay (exit animation) is already off the stack — this ESC belongs to the one below.
      if (escapeStack[escapeStack.length - 1] !== tokenRef.current) return;
      handledEscapes.add(event);
      onEscapeRef.current();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [listening]);
}
