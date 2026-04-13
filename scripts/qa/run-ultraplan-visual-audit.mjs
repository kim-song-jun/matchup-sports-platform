#!/usr/bin/env node
/**
 * Ultraplan visual-audit orchestrator.
 * Reads case/lane/band config from `ultraplan/playwright/` and shells out to
 * the isolated runtime + visual-audit runners with lane-aware orchestration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const ULTRAPLAN_ROOT = path.join(REPO_ROOT, 'ultraplan');
const PLAYWRIGHT_ROOT = path.join(ULTRAPLAN_ROOT, 'playwright');
const CONFIG_PATH = path.join(PLAYWRIGHT_ROOT, 'config', 'audit-plan.json');
const BANDS_DIR = path.join(PLAYWRIGHT_ROOT, 'bands');
const BATCHES_DIR = path.join(PLAYWRIGHT_ROOT, 'batches');
const LANES_DIR = path.join(PLAYWRIGHT_ROOT, 'lanes');

const RUN_ROOT = path.join(ULTRAPLAN_ROOT, 'runs', 'playwright');
const CASE_NOTE_DIR = path.join(RUN_ROOT, 'cases');
const LANE_NOTE_DIR = path.join(RUN_ROOT, 'lanes');
const PLAN_NOTE_DIR = path.join(RUN_ROOT, 'plans');
const LOG_DIR = path.join(RUN_ROOT, 'logs');

const E2E_SCRIPT = path.join(REPO_ROOT, 'scripts', 'qa', 'run-e2e-isolated.mjs');
const VISUAL_SCRIPT = path.join(REPO_ROOT, 'scripts', 'qa', 'run-visual-audit.mjs');

function usage(exitCode = 1) {
  console.error(`Usage:
  node scripts/qa/run-ultraplan-visual-audit.mjs list
  node scripts/qa/run-ultraplan-visual-audit.mjs matrix
  node scripts/qa/run-ultraplan-visual-audit.mjs show <batch-id> [--band <band>]
  node scripts/qa/run-ultraplan-visual-audit.mjs plan [--lanes <csv>|all] [--cases <csv>] [--band <band>|all] [--mode manifest|capture|run] [--plan-id <id>]
  node scripts/qa/run-ultraplan-visual-audit.mjs lane <lane-id> [--cases <csv>] [--band <band>|all] [--mode manifest|capture|run] [--auto-down]
  node scripts/qa/run-ultraplan-visual-audit.mjs fanout [--lanes <csv>|all] [--cases <csv>] [--band <band>|all] [--mode manifest|capture|run] [--plan-id <id>] [--auto-down]
  node scripts/qa/run-ultraplan-visual-audit.mjs up <batch-id> --band <band>|all [--runtime-run-id <run-id>]
  node scripts/qa/run-ultraplan-visual-audit.mjs manifest <batch-id> --band <band>|all [--visual-run-id <run-id>] [--allow-bootstrap-writes] [--headed] [--limit <n>] [--family <family>] [--route <route>]
  node scripts/qa/run-ultraplan-visual-audit.mjs capture <batch-id> --band <band>|all [--visual-run-id <run-id>] [--allow-bootstrap-writes] [--headed] [--limit <n>] [--states <csv>] [--viewports <csv>] [--include-blocked] [--max-concurrent-contexts <n>] [--family <family>] [--route <route>]
  node scripts/qa/run-ultraplan-visual-audit.mjs run <batch-id> --band <band>|all [--auto-down] [capture options...]
  node scripts/qa/run-ultraplan-visual-audit.mjs down <batch-id> --band <band>|all [--runtime-run-id <run-id>]
`);
  process.exit(exitCode);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'item';
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function timestampStamp() {
  return new Date().toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '-')
    .replace(/Z$/, '');
}

function relativeRepoPath(filePath) {
  return path.relative(REPO_ROOT, filePath);
}

function coerceList(value) {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return null;
}

function resolveMode(value) {
  const mode = String(value ?? 'run').trim().toLowerCase();
  if (!['manifest', 'capture', 'run'].includes(mode)) {
    throw new Error(`Unknown mode "${value}". Expected manifest, capture, or run.`);
  }
  return mode;
}

function commandResult(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
    encoding: options.captureOutput ? 'utf8' : undefined,
    stdio: options.captureOutput ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} ${args.join(' ')} exited with code ${result.status ?? 1}`);
  }

  return options.captureOutput ? (result.stdout ?? '') : '';
}

function runNodeScript(scriptPath, args, options = {}) {
  return commandResult(process.execPath, [scriptPath, ...args], options);
}

function loadAuditPlan() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Missing ultraplan config: ${relativeRepoPath(CONFIG_PATH)}`);
  }
  return readJson(CONFIG_PATH);
}

function loadJsonMap(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return new Map();
  }

  const files = fs.readdirSync(dirPath)
    .filter((name) => name.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));

  const map = new Map();
  for (const fileName of files) {
    const filePath = path.join(dirPath, fileName);
    const value = readJson(filePath);
    const id = String(value.id ?? path.basename(fileName, '.json'));
    map.set(id, {
      ...value,
      id,
      sourcePath: filePath,
      sourceRelativePath: relativeRepoPath(filePath),
    });
  }
  return map;
}

function runtimeTemplateContext(laneRef, bandId, extra = {}) {
  return {
    lane: laneRef.laneSlug,
    laneId: laneRef.id ?? laneRef.laneId ?? laneRef.name ?? laneRef.laneSlug,
    band: bandId,
    date: todayStamp(),
    yyyymmdd: todayStamp(),
    timestamp: timestampStamp(),
    ...extra,
  };
}

function visualTemplateContext(caseDef, bandId, extra = {}) {
  return {
    batch: caseDef.id,
    lane: caseDef.laneSlug,
    laneId: caseDef.laneId,
    band: bandId,
    date: todayStamp(),
    yyyymmdd: todayStamp(),
    timestamp: timestampStamp(),
    ...extra,
  };
}

function resolveTemplate(value, context) {
  if (value == null) {
    return null;
  }

  return String(value)
    .replace(/<([a-zA-Z0-9_]+)>/g, (_, token) => String(context[token] ?? `<${token}>`))
    .replace(/\{([a-zA-Z0-9_]+)\}/g, (_, token) => String(context[token] ?? `{${token}}`));
}

function sortedBandIds(bandMap) {
  return Array.from(bandMap.values())
    .sort((left, right) => Number(left.order ?? 999) - Number(right.order ?? 999))
    .map((band) => band.id);
}

function buildBatchCases(auditPlan, bandMap, laneMap, batchMap) {
  const allBandIds = sortedBandIds(bandMap);
  return Array.from(batchMap.values())
    .map((batch) => {
      const laneId = String(batch.lane ?? '');
      const laneDoc = laneMap.get(laneId) ?? null;
      const stateProfileId = String(batch.stateProfile ?? 'always');
      const defaultStates = coerceList(batch.defaultStates) ?? auditPlan.stateProfiles?.[stateProfileId] ?? ['default'];
      const rerunStates = coerceList(batch.rerunStates) ?? ['default'];

      return {
        id: batch.id,
        title: batch.title ?? batch.id,
        description: batch.description ?? '',
        priority: Number(batch.priority ?? Number.MAX_SAFE_INTEGER),
        laneId,
        laneSlug: slugify(laneId).replace(/^ultra-/, '') || 'lane',
        laneName: laneDoc?.name ?? laneId,
        laneNotes: laneDoc?.notes ?? laneDoc?.description ?? '',
        batchType: batch.category ?? 'generic',
        bandPolicy: batch.bandPolicy ?? 'all-9',
        rerunPolicy: batch.rerunPolicy ?? 'post-fix-default-plus-related-states',
        routeSelection: batch.routeSelection ?? { type: 'batch' },
        defaultStates,
        rerunStates,
        runNaming: batch.runNaming ?? {},
        bandIds: allBandIds,
        sourceRelativePath: batch.sourceRelativePath,
      };
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      return left.id.localeCompare(right.id);
    });
}

function buildLaneDefs(auditPlan, laneMap, cases, bandMap) {
  const caseById = new Map(cases.map((entry) => [entry.id, entry]));
  const auditLaneOrder = new Map(
    (auditPlan.lanes ?? []).map((lane, index) => [String(lane.id ?? ''), index]),
  );
  const auditLaneBatches = new Map(
    (auditPlan.lanes ?? []).map((lane) => [String(lane.id ?? ''), coerceList(lane.batches) ?? []]),
  );
  const allBandIds = sortedBandIds(bandMap);

  return Array.from(laneMap.values())
    .map((laneDoc) => {
      const configuredBatchOrder = coerceList(laneDoc.batchOrder)
        ?? auditLaneBatches.get(laneDoc.id)
        ?? [];

      const orderedCases = configuredBatchOrder
        .map((caseId) => caseById.get(caseId))
        .filter(Boolean);

      const missingCases = cases
        .filter((item) => item.laneId === laneDoc.id && !configuredBatchOrder.includes(item.id))
        .sort((left, right) => {
          if (left.priority !== right.priority) {
            return left.priority - right.priority;
          }
          return left.id.localeCompare(right.id);
        });

      return {
        id: laneDoc.id,
        name: laneDoc.name ?? laneDoc.id,
        laneSlug: slugify(laneDoc.id).replace(/^ultra-/, '') || 'lane',
        priority: laneDoc.priority ?? 'normal',
        description: laneDoc.description ?? laneDoc.notes ?? '',
        sourceRelativePath: laneDoc.sourceRelativePath,
        bandIds: allBandIds,
        cases: [...orderedCases, ...missingCases],
        order: auditLaneOrder.get(laneDoc.id) ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.id.localeCompare(right.id);
    });
}

function indexCases(cases) {
  const byId = new Map();
  for (const item of cases) {
    byId.set(item.id, item);
  }
  return byId;
}

function indexLanes(lanes) {
  const byId = new Map();
  for (const lane of lanes) {
    for (const key of [lane.id, slugify(lane.id), lane.name, slugify(lane.name)]) {
      if (key) {
        byId.set(String(key), lane);
      }
    }
  }
  return byId;
}

function pickCase(byId, rawId) {
  const normalized = slugify(rawId);
  const exact = byId.get(normalized) ?? byId.get(rawId);
  if (exact) {
    return exact;
  }
  throw new Error(`Unknown batch case "${rawId}". Use \`list\` to inspect available cases.`);
}

function pickLane(byId, rawId) {
  const normalized = slugify(rawId);
  const exact = byId.get(String(rawId)) ?? byId.get(normalized);
  if (exact) {
    return exact;
  }
  throw new Error(`Unknown lane "${rawId}". Use \`matrix\` to inspect available lanes.`);
}

function resolveBands(availableBandIds, bandMap, requestedBand, { allowImplicitAll = false, commandName = 'command' } = {}) {
  if (requestedBand === 'all') {
    return availableBandIds;
  }

  if (!requestedBand) {
    if (allowImplicitAll) {
      return availableBandIds;
    }
    if (availableBandIds.length === 1) {
      return availableBandIds;
    }
    throw new Error(`This ${commandName} targets multiple bands (${availableBandIds.join(', ')}). Pass --band <band>|all.`);
  }

  if (!bandMap.has(requestedBand)) {
    throw new Error(`Unknown band "${requestedBand}". Available bands: ${Array.from(bandMap.keys()).join(', ')}`);
  }

  if (!availableBandIds.includes(requestedBand)) {
    throw new Error(`Band "${requestedBand}" is not allowed here. Available: ${availableBandIds.join(', ')}`);
  }

  return [requestedBand];
}

function resolveCaseSelection(laneDef, requestedCases) {
  const caseFilter = new Set(coerceList(requestedCases) ?? []);
  if (caseFilter.size === 0) {
    return laneDef.cases;
  }
  return laneDef.cases.filter((item) => caseFilter.has(item.id));
}

function resolveLaneSelection(lanes, requestedLanes, requestedCases) {
  const laneFilter = new Set(coerceList(requestedLanes) ?? []);
  const caseFilter = new Set(coerceList(requestedCases) ?? []);

  let selected = lanes;
  if (laneFilter.size > 0 && !laneFilter.has('all')) {
    selected = selected.filter((lane) =>
      laneFilter.has(lane.id)
      || laneFilter.has(slugify(lane.id))
      || laneFilter.has(lane.name)
      || laneFilter.has(slugify(lane.name)),
    );
  }

  if (caseFilter.size > 0) {
    selected = selected.filter((lane) =>
      lane.cases.some((item) => caseFilter.has(item.id)),
    );
  }

  return selected;
}

function resolveRuntimeRunId(auditPlan, laneRef, bandId, override = null) {
  if (override) {
    return override;
  }

  const template = auditPlan.runNaming?.laneRuntime ?? 'ultra-<lane>-<band>';
  return resolveTemplate(template, runtimeTemplateContext(laneRef, bandId));
}

function resolveVisualRunId(caseDef, bandId, mode, override = null, reason = null) {
  if (override) {
    return override;
  }

  const template = mode === 'manifest'
    ? (caseDef.runNaming.manifest ?? caseDef.runNaming.capture ?? 'va-<batch>-<band>-<yyyymmdd>')
    : mode === 'capture'
      ? (caseDef.runNaming.capture ?? 'va-<batch>-<band>-<yyyymmdd>')
      : (caseDef.runNaming.rerun ?? caseDef.runNaming.capture ?? 'va-<batch>-<band>-<yyyymmdd>');

  return resolveTemplate(template, visualTemplateContext(caseDef, bandId, { reason: reason ?? 'manual' }));
}

function buildBandSpec(auditPlan, caseDef, bandDoc, bandId, options = {}) {
  const viewports = options.viewports ?? coerceList(bandDoc.viewports) ?? [];
  const states = options.states ?? (caseDef.id === 'batch-8-rerun' ? caseDef.rerunStates : caseDef.defaultStates);
  const runtimeRunId = resolveRuntimeRunId(auditPlan, caseDef, bandId, options.runtimeRunId);
  const visualRunId = resolveVisualRunId(caseDef, bandId, options.commandName, options.visualRunId, options.reason);

  return {
    bandId,
    runtimeRunId,
    visualRunId,
    viewports,
    states,
    docsPath: path.join('ultraplan', 'runs', 'playwright', `${caseDef.id}__${bandId}.json`),
  };
}

function formatList(cases) {
  const rows = cases.map((item) => ({
    id: item.id,
    lane: item.laneId,
    priority: String(item.priority),
    bands: item.bandIds.join(','),
    states: item.defaultStates.join(','),
    source: item.sourceRelativePath,
  }));

  const keys = ['id', 'lane', 'priority', 'bands', 'states', 'source'];
  const widths = keys.reduce((acc, key) => {
    acc[key] = Math.max(key.length, ...rows.map((row) => row[key].length));
    return acc;
  }, {});

  const header = keys.map((key) => key.padEnd(widths[key])).join('  ');
  const separator = keys.map((key) => '-'.repeat(widths[key])).join('  ');
  const body = rows.map((row) => keys.map((key) => row[key].padEnd(widths[key])).join('  '));
  return [header, separator, ...body].join('\n');
}

function formatMatrix(lanes) {
  const blocks = [];
  for (const lane of lanes) {
    blocks.push(`Lane ${lane.id} (${lane.name})`);
    blocks.push(`  bands: ${lane.bandIds.join(' -> ')}`);
    blocks.push(`  cases: ${lane.cases.map((item) => item.id).join(', ')}`);
    blocks.push('');
  }
  return blocks.join('\n').trim();
}

function printCaseDetails(auditPlan, caseDef, bandMap, requestedBand = null) {
  console.log(`Case: ${caseDef.id}`);
  console.log(`Lane: ${caseDef.laneId} (${caseDef.laneName ?? caseDef.laneId})`);
  console.log(`Priority: ${caseDef.priority}`);
  console.log(`State profile: ${caseDef.defaultStates.join(', ')}`);
  console.log(`Band policy: ${caseDef.bandPolicy}`);
  console.log(`Rerun policy: ${caseDef.rerunPolicy}`);
  console.log(`Route selection: ${JSON.stringify(caseDef.routeSelection)}`);
  console.log(`Source: ${caseDef.sourceRelativePath}`);
  console.log('');

  const bands = resolveBands(caseDef.bandIds, bandMap, requestedBand, { allowImplicitAll: true, commandName: 'show' });
  for (const bandId of bands) {
    const bandDoc = bandMap.get(bandId);
    const spec = buildBandSpec(auditPlan, caseDef, bandDoc, bandId, { commandName: 'capture' });
    console.log(`Band: ${bandId}`);
    console.log(`  runtime RUN: ${spec.runtimeRunId}`);
    console.log(`  visual RUN: ${spec.visualRunId}`);
    console.log(`  viewports: ${spec.viewports.join(', ')}`);
    console.log(`  states: ${spec.states.join(', ')}`);
    console.log(`  docs: ${spec.docsPath}`);
    console.log('');
  }
}

function readRuntimeEnv(runId) {
  const output = runNodeScript(E2E_SCRIPT, ['env', runId], { captureOutput: true }).trim();
  const parsed = JSON.parse(output);
  if (!parsed.initialized) {
    throw new Error(`Runtime "${runId}" is not initialized`);
  }
  return parsed;
}

function startRuntime(runtimeRunId) {
  runNodeScript(E2E_SCRIPT, ['up', runtimeRunId]);
  return readRuntimeEnv(runtimeRunId);
}

function stopRuntime(runtimeRunId) {
  runNodeScript(E2E_SCRIPT, ['down', runtimeRunId]);
}

function appendHistory(existingHistory, entry) {
  const history = Array.isArray(existingHistory) ? existingHistory : [];
  return [entry, ...history].slice(0, 20);
}

function writeCaseNote(payload) {
  ensureDir(CASE_NOTE_DIR);
  const detailPath = path.join(
    CASE_NOTE_DIR,
    `${payload.caseId}__${payload.bandId}__${payload.command}__${timestampStamp()}.json`,
  );
  writeJson(detailPath, payload);

  const summaryPath = path.join(RUN_ROOT, `${payload.caseId}__${payload.bandId}.json`);
  const existing = fs.existsSync(summaryPath) ? readJson(summaryPath) : {};
  const latest = {
    updatedAt: payload.updatedAt,
    command: payload.command,
    status: payload.status ?? 'completed',
    runtimeRunId: payload.runtimeRunId,
    visualRunId: payload.visualRunId,
    rawArtifactsPath: payload.rawArtifactsPath ?? null,
    detailPath: relativeRepoPath(detailPath),
  };

  writeJson(summaryPath, {
    caseId: payload.caseId,
    laneId: payload.laneId,
    bandId: payload.bandId,
    sourcePath: payload.sourcePath,
    latest,
    history: appendHistory(existing.history, latest),
  });

  return {
    summaryPath,
    detailPath,
  };
}

function writeLaneNote(payload) {
  ensureDir(LANE_NOTE_DIR);
  const filePath = path.join(
    LANE_NOTE_DIR,
    `${slugify(payload.planId ?? 'adhoc')}__lane-${slugify(payload.laneId)}__${payload.command}__${timestampStamp()}.json`,
  );
  writeJson(filePath, payload);
  return filePath;
}

function writePlanNote(payload) {
  ensureDir(PLAN_NOTE_DIR);
  const filePath = path.join(PLAN_NOTE_DIR, `${slugify(payload.planId)}.json`);
  writeJson(filePath, payload);
  return filePath;
}

function buildVisualArgs(commandName, caseDef, spec, options) {
  const args = [commandName, '--run-id', spec.visualRunId];

  const batch = options.batch ?? caseDef.id;
  if (batch) {
    args.push('--batch', String(batch));
  }
  if (options.family) {
    args.push('--family', String(options.family));
  }
  if (options.route) {
    args.push('--route', String(options.route));
  }
  if (options.limit != null) {
    args.push('--limit', String(options.limit));
  }
  if (options.headed) {
    args.push('--headed');
  }
  if (options.allowBootstrapWrites) {
    args.push('--allow-bootstrap-writes');
  }

  if (commandName === 'capture') {
    if (spec.viewports.length > 0) {
      args.push('--viewports', spec.viewports.join(','));
    }
    if (spec.states.length > 0) {
      args.push('--states', spec.states.join(','));
    }
    if (options.includeBlocked) {
      args.push('--include-blocked');
    }
    if (options.maxConcurrentContexts != null) {
      args.push('--max-concurrent-contexts', String(options.maxConcurrentContexts));
    }
  }

  return args;
}

function assertVisualRunIdScope(options, bandCount, caseCount, label) {
  if (!options.visualRunId) {
    return;
  }
  if (bandCount > 1 || caseCount > 1) {
    throw new Error(`--visual-run-id cannot be reused across multiple targets in ${label}. Narrow to one case and one band.`);
  }
}

function runVisual(commandName, auditPlan, caseDef, bandDoc, bandId, options) {
  const spec = buildBandSpec(auditPlan, caseDef, bandDoc, bandId, {
    commandName,
    runtimeRunId: options.runtimeRunId,
    visualRunId: options.visualRunId,
    viewports: options.viewports,
    states: options.states,
    reason: options.reason,
  });

  const runtimeEnv = options.runtimeEnv ?? startRuntime(spec.runtimeRunId);
  const args = buildVisualArgs(commandName, caseDef, spec, options);

  runNodeScript(VISUAL_SCRIPT, args, {
    env: {
      E2E_WEB_BASE: runtimeEnv.webBase,
      E2E_API_BASE: runtimeEnv.apiBase,
    },
  });

  const notePaths = writeCaseNote({
    updatedAt: new Date().toISOString(),
    status: 'completed',
    command: commandName,
    caseId: caseDef.id,
    laneId: caseDef.laneId,
    bandId,
    runtimeRunId: spec.runtimeRunId,
    visualRunId: spec.visualRunId,
    webBase: runtimeEnv.webBase,
    apiBase: runtimeEnv.apiBase,
    rawArtifactsPath: `output/playwright/visual-audit/${spec.visualRunId}`,
    sourcePath: caseDef.sourceRelativePath,
    options: {
      batch: options.batch ?? caseDef.id,
      family: options.family ?? null,
      route: options.route ?? null,
      limit: options.limit ?? null,
      viewports: spec.viewports,
      states: spec.states,
      includeBlocked: Boolean(options.includeBlocked),
      allowBootstrapWrites: Boolean(options.allowBootstrapWrites),
      headed: Boolean(options.headed),
      maxConcurrentContexts: options.maxConcurrentContexts ?? null,
    },
  });

  console.log(`[ultraplan] case=${caseDef.id} band=${bandId} command=${commandName}`);
  console.log(`[ultraplan] runtime run: ${spec.runtimeRunId}`);
  console.log(`[ultraplan] visual run: ${spec.visualRunId}`);
  console.log(`[ultraplan] raw artifacts: output/playwright/visual-audit/${spec.visualRunId}`);
  console.log(`[ultraplan] run note: ${relativeRepoPath(notePaths.summaryPath)}`);

  return {
    command: commandName,
    caseId: caseDef.id,
    laneId: caseDef.laneId,
    bandId,
    runtimeRunId: spec.runtimeRunId,
    visualRunId: spec.visualRunId,
    rawArtifactsPath: `output/playwright/visual-audit/${spec.visualRunId}`,
    summaryNotePath: relativeRepoPath(notePaths.summaryPath),
    detailNotePath: relativeRepoPath(notePaths.detailPath),
  };
}

function executeCaseRun(auditPlan, caseDef, bandDoc, bandId, options) {
  const runtimeRunId = resolveRuntimeRunId(auditPlan, caseDef, bandId, options.runtimeRunId);
  const runtimeEnv = options.runtimeEnv ?? startRuntime(runtimeRunId);
  const shouldAutoDown = Boolean(options.autoDown) && !options.runtimeEnv;

  try {
    const results = [];
    results.push(runVisual('manifest', auditPlan, caseDef, bandDoc, bandId, {
      ...options,
      runtimeEnv,
      runtimeRunId,
    }));
    results.push(runVisual('capture', auditPlan, caseDef, bandDoc, bandId, {
      ...options,
      runtimeEnv,
      runtimeRunId,
    }));
    return results;
  } finally {
    if (shouldAutoDown) {
      stopRuntime(runtimeRunId);
      console.log(`[ultraplan] removed runtime ${runtimeRunId}`);
    }
  }
}

function buildCaseSummaryEntry(caseDef, auditPlan, bandId) {
  return {
    caseId: caseDef.id,
    laneId: caseDef.laneId,
    runtimeRunId: resolveRuntimeRunId(auditPlan, caseDef, bandId),
    visualRunId: resolveVisualRunId(caseDef, bandId, 'capture'),
    sourcePath: caseDef.sourceRelativePath,
  };
}

function buildLaneCommandArgs(laneDef, options) {
  const args = ['lane', laneDef.id, '--mode', resolveMode(options.mode), '--band', options.band ?? 'all'];

  if (options.cases?.length) {
    args.push('--cases', options.cases.join(','));
  }
  if (options.planId) {
    args.push('--plan-id', options.planId);
  }
  if (options.family) {
    args.push('--family', options.family);
  }
  if (options.route) {
    args.push('--route', options.route);
  }
  if (options.limit != null) {
    args.push('--limit', String(options.limit));
  }
  if (options.viewports?.length) {
    args.push('--viewports', options.viewports.join(','));
  }
  if (options.states?.length) {
    args.push('--states', options.states.join(','));
  }
  if (options.headed) {
    args.push('--headed');
  }
  if (options.allowBootstrapWrites) {
    args.push('--allow-bootstrap-writes');
  }
  if (options.includeBlocked) {
    args.push('--include-blocked');
  }
  if (options.maxConcurrentContexts != null) {
    args.push('--max-concurrent-contexts', String(options.maxConcurrentContexts));
  }
  if (options.autoDown) {
    args.push('--auto-down');
  }
  if (options.reason) {
    args.push('--reason', options.reason);
  }

  return args;
}

function buildExecutionPlan(auditPlan, lanes, bandMap, options) {
  const selectedLanes = resolveLaneSelection(lanes, options.lanes, options.cases);
  if (selectedLanes.length === 0) {
    throw new Error('No lanes matched the current selection.');
  }

  const planId = options.planId ?? `ultra-plan-${todayStamp()}-${slugify(timestampStamp())}`;
  const plan = {
    planId,
    createdAt: new Date().toISOString(),
    mode: resolveMode(options.mode),
    filters: {
      lanes: options.lanes ?? ['all'],
      cases: options.cases ?? [],
      band: options.band ?? 'all',
    },
    outputRoot: 'output/playwright/visual-audit',
    runRoot: relativeRepoPath(RUN_ROOT),
    lanes: [],
    tasks: [],
  };

  for (const laneDef of selectedLanes) {
    const laneCases = resolveCaseSelection(laneDef, options.cases);
    if (laneCases.length === 0) {
      continue;
    }

    const bandIds = resolveBands(laneDef.bandIds, bandMap, options.band, {
      allowImplicitAll: true,
      commandName: 'plan',
    });

    const logPath = path.join(LOG_DIR, `${slugify(planId)}__lane-${slugify(laneDef.id)}.log`);
    const laneArgs = buildLaneCommandArgs(laneDef, {
      ...options,
      band: options.band ?? 'all',
      planId,
    });

    const laneEntry = {
      laneId: laneDef.id,
      laneName: laneDef.name,
      bands: bandIds.map((bandId) => ({
        bandId,
        runtimeRunId: resolveRuntimeRunId(auditPlan, laneDef, bandId),
      })),
      cases: laneCases.map((item) => item.id),
      logPath: relativeRepoPath(logPath),
      commandArgs: laneArgs,
      command: [process.execPath, relativeRepoPath(__filename), ...laneArgs].join(' '),
    };

    plan.lanes.push(laneEntry);

    for (const bandId of bandIds) {
      for (const caseDef of laneCases) {
        plan.tasks.push({
          laneId: laneDef.id,
          bandId,
          ...buildCaseSummaryEntry(caseDef, auditPlan, bandId),
        });
      }
    }
  }

  return plan;
}

function printPlan(plan, planPath) {
  console.log(`Plan: ${plan.planId}`);
  console.log(`Mode: ${plan.mode}`);
  console.log(`Lanes: ${plan.lanes.map((lane) => lane.laneId).join(', ')}`);
  console.log(`Tasks: ${plan.tasks.length}`);
  console.log(`Plan file: ${relativeRepoPath(planPath)}`);
}

function spawnLaneWorker(laneEntry) {
  const logPath = path.join(REPO_ROOT, laneEntry.logPath);
  ensureDir(path.dirname(logPath));

  return new Promise((resolve) => {
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    logStream.write(`[${new Date().toISOString()}] ${laneEntry.command}\n`);

    const child = spawn(process.execPath, [__filename, ...laneEntry.commandArgs], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => logStream.write(chunk));
    child.stderr.on('data', (chunk) => logStream.write(chunk));

    child.on('close', (code, signal) => {
      logStream.write(`\n[${new Date().toISOString()}] exit=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
      logStream.end();
      resolve({
        laneId: laneEntry.laneId,
        status: code === 0 ? 'completed' : 'failed',
        exitCode: code ?? 1,
        signal: signal ?? null,
        logPath: laneEntry.logPath,
      });
    });

    child.on('error', (error) => {
      logStream.write(`\n[${new Date().toISOString()}] error=${error.message}\n`);
      logStream.end();
      resolve({
        laneId: laneEntry.laneId,
        status: 'failed',
        exitCode: 1,
        signal: null,
        logPath: laneEntry.logPath,
        error: error.message,
      });
    });
  });
}

async function executeFanout(plan) {
  const startedAt = new Date().toISOString();
  const runningPath = writePlanNote({
    ...plan,
    status: 'running',
    startedAt,
  });

  console.log(`[ultraplan] fanout plan=${plan.planId} lanes=${plan.lanes.length}`);
  for (const laneEntry of plan.lanes) {
    console.log(`[ultraplan] spawn lane=${laneEntry.laneId} log=${laneEntry.logPath}`);
  }

  const laneResults = await Promise.all(plan.lanes.map((laneEntry) => spawnLaneWorker(laneEntry)));
  const failed = laneResults.filter((entry) => entry.status !== 'completed');

  writePlanNote({
    ...plan,
    status: failed.length > 0 ? 'failed' : 'completed',
    startedAt,
    finishedAt: new Date().toISOString(),
    laneResults,
  });

  console.log(`[ultraplan] plan note: ${relativeRepoPath(runningPath)}`);

  if (failed.length > 0) {
    throw new Error(`Fanout failed for ${failed.length}/${laneResults.length} lanes. Inspect ${relativeRepoPath(runningPath)}.`);
  }
}

function executeLane(auditPlan, laneDef, bandMap, options) {
  const laneCases = resolveCaseSelection(laneDef, options.cases);
  if (laneCases.length === 0) {
    throw new Error(`Lane "${laneDef.id}" does not include any cases for the current selection.`);
  }

  const bandIds = resolveBands(laneDef.bandIds, bandMap, options.band, {
    allowImplicitAll: true,
    commandName: 'lane',
  });
  assertVisualRunIdScope(options, bandIds.length, laneCases.length, `lane ${laneDef.id}`);

  const mode = resolveMode(options.mode);

  for (const bandId of bandIds) {
    const runtimeRunId = resolveRuntimeRunId(auditPlan, laneDef, bandId, options.runtimeRunId);
    const runtimeEnv = startRuntime(runtimeRunId);
    const bandDoc = bandMap.get(bandId);
    const caseResults = [];
    let laneError = null;

    try {
      for (const caseDef of laneCases) {
        if (mode === 'manifest' || mode === 'capture') {
          caseResults.push(runVisual(mode, auditPlan, caseDef, bandDoc, bandId, {
            ...options,
            runtimeEnv,
            runtimeRunId,
          }));
          continue;
        }

        caseResults.push(...executeCaseRun(auditPlan, caseDef, bandDoc, bandId, {
          ...options,
          runtimeEnv,
          runtimeRunId,
          autoDown: false,
        }));
      }
    } catch (error) {
      laneError = error;
      throw error;
    } finally {
      const laneNotePath = writeLaneNote({
        updatedAt: new Date().toISOString(),
        planId: options.planId ?? null,
        laneId: laneDef.id,
        laneName: laneDef.name,
        bandId,
        command: mode,
        runtimeRunId,
        cases: laneCases.map((item) => item.id),
        caseResults,
        status: laneError ? 'failed' : 'completed',
        failureReason: laneError ? (laneError instanceof Error ? laneError.message : String(laneError)) : null,
      });

      console.log(`[ultraplan] lane note: ${relativeRepoPath(laneNotePath)}`);

      if (options.autoDown) {
        stopRuntime(runtimeRunId);
        console.log(`[ultraplan] removed runtime ${runtimeRunId}`);
      }
    }
  }
}

function parseArgs(argv) {
  const command = argv[2];
  if (!command) {
    usage();
  }

  const options = {
    band: null,
    runtimeRunId: null,
    visualRunId: null,
    batch: null,
    family: null,
    route: null,
    limit: null,
    viewports: null,
    states: null,
    lanes: null,
    cases: null,
    mode: 'run',
    planId: null,
    includeBlocked: false,
    allowBootstrapWrites: false,
    headed: false,
    maxConcurrentContexts: null,
    autoDown: false,
    reason: null,
  };

  let subjectId = null;
  for (let index = 3; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--band') options.band = argv[++index] ?? null;
    else if (token === '--runtime-run-id') options.runtimeRunId = argv[++index] ?? null;
    else if (token === '--visual-run-id') options.visualRunId = argv[++index] ?? null;
    else if (token === '--batch') options.batch = argv[++index] ?? null;
    else if (token === '--family') options.family = argv[++index] ?? null;
    else if (token === '--route') options.route = argv[++index] ?? null;
    else if (token === '--limit') options.limit = Number(argv[++index] ?? '0') || null;
    else if (token === '--viewports') options.viewports = coerceList(argv[++index] ?? '');
    else if (token === '--states') options.states = coerceList(argv[++index] ?? '');
    else if (token === '--lanes') options.lanes = coerceList(argv[++index] ?? '');
    else if (token === '--cases') options.cases = coerceList(argv[++index] ?? '');
    else if (token === '--mode') options.mode = resolveMode(argv[++index] ?? 'run');
    else if (token === '--plan-id') options.planId = argv[++index] ?? null;
    else if (token === '--include-blocked') options.includeBlocked = true;
    else if (token === '--allow-bootstrap-writes') options.allowBootstrapWrites = true;
    else if (token === '--headed') options.headed = true;
    else if (token === '--max-concurrent-contexts') options.maxConcurrentContexts = Math.max(1, Number(argv[++index] ?? '3') || 3);
    else if (token === '--auto-down') options.autoDown = true;
    else if (token === '--reason') options.reason = argv[++index] ?? null;
    else if (!subjectId) subjectId = token;
    else throw new Error(`Unknown argument: ${token}`);
  }

  return { command, subjectId, options };
}

async function main() {
  const auditPlan = loadAuditPlan();
  const bandMap = loadJsonMap(BANDS_DIR);
  const laneMap = loadJsonMap(LANES_DIR);
  const batchMap = loadJsonMap(BATCHES_DIR);

  const cases = buildBatchCases(auditPlan, bandMap, laneMap, batchMap);
  const lanes = buildLaneDefs(auditPlan, laneMap, cases, bandMap);
  const casesById = indexCases(cases);
  const lanesById = indexLanes(lanes);

  const { command, subjectId, options } = parseArgs(process.argv);

  if (command === 'list') {
    console.log(formatList(cases));
    return;
  }

  if (command === 'matrix') {
    console.log(formatMatrix(lanes));
    return;
  }

  if (command === 'plan') {
    if (options.visualRunId) {
      throw new Error('--visual-run-id is not supported for `plan` because the plan spans multiple case-band tasks.');
    }

    const plan = buildExecutionPlan(auditPlan, lanes, bandMap, options);
    const planPath = writePlanNote({
      ...plan,
      status: 'planned',
    });
    printPlan(plan, planPath);
    return;
  }

  if (command === 'fanout') {
    if (options.visualRunId) {
      throw new Error('--visual-run-id is not supported for `fanout` because each case-band needs its own run-id.');
    }

    const plan = buildExecutionPlan(auditPlan, lanes, bandMap, options);
    await executeFanout(plan);
    return;
  }

  if (command === 'lane') {
    if (!subjectId) {
      throw new Error('lane command requires a lane id.');
    }
    const laneDef = pickLane(lanesById, subjectId);
    executeLane(auditPlan, laneDef, bandMap, options);
    return;
  }

  if (!subjectId) {
    usage();
  }

  const caseDef = pickCase(casesById, subjectId);

  if (command === 'show') {
    printCaseDetails(auditPlan, caseDef, bandMap, options.band);
    return;
  }

  const bandIds = resolveBands(caseDef.bandIds, bandMap, options.band, {
    allowImplicitAll: false,
    commandName: command,
  });
  assertVisualRunIdScope(options, bandIds.length, 1, `case ${caseDef.id}`);

  if (command === 'up') {
    for (const bandId of bandIds) {
      const runtimeRunId = resolveRuntimeRunId(auditPlan, caseDef, bandId, options.runtimeRunId);
      const env = startRuntime(runtimeRunId);
      const notePaths = writeCaseNote({
        updatedAt: new Date().toISOString(),
        status: 'ready',
        command: 'up',
        caseId: caseDef.id,
        laneId: caseDef.laneId,
        bandId,
        runtimeRunId,
        visualRunId: null,
        webBase: env.webBase,
        apiBase: env.apiBase,
        rawArtifactsPath: null,
        sourcePath: caseDef.sourceRelativePath,
      });
      console.log(`[ultraplan] runtime ready: case=${caseDef.id} band=${bandId} run=${runtimeRunId}`);
      console.log(`[ultraplan] run note: ${relativeRepoPath(notePaths.summaryPath)}`);
    }
    return;
  }

  if (command === 'manifest' || command === 'capture') {
    for (const bandId of bandIds) {
      const bandDoc = bandMap.get(bandId);
      runVisual(command, auditPlan, caseDef, bandDoc, bandId, options);
    }
    return;
  }

  if (command === 'run') {
    for (const bandId of bandIds) {
      const bandDoc = bandMap.get(bandId);
      executeCaseRun(auditPlan, caseDef, bandDoc, bandId, options);
    }
    return;
  }

  if (command === 'down') {
    for (const bandId of bandIds) {
      const runtimeRunId = resolveRuntimeRunId(auditPlan, caseDef, bandId, options.runtimeRunId);
      stopRuntime(runtimeRunId);
      console.log(`[ultraplan] removed runtime ${runtimeRunId}`);
    }
    return;
  }

  usage();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
