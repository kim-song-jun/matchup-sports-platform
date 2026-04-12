import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import {
  buildRouteCatalog,
  BATCH_LABELS,
  PERSONA_MATRIX,
  POINTER_VIEWPORT_KEYS,
  VIEWPORT_MATRIX,
  VISUAL_AUDIT_BASELINE_COMMIT,
  VISUAL_AUDIT_BASELINE_DATE,
} from './visual-audit-config.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT_ROOT = path.join(REPO_ROOT, 'output', 'playwright', 'visual-audit');
const WEB_BASE = process.env.E2E_WEB_BASE ?? 'http://localhost:3003';
const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:8111';
const NAVIGATION_TIMEOUT = 120_000;
const READY_TIMEOUT = 30_000;
const CURRENT_GIT_SHA = safeGitSha();
const INTERACTION_SWEEP_STATES = new Set([
  'focus-first-input',
  'hover-primary-cta',
  'hover-card-first',
  'menu-open',
  'filter-open',
  'tab-switch',
  'dialog-open',
  'drawer-open',
]);
let activeRunContext = null;

function usage() {
  console.error(`Usage:
  node scripts/qa/run-visual-audit.mjs manifest [--run-id <id>] [--batch <batch-id>] [--family <family>] [--route <template>] [--limit <n>] [--headed] [--allow-bootstrap-writes]
  node scripts/qa/run-visual-audit.mjs capture [--run-id <id>] [--batch <batch-id>] [--family <family>] [--route <template>] [--viewports <csv>] [--states <csv>] [--limit <n>] [--headed] [--include-blocked] [--allow-bootstrap-writes] [--max-concurrent-contexts <n>]`);
  process.exit(1);
}

function sanitizeRunId(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || `run-${Date.now()}`;
}

function parseArgs(argv) {
  const command = argv[2];
  if (!command || !['manifest', 'capture'].includes(command)) {
    usage();
  }

  const options = {
    runId: sanitizeRunId(`visual-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').replace(/Z$/, '')}-${process.pid}`),
    batch: null,
    family: null,
    route: null,
    limit: null,
    headed: false,
    includeBlocked: false,
    allowBootstrapWrites: false,
    viewports: Object.keys(VIEWPORT_MATRIX),
    states: null,
    maxConcurrentContexts: 3,
  };

  for (let index = 3; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--run-id') options.runId = sanitizeRunId(argv[++index] ?? options.runId);
    else if (token === '--batch') options.batch = argv[++index] ?? null;
    else if (token === '--family') options.family = argv[++index] ?? null;
    else if (token === '--route') options.route = argv[++index] ?? null;
    else if (token === '--limit') options.limit = Number(argv[++index] ?? '0') || null;
    else if (token === '--viewports') {
      options.viewports = (argv[++index] ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else if (token === '--states') {
      options.states = (argv[++index] ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else if (token === '--headed') {
      options.headed = true;
    } else if (token === '--include-blocked') {
      options.includeBlocked = true;
    } else if (token === '--allow-bootstrap-writes') {
      options.allowBootstrapWrites = true;
    } else if (token === '--max-concurrent-contexts') {
      options.maxConcurrentContexts = Math.max(1, Number(argv[++index] ?? '3') || 3);
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }

  return { command, options };
}

function runDir(runId) {
  return path.join(OUTPUT_ROOT, runId);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removePath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeAtomically(filePath, content) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function writeJson(filePath, data) {
  const serialized = JSON.stringify(data ?? null, null, 2);
  writeAtomically(filePath, serialized);
}

function writeText(filePath, content) {
  writeAtomically(filePath, content);
}

function safeGitSha() {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, '.git', 'HEAD'), 'utf8').trim().startsWith('ref:')
      ? requireGitSha()
      : fs.readFileSync(path.join(REPO_ROOT, '.git', 'HEAD'), 'utf8').trim();
  } catch {
    return 'unknown';
  }
}

function requireGitSha() {
  try {
    const head = fs.readFileSync(path.join(REPO_ROOT, '.git', 'HEAD'), 'utf8').trim();
    const ref = head.replace(/^ref:\s+/, '');
    return fs.readFileSync(path.join(REPO_ROOT, '.git', ref), 'utf8').trim();
  } catch {
    return 'unknown';
  }
}

function runMetadataPath(runId) {
  return path.join(runDir(runId), 'run-metadata.json');
}

function prepareCaptureArtifacts(runId) {
  for (const relativePath of [
    'screenshots',
    'console',
    'network',
    'checkpoints',
    'issues',
    'capture-results.json',
    'summary.md',
  ]) {
    removePath(path.join(runDir(runId), relativePath));
  }
}

function runLockPath(runId) {
  return path.join(runDir(runId), '.run.lock');
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function claimRunLock(runId, command) {
  const lockPath = runLockPath(runId);
  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath);
    if (typeof lock?.pid === 'number' && processExists(lock.pid)) {
      throw new Error(`[LOCKED_RUN_ID] run-id "${runId}" is already in use by pid ${lock.pid}`);
    }
    removePath(lockPath);
  }

  writeJson(lockPath, {
    runId,
    command,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });

  return () => removePath(lockPath);
}

function isLocalApiBase() {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(API_BASE);
}

function activateRunContext(context) {
  activeRunContext = context;
}

function clearActiveRunContext() {
  activeRunContext = null;
}

function finalizeMetadata(metadata, status, failureReason = null) {
  metadata.status = status;
  metadata.failureReason = failureReason;
  metadata.finishedAt = new Date().toISOString();
}

function failActiveRun(reason) {
  if (!activeRunContext) {
    return;
  }

  finalizeMetadata(activeRunContext.metadata, 'failed', reason);
  activeRunContext.flush();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    failActiveRun(`terminated by ${signal}`);
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

function filterCatalogByBatch(catalog, batch) {
  if (!batch) {
    return catalog;
  }

  if (batch === 'batch-7-interactions') {
    return catalog.filter((route) =>
      (route.supportedStates ?? []).some((stateKey) => INTERACTION_SWEEP_STATES.has(stateKey)),
    );
  }

  if (batch === 'batch-8-rerun') {
    return catalog;
  }

  return catalog.filter((route) => route.batch === batch);
}

function summarizeManifestRoutes(routes) {
  return {
    generatedAt: new Date().toISOString(),
    baselineCommit: VISUAL_AUDIT_BASELINE_COMMIT,
    baselineDate: VISUAL_AUDIT_BASELINE_DATE,
    routeCount: routes.length,
    resolvedCount: routes.filter((route) => route.resolved).length,
    blockedCount: routes.filter((route) => !route.resolved).length,
  };
}

function manifestSummaryMarkdown(summary, routes) {
  return [
    '# Visual Audit Manifest',
    '',
    `- Generated: ${summary.generatedAt}`,
    `- Baseline: \`${VISUAL_AUDIT_BASELINE_COMMIT}\` (${VISUAL_AUDIT_BASELINE_DATE})`,
    `- Routes: ${summary.routeCount}`,
    `- Resolved: ${summary.resolvedCount}`,
    `- Blocked: ${summary.blockedCount}`,
    '',
    '## Batch Counts',
    '',
    ...Object.entries(BATCH_LABELS).map(([batchKey, label]) => {
      const count = routes.filter((route) => route.batch === batchKey).length;
      return `- ${label}: ${count}`;
    }),
  ].join('\n');
}

function flushManifestArtifacts(runId, routes, metadata) {
  const summary = summarizeManifestRoutes(routes);
  metadata.resultSummary = summary;
  writeJson(path.join(runDir(runId), 'route-manifest.json'), { summary, routes });
  writeJson(path.join(runDir(runId), 'viewport-matrix.json'), VIEWPORT_MATRIX);
  writeJson(path.join(runDir(runId), 'persona-matrix.json'), PERSONA_MATRIX);
  writeText(path.join(runDir(runId), 'summary.md'), manifestSummaryMarkdown(summary, routes));
  writeJson(runMetadataPath(runId), metadata);
}

function summarizeCaptureResults(options, routes, captureResults) {
  return {
    runId: options.runId,
    captured: captureResults.filter((result) => result.status === 'captured').length,
    blocked: captureResults.filter((result) => result.status === 'blocked').length,
    expectedNa: captureResults.filter((result) => result.status === 'expected-na').length,
    routeCount: routes.length,
    viewportKeys: options.viewports,
  };
}

function captureSummaryMarkdown(summary, captureResults) {
  return [
    '# Visual Audit Capture Summary',
    '',
    `- Run ID: ${summary.runId}`,
    `- Captured: ${summary.captured}`,
    `- Blocked: ${summary.blocked}`,
    `- Expected N/A: ${summary.expectedNa}`,
    `- Routes: ${summary.routeCount}`,
    `- Viewports: ${summary.viewportKeys.join(', ')}`,
    '',
    '## Batches',
    '',
    ...Object.entries(BATCH_LABELS).map(([batchKey, label]) => {
      const count = captureResults.filter((result) => result.batch === batchKey && result.status === 'captured').length;
      return `- ${label}: ${count} captured`;
    }),
  ].join('\n');
}

function flushCaptureArtifacts(options, routes, captureResults, issueByFamily, metadata) {
  writeJson(path.join(runDir(options.runId), 'capture-results.json'), captureResults);

  const families = Array.from(new Set(routes.map((route) => route.family))).sort();
  for (const family of families) {
    const issues = issueByFamily.get(family) ?? [];
    writeText(
      issueLogPath(options.runId, family),
      ['# Visual Audit Issues', '', ...(issues.length > 0 ? issues : ['- none'])].join('\n'),
    );

    const familyResults = captureResults.filter((result) => result.family === family);
    writeJson(checkpointPath(options.runId, family), {
      family,
      updatedAt: new Date().toISOString(),
      routeCount: routes.filter((route) => route.family === family).length,
      captured: familyResults.filter((result) => result.status === 'captured').length,
      blocked: familyResults.filter((result) => result.status === 'blocked').length,
      expectedNa: familyResults.filter((result) => result.status === 'expected-na').length,
      resultCount: familyResults.length,
      lastResult: familyResults.at(-1) ?? null,
    });
  }

  const summary = summarizeCaptureResults(options, routes, captureResults);
  metadata.resultSummary = summary;
  writeText(path.join(runDir(options.runId), 'summary.md'), captureSummaryMarkdown(summary, captureResults));
  writeJson(runMetadataPath(options.runId), metadata);
}

async function loginViaApi(nickname) {
  const response = await fetch(`${API_BASE}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`dev-login failed for "${nickname}": ${response.status} ${text}`);
  }

  const body = await response.json();
  return body.data ?? body;
}

async function injectTokens(page, tokens) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
      await page.evaluate((payload) => {
        localStorage.setItem('accessToken', payload.accessToken);
        localStorage.setItem('refreshToken', payload.refreshToken);
        if (payload.user) {
          localStorage.setItem('authUser', JSON.stringify(payload.user));
        }
        document.cookie = 'accessToken=1; path=/; max-age=604800; SameSite=Lax';
      }, tokens);
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(250);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function apiUrl(endpoint) {
  const normalized = endpoint.startsWith('/api/v1')
    ? endpoint
    : `/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  return `${API_BASE}${normalized}`;
}

function unwrapApiPayload(payload) {
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
    return payload.data;
  }
  return payload;
}

function asArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
    if (Array.isArray(payload.data)) {
      return payload.data;
    }
  }
  return [];
}

function valueAtPath(value, pathExpression) {
  return pathExpression.split('.').reduce((current, segment) => {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    return current[segment];
  }, value);
}

function firstIdFromCollection(collection, candidatePaths = ['id']) {
  for (const item of collection) {
    for (const candidatePath of candidatePaths) {
      const value = valueAtPath(item, candidatePath);
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
  }
  return null;
}

async function apiGet(session, endpoint, cacheKey = endpoint) {
  if (!session.apiCache) {
    session.apiCache = new Map();
  }

  if (session.apiCache.has(cacheKey)) {
    return session.apiCache.get(cacheKey);
  }

  const fetchWithSession = () => fetch(apiUrl(endpoint), {
    headers: {
      Accept: 'application/json',
      ...(session.tokens?.accessToken
        ? { Authorization: `Bearer ${session.tokens.accessToken}` }
        : {}),
    },
  });

  let response = await fetchWithSession();

  if (response.status === 401) {
    const refreshed = await refreshSessionAuthentication(session);
    if (refreshed) {
      response = await fetchWithSession();
    }
  }

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`API ${endpoint} failed: ${response.status} ${message}`.trim());
  }

  const payload = unwrapApiPayload(await response.json());
  session.apiCache.set(cacheKey, payload);
  return payload;
}

