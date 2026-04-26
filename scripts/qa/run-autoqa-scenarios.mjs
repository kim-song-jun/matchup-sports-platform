#!/usr/bin/env node

import path from 'node:path';
import {
  AUTOQA_DIR,
  ensureAutoqaScaffold,
  ensureDir,
  gitBranch,
  gitHead,
  hashFile,
  interpolateTemplate,
  isoNow,
  listAppRoutes,
  listRelevantTaskDocs,
  loadStatusCursor,
  parseArgs,
  parseYamlFile,
  printJson,
  repoRelative,
  resolveRepoRoot,
  validateOracle,
  writeCompactHandoff,
  writeFileIfChanged,
  writeStatusCursor,
} from './autoqa-lib.mjs';

function scenarioDocPath(root, scenario) {
  return path.join(root, AUTOQA_DIR, 'scenarios', `${scenario.id}.md`);
}

function renderScenarioDoc(scenario) {
  const stepLines = scenario.steps.map((step) => {
    const details = [];
    if (step.target) details.push(`target=${step.target}`);
    if (step.selector) details.push(`selector=${step.selector}`);
    if (step.value) details.push(`value=${step.value}`);
    if (step.pattern) details.push(`pattern=${step.pattern}`);
    if (step.db_verify_level) details.push(`db=${step.db_verify_level}`);
    return `| ${step.id} | ${step.action} | ${details.join('<br />') || '-'} |`;
  });

  const writePath = scenario.steps.some((step) => step.action === 'db_checkpoint') ? 'yes' : 'no';
  return [
    `# ${scenario.id} — ${scenario.description}`,
    '',
    '| key | value |',
    '|---|---|',
    `| Scope | ${scenario.scope ?? 'core'} |`,
    `| Personas | ${(scenario.personas ?? []).join(', ') || '-'} |`,
    `| Source | ${scenario.source_ref ?? '-'} |`,
    `| Landing route | ${scenario.landing_route ?? '-'} |`,
    `| Write path | ${writePath} |`,
    '',
    '## Steps',
    '',
    '| step | action | details |',
    '|---|---|---|',
    ...stepLines,
    '',
    '## Notes',
    '',
    '- Generated from `.autoqa/oracle.yaml` by `run-autoqa-scenarios.mjs`.',
  ].join('\n');
}

function renderIndex(scenarios, routes, taskDocs, uncoveredRoutes) {
  const rows = scenarios.map((scenario) => {
    const writePath = scenario.steps.some((step) => step.action === 'db_checkpoint') ? 'yes' : 'no';
    return `| ${scenario.id} | ${scenario.scope ?? 'core'} | ${(scenario.personas ?? []).join(', ') || '-'} | ${writePath} | ${scenario.source_ref ?? '-'} |`;
  });

  return [
    '# autoqa scenarios index',
    '',
    '| id | scope | personas | write | source |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    '## Scope Freeze Snapshot',
    '',
    `- route_count: ${routes.length}`,
    `- task_doc_count: ${taskDocs.length}`,
    `- uncovered_route_count: ${uncoveredRoutes.length}`,
    ...(uncoveredRoutes.length ? uncoveredRoutes.map((route) => `- uncovered_route: ${route}`) : ['- uncovered_route: none']),
    '',
    '## Task Docs Included',
    '',
    ...(taskDocs.length ? taskDocs.map((doc) => `- ${doc}`) : ['- none']),
  ].join('\n');
}

function routeCovered(route, areaMap) {
  const candidates = Object.keys(areaMap ?? {}).sort((left, right) => right.length - left.length);
  return candidates.some((candidate) => route === candidate || route.startsWith(candidate === '/' ? '/' : `${candidate}/`));
}

async function main() {
  const { action } = parseArgs(process.argv.slice(2));
  const root = resolveRepoRoot();

  ensureAutoqaScaffold(root);
  validateOracle(root);

  const oraclePath = path.join(root, AUTOQA_DIR, 'oracle.yaml');
  const oracle = parseYamlFile(oraclePath);
  const routes = listAppRoutes(root);
  const taskDocs = listRelevantTaskDocs(root);
  const uncoveredRoutes = routes.filter((route) => !routeCovered(route, oracle.area_map));

  for (const scenario of oracle.scenarios ?? []) {
    writeFileIfChanged(scenarioDocPath(root, scenario), `${renderScenarioDoc(scenario)}\n`);
  }

  writeFileIfChanged(
    path.join(root, AUTOQA_DIR, 'scenarios', '00-index.md'),
    `${renderIndex(oracle.scenarios ?? [], routes, taskDocs, uncoveredRoutes)}\n`,
  );

  const freezeDir = path.join(root, AUTOQA_DIR, 'scope-freeze');
  ensureDir(freezeDir);
  const freezePayload = {
    generated_at: isoNow(),
    mode: action,
    git_head: gitHead(root),
    git_branch: gitBranch(root),
    oracle_path: repoRelative(root, oraclePath),
    oracle_hash: hashFile(oraclePath),
    route_inventory: routes,
    task_docs: taskDocs,
    scenario_ids: (oracle.scenarios ?? []).map((scenario) => scenario.id),
    uncovered_routes: uncoveredRoutes,
  };
  const freezeName = freezePayload.generated_at.replace(/:/g, '-').replace(/\./g, '-');
  writeFileIfChanged(
    path.join(freezeDir, `${freezeName}.json`),
    `${JSON.stringify(freezePayload, null, 2)}\n`,
  );

  const cursor = loadStatusCursor(root);
  cursor.phase = 'idle';
  cursor.scope = 'core';
  cursor.last_wake_at = isoNow();
  cursor.stall.last_progress_at = isoNow();
  cursor.stall.last_progress_reason = 'scenario_refresh_completed';
  writeStatusCursor(root, cursor);
  writeCompactHandoff(root, {
    active_task: 'autoqa scenario refresh',
    done: [
      'validated .autoqa/oracle.yaml',
      'refreshed scenario markdown from oracle',
      'wrote a new scope-freeze manifest',
    ],
    remaining: [
      'run `autoqa` or `autoqa cycle all` to execute scenarios',
    ],
    blocker: null,
    next_action: 'execute foreground autoqa cycle',
    updated_at: isoNow(),
  });

  printJson({
    ok: true,
    scenario_count: (oracle.scenarios ?? []).length,
    route_count: routes.length,
    uncovered_route_count: uncoveredRoutes.length,
    scope_freeze: path.join(AUTOQA_DIR, 'scope-freeze', `${freezeName}.json`),
  });
}

await main();
