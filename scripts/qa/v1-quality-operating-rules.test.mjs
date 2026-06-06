import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const repoFiles = [
  'AGENTS.md',
  '.codex/AGENTS.md',
  '.codex/qa-rules.md',
  '.codex/frontend-rules.md',
  '.codex/design-rules.md',
  '.codex/agents/prompts.md',
  '.codex/agents/workflow.md',
  '.claude/agents/AGENTS.md',
  '.claude/agents/prompts.md',
];

const rootInstructionFiles = [
  'AGENTS.md',
  '.codex/AGENTS.md',
  '.codex/qa-rules.md',
  '.codex/agents/prompts.md',
  '.codex/agents/workflow.md',
  '.claude/agents/AGENTS.md',
  '.claude/agents/prompts.md',
];

const frontendDesignFiles = [
  '.codex/frontend-rules.md',
  '.codex/design-rules.md',
];

async function readJoined(paths) {
  const contents = await Promise.all(paths.map(async (path) => {
    const text = await readFile(path, 'utf8');
    return `\n--- ${path} ---\n${text}`;
  }));
  return contents.join('\n');
}

function assertContainsEvery(text, phrases) {
  const missing = phrases.filter((phrase) => !text.includes(phrase));
  assert.deepEqual(missing, [], `Missing required rule phrases: ${missing.join(', ')}`);
}

test('quality operating rules are persisted in project instructions', async () => {
  const text = await readJoined(repoFiles);

  assertContainsEvery(text, [
    'No useless fallback',
    'No fake tests',
    'Visual verification before completion',
    'Before/after screenshot evidence',
    'Layout rebalance',
    'No scope retreat',
    'Tech-Debt Grep',
    'Committed-tree verification',
    'Shared-tree pathspec safety',
    'No left accent rail',
    'manual QA',
    'RED -> GREEN',
  ]);
});

test('frontend and design rules require visual evidence beyond green tests', async () => {
  const text = await readJoined(frontendDesignFiles);

  assertContainsEvery(text, [
    'tests pass is not completion',
    'Playwright screenshot',
    'before/after',
    'layout rebalance',
    'no left accent rail',
    'semantic color only',
    'console/network',
  ]);
});

test('shared-tree and review safety rules are enforced', async () => {
  const text = await readJoined(rootInstructionFiles);

  assertContainsEvery(text, [
    'git commit -- <pathspec>',
    'git add -A',
    'sub-agent self-commit',
    'diff scope',
    'untracked import',
    'committed-tree',
  ]);
});
