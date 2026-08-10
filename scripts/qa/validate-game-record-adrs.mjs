import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const DRIFT = 'ADR_CONTRACT_DRIFT';
const PLAN_START = '# teameet-team-tournament-operations-v1 - Work Plan';
const PLAN_END = '## Execution strategy';
const META_BEGIN = '<!-- TASK127_GAME_RECORD_ADR_METADATA_BEGIN -->';
const META_END = '<!-- TASK127_GAME_RECORD_ADR_METADATA_END -->';
const BUNDLE_BEGIN = '<!-- TASK127_GAME_RECORD_ADR_BUNDLE_BEGIN -->';
const BUNDLE_END = '<!-- TASK127_GAME_RECORD_ADR_BUNDLE_END -->';
const BINDING_BEGIN = '<!-- TASK127_GAME_RECORD_ADR_BINDING_BEGIN -->';
const BINDING_END = '<!-- TASK127_GAME_RECORD_ADR_BINDING_END -->';
const PLAN_BINDING_START = '- [ ] 2. Ratify the Game/Record, permission, visibility, identity, and migration ADR bundle';
const PLAN_BINDING_END = '- [ ] 3. Normalize the canonical v1 API contract tree and deferred boundaries';

function fail(reason) {
  throw new Error(reason);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeLine(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function normalizeBundle(value) {
  return value
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/u, ''))
    .filter((line) => line.trim() !== '')
    .join('\n')
    .trim();
}

function readText(path) {
  const buffer = readFileSync(path);
  if (buffer.includes(0)) fail(`nul_byte:${path}`);
  return buffer.toString('utf8');
}

