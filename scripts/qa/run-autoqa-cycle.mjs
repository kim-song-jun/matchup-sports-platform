#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import {
  AUTOQA_DIR,
  DEFAULT_SCOPE,
  DEFAULT_THEME,
  DEFAULT_VIEWPORT,
  acquireRunOwner,
  appendFile,
  applySqlParams,
  capturePersonaStorageState,
  countHeadingBlocks,
  ensureDir,
  gitHead,
  interpolateTemplate,
  isoNow,
  latestScopeFreezePath,
  loadStatusCursor,
  newRunId,
  parseArgs,
  parseYamlFile,
  printJson,
  promoteAdminPersona,
  readFile,
  releaseRunOwner,
  repoRelative,
  resolveRepoRoot,
  resolveScopeSet,
  runDbSql,
  runShell,
  storageStatePath,
  validateOracle,
  writeCompactHandoff,
  writeFile,
  writeStatusCursor,
} from './autoqa-lib.mjs';

function fail(message) {
  throw new Error(message);
}

const DEFAULT_INTERACTION_SETTLE_MS = 250;

function interactionSettleMs(config, step) {
  const configured = Number(step.after_ms ?? config.browser?.interaction_settle_ms ?? DEFAULT_INTERACTION_SETTLE_MS);
  if (!Number.isFinite(configured) || configured < 0) {
    return DEFAULT_INTERACTION_SETTLE_MS;
  }
  return configured;
}

async function waitForInteractionSettle(page, config, step) {
  const settleMs = interactionSettleMs(config, step);
  if (settleMs > 0) {
    await page.waitForTimeout(settleMs);
  }
}

function resolveScenarioSelection(oracle, selector, scope) {
  const includeScopes = resolveScopeSet(scope);
  const scenarios = oracle.scenarios ?? [];

  if (selector === 'all') {
    return scenarios.filter((scenario) => !scenario.id.startsWith('SC-LOGIN-') && includeScopes.has(scenario.scope ?? 'core'));
  }

  const selectedIds = new Set(selector.split(',').map((item) => item.trim()).filter(Boolean));
  return scenarios.filter((scenario) => selectedIds.has(scenario.id));
}

function findLoginScenariosForSelection(oracle, scenarios) {
  const loginByPersona = new Map(
    (oracle.scenarios ?? [])
      .filter((scenario) => scenario.id.startsWith('SC-LOGIN-'))
      .map((scenario) => {
        const personaId = (scenario.id.replace('SC-LOGIN-', '').toLowerCase())
          .replaceAll('_', '-');
        return [personaId, scenario];
      }),
  );

  const personas = Array.from(new Set(scenarios.flatMap((scenario) => scenario.personas ?? []).filter((persona) => persona !== 'guest')));
  return personas.map((persona) => ({ persona, scenario: loginByPersona.get(persona) ?? null }));
}

function scenarioTables(scenario) {
  const tables = new Set();
  for (const step of scenario.steps ?? []) {
    if (step.action !== 'db_checkpoint') {
      continue;
    }
    for (const table of Object.keys(step.expect?.counts ?? {})) {
      tables.add(table);
    }
  }
  return Array.from(tables);
}

function formatStepDir(baseDir, scenarioId, stepId) {
  const dir = path.join(baseDir, scenarioId, stepId);
  ensureDir(dir);
  return dir;
}

function resolveViewport(oracle) {
  const desktopLg = oracle.viewport_matrix?.desktop?.lg;
  if (!desktopLg) {
    return DEFAULT_VIEWPORT;
  }
  return {
    width: desktopLg.width,
    height: desktopLg.height,
    label: 'desktop.lg',
  };
}

function stripTrailingSemicolon(sql) {
  return String(sql).trim().replace(/;+\s*$/, '');
}

