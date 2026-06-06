import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { VIEWPORTS } from './v1-responsive-matrix-lib.mjs';

const css = await readFile('apps/v1_web/src/app/globals.css', 'utf8');

test('Given Task 98 responsive QA When viewport matrix is inspected Then all intermediate widths are covered', () => {
  const widths = new Set(VIEWPORTS.map((viewport) => viewport.width));

  for (const width of [768, 900, 1023, 1024, 1180, 1280, 1440, 1920]) {
    assert.equal(widths.has(width), true, `missing ${width}px viewport`);
  }
});

test('Given tablet app chrome When list pages render below 1024px Then card stacks remain mobile-linear instead of desktop grids', () => {
  assert.match(
    css,
    /@media \(min-width: 768px\) and \(max-width: 1023px\)\s*{[\s\S]*\.tm-app-frame-wide \.tm-matches-desktop-workbench \.tm-match-card-stack\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    css,
    /@media \(min-width: 768px\) and \(max-width: 1023px\)\s*{[\s\S]*\.tm-app-frame-wide \.tm-team-matches-desktop-workbench \.tm-match-card-stack\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    css,
    /@media \(min-width: 768px\) and \(max-width: 1023px\)\s*{[\s\S]*\.tm-app-frame-wide \.tm-teams-desktop-workbench \.tm-team-card-stack\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  );
});

test('Given narrow desktop chrome When list pages render from 1024px through 1180px Then rails stay hidden and card columns are constrained', () => {
  assert.match(
    css,
    /@media \(max-width: 1180px\)\s*{[\s\S]*\.tm-matches-desktop-workbench \.tm-filter-rail,[\s\S]*\.tm-team-matches-desktop-workbench \.tm-filter-rail,[\s\S]*\.tm-teams-desktop-workbench \.tm-filter-rail,[\s\S]*display:\s*none/s,
  );
  assert.match(
    css,
    /@media \(min-width: 1024px\) and \(max-width: 1180px\)\s*{[\s\S]*\.tm-app-frame-wide \.tm-matches-desktop-workbench \.tm-match-card-stack\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(
    css,
    /@media \(min-width: 1024px\) and \(max-width: 1180px\)\s*{[\s\S]*\.tm-app-frame-wide \.tm-team-matches-desktop-workbench \.tm-match-card-stack\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  );
  assert.match(
    css,
    /@media \(min-width: 1024px\) and \(max-width: 1180px\)\s*{[\s\S]*\.tm-app-frame-wide \.tm-teams-desktop-workbench \.tm-team-card-stack\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
  );
});
