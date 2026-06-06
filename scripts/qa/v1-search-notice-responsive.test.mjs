import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const searchSource = await readFile('apps/v1_web/src/components/search/search-experience.tsx', 'utf8');
const css = await readFile('apps/v1_web/src/app/globals.css', 'utf8');

test('Given search page source When inspected Then frame layout is class based', () => {
  assert.ok(searchSource.includes('className="tm-search-frame"'));
  assert.ok(searchSource.includes('className="tm-search-topbar"'));
  assert.ok(searchSource.includes('className="tm-search-scroll"'));
  assert.ok(searchSource.includes('className="tm-search-toast"'));
  assert.equal(searchSource.includes("width: 'min(100%, var(--v1-app-chrome-frame-width))'"), false);
});

test('Given utility CSS When inspected Then search and notice responsive classes exist', () => {
  assert.match(css, /\.tm-search-frame\s*{/);
  assert.match(css, /\.tm-search-quick-grid\s*{/);
  assert.match(css, /\.tm-search-toast\s*{/);
  assert.match(css, /bottom:\s*calc\(22px \+ var\(--v1-shell-safe-bottom\)\)/);
  assert.match(css, /\.tm-notice-row\s*{/);
  assert.match(css, /\.tm-notice-row-title\s*{/);
});
