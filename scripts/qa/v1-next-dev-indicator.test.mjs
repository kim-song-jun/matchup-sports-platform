import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const nextConfig = await readFile('apps/v1_web/next.config.ts', 'utf8');

test('Given local visual QA When v1 web runs in Next dev Then the Next dev indicator is disabled', () => {
  assert.match(nextConfig, /devIndicators:\s*false/);
});
