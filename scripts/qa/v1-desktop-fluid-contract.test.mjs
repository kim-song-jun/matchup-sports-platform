import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile('apps/v1_web/src/app/globals.css', 'utf8');
const matchesSource = await readFile('apps/v1_web/src/components/matches/matches-page.tsx', 'utf8');

test('Given wide desktop shell CSS When inspected Then the app frame is not capped to a fixed 1440px canvas', () => {
  assert.doesNotMatch(css, /--v1-desktop-content-max:\s*1440px/);
  assert.match(css, /@media \(min-width: 1024px\)\s*{[\s\S]*\.tm-app-frame\s*{[\s\S]*max-width:\s*none/s);
});

test('Given wide list route CSS When inspected Then match cards adapt beyond three fixed columns', () => {
  assert.match(css, /@media \(min-width: 1600px\)\s*{[\s\S]*\.tm-app-frame-wide \.tm-matches-desktop-workbench \.tm-match-card-stack\s*{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(250px,\s*1fr\)\)/s);
  assert.doesNotMatch(css, /\.tm-app-frame-wide \.tm-matches-desktop-workbench \.tm-match-card-stack\s*{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
});

test('Given desktop list search CSS When inspected Then route search behaves like a desktop toolbar instead of a mobile sticky bar', () => {
  assert.match(css, /\.tm-app-frame-wide \.tm-list-searchbar\s*{[\s\S]*position:\s*static[\s\S]*background:\s*var\(--v1-open-design-bg\)/s);
  assert.match(css, /\.tm-app-frame-wide \.tm-list-search-form\s*{[\s\S]*max-width:\s*none/s);
});

test('Given intermediate tablet and narrow desktop widths When inspected Then list filter rails do not render as a full-width block above the title', () => {
  assert.match(css, /@media \(max-width: 1180px\)\s*{[\s\S]*\.tm-matches-desktop-workbench \.tm-filter-rail[\s\S]*display:\s*none/s);
  assert.match(css, /@media \(max-width: 1180px\)\s*{[\s\S]*\.tm-app-frame-wide \.tm-matches-desktop-workbench \.tm-list-grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});

test('Given desktop management routes When inspected Then workbench lanes are not capped to a narrow 1040px canvas', () => {
  assert.doesNotMatch(css, /tm-my-matches-desktop-workbench[\s\S]{0,240}1040px/);
  assert.doesNotMatch(css, /tm-my-teams-desktop-workbench[\s\S]{0,240}1040px/);
  assert.doesNotMatch(css, /tm-team-state-desktop-lane[\s\S]{0,240}1040px/);
  assert.match(css, /\.tm-app-frame-wide \.tm-my-matches-desktop-workbench[\s\S]*width:\s*calc\(100% - 56px\)/s);
});

test('Given match list cards When inspected Then visible actions are independent links and not inert text spans', () => {
  assert.doesNotMatch(matchesSource, /<span>참가 신청<\/span>\s*<span>상세 보기<\/span>/);
  assert.match(matchesSource, /aria-label=\{`\$\{match\.title\} 참가 신청`\}/);
  assert.match(matchesSource, /aria-label=\{`\$\{match\.title\} 상세 보기`\}/);
});
