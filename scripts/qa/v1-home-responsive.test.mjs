import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const homeSource = await readFile('apps/v1_web/src/components/home/home-page.tsx', 'utf8');
const css = await readFile('apps/v1_web/src/app/globals.css', 'utf8');

test('Given home source When inspected Then main sections use responsive classes', () => {
  assert.ok(homeSource.includes('className="tm-home-page-head"'));
  assert.ok(homeSource.includes('className="tm-home-section tm-home-section-featured"'));
  assert.ok(homeSource.includes('className="tm-home-section tm-home-section-quick"'));
  assert.ok(homeSource.includes('className="tm-home-weather-head"'));
  assert.ok(homeSource.includes('className="tm-quick-label tm-text-micro"'));
});

test('Given home CSS When inspected Then quick actions preserve narrow and wide readability', () => {
  assert.match(css, /\.tm-home-page-head\s*{/);
  assert.match(css, /\.tm-home-section\s*{/);
  assert.match(css, /\.tm-quick-label\s*{/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /@media\s*\(max-width:\s*360px\)/);
});
