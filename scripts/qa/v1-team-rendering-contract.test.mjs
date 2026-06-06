import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const teams = await readFile('apps/v1_web/src/components/teams/teams-page.tsx', 'utf8');

test('Given team card badges When tags include duplicate labels Then React keys include position context', () => {
  assert.doesNotMatch(teams, /\[\.\.\.team\.tags,\s*team\.genderRule\]\.map\(\(tag\)\s*=>\s*<span key=\{tag\}/);
  assert.match(teams, /\[\.\.\.team\.tags,\s*team\.genderRule\]\.map\(\(tag,\s*index\)\s*=>\s*<span key=\{`\$\{tag\}-\$\{index\}`\}/);
});