function parseJsonRows(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function compareValue(expected, actual) {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function evaluateCountExpression(expression, before, after) {
  if (typeof expression === 'number') {
    return {
      ok: after === expression,
      observed: after,
      target: expression,
    };
  }

  const raw = String(expression).trim();
  const delta = after - before;
  const rangeMatch = raw.match(/^range\s+(-?\d+)\.\.(-?\d+)$/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    return {
      ok: after >= min && after <= max,
      observed: after,
      target: raw,
    };
  }

  const comparatorMatch = raw.match(/^(>=|<=|>|<|==|=)?\s*([+-]?\d+)$/);
  if (!comparatorMatch) {
    return {
      ok: false,
      observed: delta,
      target: raw,
    };
  }

  const operator = comparatorMatch[1] ?? '==';
  const numeric = Number(comparatorMatch[2]);
  const observed = /^[+-]/.test(comparatorMatch[2]) ? delta : after;

  let ok = false;
  if (operator === '>') ok = observed > numeric;
  if (operator === '>=') ok = observed >= numeric;
  if (operator === '<') ok = observed < numeric;
  if (operator === '<=') ok = observed <= numeric;
  if (operator === '=' || operator === '==') ok = observed === numeric;

  return {
    ok,
    observed,
    target: raw,
  };
}

function nextFindingId(root, scenarioId, stepId, axis) {
  const findingsPath = path.join(root, AUTOQA_DIR, 'findings.md');
  const prefix = `F-${scenarioId}-${stepId}-${axis}-`;
  const count = countHeadingBlocks(findingsPath, prefix);
  return `${prefix}${String(count + 1).padStart(2, '0')}`;
}

function axisMeta(axis) {
  if (axis === 'DB') {
    return { severity: 'C', category: 'truth', wave: 'A' };
  }
  if (axis === 'API') {
    return { severity: 'W', category: 'state', wave: 'B' };
  }
  if (axis === 'DIFF') {
    return { severity: 'W', category: 'layout', wave: 'C' };
  }
  return { severity: 'W', category: 'interaction', wave: 'D' };
}

function appendFinding(root, runId, scenario, step, axis, persona, evidence, summary, details) {
  const findingId = nextFindingId(root, scenario.id, step.id, axis);
  const meta = axisMeta(axis);
  const lines = [
    `## ${findingId} — ${summary}`,
    `- Severity: ${meta.severity}`,
    `- Axis: ${axis}`,
    `- Category: ${meta.category}`,
    `- Wave: ${meta.wave}`,
    '- State: OPEN',
    '- Confidence: n/a',
    `- Detected: ${isoNow()}`,
    `- Run: ${runId}`,
    `- Case: ${scenario.id}:${step.id}`,
    `- Scenario: ${scenario.id} / ${step.id}`,
    `- Axes observed: viewport=${DEFAULT_VIEWPORT.label} theme=${DEFAULT_THEME} persona=${persona}`,
    '- Evidence:',
    ...(evidence.length ? evidence.map((item) => `  - ${item}`) : ['  - n/a']),
    `- Oracle violation: ${details}`,
    '- Root cause hypothesis: pending manual review',
    `- Suggested scope: ${scenario.source_ref ?? 'apps/web/src'}`,
    '- Adjacent cases to rerun on fix: (derived from oracle adjacency)',
    '- Paired fix:',
  ];
  appendFile(path.join(root, AUTOQA_DIR, 'findings.md'), lines.join('\n'));
  return findingId;
}

async function ensurePreflight(root, config, oracle, scenarios) {
  const freezePath = latestScopeFreezePath(root);
  if (!freezePath) {
    fail('scope-freeze missing; run `autoqa scenarios` first');
  }

  const healthPath = config.app?.health_path ?? '/';
  const baseUrl = config.app?.base_url ?? oracle.app?.base_url;
  if (!baseUrl) {
    fail('app.base_url missing');
  }

  const healthResult = runShell(
    `curl -I -sS ${JSON.stringify(new URL(healthPath, baseUrl).toString())}`,
    { cwd: root, allowFailure: true },
  );
  if (healthResult.status !== 0) {
    fail(`app healthcheck failed for ${healthPath}`);
  }

  const dbRequired = scenarios.some((scenario) => scenario.steps.some((step) => step.action === 'db_checkpoint'));
  if (dbRequired && config.db_watcher?.enabled) {
    runDbSql(root, config, 'SELECT 1;');
  }
}

function updateCursorForStart(root, cursor, runId, scenarios, scope, backgroundRequested) {
  const currentHead = gitHead(root);
  cursor.phase = 'run';
  cursor.scope = scope;
  cursor.run_id = runId;
  cursor.active_scenarios = scenarios.map((scenario) => scenario.id);
  cursor.queued_scenarios = scenarios.map((scenario) => scenario.id);
  cursor.current_scenario = scenarios[0]?.id ?? null;
  cursor.completed_scenarios = [];
  cursor.blocked_scenarios = [];
  cursor.open_findings = [];
  cursor.tool_failure = null;
  cursor.last_wake_at = isoNow();
  cursor.next_wake_reason = null;
  cursor.automation.active = false;
  cursor.automation.mode = backgroundRequested ? 'heartbeat' : null;
  cursor.automation.fallback_mode = backgroundRequested ? 'foreground' : null;
  cursor.automation.disabled_reason = backgroundRequested ? 'automation_unavailable' : cursor.automation.disabled_reason;
  cursor.stall.head_sha = currentHead;
  cursor.stall.last_progress_at = isoNow();
  cursor.stall.last_progress_reason = 'foreground_cycle_started';
  writeStatusCursor(root, cursor);
}

async function refreshPersonas(root, config, oracle, scenarios) {
  const loginPlan = findLoginScenariosForSelection(oracle, scenarios);
  for (const { persona } of loginPlan) {
    const personaConfig = config.personas?.[persona];
    const filePath = storageStatePath(root, config, persona);
    if (!filePath) {
      continue;
    }

    capturePersonaStorageState(root, config, persona);
    if (persona === 'admin') {
      promoteAdminPersona(root, config);
      capturePersonaStorageState(root, config, persona);
    }

    if (personaConfig?.storage_state_max_age_hours && !fs.existsSync(filePath)) {
      fail(`storage state refresh failed for ${persona}`);
    }
  }
}

function queryCounts(root, config, tables) {
  const result = {};
  for (const table of tables) {
    const raw = runDbSql(root, config, `SELECT COUNT(*)::int FROM ${table};`);
    result[table] = Number(raw.trim() || '0');
  }
  return result;
}

async function runDbCheckpoint(root, config, page, runDir, scenario, step, beforeCounts, context) {
  const stepDir = formatStepDir(path.join(runDir, 'db'), scenario.id, step.id);
  const evidence = [];
  const counts = step.expect?.counts ?? {};

  if (Object.keys(counts).length > 0) {
    const afterCounts = queryCounts(root, config, Object.keys(counts));
    const rows = ['table\tbefore\tafter\tdelta'];
    for (const table of Object.keys(counts)) {
      const before = beforeCounts[table] ?? 0;
      const after = afterCounts[table] ?? 0;
      rows.push(`${table}\t${before}\t${after}\t${after - before}`);
      const comparison = evaluateCountExpression(counts[table], before, after);
      if (!comparison.ok) {
        fail(`db count check failed for ${table}: observed=${comparison.observed} target=${comparison.target}`);
      }
    }
    const countPath = path.join(stepDir, 'counts.tsv');
    writeFile(countPath, `${rows.join('\n')}\n`);
    evidence.push(`db_counts: ${repoRelative(root, countPath)}`);
  }

  if (step.expect?.target) {
    const rawQuery = applySqlParams(step.expect.target.query, step.expect.target.params ?? [], context);
    const queryText = `SELECT row_to_json(t)::text FROM (${stripTrailingSemicolon(rawQuery)}) AS t;`;
    const queryPath = path.join(stepDir, 'query.sql');
    writeFile(queryPath, `${rawQuery}\n`);

    const rawRows = runDbSql(root, config, queryText);
    const parsedRows = rawRows ? parseJsonRows(rawRows) : [];
    const expectRows = step.expect.target.expect_rows ?? 0;
    if (parsedRows.length !== expectRows) {
      fail(`db target row count failed: observed=${parsedRows.length} expected=${expectRows}`);
    }

    const firstRow = parsedRows[0] ?? {};
    for (const [column, expected] of Object.entries(step.expect.target.expect_columns ?? {})) {
      const resolved = interpolateTemplate(expected, context);
      if (!compareValue(resolved, firstRow[column])) {
        fail(`db target column failed: ${column} observed=${JSON.stringify(firstRow[column])} expected=${JSON.stringify(resolved)}`);
      }
    }

    for (const [variable, column] of Object.entries(step.expect.target.capture ?? {})) {
      context.scenarioVariables[variable] = firstRow[column];
    }

    const targetPath = path.join(stepDir, 'target-row.json');
    writeFile(targetPath, `${JSON.stringify(parsedRows, null, 2)}\n`);
    evidence.push(`db_target_row: ${repoRelative(root, targetPath)}`);
  }

  if (step.expect?.landing_screen) {
    const landing = step.expect.landing_screen;
    if (landing.after_ms) {
      await page.waitForTimeout(Number(landing.after_ms));
    }
    if (landing.navigate) {
      const target = interpolateTemplate(landing.navigate, context);
      await page.goto(new URL(target, context.baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    }
    if (landing.assert_contains_text) {
      const text = interpolateTemplate(landing.assert_contains_text, context);
      await page.waitForFunction(
        (needle) => Boolean(document.body?.innerText?.includes(needle)),
        text,
        { timeout: 10_000 },
      );
    }
  }

  return evidence;
}

async function runScenario(root, config, runId, runDir, oracle, scenario, mode) {
  const baseUrl = config.app?.base_url ?? oracle.app?.base_url;
  const persona = (scenario.personas ?? ['guest'])[0];
  const viewport = resolveViewport(oracle);
  const storageState = storageStatePath(root, config, persona);
  const context = {
    baseUrl,
    persona,
    scenarioVariables: { ...(scenario.variables ?? {}) },
  };
  const consoleErrors = [];
  const pageErrors = [];
  const tableSnapshot = queryCounts(root, config, scenarioTables(scenario));

  const browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: DEFAULT_THEME,
    storageState: storageState && fs.existsSync(storageState) ? storageState : undefined,
  });
  const page = await browserContext.newPage();

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  const scenarioDir = path.join(runDir, 'scenarios', scenario.id);
  ensureDir(scenarioDir);
  const result = {
    scenario: scenario.id,
    mode,
    persona,
    status: 'passed',
    steps: [],
    findings: [],
  };

  try {
    for (const step of scenario.steps ?? []) {
      const stepDir = formatStepDir(path.join(runDir, 'steps'), scenario.id, step.id);
      const stepResult = { step: step.id, action: step.action, status: 'passed', evidence: [] };

      try {
        if (step.action === 'navigate') {
          const target = interpolateTemplate(step.target, context);
          await page.goto(new URL(target, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
        } else if (step.action === 'click') {
          const selector = interpolateTemplate(step.selector, context);
          await page.locator(selector).first().waitFor({ state: 'visible', timeout: 10_000 });
          await page.locator(selector).first().click();
          await waitForInteractionSettle(page, config, step);
        } else if (step.action === 'type') {
          const selector = interpolateTemplate(step.selector, context);
          const value = interpolateTemplate(step.value, context);
          await page.locator(selector).first().waitFor({ state: 'visible', timeout: 10_000 });
          await page.locator(selector).first().fill(String(value));
          await waitForInteractionSettle(page, config, step);
        } else if (step.action === 'wait') {
          await page.waitForTimeout(Number(step.ms ?? 500));
        } else if (step.action === 'wait_url') {
          await page.waitForURL(new RegExp(step.pattern), { timeout: Number(step.timeout_ms ?? 10_000) });
        } else if (step.action === 'assert_dom') {
          for (const assertion of step.assertions ?? []) {
            const selector = interpolateTemplate(assertion.selector, context);
            const locator = page.locator(selector);
            const minRows = Number(assertion.min_rows ?? 1);
            const count = await locator.count();
            if (count < minRows) {
              fail(`assert_dom min_rows failed for ${selector}: observed=${count} expected>=${minRows}`);
            }
            await locator.first().waitFor({ state: 'visible', timeout: 10_000 });
            if (assertion.contains_text) {
              const text = interpolateTemplate(assertion.contains_text, context);
              await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 10_000 });
            }
          }
        } else if (step.action === 'assert_no_console_errors') {
          if (consoleErrors.length > 0 || pageErrors.length > 0) {
            fail(`console/page errors detected: ${(consoleErrors[0] ?? pageErrors[0])}`);
          }
        } else if (step.action === 'screenshot') {
          await page.waitForTimeout(500);
          const screenshotPath = path.join(stepDir, 'run.png');
          await page.screenshot({ path: screenshotPath, fullPage: false });
          const baselinePath = path.join(
            root,
            AUTOQA_DIR,
            'baseline',
            viewport.label,
            DEFAULT_THEME,
            persona,
            scenario.id,
            `${step.id}.png`,
          );
          ensureDir(path.dirname(baselinePath));
          if (!fs.existsSync(baselinePath)) {
            fs.copyFileSync(screenshotPath, baselinePath);
            stepResult.evidence.push(`baseline_bootstrapped: ${repoRelative(root, baselinePath)}`);
          } else {
            const diffPath = path.join(stepDir, 'diff.png');
            const diffScript = path.join(process.env.HOME ?? '', '.codex', 'skills', 'autoqa', 'scripts', 'diff-screenshot.sh');
            const diffResult = runShell(
              `bash ${JSON.stringify(diffScript)} ${JSON.stringify(baselinePath)} ${JSON.stringify(screenshotPath)} ${JSON.stringify(diffPath)}`,
              { cwd: root },
            );
            const diffPct = Number(diffResult.stdout.trim() || '0');
            stepResult.evidence.push(`baseline: ${repoRelative(root, baselinePath)}`);
            stepResult.evidence.push(`run_screenshot: ${repoRelative(root, screenshotPath)}`);
            stepResult.evidence.push(`diff_pct: ${diffPct.toFixed(2)}`);
            if (diffPct > Number(step.diff_threshold_pct ?? 1.0)) {
              fail(`screenshot diff exceeded threshold: observed=${diffPct.toFixed(2)} threshold=${step.diff_threshold_pct ?? 1.0}`);
            }
          }
        } else if (step.action === 'export_storage_state') {
          const out = path.join(root, step.to);
          ensureDir(path.dirname(out));
          await browserContext.storageState({ path: out });
          stepResult.evidence.push(`storage_state: ${repoRelative(root, out)}`);
        } else if (step.action === 'db_checkpoint') {
          const evidence = await runDbCheckpoint(root, config, page, runDir, scenario, step, tableSnapshot, context);
          stepResult.evidence.push(...evidence);
        } else {
          fail(`unsupported autoqa action: ${step.action}`);
        }
      } catch (error) {
        stepResult.status = 'failed';
        const failureShot = path.join(stepDir, 'failure.png');
        await page.screenshot({ path: failureShot, fullPage: false }).catch(() => {});

        const axis = step.action === 'db_checkpoint'
          ? 'DB'
          : step.action === 'assert_no_console_errors'
            ? 'API'
            : step.action === 'screenshot'
              ? 'DIFF'
              : 'DOM';
        const findingId = appendFinding(
          root,
          runId,
          scenario,
          step,
          axis,
          persona,
          [
            `failure_screenshot: ${repoRelative(root, failureShot)}`,
            ...stepResult.evidence,
          ],
          `${scenario.id} ${step.id} failed`,
          String(error.message ?? error),
        );
        stepResult.finding = findingId;
        result.findings.push(findingId);
        result.status = 'failed';
        result.steps.push(stepResult);
        break;
      }

      result.steps.push(stepResult);
    }
  } finally {
    await browserContext.close();
    await browser.close();
  }

  writeFile(path.join(scenarioDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

function summarizeStatus(root) {
  const findingsPath = path.join(root, AUTOQA_DIR, 'findings.md');
  const fixesPath = path.join(root, AUTOQA_DIR, 'fixes.md');
  const gapsPath = path.join(root, AUTOQA_DIR, 'feature-gaps.md');
  return {
    finding_count: countHeadingBlocks(findingsPath, 'F-'),
    fix_count: countHeadingBlocks(fixesPath, 'FIX-'),
    gap_count: countHeadingBlocks(gapsPath, 'FG-'),
  };
}

async function main() {
  const { action, options } = parseArgs(process.argv.slice(2));
  const selector = options._[0] ?? 'all';
  const scope = options.scope ?? DEFAULT_SCOPE;
  const mode = options.mode ?? action;
  const backgroundRequested = Boolean(options.background);
  const limit = options.limit ? Number(options.limit) : null;

  const root = resolveRepoRoot();
  const config = parseYamlFile(path.join(root, AUTOQA_DIR, 'config.yaml'));
  const oracle = parseYamlFile(path.join(root, AUTOQA_DIR, 'oracle.yaml'));
  validateOracle(root);

  const selectedScenarios = resolveScenarioSelection(oracle, selector, scope);
  const scenarios = limit ? selectedScenarios.slice(0, limit) : selectedScenarios;
  if (scenarios.length === 0) {
    fail(`no scenarios selected for selector=${selector} scope=${scope}`);
  }

  await ensurePreflight(root, config, oracle, scenarios);
  await refreshPersonas(root, config, oracle, scenarios);

  const runId = newRunId(root);
  const runDir = path.join(root, AUTOQA_DIR, 'runs', runId);
  ensureDir(runDir);

  acquireRunOwner(root, 'cycle');
  const cursor = loadStatusCursor(root);
  updateCursorForStart(root, cursor, runId, scenarios, scope, backgroundRequested);
  writeCompactHandoff(root, {
    active_task: `autoqa ${mode} ${selector}`,
    done: [
      'validated oracle and preflight',
      'refreshed required persona storage states',
    ],
    remaining: scenarios.map((scenario) => scenario.id),
    blocker: null,
    next_action: `execute ${scenarios[0].id}`,
    updated_at: isoNow(),
  });

  const results = [];
  let hardBlocker = null;
  try {
    for (const scenario of scenarios) {
      const freshCursor = loadStatusCursor(root);
      freshCursor.current_scenario = scenario.id;
      freshCursor.queued_scenarios = scenarios
        .map((candidate) => candidate.id)
        .filter((id) => !freshCursor.completed_scenarios.includes(id) && id !== scenario.id);
      freshCursor.stall.last_progress_at = isoNow();
      freshCursor.stall.last_progress_reason = `running_${scenario.id}`;
      writeStatusCursor(root, freshCursor);

      const result = await runScenario(root, config, runId, runDir, oracle, scenario, mode);
      results.push(result);

      const updated = loadStatusCursor(root);
      if (result.status === 'passed') {
        updated.completed_scenarios = [...updated.completed_scenarios, scenario.id];
      } else {
        updated.blocked_scenarios = [...updated.blocked_scenarios, scenario.id];
        updated.open_findings = [...updated.open_findings, ...result.findings];
      }
      updated.current_scenario = null;
      updated.stall.last_progress_at = isoNow();
      updated.stall.last_progress_reason = result.status === 'passed' ? `scenario_passed_${scenario.id}` : `scenario_failed_${scenario.id}`;
      writeStatusCursor(root, updated);
    }
  } catch (error) {
    hardBlocker = String(error.message ?? error);
    const interrupted = loadStatusCursor(root);
    interrupted.phase = 'interrupted';
    interrupted.tool_failure = {
      detected_at: isoNow(),
      symptom: 'tool_failure',
      last_successful_step: interrupted.current_scenario,
      attempts: 1,
      next_action: 'inspect cycle failure and rerun after fixing preflight or runtime issue',
    };
    interrupted.automation.active = false;
    interrupted.automation.disabled_reason = backgroundRequested ? 'automation_unavailable' : interrupted.automation.disabled_reason;
    writeStatusCursor(root, interrupted);
  } finally {
    releaseRunOwner(root, 'cycle');
  }

  const finalCursor = loadStatusCursor(root);
  finalCursor.phase = hardBlocker ? 'interrupted' : 'done';
  finalCursor.last_wake_at = isoNow();
  finalCursor.next_wake_reason = hardBlocker ? 'foreground_cycle_blocked' : null;
  finalCursor.stall.last_progress_at = isoNow();
  finalCursor.stall.last_progress_reason = hardBlocker ? 'cycle_interrupted' : 'foreground_cycle_completed';
  writeStatusCursor(root, finalCursor);

  const summary = summarizeStatus(root);
  writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify({ run_id: runId, results, summary, hardBlocker }, null, 2)}\n`);
  writeCompactHandoff(root, {
    active_task: `autoqa ${mode} ${selector}`,
    done: [
      `executed ${results.length} scenario(s)`,
      `recorded ${summary.finding_count} total finding block(s) in ledger`,
    ],
    remaining: hardBlocker
      ? ['resolve hard blocker before rerunning cycle']
      : finalCursor.blocked_scenarios.length > 0
        ? finalCursor.blocked_scenarios.map((scenarioId) => `investigate finding(s) from ${scenarioId}`)
        : ['no remaining foreground test work in current run'],
    blocker: hardBlocker,
    next_action: hardBlocker
      ? 'fix tool/preflight blocker and rerun autoqa'
      : finalCursor.blocked_scenarios.length > 0
        ? 'inspect .autoqa/findings.md and rerun targeted scenarios'
        : 'expand to more scenarios or enable scheduled reruns',
    updated_at: isoNow(),
  });

  printJson({
    ok: !hardBlocker,
    run_id: runId,
    executed: results.length,
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status !== 'passed').length,
    blocker: hardBlocker,
    findings_total: summary.finding_count,
    latest_status_phase: finalCursor.phase,
  });
}

await main();
