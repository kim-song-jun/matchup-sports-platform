#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';

export const AUTOQA_DIR = '.autoqa';
export const AUTOQA_SKILL_ROOT = path.join(process.env.HOME ?? '', '.codex', 'skills', 'autoqa');
export const DEFAULT_SCOPE = 'core';
export const DEFAULT_VIEWPORT = { width: 1440, height: 900, label: 'desktop.lg' };
export const DEFAULT_THEME = 'light';
export const DEFAULT_PERSONA_LABELS = {
  'sinaro': '시나로E2E',
  'team-owner': '팀장오너E2E',
  'team-manager': '매니저E2E',
  'team-member': '일반팀원E2E',
  'mercenary-host': '용병호스트E2E',
  'seller': '판매자E2E',
  'instructor': '강사E2E',
  'admin': '관리자E2E',
};

export function parseArgs(argv) {
  const hasLeadingAction = argv[0] && !argv[0].startsWith('--');
  const action = hasLeadingAction ? argv[0] : 'auto';
  const rest = hasLeadingAction ? argv.slice(1) : argv;
  const options = { _: [] };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      options._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = rest[index + 1];
    if (next === undefined || next.startsWith('--')) {
      options[key] = true;
      continue;
    }

    if (options[key] === undefined) {
      options[key] = next;
    } else if (Array.isArray(options[key])) {
      options[key].push(next);
    } else {
      options[key] = [options[key], next];
    }
    index += 1;
  }

  return {
    action: action ?? 'auto',
    options,
  };
}

export function resolveRepoRoot(cwd = process.cwd()) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

export function runShell(command, { cwd, env, allowFailure = false } = {}) {
  const result = spawnSync('bash', ['-lc', command], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (!allowFailure && result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(detail || `command failed: ${command}`);
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

export function parseYamlFile(filePath) {
  const python = [
    'import json, sys',
    'import yaml',
    'with open(sys.argv[1], "r", encoding="utf-8") as fh:',
    '    data = yaml.safe_load(fh)',
    'json.dump(data, sys.stdout, ensure_ascii=False)',
  ].join('\n');

  const raw = execFileSync('python3', ['-c', python, filePath], {
    encoding: 'utf8',
  });
  return JSON.parse(raw);
}

export function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

export function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

export function writeFileIfChanged(filePath, content) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) {
    return false;
  }
  writeFile(filePath, content);
  return true;
}

export function appendFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  const prefix = fs.existsSync(filePath) && fs.statSync(filePath).size > 0 ? '\n' : '';
  fs.appendFileSync(filePath, `${prefix}${content.trimEnd()}\n`);
}

export function isoNow() {
  return new Date().toISOString();
}

export function todayStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

export function hashFile(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function repoRelative(root, targetPath) {
  return path.relative(root, targetPath) || '.';
}

export function listAppRoutes(root) {
  const appRoot = path.join(root, 'apps', 'web', 'src', 'app');
  const routes = [];

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const nextPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(nextPath);
        continue;
      }
      if (entry.isFile() && entry.name === 'page.tsx') {
        routes.push(normalizeAppRoute(appRoot, nextPath));
      }
    }
  }

  walk(appRoot);
  return Array.from(new Set(routes)).sort();
}

function normalizeAppRoute(appRoot, filePath) {
  const relative = path.relative(appRoot, filePath).replace(/\\/g, '/');
  const segments = relative
    .replace(/\/page\.tsx$/, '')
    .split('/')
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')));

  if (segments.length === 0) {
    return '/';
  }

  return `/${segments.join('/')}`;
}

export function listRelevantTaskDocs(root) {
  const docs = [];
  const pattern = /(autoqa|qa|playwright|visual|audit|browser|scenario|e2e)/i;
  for (const base of ['.github/tasks', 'docs']) {
    const dir = path.join(root, base);
    if (!fs.existsSync(dir)) {
      continue;
    }
    walkFiles(dir, (filePath) => {
      const relative = repoRelative(root, filePath);
      if (pattern.test(relative)) {
        docs.push(relative);
      }
    });
  }
  return Array.from(new Set(docs)).sort();
}

function walkFiles(dir, onFile) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const nextPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(nextPath, onFile);
      continue;
    }
    if (entry.isFile()) {
      onFile(nextPath);
    }
  }
}

export function ensureAutoqaScaffold(root) {
  const configPath = path.join(root, AUTOQA_DIR, 'config.yaml');
  if (fs.existsSync(configPath)) {
    return false;
  }

  const scriptPath = path.join(AUTOQA_SKILL_ROOT, 'scripts', 'scaffold-autoqa.sh');
  runShell(`bash ${shellQuote(scriptPath)} ${shellQuote(root)}`, { cwd: root });
  return true;
}

