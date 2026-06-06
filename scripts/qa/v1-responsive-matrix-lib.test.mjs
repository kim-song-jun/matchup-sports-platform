import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  DEFAULT_ROUTES,
  VIEWPORTS,
  detectLayoutIssues,
  validateV1BaseUrl,
} from './v1-responsive-matrix-lib.mjs';

const execFileAsync = promisify(execFile);

test('Given the default matrix When listed Then it includes core routes and boundary viewports', () => {
  assert.ok(DEFAULT_ROUTES.includes('/home'));
  assert.ok(DEFAULT_ROUTES.includes('/search'));
  assert.ok(DEFAULT_ROUTES.includes('/matches'));
  assert.ok(DEFAULT_ROUTES.includes('/team-matches'));
  assert.ok(DEFAULT_ROUTES.includes('/teams'));
  assert.ok(DEFAULT_ROUTES.includes('/chat'));
  assert.ok(DEFAULT_ROUTES.includes('/notifications'));
  assert.ok(VIEWPORTS.some((viewport) => viewport.width === 320));
  assert.ok(VIEWPORTS.some((viewport) => viewport.width === 1440));
});

test('Given a legacy base URL When validated Then it is rejected', () => {
  const result = validateV1BaseUrl('http://localhost:3003');

  assert.equal(result.ok, false);
  assert.match(result.message, /localhost:3013/);
});

test('Given layout metrics with overflow and overlap When inspected Then issues are reported', () => {
  const issues = detectLayoutIssues({
    horizontalOverflow: true,
    fixedOverlaps: [{ a: 'tm-bottom-nav', b: 'tm-fixed-cta' }],
    clippedText: [{ text: '매치 만들기', className: 'tm-btn' }],
    hiddenPrimaryCta: true,
  });

  assert.deepEqual(issues, [
    'document has horizontal overflow',
    'fixed chrome overlaps: tm-bottom-nav/tm-fixed-cta',
    'possible clipped text: 매치 만들기',
    'primary CTA is hidden or unreachable',
  ]);
});

test('Given the CLI list command When Playwright is not needed Then it prints the manifest', async () => {
  const { stdout } = await execFileAsync(process.execPath, ['scripts/qa/v1-responsive-matrix.mjs', '--list']);

  assert.ok(stdout.includes('/home'));
  assert.ok(stdout.includes('320'));
  assert.ok(stdout.includes('1440'));
});
