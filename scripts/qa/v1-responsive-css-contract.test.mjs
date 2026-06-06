import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile('apps/v1_web/src/app/globals.css', 'utf8');

test('Given the shell CSS When inspected Then it exposes responsive lane tokens', () => {
  assert.match(css, /--v1-content-lane-max:\s*480px/);
  assert.match(css, /--v1-wide-content-lane-max:\s*720px/);
  assert.match(css, /--v1-detail-side-panel-width:\s*360px/);
});

test('Given shared responsive utilities When inspected Then they preserve mobile-first constraints', () => {
  assert.match(css, /\.tm-responsive-lane\s*{/);
  assert.match(css, /\.tm-responsive-action-row\s*{/);
  assert.match(css, /\.tm-responsive-action-row-primary\s*{/);
  assert.match(css, /@media \(min-width:\s*768px\)/);
});