export function validateOracle(root) {
  const scriptPath = path.join(AUTOQA_SKILL_ROOT, 'scripts', 'validate-oracle.sh');
  const oraclePath = path.join(root, AUTOQA_DIR, 'oracle.yaml');
  runShell(`bash ${shellQuote(scriptPath)} ${shellQuote(oraclePath)}`, { cwd: root });
}

export function latestScopeFreezePath(root) {
  const dir = path.join(root, AUTOQA_DIR, 'scope-freeze');
  if (!fs.existsSync(dir)) {
    return null;
  }
  const files = fs.readdirSync(dir).filter((entry) => entry.endsWith('.json')).sort();
  if (files.length === 0) {
    return null;
  }
  return path.join(dir, files.at(-1));
}

export function loadStatusCursor(root) {
  const statusPath = path.join(root, AUTOQA_DIR, 'status.md');
  if (!fs.existsSync(statusPath)) {
    return defaultStatusCursor();
  }

  const content = readFile(statusPath);
  const match = content.match(/```json\n([\s\S]*?)\n```/);
  if (!match) {
    return defaultStatusCursor();
  }

  return JSON.parse(match[1]);
}

export function writeStatusCursor(root, cursor) {
  const statusPath = path.join(root, AUTOQA_DIR, 'status.md');
  const current = fs.existsSync(statusPath)
    ? readFile(statusPath)
    : '# autoqa status\n\n```json\n{}\n```\n';
  const jsonBlock = `\`\`\`json\n${JSON.stringify(cursor, null, 2)}\n\`\`\``;
  const next = current.match(/```json\n([\s\S]*?)\n```/)
    ? current.replace(/```json\n([\s\S]*?)\n```/, jsonBlock)
    : `${current.trimEnd()}\n\n${jsonBlock}\n`;
  writeFile(statusPath, next);
}

export function writeCompactHandoff(root, handoff) {
  const handoffPath = path.join(root, AUTOQA_DIR, 'status.md.compact_handoff');
  const lines = [
    `active_task: ${handoff.active_task ?? 'null'}`,
    'done:',
    ...(handoff.done?.length ? handoff.done.map((item) => `- ${item}`) : ['- none']),
    'remaining:',
    ...(handoff.remaining?.length ? handoff.remaining.map((item) => `- ${item}`) : ['- none']),
    `blocker: ${handoff.blocker ?? 'null'}`,
    `next_action: ${handoff.next_action ?? 'null'}`,
    `updated_at: ${handoff.updated_at ?? isoNow()}`,
  ];
  writeFile(handoffPath, `${lines.join('\n')}\n`);
}

export function defaultStatusCursor() {
  const now = isoNow();
  return {
    phase: 'idle',
    run_owner: null,
    run_owner_pid: null,
    run_owner_claimed_at: null,
    active_scenarios: [],
    queued_scenarios: [],
    current_scenario: null,
    completed_scenarios: [],
    blocked_scenarios: [],
    scope: 'minimal',
    run_id: null,
    open_findings: [],
    pending_fixes: [],
    publish_pending: [],
    re_run_pending: [],
    gap_pending_decision: [],
    retry_counts: {},
    tool_failure: null,
    automation: {
      mode: null,
      active: false,
      name: null,
      id: null,
      last_tick_at: null,
      next_tick_at: null,
      disabled_reason: null,
      fallback_mode: null,
    },
    stall: {
      head_sha: null,
      ticks_without_head_change: 0,
      ticks_without_progress: 0,
      last_progress_at: now,
      last_progress_reason: 'initialized',
    },
    last_pushed_sha: null,
    last_pushed_at: null,
    last_wake_at: now,
    next_wake_reason: null,
  };
}

export function acquireRunOwner(root, owner) {
  const cursor = loadStatusCursor(root);
  if (cursor.run_owner && cursor.run_owner !== owner) {
    throw new Error(`autoqa owner conflict: ${cursor.run_owner}`);
  }
  cursor.run_owner = owner;
  cursor.run_owner_pid = process.pid;
  cursor.run_owner_claimed_at = isoNow();
  writeStatusCursor(root, cursor);
  return cursor;
}

export function releaseRunOwner(root, owner) {
  const cursor = loadStatusCursor(root);
  if (cursor.run_owner === owner) {
    cursor.run_owner = null;
    cursor.run_owner_pid = null;
    cursor.run_owner_claimed_at = null;
    writeStatusCursor(root, cursor);
  }
}

export function resolveScopeSet(scope) {
  if (scope === 'all') {
    return new Set(['minimal', 'core', 'all']);
  }
  if (scope === 'core') {
    return new Set(['minimal', 'core']);
  }
  return new Set(['minimal']);
}

export function resolvePersonaLabel(personaId, config) {
  const persona = config.personas?.[personaId];
  const envKeys = Array.isArray(persona?.env_required) ? persona.env_required : [];
  for (const key of envKeys) {
    if (process.env[key]) {
      return process.env[key];
    }
  }
  return DEFAULT_PERSONA_LABELS[personaId] ?? null;
}