async function refreshSessionAuthentication(session) {
  const persona = PERSONA_MATRIX[session.personaKey];
  if (!persona?.nickname) {
    return false;
  }

  const tokens = await loginViaApi(persona.nickname);
  session.tokens = tokens;
  session.apiCache?.clear();
  if (session.page) {
    await injectTokens(session.page, tokens);
  }
  return true;
}

async function apiPost(session, endpoint, body) {
  const response = await fetch(apiUrl(endpoint), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(session.tokens?.accessToken
        ? { Authorization: `Bearer ${session.tokens.accessToken}` }
        : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`API POST ${endpoint} failed: ${response.status} ${message}`.trim());
  }

  const payload = unwrapApiPayload(await response.json());
  session.apiCache?.clear();
  return payload;
}

async function apiPatch(session, endpoint, body) {
  const fetchWithSession = () => fetch(apiUrl(endpoint), {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(session.tokens?.accessToken
        ? { Authorization: `Bearer ${session.tokens.accessToken}` }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let response = await fetchWithSession();
  if (response.status === 401) {
    const refreshed = await refreshSessionAuthentication(session);
    if (refreshed) {
      response = await fetchWithSession();
    }
  }

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`API PATCH ${endpoint} failed: ${response.status} ${message}`.trim());
  }

  const payload = unwrapApiPayload(await response.json());
  session.apiCache?.clear();
  return payload;
}

function requireBootstrapWrites(session, resourceLabel) {
  if (session.allowBootstrapWrites) {
    return;
  }

  throw new Error(`bootstrap write disabled for ${resourceLabel}; rerun with --allow-bootstrap-writes on localhost only`);
}

function escapeSqlForBootstrap(value) {
  return String(value).replace(/'/g, "''");
}

function runPostgresCommand(sql) {
  const result = spawnSync(
    'docker',
    [
      'compose', 'exec', '-T', 'postgres',
      'psql', '-U', 'matchup_user', '-d', 'matchup_dev',
      '-v', 'ON_ERROR_STOP=1',
      '-c', sql,
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 30_000,
    },
  );

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? 'unknown error';
    throw new Error(`docker compose postgres query failed: ${stderr}`);
  }

  return result.stdout?.trim() ?? '';
}

async function promotePersonaRole(nickname, role) {
  try {
    const safeNickname = escapeSqlForBootstrap(nickname);
    const safeRole = escapeSqlForBootstrap(role);
    runPostgresCommand(
      `UPDATE users SET role = '${safeRole}' WHERE nickname = '${safeNickname}' AND deleted_at IS NULL;`,
    );
    console.log(`[bootstrap] promoted "${nickname}" to role="${role}"`);
  } catch (error) {
    console.warn(`[bootstrap] promotePersonaRole failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function ensureTeamsForPersona(session, personaKey) {
  if (personaKey !== 'teamOwner') {
    return;
  }

  const memberships = asArray(await apiGet(session, '/teams/me', 'teams:me'));
  const ownedCount = memberships.filter(
    (m) => String(m?.role ?? '') === 'owner',
  ).length;

  if (ownedCount >= 1) {
    console.log(`[bootstrap] teamOwner already has ${ownedCount} owned team(s), skipping team creation`);
    return;
  }

  requireBootstrapWrites(session, 'teams');

  const teamDefs = [
    { name: '시각감사팀A', sportType: 'futsal', city: '서울', district: '마포구', level: 3 },
    { name: '시각감사팀B', sportType: 'basketball', city: '서울', district: '강남구', level: 3 },
  ];

  for (const teamDef of teamDefs) {
    const created = await apiPost(session, '/teams', teamDef);
    console.log(`[bootstrap] created team "${teamDef.name}" (id=${created?.id ?? 'unknown'})`);
  }

  session.apiCache?.delete('teams:me');
}

async function runInfrastructureBootstrap(sessions, apiBase) {
  const venueCheck = await fetch(`${apiBase}/api/v1/venues`, {
    headers: { Accept: 'application/json' },
  }).catch(() => null);

  if (!venueCheck || !venueCheck.ok) {
    throw new Error('Bootstrap abort: venue check request failed');
  }

  const venuePayload = unwrapApiPayload(await venueCheck.json().catch(() => null));
  const venues = asArray(venuePayload);
  if (venues.length === 0) {
    throw new Error('Bootstrap abort: run make db-seed-mocks first');
  }

  console.log(`[bootstrap] venue seed confirmed (${venues.length} venues)`);

  const teamOwnerPersona = PERSONA_MATRIX['teamOwner'];
  const teamOwnerTokens = await loginViaApi(teamOwnerPersona.nickname);
  const teamOwnerSession = {
    tokens: teamOwnerTokens,
    personaKey: 'teamOwner',
    apiCache: new Map(),
    allowBootstrapWrites: true,
  };
  await ensureTeamsForPersona(teamOwnerSession, 'teamOwner');

  await promotePersonaRole(PERSONA_MATRIX['admin'].nickname, 'admin');

  const adminSession = await sessions.getSession('admin', 'desktop-md');
  const refreshed = await refreshSessionAuthentication(adminSession);
  if (refreshed) {
    console.log('[bootstrap] admin session re-authenticated with promoted role');
  }
}

function futureDate(daysFromNow = 7) {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function buildScheduledAtForAudit(matchDate, startTime) {
  if (!matchDate || !startTime) {
    return null;
  }

  const normalizedDate = String(matchDate).includes('T')
    ? String(matchDate).slice(0, 10)
    : String(matchDate);
  const normalizedTime = String(startTime).length >= 8
    ? String(startTime).slice(0, 8)
    : `${String(startTime)}:00`;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    return null;
  }

  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(normalizedTime)) {
    return null;
  }

  return `${normalizedDate}T${normalizedTime}`;
}

async function firstVenueForSport(session, sportType) {
  const sportVenues = asArray(await apiGet(
    session,
    `/venues?sportType=${encodeURIComponent(sportType)}`,
    `venues:sport:${sportType}`,
  ));
  if (sportVenues.length > 0) {
    return sportVenues[0];
  }

  const allVenues = asArray(await apiGet(session, '/venues', 'venues:list'));
  return allVenues[0] ?? null;
}

async function ensureBootstrapPath(session, key, creator) {
  if (!session.bootstrap) {
    session.bootstrap = new Map();
  }
  if (session.bootstrap.has(key)) {
    return session.bootstrap.get(key);
  }
  const value = await creator();
  if (value) {
    session.bootstrap.set(key, value);
  }
  return value ?? null;
}

async function ensureOwnedLessonPath(session) {
  return ensureBootstrapPath(session, 'bootstrap:lesson', async () => {
    const userId = await currentUserId(session);
    const lessons = asArray(await apiGet(session, '/lessons?limit=100', 'lessons:list:100'));
    const existing = lessons.find((item) => item?.hostId === userId);
    if (existing?.id) {
      return `/lessons/${existing.id}`;
    }

    requireBootstrapWrites(session, 'lessons');
    const created = await apiPost(session, '/lessons', {
      sportType: 'futsal',
      type: 'group_lesson',
      title: 'QA Visual Audit Lesson',
      description: 'Visual audit bootstrap lesson.',
      venueName: 'QA Training Court',
      lessonDate: futureDate(10),
      startTime: '19:00',
      endTime: '20:30',
      maxParticipants: 12,
      fee: 15000,
      levelMin: 1,
      levelMax: 3,
      coachName: 'QA Coach',
      coachBio: 'Bootstrap profile for visual audit.',
    });
    return created?.id ? `/lessons/${created.id}` : null;
  });
}

async function ensureOwnedListingPath(session) {
  return ensureBootstrapPath(session, 'bootstrap:listing', async () => {
    const userId = await currentUserId(session);
    const listings = asArray(await apiGet(session, '/marketplace/listings?limit=100', 'marketplace:list:100'));
    const existing = listings.find((item) => item?.sellerId === userId);
    if (existing?.id) {
      return `/marketplace/${existing.id}`;
    }

    requireBootstrapWrites(session, 'marketplace listings');
    const created = await apiPost(session, '/marketplace/listings', {
      title: 'QA Visual Audit Listing',
      description: 'Bootstrap listing for visual audit runs.',
      sportType: 'futsal',
      category: '볼',
      condition: 'good',
      price: 12000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '마포구',
    });
    return created?.id ? `/marketplace/${created.id}` : null;
  });
}

async function ensureMercenaryPostPath(session) {
  return ensureBootstrapPath(session, 'bootstrap:mercenary', async () => {
    const userId = await currentUserId(session);
    const posts = asArray(await apiGet(session, '/mercenary?limit=100', 'mercenary:list:100'));
    const existing = posts.find((item) => item?.authorId === userId);
    if (existing?.id) {
      return `/mercenary/${existing.id}`;
    }

    const teamId = (await managedTeamIds(session))[0] ?? null;
    if (!teamId) {
      return null;
    }

    requireBootstrapWrites(session, 'mercenary posts');
    const created = await apiPost(session, '/mercenary', {
      teamId,
      sportType: 'soccer',
      matchDate: futureDate(8),
      venue: 'QA Stadium',
      position: 'wing',
      count: 1,
      level: 3,
      fee: 10000,
      notes: 'Bootstrap mercenary post for visual audit.',
    });
    return created?.id ? `/mercenary/${created.id}` : null;
  });
}

async function ensureManagedTeamMatchPath(session) {
  return ensureBootstrapPath(session, 'bootstrap:team-match', async () => {
    const teamIds = await managedTeamIds(session);
    const matches = asArray(await apiGet(session, '/team-matches?limit=100', 'team-matches:list:100'));
    const existing = matches.find((item) => teamIds.includes(item?.hostTeamId))
      ?? matches.find((item) => teamIds.includes(item?.guestTeamId))
      ?? null;
    if (existing?.id) {
      return `/team-matches/${existing.id}`;
    }

    const hostTeamId = teamIds[0] ?? null;
    if (!hostTeamId) {
      return null;
    }

    requireBootstrapWrites(session, 'team matches');
    const created = await apiPost(session, '/team-matches', {
      hostTeamId,
      sportType: 'soccer',
      title: 'QA Visual Audit Team Match',
      description: 'Bootstrap team match for visual audit.',
      matchDate: futureDate(9),
      startTime: '20:00',
      endTime: '22:00',
      venueName: 'QA Match Ground',
      venueAddress: 'Seoul QA district',
      totalFee: 80000,
      opponentFee: 40000,
      quarterCount: 4,
      matchStyle: 'friendly',
      allowMercenary: true,
      hasReferee: false,
    });
    return created?.id ? `/team-matches/${created.id}` : null;
  });
}

function resolvedGuestTeam(match) {
  if (match?.guestTeam?.id) {
    return match.guestTeam;
  }

  const approvedApplication = asArray(match?.applications).find((application) =>
    application?.applicantTeamId === match?.guestTeamId || application?.status === 'approved');

  return approvedApplication?.applicantTeam ?? null;
}

function isManagedTeamMatchForAudit(match, teamIds) {
  if (!match?.id) {
    return false;
  }

  const approvedApplicantIds = asArray(match?.applications)
    .filter((application) => application?.status === 'approved')
    .map((application) => application?.applicantTeamId)
    .filter((teamId) => typeof teamId === 'string' && teamId.length > 0);

  return teamIds.some((teamId) =>
    teamId === match?.hostTeamId || teamId === match?.guestTeamId || approvedApplicantIds.includes(teamId));
}

function hasResolvedTeamMatchParticipants(match) {
  return Boolean(match?.hostTeam?.id && resolvedGuestTeam(match)?.id);
}

function isScheduledAuditTeamMatch(match, teamIds) {
  if (!isManagedTeamMatchForAudit(match, teamIds) || !hasResolvedTeamMatchParticipants(match)) {
    return false;
  }

  return ['scheduled', 'checking_in', 'in_progress', 'completed'].includes(match?.status);
}

function isCompletedAuditTeamMatch(match, teamIds) {
  return isManagedTeamMatchForAudit(match, teamIds)
    && hasResolvedTeamMatchParticipants(match)
    && match?.status === 'completed';
}

async function findManagedTeamMatchPath(session, predicate) {
  const teamIds = await managedTeamIds(session);
  const matches = asArray(await apiGet(session, '/team-matches?limit=100', 'team-matches:list:100'));
  const managedMatches = matches.filter((item) => isManagedTeamMatchForAudit(item, teamIds));

  for (const match of managedMatches) {
    const matchId = typeof match?.id === 'string' ? match.id : null;
    if (!matchId) {
      continue;
    }

    try {
      const detail = await apiGet(session, `/team-matches/${matchId}`, `team-match:detail:${matchId}`);
      if (predicate(detail, teamIds)) {
        return `/team-matches/${matchId}`;
      }
    } catch {
      // Keep searching when detail hydration fails.
    }
  }

  return null;
}

async function bootstrapScheduledManagedTeamMatchPath(session) {
  return ensureBootstrapPath(session, 'bootstrap:team-match:scheduled', async () => {
    const memberships = (await managedTeamMemberships(session))
      .filter((membership) => ['owner', 'manager'].includes(String(membership?.role ?? '')));
    const hostMembership = memberships.find((membership) => membership?.team?.id && membership?.team?.sportType);
    const guestMembership = memberships.find((membership) =>
      membership?.team?.id
      && membership?.team?.sportType === hostMembership?.team?.sportType
      && membership.team.id !== hostMembership?.team?.id);

    const hostTeamId = hostMembership?.team?.id ?? hostMembership?.teamId ?? null;
    const guestTeamId = guestMembership?.team?.id ?? guestMembership?.teamId ?? null;
    const sportType = hostMembership?.team?.sportType ?? guestMembership?.team?.sportType ?? 'soccer';

    if (!hostTeamId || !guestTeamId || hostTeamId === guestTeamId) {
      return null;
    }

    requireBootstrapWrites(session, 'scheduled team matches');
    const created = await apiPost(session, '/team-matches', {
      hostTeamId,
      sportType,
      title: 'QA Visual Audit Scheduled Team Match',
      description: 'Bootstrap scheduled team match for visual audit.',
      matchDate: futureDate(9),
      startTime: '20:00',
      endTime: '22:00',
      venueName: 'QA Match Ground',
      venueAddress: 'Seoul QA district',
      totalFee: 80000,
      opponentFee: 40000,
      quarterCount: 4,
      matchStyle: 'friendly',
      allowMercenary: true,
      hasReferee: false,
    });

    const matchId = typeof created?.id === 'string' ? created.id : null;
    if (!matchId) {
      return null;
    }

    const application = await apiPost(session, `/team-matches/${matchId}/apply`, {
      applicantTeamId: guestTeamId,
      confirmedInfo: true,
      confirmedLevel: true,
      message: 'Bootstrap application for visual audit.',
    });
    const applicationId = typeof application?.id === 'string' ? application.id : null;
    if (!applicationId) {
      return `/team-matches/${matchId}`;
    }

    await apiPatch(session, `/team-matches/${matchId}/applications/${applicationId}/approve`);
    return `/team-matches/${matchId}`;
  });
}

async function ensureScheduledManagedTeamMatchPath(session) {
  return ensureBootstrapPath(session, 'bootstrap:team-match:scheduled-path', async () => {
    const existing = await findManagedTeamMatchPath(session, isScheduledAuditTeamMatch);
    if (existing) {
      return existing;
    }

    return bootstrapScheduledManagedTeamMatchPath(session);
  });
}

async function ensureCompletedManagedTeamMatchPath(session) {
  return ensureBootstrapPath(session, 'bootstrap:team-match:completed-path', async () => {
    const existing = await findManagedTeamMatchPath(session, isCompletedAuditTeamMatch);
    if (existing) {
      return existing;
    }

    const scheduledPath = await ensureScheduledManagedTeamMatchPath(session);
    const matchId = typeof scheduledPath === 'string' ? scheduledPath.split('/').at(-1) : null;
    if (!matchId) {
      return null;
    }

    const detail = await apiGet(session, `/team-matches/${matchId}`, `team-match:detail:${matchId}`);
    if (detail?.status !== 'completed') {
      requireBootstrapWrites(session, 'completed team matches');
      const quarterCount = Number.isFinite(detail?.quarterCount) ? Number(detail.quarterCount) : 4;
      const scoreHome = Object.fromEntries(
        Array.from({ length: quarterCount }, (_, index) => [`Q${index + 1}`, 1]),
      );
      const scoreAway = Object.fromEntries(
        Array.from({ length: quarterCount }, (_, index) => [`Q${index + 1}`, 0]),
      );

      await apiPost(session, `/team-matches/${matchId}/result`, {
        scoreHome,
        scoreAway,
        resultHome: 'win',
        resultAway: 'lose',
      });
    }

    return `/team-matches/${matchId}`;
  });
}

function isScoreReadyTeamMatch(match, teamIds) {
  if (!isScheduledAuditTeamMatch(match, teamIds)) {
    return false;
  }

  if (!match?.hostTeam?.id || !resolvedGuestTeam(match)?.id) {
    return false;
  }

  return ['scheduled', 'checking_in', 'in_progress', 'completed'].includes(match?.status);
}

async function ensureHostedMatchPath(session) {
  return ensureBootstrapPath(session, 'bootstrap:match', async () => {
    const userId = await currentUserId(session);
    const matches = asArray(await apiGet(session, '/users/me/matches', 'matches:mine'));
    const existing = matches.find((item) => item?.hostId === userId);
    if (existing?.id) {
      return `/matches/${existing.id}`;
    }

    const venue = await firstVenueForSport(session, 'futsal');
    if (!venue?.id) {
      return null;
    }

    requireBootstrapWrites(session, 'matches');
    const created = await apiPost(session, '/matches', {
      title: 'QA Visual Audit Match',
      description: 'Bootstrap match for visual audit.',
      sportType: 'futsal',
      venueId: venue.id,
      matchDate: futureDate(7),
      startTime: '19:00',
      endTime: '21:00',
      maxPlayers: 10,
      fee: 5000,
      levelMin: 1,
      levelMax: 3,
      gender: 'any',
    });
    return created?.id ? `/matches/${created.id}` : null;
  });
}

async function ensureChatRoomPath(session, sessions) {
  return ensureBootstrapPath(session, 'bootstrap:chat-room', async () => {
    const rooms = asArray(await apiGet(session, '/chat/rooms?limit=30', 'chat:rooms'));
    for (const room of rooms) {
      const roomId = typeof room?.id === 'string' ? room.id : null;
      if (!roomId) {
        continue;
      }

      try {
        await apiGet(session, `/chat/rooms/${roomId}/messages?limit=1`, `chat:room:${roomId}:messages`);
        return `/chat/${roomId}`;
      } catch {
        // Skip stale or inaccessible rooms and keep searching.
      }
    }

    const counterpartSession = await sessions.getSession('admin', 'desktop-md');
    const counterpartId = await currentUserId(counterpartSession);
    if (!counterpartId) {
      return null;
    }

    requireBootstrapWrites(session, 'chat rooms');
    const created = await apiPost(session, '/chat/rooms', {
      type: 'direct',
      participantIds: [counterpartId],
    });
    return created?.id ? `/chat/${created.id}` : null;
  });
}

async function ensureTournamentPath(session) {
  return ensureBootstrapPath(session, 'bootstrap:tournament', async () => {
    const tournaments = asArray(await apiGet(session, '/tournaments?limit=100', 'tournaments:list:100'));
    const existingId = firstIdFromCollection(tournaments);
    if (existingId) {
      return `/tournaments/${existingId}`;
    }

    requireBootstrapWrites(session, 'tournaments');
    const created = await apiPost(session, '/tournaments', {
      sportType: 'soccer',
      title: 'QA Visual Audit Tournament',
      description: 'Bootstrap tournament for visual audit.',
      startDate: futureDate(14),
      endDate: futureDate(14),
      entryFee: 20000,
      maxParticipants: 8,
    });
    return created?.id ? `/tournaments/${created.id}` : null;
  });
}

async function currentUserId(session) {
  const tokenUserId = session.tokens?.user?.id;
  if (typeof tokenUserId === 'string' && tokenUserId.length > 0) {
    return tokenUserId;
  }

  const me = await apiGet(session, '/auth/me', 'auth:me');
  return typeof me?.id === 'string' ? me.id : null;
}

async function managedTeamMemberships(session) {
  const payload = await apiGet(session, '/teams/me', 'teams:me');
  return asArray(payload);
}

async function managedTeamIds(session) {
  const memberships = await managedTeamMemberships(session);
  return memberships
    .filter((membership) => ['owner', 'manager'].includes(String(membership?.role ?? '')))
    .map((membership) => membership?.team?.id ?? membership?.teamId)
    .filter((teamId) => typeof teamId === 'string' && teamId.length > 0);
}

function buildScheduledAt(match) {
  const matchDate = typeof match?.matchDate === 'string' ? match.matchDate : null;
  const startTime = typeof match?.startTime === 'string' ? match.startTime : null;
  if (!matchDate || !startTime) {
    return null;
  }

  const normalizedDate = matchDate.includes('T') ? matchDate.slice(0, 10) : matchDate;
  const normalizedTime = startTime.length >= 8 ? startTime.slice(0, 8) : `${startTime}:00`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || !/^\d{2}:\d{2}(:\d{2})?$/.test(normalizedTime)) {
    return null;
  }

  return `${normalizedDate}T${normalizedTime}`;
}

function refundPercentageForScheduledAt(startAt) {
  if (!startAt) {
    return 0;
  }

  const hoursUntilStart = (new Date(startAt).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntilStart > 24) {
    return 100;
  }
  if (hoursUntilStart > 1) {
    return 50;
  }
  return 0;
}

function isRefundablePaymentForAudit(payment) {
  if (payment?.status !== 'completed') {
    return false;
  }
  if (payment?.pgProvider !== 'mock') {
    return false;
  }

  const match = payment?.participant?.match;
  if (!match?.id) {
    return false;
  }

  return refundPercentageForScheduledAt(buildScheduledAt(match)) > 0;
}

function normalizeApiResolution(result, strategy) {
  if (!result) {
    return null;
  }

  if (typeof result === 'string') {
    return {
      concretePath: result,
      note: `resolved via API strategy ${strategy}`,
    };
  }

  return result;
}

async function resolveViaApiStrategy(route, sessions) {
  const strategy = route.resolver?.apiStrategy;
  if (!strategy) {
    return null;
  }

  const session = await sessions.getSession(route.personaKey, 'desktop-md');

  if (strategy === 'current-user-profile') {
    const userId = await currentUserId(session);
    return userId ? `/user/${userId}` : null;
  }

  if (strategy === 'managed-team-detail' || strategy === 'managed-team-edit') {
    const teamId = (await managedTeamIds(session))[0] ?? null;
    if (!teamId) {
      return null;
    }
    return strategy === 'managed-team-edit' ? `/teams/${teamId}/edit` : `/teams/${teamId}`;
  }

  if (strategy === 'managed-team-matches' || strategy === 'managed-team-members' || strategy === 'managed-team-mercenary') {
    const teamId = (await managedTeamIds(session))[0] ?? null;
    if (!teamId) {
      return null;
    }
    const suffix = {
      'managed-team-matches': '/matches',
      'managed-team-members': '/members',
      'managed-team-mercenary': '/mercenary',
    }[strategy];
    return suffix ? `/teams/${teamId}${suffix}` : null;
  }

  if (strategy === 'hosted-match-edit') {
    const matchPath = await ensureHostedMatchPath(session);
    return matchPath ? `${matchPath}/edit` : null;
  }

  if (strategy === 'owned-lesson-edit') {
    const lessonPath = await ensureOwnedLessonPath(session);
    return lessonPath ? `${lessonPath}/edit` : null;
  }

  if (strategy === 'owned-listing-edit') {
    const listingPath = await ensureOwnedListingPath(session);
    return listingPath ? `${listingPath}/edit` : null;
  }

  if (strategy === 'authored-mercenary-edit') {
    const postPath = await ensureMercenaryPostPath(session);
    return postPath ? `${postPath}/edit` : null;
  }

  if (strategy.startsWith('managed-team-match-')) {
    const matchPath = strategy === 'managed-team-match-score'
      ? await ensureScheduledManagedTeamMatchPath(session)
      : strategy === 'managed-team-match-arrival'
        ? await ensureScheduledManagedTeamMatchPath(session)
        : strategy === 'managed-team-match-evaluate'
          ? await ensureCompletedManagedTeamMatchPath(session)
          : await ensureManagedTeamMatchPath(session);
    if (!matchPath) {
      return null;
    }

    const suffix = {
      'managed-team-match-edit': '/edit',
      'managed-team-match-arrival': '/arrival',
      'managed-team-match-score': '/score',
      'managed-team-match-evaluate': '/evaluate',
    }[strategy];

    return suffix ? `${matchPath}${suffix}` : null;
  }

  if (strategy === 'tournament-detail') {
    return ensureTournamentPath(session);
  }

  if (strategy === 'lesson-ticket-checkout') {
    const userId = await currentUserId(session);
    const lessons = asArray(await apiGet(session, '/lessons?limit=100', 'lessons:list:100'));
    const checkoutLesson = lessons.find((lesson) => {
      const ticketPlans = asArray(lesson?.ticketPlans);
      return lesson?.id && lesson?.hostId !== userId && ticketPlans.some((plan) => plan?.id && plan?.isActive !== false);
    }) ?? null;
    const ticketPlan = asArray(checkoutLesson?.ticketPlans).find((plan) => plan?.id && plan?.isActive !== false) ?? null;

    if (checkoutLesson?.id && ticketPlan?.id) {
      const params = new URLSearchParams({
        source: 'lesson',
        ticketPlanId: ticketPlan.id,
        lessonId: checkoutLesson.id,
        name: `${checkoutLesson.title ?? '강좌'} · ${ticketPlan.name ?? '수강권'}`,
        amount: String(Number.isFinite(ticketPlan.price) ? ticketPlan.price : 0),
        venue: checkoutLesson.venueName ?? checkoutLesson.venue?.name ?? '',
      });

      const scheduledAt = buildScheduledAtForAudit(checkoutLesson.lessonDate, checkoutLesson.startTime);
      if (scheduledAt) {
        params.set('scheduledAt', scheduledAt);
      }

      return `/payments/checkout?${params.toString()}`;
    }

    return null;
  }

  if (strategy === 'payment-refund') {
    const payments = asArray(await apiGet(session, '/payments/me', 'payments:me'));
    const refundable = payments.find((payment) => isRefundablePaymentForAudit(payment)) ?? null;
    if (refundable?.id) {
      return `/payments/${refundable.id}/refund`;
    }

    const fallback = payments.find((payment) => payment?.status === 'completed' && payment?.participant?.match?.id) ?? null;
    if (fallback?.id) {
      return {
        concretePath: `/payments/${fallback.id}/refund`,
        note: 'resolved via API strategy payment-refund (degraded candidate: refund UI may be blocked by payment mode or policy)',
      };
    }

    return null;
  }

  if (strategy === 'chat-room') {
    return ensureChatRoomPath(session, sessions);
  }

  if (strategy === 'venue-detail' || strategy === 'editable-venue-edit') {
    const venues = asArray(await apiGet(session, '/venues', 'venues:list'));
    if (strategy === 'venue-detail') {
      const venueId = firstIdFromCollection(venues);
      return venueId ? `/venues/${venueId}` : null;
    }

    for (const venue of venues.slice(0, 20)) {
      if (typeof venue?.id !== 'string') {
        continue;
      }
      const hub = await apiGet(session, `/venues/${venue.id}/hub`, `venues:hub:${venue.id}`);
      if (hub?.capabilities?.canEditProfile) {
        return `/venues/${venue.id}/edit`;
      }
    }
    return null;
  }

  if (strategy === 'admin-lesson-detail') {
    const lessons = asArray(await apiGet(session, '/admin/lessons', 'admin:lessons'));
    const lessonId = firstIdFromCollection(lessons);
    return lessonId ? `/admin/lessons/${lessonId}` : null;
  }

  if (strategy === 'admin-team-detail') {
    const teams = asArray(await apiGet(session, '/admin/teams', 'admin:teams'));
    const teamId = firstIdFromCollection(teams);
    return teamId ? `/admin/teams/${teamId}` : null;
  }

  return null;
}

function mobileContextOptions(viewportKey) {
  const viewport = VIEWPORT_MATRIX[viewportKey];
  if (!viewport) {
    throw new Error(`Unknown viewport key: ${viewportKey}`);
  }

  return {
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
  };
}

class SessionManager {
  constructor(browser, options = {}) {
    this.browser = browser;
    this.cache = new Map();
    this.allowBootstrapWrites = Boolean(options.allowBootstrapWrites);
    this.maxConcurrentContexts = typeof options.maxConcurrentContexts === 'number'
      ? Math.max(1, options.maxConcurrentContexts)
      : 3;
  }

  async getSession(personaKey, viewportKey) {
    const cacheKey = `${personaKey}:${viewportKey}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const persona = PERSONA_MATRIX[personaKey];
    if (!persona) {
      throw new Error(`Unknown persona: ${personaKey}`);
    }

    if (this.cache.size >= this.maxConcurrentContexts) {
      const evictKey = this.cache.keys().next().value;
      const evictSession = this.cache.get(evictKey);
      await evictSession.context.close().catch(() => {});
      this.cache.delete(evictKey);
    }

    const context = await this.browser.newContext(mobileContextOptions(viewportKey));
    const page = await context.newPage();
    const logs = { console: [], network: [] };

    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        logs.console.push(`[${message.type()}] ${message.text()}`);
      }
    });
    page.on('requestfailed', (request) => {
      logs.network.push({
        type: 'requestfailed',
        method: request.method(),
        url: request.url(),
        resourceType: request.resourceType(),
        failure: request.failure()?.errorText ?? 'request failed',
      });
    });
    page.on('response', (response) => {
      if (response.status() < 400) {
        return;
      }
      logs.network.push({
        type: 'response',
        method: response.request().method(),
        url: response.url(),
        resourceType: response.request().resourceType(),
        status: response.status(),
      });
    });
    page.on('pageerror', (error) => {
      logs.console.push(`[pageerror] ${error.message}`);
    });

    await page.goto(`${WEB_BASE}${persona.warmupPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT,
    }).catch((error) => {
      logs.console.push(`[warmup] initial navigation failed: ${error instanceof Error ? error.message : String(error)}`);
    });

    if (persona.nickname) {
      const tokens = await loginViaApi(persona.nickname);
      await injectTokens(page, tokens);
      await page.goto(`${WEB_BASE}${persona.warmupPath}`, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT,
      });
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch((error) => {
        logs.console.push(`[warmup] networkidle timeout: ${error instanceof Error ? error.message : String(error)}`);
      });
      context.__visualAuditTokens = tokens;
    }

    const session = {
      context,
      page,
      logs,
      personaKey,
      viewportKey,
      tokens: context.__visualAuditTokens ?? null,
      apiCache: new Map(),
      allowBootstrapWrites: this.allowBootstrapWrites,
    };
    this.cache.set(cacheKey, session);
    return session;
  }

  async closeViewport(viewportKey) {
    const entries = [...this.cache.entries()].filter(([, session]) => session.viewportKey === viewportKey);
    await Promise.all(entries.map(([, session]) => session.context.close()));
    for (const [cacheKey] of entries) {
      this.cache.delete(cacheKey);
    }
  }

  async closeAll() {
    await Promise.all([...this.cache.values()].map((session) => session.context.close()));
  }
}

async function waitForRouteReady(page, route, concretePath) {
  await page.goto(`${WEB_BASE}${concretePath}`, {
    waitUntil: 'domcontentloaded',
    timeout: NAVIGATION_TIMEOUT,
  });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

  const readyContract = route.readyContract ?? {
    anySelectors: ['main h1', 'main h2', 'main form'],
    contentSelectors: ['main a[href]', 'main button', 'main section', 'main article'],
  };
  const selectorTimeoutMs = readyContract.selectorTimeoutMs ?? READY_TIMEOUT;
  const transientTimeoutMs = readyContract.transientTimeoutMs ?? 20_000;
  const readySelector = await waitForVisibleSelector(page, readyContract.anySelectors ?? [], selectorTimeoutMs);
  if (!readySelector) {
    throw new Error(`ready selector not found for ${route.template}`);
  }

  const transientSelectors = [
    '.skeleton-shimmer',
    '[class*="animate-pulse"]',
    '[data-testid*="skeleton"]',
  ];

  for (const selector of transientSelectors) {
    const transient = page.locator(selector).first();
    if (await transient.count().catch(() => 0)) {
      await transient.waitFor({ state: 'hidden', timeout: transientTimeoutMs }).catch(() => {});
    }
  }

  if (Array.isArray(readyContract.contentSelectors) && readyContract.contentSelectors.length > 0) {
    const contentSelector = await waitForVisibleSelector(page, readyContract.contentSelectors, selectorTimeoutMs);
    if (!contentSelector) {
      throw new Error(`content selector not found for ${route.template}`);
    }
  }

  await page.waitForTimeout(readyContract.postReadyDelayMs ?? 600);
}

async function waitForVisibleSelector(page, selectors, timeout = READY_TIMEOUT) {
  const candidates = selectors.filter(Boolean);
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const selector of candidates) {
      const locator = page.locator(selector);
      const count = await locator.count().catch(() => 0);

      if (count > 0) {
        const hasVisibleMatch = await locator.evaluateAll((elements) =>
          elements.some((element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              style.opacity !== '0'
            );
          }),
        ).catch(() => false);

        if (hasVisibleMatch) {
          return selector;
        }
      } else {
        try {
          await locator.first().waitFor({
            state: 'attached',
            timeout: Math.min(400, Math.max(50, deadline - Date.now())),
          });
        } catch {
          // Continue polling other candidates until the deadline.
        }
      }

      try {
        await locator.first().waitFor({
          state: 'visible',
          timeout: Math.min(200, Math.max(50, deadline - Date.now())),
        });
        return selector;
      } catch {
        // Continue polling other candidates until the deadline.
      }
    }

    await page.waitForTimeout(200);
  }

  return null;
}

async function visibleLocator(page, selectors) {
  const locators = await visibleLocators(page, selectors);
  return locators[0] ?? null;
}

async function visibleLocators(page, selectors, maxCount = 24) {
  const matches = [];
  for (const selector of selectors.filter(Boolean)) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < Math.min(count, maxCount); index += 1) {
      const candidate = locator.nth(index);
      const isVisible = await candidate.isVisible().catch(() => false);
      if (isVisible) {
        matches.push(candidate);
      }
    }
  }
  return matches;
}

async function extractFirstMatchingHref(page, pattern) {
  const matcher = new RegExp(pattern);
  const locators = await visibleLocators(page, ['main a[href]', 'a[href]'], 150);
  const seen = new Set();

  for (const locator of locators) {
    const href = await locator.getAttribute('href').catch(() => null);
    if (typeof href !== 'string' || !href.startsWith('/') || seen.has(href)) {
      continue;
    }
    seen.add(href);
    if (matcher.test(href)) {
      return href;
    }
  }

  return null;
}

async function captureLocatorSnapshot(locator) {
  return {
    ariaExpanded: await locator.getAttribute('aria-expanded').catch(() => null),
    ariaPressed: await locator.getAttribute('aria-pressed').catch(() => null),
    ariaSelected: await locator.getAttribute('aria-selected').catch(() => null),
    ariaLabel: await locator.getAttribute('aria-label').catch(() => null),
    dataState: await locator.getAttribute('data-state').catch(() => null),
  };
}

function didAttributeChange(beforeValue, afterValue) {
  if (beforeValue == null && afterValue == null) {
    return false;
  }
  return beforeValue !== afterValue;
}

async function hasVisibleSelector(page, selectors) {
  return (await waitForVisibleSelector(page, selectors, 600)) !== null;
}

async function assertStateApplied(page, route, stateKey, context) {
  const assertions = route.stateAssertions?.[stateKey];
  if (!assertions) {
    return true;
  }

  const checks = [];

  if (assertions.requireTargetSelected && context.target) {
    const selected = await context.target.getAttribute('aria-selected').catch(() => null);
    const dataState = await context.target.getAttribute('data-state').catch(() => null);
    checks.push(selected === 'true' || dataState === 'active');
  }

  if (assertions.requireTriggerAttributeChange?.length && context.trigger && context.beforeTriggerSnapshot) {
    const afterSnapshot = await captureLocatorSnapshot(context.trigger);
    for (const attributeName of assertions.requireTriggerAttributeChange) {
      const key = attributeName === 'aria-expanded'
        ? 'ariaExpanded'
        : attributeName === 'aria-pressed'
          ? 'ariaPressed'
          : attributeName === 'aria-selected'
            ? 'ariaSelected'
            : attributeName === 'aria-label'
              ? 'ariaLabel'
              : attributeName === 'data-state'
                ? 'dataState'
                : null;
      if (!key) {
        continue;
      }
      checks.push(didAttributeChange(context.beforeTriggerSnapshot[key], afterSnapshot[key]));
    }
  }

  if (Array.isArray(assertions.anyVisibleSelectors) && assertions.anyVisibleSelectors.length > 0) {
    checks.push(await hasVisibleSelector(page, assertions.anyVisibleSelectors));
  }

  return checks.length === 0 ? true : checks.some(Boolean);
}

async function resolveDynamicRoute(route, routesByTemplate, resolvedByTemplate, sessions) {
  if (!route.resolver) {
    return { resolved: false, concretePath: null, note: 'no resolver configured' };
  }

  let unresolvedBaseNote = null;
  if (route.resolver.baseTemplate) {
    const baseResolved = resolvedByTemplate.get(route.resolver.baseTemplate);
    if (baseResolved?.concretePath) {
      return {
        resolved: true,
        concretePath: `${baseResolved.concretePath}${route.resolver.append}`,
        note: `derived from ${route.resolver.baseTemplate}`,
      };
    }
    unresolvedBaseNote = `base template unresolved: ${route.resolver.baseTemplate}`;
  }

  const sourceTemplates = route.resolver.sourceTemplates ?? [];
  let lastApiError = null;
  let lastSourceError = null;

  if (route.resolver.apiStrategy) {
    const apiResolution = await resolveViaApiStrategy(route, sessions).catch((error) => {
      lastApiError = error instanceof Error ? error.message : String(error);
      return null;
    });
    const normalizedApiResolution = normalizeApiResolution(apiResolution, route.resolver.apiStrategy);
    if (normalizedApiResolution?.concretePath) {
      return {
        resolved: true,
        concretePath: normalizedApiResolution.concretePath,
        note: normalizedApiResolution.note,
      };
    }
  }

  for (const sourceTemplate of sourceTemplates) {
    const sourceRoute = routesByTemplate.get(sourceTemplate) ?? {
      template: sourceTemplate,
      readyContract: {
        anySelectors: ['main h1', 'main h2', 'main form'],
        contentSelectors: ['main a[href]', 'main button', 'main section', 'main article'],
      },
      personaKey: route.personaKey,
    };
    const sourceResolved = resolvedByTemplate.get(sourceTemplate) ?? { concretePath: sourceTemplate };
    if (!sourceResolved?.concretePath) {
      continue;
    }

    const session = await sessions.getSession(route.personaKey, 'desktop-md');
    try {
      await waitForRouteReady(session.page, sourceRoute, sourceResolved.concretePath);
      const href = await extractFirstMatchingHref(session.page, route.resolver.pattern);
      if (href) {
        return {
          resolved: true,
          concretePath: href,
          note: `resolved from ${sourceTemplate}`,
        };
      }
    } catch (error) {
      lastSourceError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    resolved: false,
    concretePath: null,
    note: lastApiError
      ? `api strategy failed: ${lastApiError}`
      : lastSourceError
        ? `source route resolution failed: ${lastSourceError}`
        : unresolvedBaseNote ?? 'no matching visible href found on source routes',
  };
}

async function buildManifest(options) {
  let catalog = buildRouteCatalog(REPO_ROOT);
  catalog = filterCatalogByBatch(catalog, options.batch);
  if (options.family) {
    catalog = catalog.filter((route) => route.family === options.family);
  }
  if (options.route) {
    catalog = catalog.filter((route) => route.template === options.route);
  }
  if (options.limit) {
    catalog = catalog.slice(0, options.limit);
  }

  const browser = await chromium.launch({ headless: !options.headed });
  const sessions = new SessionManager(browser, { allowBootstrapWrites: options.allowBootstrapWrites });
  const routesByTemplate = new Map(catalog.map((route) => [route.template, route]));
  const resolvedByTemplate = new Map();
  const entryByTemplate = new Map();
  const metadata = {
    command: 'manifest',
    runId: options.runId,
    gitSha: CURRENT_GIT_SHA,
    baselineCommit: VISUAL_AUDIT_BASELINE_COMMIT,
    baselineDate: VISUAL_AUDIT_BASELINE_DATE,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'in_progress',
    failureReason: null,
    webBase: WEB_BASE,
    apiBase: API_BASE,
    filters: {
      batch: options.batch,
      family: options.family,
      route: options.route,
      limit: options.limit,
      allowBootstrapWrites: options.allowBootstrapWrites,
    },
    viewportKeys: Object.keys(VIEWPORT_MATRIX),
    personaKeys: Object.keys(PERSONA_MATRIX),
  };
  activateRunContext({
    metadata,
    flush: () => {
      const routes = catalog.map((item) => entryByTemplate.get(item.template)).filter(Boolean);
      flushManifestArtifacts(options.runId, routes, metadata);
    },
  });

  try {
    const staticRoutes = catalog.filter((route) => !route.isDynamic);
    for (let index = 0; index < staticRoutes.length; index += 1) {
      const route = staticRoutes[index];
      const entry = {
        ...route,
        warmupPath: PERSONA_MATRIX[route.personaKey]?.warmupPath ?? null,
        concretePath: route.template,
        resolved: true,
        resolutionNote: 'static route',
      };
      resolvedByTemplate.set(route.template, entry);
      entryByTemplate.set(route.template, entry);
      flushManifestArtifacts(options.runId, catalog.map((item) => entryByTemplate.get(item.template)).filter(Boolean), metadata);
    }

    const dynamicRoutes = catalog.filter((route) => route.isDynamic);
    const unresolvedTemplates = new Set(dynamicRoutes.map((route) => route.template));
    let pass = 0;

    while (unresolvedTemplates.size > 0 && pass < dynamicRoutes.length) {
      pass += 1;
      let resolvedThisPass = 0;

      for (const route of dynamicRoutes) {
        if (!unresolvedTemplates.has(route.template)) {
          continue;
        }

        console.log(`[manifest pass ${pass} ${catalog.length - unresolvedTemplates.size + 1}/${catalog.length}] ${route.template}`);
        const resolution = await resolveDynamicRoute(route, routesByTemplate, resolvedByTemplate, sessions);
        const entry = {
          ...route,
          warmupPath: PERSONA_MATRIX[route.personaKey]?.warmupPath ?? null,
          concretePath: resolution.concretePath,
          resolved: resolution.resolved,
          resolutionNote: resolution.note,
        };

        entryByTemplate.set(route.template, entry);
        if (entry.resolved) {
          resolvedByTemplate.set(route.template, entry);
          unresolvedTemplates.delete(route.template);
          resolvedThisPass += 1;
        }

        flushManifestArtifacts(options.runId, catalog.map((item) => entryByTemplate.get(item.template)).filter(Boolean), metadata);
        console.log(`  -> ${entry.resolved ? entry.concretePath : 'blocked'} (${entry.resolutionNote})`);
      }

      if (resolvedThisPass === 0) {
        break;
      }
    }
    finalizeMetadata(metadata, 'completed');
  } finally {
    await sessions.closeAll();
    await browser.close();
  }

  const resolvedRoutes = catalog.map((route) => entryByTemplate.get(route.template) ?? {
    ...route,
    warmupPath: PERSONA_MATRIX[route.personaKey]?.warmupPath ?? null,
    concretePath: null,
    resolved: false,
    resolutionNote: 'resolution exhausted',
  });
  const summary = summarizeManifestRoutes(resolvedRoutes);
  flushManifestArtifacts(options.runId, resolvedRoutes, metadata);
  clearActiveRunContext();

  console.log(`Manifest written to ${path.join(runDir(options.runId), 'route-manifest.json')}`);
  console.log(`Resolved ${summary.resolvedCount}/${summary.routeCount} routes`);
}

async function applyState(page, route, stateKey, viewportKey) {
  const selectors = route.interactionSelectors ?? {
    menuOpen: [],
    primaryCta: [],
    firstCard: [],
    firstInput: [],
    filterToggle: [],
    tabTrigger: [],
    dialogTrigger: [],
    drawerTrigger: [],
  };

  if (stateKey === 'default') {
    return { status: 'captured', note: 'default state' };
  }

  if (stateKey === 'scrolled') {
    const scrolled = await page.evaluate(() => {
      if (document.documentElement.scrollHeight <= window.innerHeight + 80) {
        return false;
      }
      window.scrollTo({ top: Math.min(window.innerHeight * 0.75, document.documentElement.scrollHeight), behavior: 'instant' });
      return true;
    });
    await page.waitForTimeout(250);
    return scrolled ? { status: 'captured', note: 'scrolled' } : { status: 'expected-na', note: 'page is not scrollable' };
  }

  if (stateKey === 'focus-first-input') {
    const locator = await visibleLocator(page, selectors.firstInput.length > 0 ? selectors.firstInput : ['input', 'textarea', 'select']);
    if (!locator) return { status: 'expected-na', note: 'no input available' };
    await locator.focus();
    await page.waitForTimeout(200);
    return { status: 'captured', note: 'focused first input' };
  }

  if (stateKey === 'hover-primary-cta') {
    if (!POINTER_VIEWPORT_KEYS.has(viewportKey)) {
      return { status: 'expected-na', note: 'hover state is desktop-only' };
    }
    const locator = await visibleLocator(page, selectors.primaryCta.length > 0 ? selectors.primaryCta : ['a[href]', 'button']);
    if (!locator) return { status: 'expected-na', note: 'no CTA found' };
    await locator.hover();
    await page.waitForTimeout(200);
    return { status: 'captured', note: 'hovered primary CTA' };
  }

  if (stateKey === 'hover-card-first') {
    if (!POINTER_VIEWPORT_KEYS.has(viewportKey)) {
      return { status: 'expected-na', note: 'hover state is desktop-only' };
    }
    const locator = await visibleLocator(page, selectors.firstCard.length > 0 ? selectors.firstCard : ['a[href]']);
    if (!locator) return { status: 'expected-na', note: 'no card-like link found' };
    await locator.hover();
    await page.waitForTimeout(200);
    return { status: 'captured', note: 'hovered first card' };
  }

  if (stateKey === 'menu-open') {
    const menuSelectors = selectors.menuOpen.length > 0
      ? selectors.menuOpen
      : ['button[aria-label*="메뉴"]', 'button[aria-label*="menu"]', '[data-testid*="menu-toggle"]', 'button[aria-label*="Menu"]'];
    const locator = await visibleLocator(page, menuSelectors);
    if (!locator) return { status: 'expected-na', note: 'no menu trigger found' };
    const beforeTriggerSnapshot = await captureLocatorSnapshot(locator);
    await locator.click();
    await page.waitForTimeout(500);
    if (!await assertStateApplied(page, route, stateKey, { trigger: locator, beforeTriggerSnapshot })) {
      throw new Error('menu did not enter open state');
    }
    return { status: 'captured', note: 'opened menu' };
  }

  if (stateKey === 'filter-open') {
    const filterSelectors = selectors.filterToggle.length > 0
      ? selectors.filterToggle
      : ['[data-testid*="filter-toggle"]', 'button[aria-label*="필터"]', 'button[aria-pressed][aria-label]'];
    const locator = await visibleLocator(page, filterSelectors);
    if (!locator) return { status: 'expected-na', note: 'no filter trigger found' };
    const beforeTriggerSnapshot = await captureLocatorSnapshot(locator);
    await locator.click();
    await page.waitForTimeout(500);
    if (!await assertStateApplied(page, route, stateKey, { trigger: locator, beforeTriggerSnapshot })) {
      throw new Error('filter did not enter open state');
    }
    return { status: 'captured', note: 'opened filter' };
  }

  if (stateKey === 'tab-switch') {
    const locators = await visibleLocators(page, selectors.tabTrigger.length > 0 ? selectors.tabTrigger : ['[role="tab"]']);
    if (locators.length < 2) return { status: 'expected-na', note: 'not enough visible tabs' };

    let target = null;
    for (const locator of locators) {
      const selected = await locator.getAttribute('aria-selected').catch(() => null);
      if (selected !== 'true') {
        target = locator;
        break;
      }
    }

    target ??= locators[1];
    const beforeTriggerSnapshot = await captureLocatorSnapshot(target);
    await target.click();
    await page.waitForTimeout(400);
    if (!await assertStateApplied(page, route, stateKey, {
      trigger: target,
      target,
      beforeTriggerSnapshot,
    })) {
      throw new Error('tab selection did not change');
    }
    return { status: 'captured', note: 'switched tab' };
  }

  if (stateKey === 'dialog-open') {
    const locator = await visibleLocator(page, selectors.dialogTrigger.length > 0 ? selectors.dialogTrigger : ['[aria-haspopup="dialog"]']);
    if (!locator) return { status: 'expected-na', note: 'no dialog trigger found' };
    const beforeTriggerSnapshot = await captureLocatorSnapshot(locator);
    await locator.click();
    await page.waitForTimeout(500);
    if (!await assertStateApplied(page, route, stateKey, { trigger: locator, beforeTriggerSnapshot })) {
      throw new Error('dialog did not enter open state');
    }
    return { status: 'captured', note: 'opened dialog' };
  }

  if (stateKey === 'drawer-open') {
    const locator = await visibleLocator(page, selectors.drawerTrigger.length > 0 ? selectors.drawerTrigger : ['[data-testid*="drawer-trigger"]', '[aria-controls*="drawer"]']);
    if (!locator) return { status: 'expected-na', note: 'no drawer trigger found' };
    const beforeTriggerSnapshot = await captureLocatorSnapshot(locator);
    await locator.click();
    await page.waitForTimeout(500);
    if (!await assertStateApplied(page, route, stateKey, { trigger: locator, beforeTriggerSnapshot })) {
      throw new Error('drawer did not enter open state');
    }
    return { status: 'captured', note: 'opened drawer' };
  }

  return { status: 'expected-na', note: `unsupported state: ${stateKey}` };
}

const PERSISTENT_UI_STATE_KEYS = new Set([
  'menu-open',
  'filter-open',
  'dialog-open',
  'drawer-open',
]);

const STATE_CAPTURE_PRIORITY = new Map([
  ['default', 0],
  ['focus-first-input', 1],
  ['hover-primary-cta', 2],
  ['hover-card-first', 3],
  ['tab-switch', 4],
  ['scrolled', 5],
  ['menu-open', 6],
  ['filter-open', 7],
  ['dialog-open', 8],
  ['drawer-open', 9],
]);

function orderedStateKeysForCapture(stateKeys) {
  return [...stateKeys].sort((left, right) => {
    const leftPriority = STATE_CAPTURE_PRIORITY.get(left) ?? 99;
    const rightPriority = STATE_CAPTURE_PRIORITY.get(right) ?? 99;
    return leftPriority - rightPriority || left.localeCompare(right);
  });
}

function routeArtifactDir(runId, route, viewportKey) {
  return path.join(runDir(runId), 'screenshots', route.family, route.slug, viewportKey);
}

function routeLogPath(runId, route, viewportKey, stateKey) {
  return path.join(runDir(runId), 'console', route.family, `${route.slug}__${viewportKey}__${stateKey}.log`);
}

function routeNetworkPath(runId, route, viewportKey, stateKey) {
  return path.join(runDir(runId), 'network', route.family, `${route.slug}__${viewportKey}__${stateKey}.json`);
}

function issueLogPath(runId, family) {
  return path.join(runDir(runId), 'issues', `${family}.md`);
}

function checkpointPath(runId, family) {
  return path.join(runDir(runId), 'checkpoints', `${family}.json`);
}

async function captureArtifacts(options) {
  const manifestFile = path.join(runDir(options.runId), 'route-manifest.json');
  if (!fs.existsSync(manifestFile)) {
    await buildManifest(options);
  }

  const manifest = readJson(manifestFile);
  const previousCaptureFile = path.join(runDir(options.runId), 'capture-results.json');
  const isRerunBatch = options.batch === 'batch-8-rerun';

  if (!isRerunBatch) {
    prepareCaptureArtifacts(options.runId);
  }

  let routes = options.includeBlocked
    ? manifest.routes.slice()
    : manifest.routes.filter((route) => route.resolved);

  if (isRerunBatch) {
    if (fs.existsSync(previousCaptureFile)) {
      const previousCaptureResults = readJson(previousCaptureFile);
      const blockedTemplates = new Set(
        previousCaptureResults
          .filter((result) => result.status === 'blocked')
          .map((result) => result.template),
      );
      routes = routes.filter((route) => blockedTemplates.has(route.template));
    } else {
      throw new Error('batch-8-rerun requires an existing capture-results.json for the same run-id');
    }
  } else if (options.batch) {
    routes = filterCatalogByBatch(routes, options.batch);
  }
  if (options.family) {
    routes = routes.filter((route) => route.family === options.family);
  }
  if (options.route) {
    routes = routes.filter((route) => route.template === options.route);
  }
  if (options.limit) {
    routes = routes.slice(0, options.limit);
  }

  if (routes.length === 0) {
    throw new Error('no routes selected for capture');
  }
  const browser = await chromium.launch({ headless: !options.headed });
  const sessions = new SessionManager(browser, {
    allowBootstrapWrites: options.allowBootstrapWrites,
    maxConcurrentContexts: options.maxConcurrentContexts,
  });
  const captureResults = [];
  const issueByFamily = new Map();
  const metadata = {
    command: 'capture',
    runId: options.runId,
    gitSha: CURRENT_GIT_SHA,
    baselineCommit: VISUAL_AUDIT_BASELINE_COMMIT,
    baselineDate: VISUAL_AUDIT_BASELINE_DATE,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'in_progress',
    failureReason: null,
    webBase: WEB_BASE,
    apiBase: API_BASE,
    filters: {
      batch: options.batch,
      family: options.family,
      route: options.route,
      limit: options.limit,
      includeBlocked: options.includeBlocked,
      allowBootstrapWrites: options.allowBootstrapWrites,
    },
    viewportKeys: options.viewports,
    stateKeys: options.states,
    routeCount: routes.length,
  };
  activateRunContext({
    metadata,
    flush: () => flushCaptureArtifacts(options, routes, captureResults, issueByFamily, metadata),
  });

  if (options.allowBootstrapWrites && isLocalApiBase()) {
    await runInfrastructureBootstrap(sessions, API_BASE);
  }

  const totalStates = options.viewports.reduce((count, viewportKey) => {
    if (!VIEWPORT_MATRIX[viewportKey]) {
      return count;
    }

    return count + routes.reduce((routeCount, route) => {
      const stateKeys = options.states ?? route.supportedStates ?? ['default'];
      return routeCount + (route.resolved && route.concretePath ? stateKeys.length : 1);
    }, 0);
  }, 0);
  let completedStates = 0;

  try {
    for (const viewportKey of options.viewports) {
      if (!VIEWPORT_MATRIX[viewportKey]) {
        throw new Error(`Unknown viewport key: ${viewportKey}`);
      }

      for (const route of routes) {
        if (!route.resolved || !route.concretePath) {
          completedStates += 1;
          console.log(`[capture ${completedStates}/${totalStates}] ${viewportKey} ${route.template} default`);
          captureResults.push({
            template: route.template,
            concretePath: null,
            personaKey: route.personaKey,
            family: route.family,
            batch: route.batch,
            viewportKey,
            stateKey: 'default',
            status: 'blocked',
            note: route.resolutionNote ?? 'route unresolved in manifest',
            screenshotPath: null,
          });
          const issues = issueByFamily.get(route.family) ?? [];
          issues.push(`- \`${route.template}\` [${viewportKey}/default] ${route.resolutionNote ?? 'route unresolved in manifest'}`);
          issueByFamily.set(route.family, issues);
          console.log(`  -> blocked (${route.resolutionNote ?? 'route unresolved in manifest'})`);
          flushCaptureArtifacts(options, routes, captureResults, issueByFamily, metadata);
          continue;
        }

        const session = await sessions.getSession(route.personaKey, viewportKey);
        const stateKeys = orderedStateKeysForCapture(options.states ?? route.supportedStates ?? ['default']);
        let hasLoadedBaseline = false;

        for (const stateKey of stateKeys) {
          completedStates += 1;
          console.log(`[capture ${completedStates}/${totalStates}] ${viewportKey} ${route.template} ${stateKey}`);
          session.logs.console.length = 0;
          session.logs.network.length = 0;

          try {
            if (!hasLoadedBaseline || PERSISTENT_UI_STATE_KEYS.has(stateKey)) {
              await waitForRouteReady(session.page, route, route.concretePath);
              hasLoadedBaseline = true;
            }
            const outcome = await applyState(session.page, route, stateKey, viewportKey);

            const artifactDir = routeArtifactDir(options.runId, route, viewportKey);
            const screenshotPath = path.join(artifactDir, `${stateKey}.png`);

            if (outcome.status === 'captured') {
              ensureDir(artifactDir);
              await session.page.screenshot({ path: screenshotPath, fullPage: true });
            }

            captureResults.push({
              template: route.template,
              concretePath: route.concretePath,
              personaKey: route.personaKey,
              family: route.family,
              batch: route.batch,
              viewportKey,
              stateKey,
              status: outcome.status,
              note: outcome.note,
              screenshotPath: outcome.status === 'captured' ? screenshotPath : null,
            });
            console.log(`  -> ${outcome.status} (${outcome.note})`);
            if (PERSISTENT_UI_STATE_KEYS.has(stateKey)) {
              hasLoadedBaseline = false;
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            captureResults.push({
              template: route.template,
              concretePath: route.concretePath,
              personaKey: route.personaKey,
              family: route.family,
              batch: route.batch,
              viewportKey,
              stateKey,
              status: 'blocked',
              note: message,
              screenshotPath: null,
            });
            const issues = issueByFamily.get(route.family) ?? [];
            issues.push(`- \`${route.template}\` [${viewportKey}/${stateKey}] ${message}`);
            issueByFamily.set(route.family, issues);
            console.log(`  -> blocked (${message})`);
            hasLoadedBaseline = false;
          } finally {
            writeText(routeLogPath(options.runId, route, viewportKey, stateKey), session.logs.console.join('\n'));
            writeJson(routeNetworkPath(options.runId, route, viewportKey, stateKey), session.logs.network);
            flushCaptureArtifacts(options, routes, captureResults, issueByFamily, metadata);
          }
        }
      }

      await sessions.closeViewport(viewportKey);
    }
    finalizeMetadata(metadata, 'completed');
  } finally {
    await sessions.closeAll();
    await browser.close();
  }

  flushCaptureArtifacts(options, routes, captureResults, issueByFamily, metadata);
  clearActiveRunContext();
  const summary = summarizeCaptureResults(options, routes, captureResults);
  console.log(`Capture results written to ${path.join(runDir(options.runId), 'capture-results.json')}`);
  console.log(`Captured ${summary.captured} states, blocked ${summary.blocked}, expected N/A ${summary.expectedNa}`);
}

async function main() {
  const { command, options } = parseArgs(process.argv);
  ensureDir(runDir(options.runId));

  if (options.allowBootstrapWrites && !isLocalApiBase()) {
    throw new Error('--allow-bootstrap-writes is restricted to localhost API targets');
  }

  const releaseRunLock = claimRunLock(options.runId, command);
  try {
    if (command === 'manifest') {
      await buildManifest(options);
      return;
    }

    if (command === 'capture') {
      await captureArtifacts(options);
    }
  } finally {
    releaseRunLock();
  }
}

main().catch((error) => {
  failActiveRun(error instanceof Error ? error.message : String(error));
  clearActiveRunContext();
  console.error(error);
  process.exit(1);
});
