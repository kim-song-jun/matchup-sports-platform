import { findScrollContainer } from '@/components/reviews/review-scroll-anchor';

function wizardViewportBounds(
  element: HTMLElement,
  scroller: HTMLElement,
  footer: HTMLElement | null,
) {
  const viewport = window.visualViewport;
  let top = viewport?.offsetTop ?? 0;
  let bottom = top + (viewport?.height ?? window.innerHeight);
  if (scroller !== document.scrollingElement) {
    const bounds = scroller.getBoundingClientRect();
    if (bounds.height > 0) {
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
    }
  }

  // The admin shell's sticky appbar is the main's sibling; measure it, rather than assuming 52px.
  const appbar = element.closest('main')?.previousElementSibling;
  if (appbar?.tagName === 'HEADER') {
    const bounds = appbar.getBoundingClientRect();
    const position = getComputedStyle(appbar).position;
    if (bounds.height > 0 && (position === 'sticky' || position === 'fixed')) {
      top = Math.max(top, bounds.bottom);
    }
  }
  const footerBounds = footer?.getBoundingClientRect();
  if (footerBounds && footerBounds.height > 0) bottom = Math.min(bottom, footerBounds.top);
  return { top, bottom };
}

/** Reveal the already focused control without changing focus or resetting the stage. */
export function revealWizardControl(control: HTMLElement, footer: HTMLElement | null): void {
  const scroller = findScrollContainer(control);
  if (!scroller) return;
  const fixedFooter = footer && getComputedStyle(footer).position === 'fixed' ? footer : null;
  const { top, bottom } = wizardViewportBounds(control, scroller, fixedFooter);
  const bounds = control.getBoundingClientRect();
  const margin = 4;
  if (bounds.height <= 0 || bottom - top <= margin * 2) return;
  let delta = 0;
  if (bounds.top < top + margin || bounds.height + margin * 2 > bottom - top) {
    delta = bounds.top - top - margin;
  } else if (bounds.bottom > bottom - margin) {
    delta = bounds.bottom - bottom + margin;
  }
  const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const target = Math.min(maxScroll, Math.max(0, scroller.scrollTop + delta));
  if (delta !== 0 && target !== scroller.scrollTop) scroller.scrollTo({ top: target, behavior: 'instant' });
}

/** Stage changes share a URL: reset the real scroller, accounting for its visible chrome. */
export function revealWizardStage(
  heading: HTMLElement,
  fields: HTMLElement | null,
  footer: HTMLElement | null,
  behavior: ScrollBehavior,
): void {
  const scroller = findScrollContainer(heading);
  if (!scroller) return;
  let { top, bottom } = wizardViewportBounds(heading, scroller, footer);

  const headingBounds = heading.getBoundingClientRect();
  const firstControl = Array.from(fields?.querySelectorAll<HTMLElement>(
    'input:not([type="hidden"]):not([type="file"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)',
  ) ?? []).find((control) => control.getBoundingClientRect().height > 0);
  const firstBounds = firstControl?.getBoundingClientRect();
  top += 8;
  bottom -= 8;
  const originTop = headingBounds.top + scroller.scrollTop;
  const originBottom = Math.max(headingBounds.bottom, firstBounds?.bottom ?? headingBounds.bottom) + scroller.scrollTop;

  // Preserve the page context when scroll0 already fits. Otherwise align the heading below chrome.
  // Keep focus on the heading: focusing an input would open the mobile keyboard. If both cannot fit,
  // the heading takes priority and the user can Tab/scroll to the first control.
  const fitsAtStart = originTop >= top && originBottom <= bottom;
  const target = fitsAtStart ? 0 : Math.max(0, originTop - top);
  const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  scroller.scrollTo({ top: Math.min(target, maxScroll), behavior });
}