export function resolveAutoqaEnv(name) {
  if (process.env[name]) {
    return process.env[name];
  }

  const suffixMap = {
    'AUTOQA_SINARO_LABEL': DEFAULT_PERSONA_LABELS['sinaro'],
    'AUTOQA_TEAM_OWNER_LABEL': DEFAULT_PERSONA_LABELS['team-owner'],
    'AUTOQA_TEAM_MANAGER_LABEL': DEFAULT_PERSONA_LABELS['team-manager'],
    'AUTOQA_TEAM_MEMBER_LABEL': DEFAULT_PERSONA_LABELS['team-member'],
    'AUTOQA_MERCENARY_HOST_LABEL': DEFAULT_PERSONA_LABELS['mercenary-host'],
    'AUTOQA_SELLER_LABEL': DEFAULT_PERSONA_LABELS['seller'],
    'AUTOQA_INSTRUCTOR_LABEL': DEFAULT_PERSONA_LABELS['instructor'],
    'AUTOQA_ADMIN_LABEL': DEFAULT_PERSONA_LABELS['admin'],
  };
  return suffixMap[name] ?? null;
}

export function interpolateTemplate(value, context = {}) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replace(/\$\{([^}]+)\}/g, (_full, token) => {
    const trimmed = token.trim();
    if (trimmed.startsWith('scenario.variables.')) {
      const key = trimmed.slice('scenario.variables.'.length);
      return String(context.scenarioVariables?.[key] ?? '');
    }

    return String(resolveAutoqaEnv(trimmed) ?? process.env[trimmed] ?? '');
  });
}

export function storageStatePath(root, config, personaId) {
  const file = config.personas?.[personaId]?.storage_state_file;
  return file ? path.join(root, file) : null;
}

export function isStorageStateStale(filePath, maxAgeHours) {
  if (!filePath || !fs.existsSync(filePath)) {
    return true;
  }
  if (!maxAgeHours) {
    return false;
  }
  const ageMs = Date.now() - fs.statSync(filePath).mtimeMs;
  return ageMs > maxAgeHours * 60 * 60 * 1000;
}

export function capturePersonaStorageState(root, config, personaId) {
  const out = storageStatePath(root, config, personaId);
  if (!out) {
    return null;
  }

  const label = resolvePersonaLabel(personaId, config);
  if (!label) {
    throw new Error(`missing label for persona ${personaId}`);
  }

  const scriptPath = path.join(root, 'scripts', 'qa', 'autoqa-playwright-session.mjs');
  runShell(
    [
      'node',
      shellQuote(scriptPath),
      'capture',
      '--persona',
      shellQuote(personaId),
      '--label',
      shellQuote(label),
      '--out',
      shellQuote(out),
    ].join(' '),
    { cwd: root },
  );
  return out;
}

export function promoteAdminPersona(root, config) {
  const label = resolvePersonaLabel('admin', config);
  if (!label) {
    return;
  }

  const sql = `UPDATE users SET role = 'admin' WHERE nickname = ${sqlLiteral(label)} AND deleted_at IS NULL;`;
  runDbSql(root, config, sql);
}

export function sqlLiteral(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function applySqlParams(query, params = [], context = {}) {
  let resolved = String(query);
  params.forEach((param, index) => {
    const value = interpolateTemplate(param, context);
    resolved = resolved.replaceAll(`$${index + 1}`, sqlLiteral(value));
  });
  return resolved;
}

export function runDbSql(root, config, sql) {
  const execCmd = config.db_watcher?.exec_cmd;
  if (!execCmd) {
    throw new Error('db_watcher.exec_cmd is not configured');
  }
  const command = `${execCmd} ${shellQuote(sql)}`;
  return runShell(command, { cwd: root }).stdout.trim();
}

export function countHeadingBlocks(filePath, prefix) {
  if (!fs.existsSync(filePath)) {
    return 0;
  }
  const content = readFile(filePath);
  const pattern = new RegExp(`^## ${prefix}`, 'gm');
  return (content.match(pattern) ?? []).length;
}

export function gitHead(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

export function gitShortHead(root) {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

export function gitBranch(root) {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

export function newRunId(root) {
  const timestamp = isoNow().replace(/[:.]/g, '-');
  return `RUN-${timestamp}-${gitShortHead(root)}`;
}

export function latestRunId(root) {
  const runsDir = path.join(root, AUTOQA_DIR, 'runs');
  if (!fs.existsSync(runsDir)) {
    return null;
  }
  const entries = fs.readdirSync(runsDir).filter((entry) => entry.startsWith('RUN-')).sort();
  return entries.at(-1) ?? null;
}

export function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}
