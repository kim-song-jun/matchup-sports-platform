import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile('apps/v1_web/src/app/globals.css', 'utf8');
const matches = await readFile('apps/v1_web/src/components/matches/matches-page.tsx', 'utf8');
const teamMatches = await readFile('apps/v1_web/src/components/team-matches/team-matches-page.tsx', 'utf8');
const teams = await readFile('apps/v1_web/src/components/teams/teams-page.tsx', 'utf8');
const appChrome = await readFile('apps/v1_web/src/components/v1-ui/shell.tsx', 'utf8');
const mobileTabletCss = blockFor('@media (max-width: 1023px)');
const tabletCss = blockFor('@media (min-width: 768px)');
const desktopCss = blocksFor('@media (min-width: 1024px)').join('\n');
const narrowDesktopCss = blockFor('@media (min-width: 1024px) and (max-width: 1180px)');
const railDesktopCss = blockFor('@media (min-width: 1181px)');

test('Given mobile and tablet list routes When below desktop breakpoint Then persistent desktop filter rails are hidden', () => {
  assert.match(
    mobileTabletCss,
    /\.tm-filter-rail\s*{[^}]*display:\s*none/s,
    'max-width 1023px must hide the persistent filter rail instead of stacking it above the page title',
  );
});

test('Given mobile and tablet wide app frames When inspected Then they do not cap to a fixed 960px canvas', () => {
  assert.doesNotMatch(
    tabletCss,
    /\.tm-app-frame-wide\s*{[^}]*--v1-app-chrome-frame-width:\s*min\(calc\(100vw - 48px\),\s*960px\)/s,
    'tablet wide frames must not use a fixed 960px cap before the desktop shell takes over',
  );
  assert.match(
    tabletCss,
    /\.tm-app-frame-wide\s*{[^}]*--v1-app-chrome-frame-width:\s*100vw/s,
    'tablet wide frames should fill the available viewport width',
  );
});

test('Given list pages hide tablet rails When inspected Then each route still exposes a filter button entry point', () => {
  for (const [name, source] of [
    ['matches', matches],
    ['team-matches', teamMatches],
    ['teams', teams],
  ]) {
    assert.match(source, /className="tm-list-filter-button"/, `${name} must keep the mobile/tablet filter button`);
    assert.match(source, /filterSheet\?\.open/, `${name} must keep the route filter sheet`);
  }
});

test('Given filter sheets are modal When inspected Then focus and background chrome are contained', () => {
  assert.match(appChrome, /modalOpen\?:\s*boolean/, 'AppChrome should expose modalOpen for route-level modal containment');
  assert.match(appChrome, /aria-hidden={modalOpen \? true : undefined}/, 'AppChrome should hide background chrome from a11y while modal is open');
  assert.match(appChrome, /inert={modalOpen \? true : undefined}/, 'AppChrome should make background chrome inert while modal is open');

  for (const [name, source] of [
    ['matches', matches],
    ['team-matches', teamMatches],
    ['teams', teams],
  ]) {
    assert.match(source, /const filterOpen = Boolean\(model\.filterSheet\?\.open\)/, `${name} should derive a stable filter modal state`);
    assert.match(source, /modalOpen={filterOpen}/, `${name} should pass filter modal state into AppChrome`);
    assert.match(source, /inert={filterOpen \? true : undefined}/, `${name} should make list background inert while filter sheet is open`);
    assert.match(source, /const sheetRef = useRef<HTMLElement \| null>\(null\)/, `${name} should keep a dialog ref`);
    assert.match(source, /useEffect\(\(\) => {\s*sheetRef\.current\?\.focus\(\);\s*}, \[\]\)/s, `${name} should move initial focus into the dialog after mount`);
    assert.match(source, /ref={sheetRef}/, `${name} should attach the focus ref to the dialog sheet`);
    assert.match(source, /className="tm-filter-scrim"[\s\S]*aria-hidden="true"[\s\S]*tabIndex={-1}/, `${name} scrim should not be part of the modal tab order`);
  }
});

test('Given desktop starts at 1024px When inspected Then mobile chrome and desktop rail visibility switch together', () => {
  assert.match(desktopCss, /\.tm-desktop-nav\s*{[^}]*display:\s*flex/s);
  assert.match(desktopCss, /\.tm-bottom-nav\s*{[^}]*display:\s*none/s);
  assert.match(desktopCss, /\.tm-floating-fab\s*{[^}]*display:\s*none/s);
  assert.match(desktopCss, /\.tm-filter-rail\s*{[^}]*position:\s*sticky/s);
});

test('Given narrow desktop routes When inspected Then search and card density are desktop-grade without cramped rails', () => {
  assert.match(narrowDesktopCss, /\.tm-app-frame-wide \.tm-list-searchbar\s*{[^}]*position:\s*static/s);
  assert.match(narrowDesktopCss, /\.tm-app-frame-wide \.tm-list-filter-button\s*{[^}]*width:\s*48px/s);
  assert.match(narrowDesktopCss, /\.tm-app-frame-wide \.tm-matches-desktop-workbench \.tm-match-card-stack\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(narrowDesktopCss, /\.tm-app-frame-wide \.tm-team-matches-desktop-workbench \.tm-match-card-stack\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(narrowDesktopCss, /\.tm-app-frame-wide \.tm-teams-desktop-workbench \.tm-team-card-stack\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
});

test('Given tablet list cards When inspected Then visible card actions remain available', () => {
  const tabletListCss = blockFor('@media (min-width: 768px) and (max-width: 1023px)');
  assert.match(tabletListCss, /\.tm-app-frame-wide \.tm-matches-desktop-workbench \.tm-match-card-actions[\s\S]*display:\s*flex/s);
  assert.match(tabletListCss, /\.tm-app-frame-wide \.tm-team-matches-desktop-workbench \.tm-team-match-card-actions[\s\S]*display:\s*flex/s);
  assert.match(tabletListCss, /\.tm-app-frame-wide \.tm-teams-desktop-workbench \.tm-team-card-actions[\s\S]*display:\s*flex/s);
});

test('Given full desktop routes When inspected Then persistent filter rails return only when there is enough width', () => {
  assert.match(railDesktopCss, /\.tm-app-frame-wide \.tm-matches-desktop-workbench \.tm-list-grid[\s\S]*grid-template-columns:\s*minmax\(260px,\s*300px\) minmax\(0,\s*1fr\)/s);
  assert.match(railDesktopCss, /\.tm-app-frame-wide \.tm-matches-desktop-workbench \.tm-filter-rail[\s\S]*padding:\s*16px/s);
});

function blockFor(header) {
  const blocks = blocksFor(header);
  assert.ok(blocks.length > 0, `Missing CSS block: ${header}`);
  return blocks[0];
}

function blocksFor(header) {
  const blocks = [];
  let searchFrom = 0;
  while (searchFrom < css.length) {
    const start = css.indexOf(`${header} {`, searchFrom);
    if (start === -1) break;
    const block = blockAt(start, header);
    blocks.push(block.content);
    searchFrom = block.end + 1;
  }
  return blocks;
}

function blockAt(start, header) {
  assert.notEqual(start, -1, `Missing CSS block: ${header}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    const char = css[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return { content: css.slice(open + 1, index), end: index };
    }
  }
  throw new Error(`Unclosed CSS block: ${header}`);
}