function parseArgs(argv) {
  const paths = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag !== '--plan' && flag !== '--task') fail(`unexpected_argument:${flag}`);
    if (paths[flag]) fail(`duplicate_argument:${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`missing_value:${flag}`);
    paths[flag] = value;
    index += 1;
  }
  if (!paths['--plan'] || !paths['--task']) fail('required_arguments_missing');
  return { plan: paths['--plan'], task: paths['--task'] };
}

function extractBetween(source, begin, end, label) {
  const beginParts = source.split(begin);
  const endParts = source.split(end);
  if (beginParts.length !== 2 || endParts.length !== 2) fail(`marker_count:${label}`);
  const start = source.indexOf(begin) + begin.length;
  const finish = source.indexOf(end);
  if (finish <= start) fail(`marker_order:${label}`);
  return source.slice(start, finish).replace(/^\r?\n/u, '').replace(/\r?\n$/u, '');
}

function extractPlanBundle(plan) {
  const starts = plan.split(PLAN_START).length - 1;
  const ends = plan.split(PLAN_END).length - 1;
  if (starts !== 1 || ends !== 1) fail('plan_bundle_boundary_count');
  const start = plan.indexOf(PLAN_START);
  const end = plan.indexOf(PLAN_END);
  if (end <= start) fail('plan_bundle_boundary_order');
  return plan.slice(start, end).trimEnd();
}

function extractPlanBinding(plan) {
  const starts = plan.split(PLAN_BINDING_START).length - 1;
  const ends = plan.split(PLAN_BINDING_END).length - 1;
  if (starts !== 1 || ends !== 1) fail('plan_binding_boundary_count');
  const start = plan.indexOf(PLAN_BINDING_START);
  const end = plan.indexOf(PLAN_BINDING_END);
  if (end <= start) fail('plan_binding_boundary_order');
  return plan.slice(start, end).trim();
}

function parseMetadata(task, planPath, planHash) {
  const raw = extractBetween(task, META_BEGIN, META_END, 'metadata').trim();
  if (!raw.startsWith('```json\n') || !raw.endsWith('\n```')) fail('metadata_fence');
  const json = raw.slice(8, -4);
  const duplicateKeys = [];
  const keys = [...json.matchAll(/"((?:\\.|[^"\\])*)"\s*:/gu)].map((match) => match[1]);
  for (const key of keys) {
    if (keys.indexOf(key) !== keys.lastIndexOf(key) && !duplicateKeys.includes(key)) duplicateKeys.push(key);
  }
  if (duplicateKeys.length) fail(`metadata_duplicate_key:${duplicateKeys.join(',')}`);
  let metadata;
  try {
    metadata = JSON.parse(json);
  } catch {
    fail('metadata_malformed_json');
  }
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') fail('metadata_not_object');
  const required = ['schemaVersion', 'planPath', 'planSHA256', 'bundleSectionStart', 'bundleSectionEnd'];
  const actual = Object.keys(metadata).sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== [...required].sort()[index])) fail('metadata_extra_or_missing_field');
  if (metadata.schemaVersion !== 1 || metadata.planPath !== planPath || metadata.planSHA256 !== planHash ||
      metadata.bundleSectionStart !== PLAN_START || metadata.bundleSectionEnd !== PLAN_END) {
    fail('metadata_stale_plan_identity_or_boundary');
  }
}

function splitCells(line) {
  if (!line.startsWith('|') || !line.endsWith('|')) fail('table_row_boundary');
  const cells = [];
  let cell = '';
  let inCode = false;
  for (let index = 1; index < line.length - 1; index += 1) {
    const character = line[index];
    const escaped = index > 0 && line[index - 1] === '\\';
    if (character === '\`' && !escaped) inCode = !inCode;
    if (character === '|' && !inCode) {
      cells.push(normalizeLine(cell));
      cell = '';
      continue;
    }
    cell += character;
  }
  if (inCode) fail('table_unclosed_code_span');
  cells.push(normalizeLine(cell));
  return cells;
}

function isDivider(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function parseStructuredMarkdown(bundle) {
  const lines = normalizeBundle(bundle).split('\n');
  const sections = [];
  let current = { heading: '__preamble__', entries: [] };
  sections.push(current);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = /^(#{2,4})\s+(.+)$/u.exec(line);
    if (heading) {
      current = { heading: `${heading[1]} ${normalizeLine(heading[2])}`, entries: [] };
      sections.push(current);
      continue;
    }
    if (line.startsWith('|')) {
      const tableLines = [];
      while (index < lines.length && lines[index].startsWith('|')) {
        tableLines.push(lines[index]);
        index += 1;
      }
      index -= 1;
      if (tableLines.length < 2) fail('table_missing_divider');
      const header = splitCells(tableLines[0]);
      const divider = splitCells(tableLines[1]);
      if (header.length === 0 || header.some((cell) => !cell) || header.length !== divider.length || !isDivider(divider)) fail('table_header_or_divider');
      if (new Set(header).size !== header.length) fail(`table_duplicate_column:${header.join(',')}`);
      const rows = tableLines.slice(2).map(splitCells);
      if (rows.some((row) => row.length !== header.length)) fail('table_row_arity');
      const primary = new Set();
      const rowSet = new Set();
      for (const row of rows) {
        const rowKey = JSON.stringify(row);
        if (rowSet.has(rowKey)) fail(`semantic_duplicate_row:${header[0]}`);
        rowSet.add(rowKey);
        if (row[0]) {
          if (primary.has(row[0])) fail(`duplicate_table_key:${row[0]}`);
          primary.add(row[0]);
        }
      }
      current.entries.push({ type: 'table', header, rows });
      continue;
    }
    if (normalizeLine(line)) current.entries.push({ type: 'text', value: normalizeLine(line) });
  }
  const headings = sections.map((section) => section.heading);
  if (new Set(headings).size !== headings.length) fail('duplicate_heading');
  return sections;
}

function requirePlanContracts(bundle, structure) {
  const decisions = structure
    .flatMap((section) => section.entries)
    .filter((entry) => entry.type === 'table' && entry.header[0] === 'Decision')
    .flatMap((entry) => entry.rows.map((row) => row[0]));
  const expectedDecisions = Array.from({ length: 12 }, (_, index) => `D-${String(index + 1).padStart(2, '0')}`);
  if (JSON.stringify(decisions) !== JSON.stringify(expectedDecisions)) fail('decision_ids_not_exactly_d01_d12');
  const requiredHeadings = [
    '### Frozen operational decision table',
    '### Frozen REST and idempotency contract',
    '### Frozen realtime contract',
    '### Canonical actor-action matrix',
    '### Frozen additive schema ledger',
    '### Consent truth table',
    '### Consent lifecycle and retroactivity',
    '### Literal migration/cutover phases',
  ];
  const headings = new Set(structure.map((section) => section.heading));
  for (const heading of requiredHeadings) if (!headings.has(heading)) fail(`required_heading_missing:${heading}`);
  const requiredLiterals = [
    'exactly one source',
    'schedules associate to matches but do not own games',
    'Separate scoped tournament-operations authorization and shell',
    '/tournament-ops/**',
    'free-text venue comparison',
    'forward-only',
    'last rollback-safe point',
    'status_only',
    'clientEventId',
    'expectedVersion',
    'V1Game',
    'soft-delete',
    'snapshot',
    'revoke',
  ];
  for (const literal of requiredLiterals) if (!bundle.includes(literal)) fail(`required_contract_literal_missing:${literal}`);
}

function requireLiveEntryClarification(task) {
  const requiredLiterals = [
    "Tapping a player freezes that moment's server-synchronized game clock",
    'GOAL',
    'YELLOW_CARD',
    'RED_CARD',
    'requires the scorer and may include one optional assist',
    'A generic `FOUL` event and an ordinary-team-match live console are deferred',
  ];
  for (const literal of requiredLiterals) if (!task.includes(literal)) fail(`live_entry_clarification_missing:${literal}`);
}

function stable(value) {
  return JSON.stringify(value);
}

function validate(planPath, taskPath) {
  const plan = readText(planPath);
  const task = readText(taskPath);
  const planHash = sha256(plan);
  parseMetadata(task, planPath, planHash);
  requireLiveEntryClarification(task);
  const planBundle = extractPlanBundle(plan);
  const taskBundle = extractBetween(task, BUNDLE_BEGIN, BUNDLE_END, 'bundle');
  const planBinding = extractPlanBinding(plan);
  const taskBinding = extractBetween(task, BINDING_BEGIN, BINDING_END, 'binding');
  const planStructure = parseStructuredMarkdown(planBundle);
  const taskStructure = parseStructuredMarkdown(taskBundle);
  requirePlanContracts(`${planBundle}\n${planBinding}`, planStructure);
  requirePlanContracts(`${taskBundle}\n${taskBinding}`, taskStructure);
  if (normalizeBundle(planBundle) !== normalizeBundle(taskBundle)) fail('normalized_bundle_semantic_mismatch');
  if (normalizeBundle(planBinding) !== normalizeBundle(taskBinding)) fail('normalized_binding_semantic_mismatch');
  if (stable(planStructure) !== stable(taskStructure)) fail('structured_table_semantic_mismatch');
  const endpointTables = planStructure
    .flatMap((section) => section.entries)
    .filter((entry) => entry.type === 'table' && entry.header[0] === 'Method/path');
  const modelTables = planStructure
    .flatMap((section) => section.entries)
    .filter((entry) => entry.type === 'table' && entry.header[0] === 'Model');
  if (endpointTables.length !== 1 || modelTables.length !== 1 || endpointTables[0].rows.length < 20 || modelTables[0].rows.length < 10) {
    fail('endpoint_or_model_contract_incomplete');
  }
  return {
    decisions: 12,
    endpoints: endpointTables[0].rows.length,
    models: modelTables[0].rows.length,
    sections: planStructure.length,
    planHash,
  };
}

try {
  const { plan, task } = parseArgs(process.argv.slice(2));
  const result = validate(plan, task);
  console.log(`V2 PASS D-01..D-12=${result.decisions}/12 endpoints=${result.endpoints} models=${result.models} sections=${result.sections} actor-action=present state-axes=present xor=present deletion-consent-revoke=present rollback-boundary=present planSHA256=${result.planHash}`);
} catch (error) {
  console.error(`${DRIFT}: ${error.message}`);
  process.exitCode = 1;
}
