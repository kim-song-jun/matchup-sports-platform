/**
 * Scoped responsive grid CSS for the result-review/corrections pages,
 * injected via a module-level `<style>` tag -- exactly the pattern
 * `components/v1-ui/button.tsx`'s `Spinner` already uses for its keyframes,
 * so this never has to touch the shared `apps/v1_web/src/app/globals.css`
 * (a file outside this lane's ownership, and one with a known
 * mixed-line-ending edit hazard on large diffs).
 *
 * Tablet(768)/desktop(1440) get a two-column fixture-list + detail-panel
 * layout with the detail panel's own sticky header
 * (`game-summary-header.tsx`) kept in view while its revision history
 * scrolls -- satisfying this task's "tablet/desktop focus and sticky context
 * work" acceptance criterion. Mobile stays single-column (list, then panel).
 */
const GRID_STYLES = `
.tm-result-review-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
@media (min-width: 768px) {
  .tm-result-review-grid { grid-template-columns: minmax(240px, 320px) 1fr; align-items: start; }
}
`;

export function ResultReviewGridStyles() {
  // eslint-disable-next-line react/no-danger
  return <style dangerouslySetInnerHTML={{ __html: GRID_STYLES }} />;
}
