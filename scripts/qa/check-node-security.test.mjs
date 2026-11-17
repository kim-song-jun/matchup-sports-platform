import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { assertNodeVersion, checkConfiguration } from './check-node-security.mjs';

test('reject vulnerable, unsupported and malformed runtimes', () => {
  for (const version of ['22.17.0', '22.23.2', '22.23.4', '20.20.0', '24.22.0', '22.23.5-rc.1', 'garbage']) {
    assert.throws(() => assertNodeVersion(version));
  }
  for (const version of ['22.23.5', 'v22.23.6', '22.24.0']) assert.doesNotThrow(() => assertNodeVersion(version));
});

test('actual shipping configuration meets the security baseline', () => checkConfiguration(process.cwd()));

test('configuration guard rejects regressed Docker, CI and engine contracts', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'teameet-node-security-'));
  try {
    for (const path of ['package.json', 'apps/v1_api/package.json', 'apps/v1_web/package.json', '.nvmrc', 'deploy', '.github/workflows', 'scripts/qa/harness/task168-stage-b-image']) {
      cpSync(resolve(path), resolve(root, path), { recursive: true });
    }
    for (const [path, before, after] of [
      ['deploy/Dockerfile.v1-api', '22.23.5-alpine', '22-alpine'],
      ['.github/workflows/deploy.yml', "node-version: '22.23.5'", 'node-version: 22'],
      ['package.json', '>=22.23.5 <23', '>=22'],
    ]) {
      const target = resolve(root, path);
      const original = readFileSync(target, 'utf8');
      assert.ok(original.includes(before));
      writeFileSync(target, original.replace(before, after));
      assert.throws(() => checkConfiguration(root));
      writeFileSync(target, original);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
