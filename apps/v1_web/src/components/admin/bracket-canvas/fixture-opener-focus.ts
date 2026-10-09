const OPENER_ATTRIBUTE = 'data-fixture-opener';

export const fixtureOpenerProps = (fixtureId: string) => ({ [OPENER_ATTRIBUTE]: fixtureId });

// An inline side panel unmounts with its close button, so focus would fall to <body>; hand it back to the fixture's open button.
// Sheets restore focus themselves (useModalA11y), so callers only use this for the side-panel layout.
export function focusFixtureOpener(fixtureId: string) {
  const openers = document.querySelectorAll<HTMLElement>(`[${OPENER_ATTRIBUTE}]`);
  Array.from(openers).find((opener) => opener.getAttribute(OPENER_ATTRIBUTE) === fixtureId)?.focus();
}
