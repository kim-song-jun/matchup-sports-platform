#!/usr/bin/env node
/**
 * Persistent E2E screenshot analyzer queue.
 * Scans screenshot roots, groups feature-level image sets, persists queue state,
 * and can optionally dispatch Codex for sub-agent analysis plus agent-all remediation.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  E2E_ANALYZER_VIEWPORT_CODES,
  E2E_ANALYZER_VIEWPORT_MAP,
  E2E_ANALYZER_VIEWPORT_ORDER,
  normalizeViewportCode,
  parseViewportTokenFromName,
  sortViewportCodes,
  stripViewportToken,
  viewportLabel,
} from './e2e-analyzer-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const DEFAULT_INPUT_ROOT = path.join(REPO_ROOT, 'tests', 'ui-scenarios', 'screenshots');
const DEFAULT_QUEUE_ROOT = path.join(REPO_ROOT, 'ultraplan', 'runs', 'e2e-analyzer');
const RESULT_SCHEMA_PATH = path.join(REPO_ROOT, 'scripts', 'qa', 'e2e-analyzer-result.schema.json');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const IGNORED_BASENAMES = new Set(['.DS_Store', '.watch-state.json', 'manifest.log']);
const QUEUE_STATUSES = ['pending', 'running', 'completed', 'failed', 'staged'];
const DEFAULT_MODEL = 'gpt-5.4';
const DEFAULT_REASONING_EFFORT = 'high';
const DEFAULT_POLL_SECONDS = 120;
const DEFAULT_MAX_DISPATCH = 1;
const DEFAULT_MAX_IMAGES = 16;
const DEFAULT_CODEX_TIMEOUT_SECONDS = 900;
const DEFAULT_INCOMPLETE_WINDOW_SECONDS = 300;
const DEFAULT_COMMIT_LABEL = 'codex';

function usage(exitCode = 1) {
  console.error(`Usage:
  node scripts/qa/run-e2e-analyzer.mjs status [options]
  node scripts/qa/run-e2e-analyzer.mjs scan [options]
  node scripts/qa/run-e2e-analyzer.mjs dispatch [options]
  node scripts/qa/run-e2e-analyzer.mjs tick [options]
  node scripts/qa/run-e2e-analyzer.mjs watch [options]

Options:
  --input-root <path>              Screenshot root (default: tests/ui-scenarios/screenshots)
  --queue-root <path>              Queue root (default: ultraplan/runs/e2e-analyzer)
  --strategy <auto|filename|scenario-folder>
  --expected-viewports <csv>       Expected viewport codes (default: MS,MM,ML,TS,TM,TL,DS,DM,DL,DXL,DXXL)
  --include-incomplete             Queue sets even if viewport coverage is incomplete
  --include-unknown                Include input paths under unknown/
  --set-id <id>                    Restrict dispatch/status output to one set id
  --run-codex                      Dispatch pending sets via codex exec
  --codex-mode <agent-all|analyze-only>
  --dispatch-incomplete            Queue recently changed incomplete sets immediately
  --incomplete-window-seconds <n>  Recent-change window for incomplete dispatch (default: 300)
  --auto-commit                    Commit successful UI fixes per feature set
  --commit-label <label>           Commit label token (default: codex)
  --model <name>                   Codex model (default: gpt-5.4)
  --reasoning-effort <level>       Codex reasoning effort (default: high)
  --codex-timeout-seconds <n>      Kill hanging codex exec runs after N seconds (default: 900)
  --poll-seconds <n>               Watch loop interval (default: 120)
  --max-dispatch <n>               Max sets to dispatch per tick (default: 1)
  --max-images <n>                 Refuse auto-dispatch above this image count (default: 16)
  --dry-run                        Do not mutate queue state or run Codex
`);
  process.exit(exitCode);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function removePath(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function relativeRepoPath(filePath) {
  return path.relative(REPO_ROOT, filePath);
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'set';
}

function isoTimestamp() {
  return new Date().toISOString();
}

function yyyymmddStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function createFingerprint(payload) {
  return createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleepSeconds(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

function normalizeRepoFilePath(filePath) {
  if (!filePath) {
    return null;
  }

  const absolutePath = path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.normalize(path.join(REPO_ROOT, filePath));

  if (!absolutePath.startsWith(REPO_ROOT)) {
    return null;
  }

  return path.relative(REPO_ROOT, absolutePath);
}

function gitCapture(args) {
  const result = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} exited with code ${result.status ?? 1}`);
  }

  return result.stdout ?? '';
}

function snapshotDirtyFiles() {
  const output = gitCapture(['status', '--short', '--untracked-files=all']);
  const files = new Set();

  for (const line of output.split('\n').filter(Boolean)) {
    const rawPath = line.slice(3).trim();
    if (!rawPath) {
      continue;
    }

    if (rawPath.includes(' -> ')) {
      files.add(rawPath.split(' -> ').at(-1));
      continue;
    }

    files.add(rawPath);
  }

  return files;
}

function hasTrackedOrUntrackedChanges(paths) {
  if (paths.length === 0) {
    return false;
  }

  const output = spawnSync('git', ['status', '--short', '--untracked-files=all', '--', ...paths], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  if (output.error) {
    throw output.error;
  }

  return Boolean((output.stdout ?? '').trim());
}

function buildCommitMessage(setId, options) {
  return `fix: apply ${options.commitLabel}:${yyyymmddStamp()}:ui_fix for ${setId}`;
}

function autoCommitSet(setId, changedFiles, preRunDirtyFiles, options) {
  if (!options.autoCommit) {
    return { status: 'disabled', commitSha: null, reason: null, changedFiles };
  }

  const normalizedChangedFiles = Array.from(new Set(
    (changedFiles ?? [])
      .map((filePath) => normalizeRepoFilePath(filePath))
      .filter(Boolean),
  ));

  if (normalizedChangedFiles.length === 0) {
    return { status: 'skipped', commitSha: null, reason: 'no-changed-files', changedFiles: [] };
  }

  const conflictingFiles = normalizedChangedFiles.filter((filePath) => preRunDirtyFiles.has(filePath));
  if (conflictingFiles.length > 0) {
    return {
      status: 'blocked',
      commitSha: null,
      reason: 'preexisting-dirty-files',
      changedFiles: normalizedChangedFiles,
      conflictingFiles,
    };
  }

  if (!hasTrackedOrUntrackedChanges(normalizedChangedFiles)) {
    return { status: 'skipped', commitSha: null, reason: 'no-diff-after-run', changedFiles: normalizedChangedFiles };
  }

  gitCapture(['add', '--', ...normalizedChangedFiles]);
  if (!hasTrackedOrUntrackedChanges(normalizedChangedFiles)) {
    return { status: 'skipped', commitSha: null, reason: 'nothing-staged', changedFiles: normalizedChangedFiles };
  }

  const commitMessage = buildCommitMessage(setId, options);
  gitCapture(['commit', '-m', commitMessage]);
  const commitSha = gitCapture(['rev-parse', 'HEAD']).trim();

  return {
    status: 'committed',
    commitSha,
    reason: null,
    changedFiles: normalizedChangedFiles,
    commitMessage,
  };
}

function baseDirs(queueRoot) {
  return {
    queueRoot,
    queueDir: path.join(queueRoot, 'queue'),
    reportsDir: path.join(queueRoot, 'reports'),
    statePath: path.join(queueRoot, 'state.json'),
    lockPath: path.join(queueRoot, 'dispatch.lock'),
    logsDir: path.join(queueRoot, 'logs'),
  };
}

function ensureBaseDirs(queueRoot) {
  const dirs = baseDirs(queueRoot);
  ensureDir(dirs.queueRoot);
  ensureDir(dirs.reportsDir);
  ensureDir(dirs.logsDir);
  for (const status of QUEUE_STATUSES) {
    ensureDir(path.join(dirs.queueDir, status));
  }
  return dirs;
}

function loadState(queueRoot) {
  const dirs = ensureBaseDirs(queueRoot);
  return readJson(dirs.statePath, {
    version: 1,
    updatedAt: null,
    sets: {},
  });
}

function saveState(queueRoot, state, dryRun = false) {
  if (dryRun) {
    return;
  }
  const dirs = ensureBaseDirs(queueRoot);
  state.updatedAt = isoTimestamp();
  writeJson(dirs.statePath, state);
}

function queueEntryPath(queueRoot, status, setId) {
  return path.join(baseDirs(queueRoot).queueDir, status, `${setId}.json`);
}

function clearQueueEntry(queueRoot, setId) {
  for (const status of QUEUE_STATUSES) {
    removePath(queueEntryPath(queueRoot, status, setId));
  }
}

function writeQueueEntry(queueRoot, status, entry, dryRun = false) {
  if (!QUEUE_STATUSES.includes(status)) {
    throw new Error(`Unsupported queue status: ${status}`);
  }
  if (dryRun) {
    return;
  }
  clearQueueEntry(queueRoot, entry.setId);
  writeJson(queueEntryPath(queueRoot, status, entry.setId), entry);
}

function loadQueueEntries(queueRoot, status) {
  const dirPath = path.join(baseDirs(queueRoot).queueDir, status);
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs.readdirSync(dirPath)
    .filter((name) => name.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => readJson(path.join(dirPath, name), null))
    .filter(Boolean);
}

function loadLock(queueRoot) {
  return readJson(baseDirs(queueRoot).lockPath, null);
}

function saveLock(queueRoot, payload, dryRun = false) {
  if (dryRun) {
    return;
  }
  writeJson(baseDirs(queueRoot).lockPath, payload);
}

function clearLock(queueRoot, dryRun = false) {
  if (dryRun) {
    return;
  }
  removePath(baseDirs(queueRoot).lockPath);
}

function listImageFiles(rootDir, options = {}) {
  const results = [];
  const includeUnknown = Boolean(options.includeUnknown);

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, absolutePath);
      if (IGNORED_BASENAMES.has(entry.name)) {
        continue;
      }
      if (!includeUnknown && relativePath.split(path.sep).includes('unknown')) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) {
        continue;
      }

      const stat = fs.statSync(absolutePath);
      results.push({
        absolutePath,
        relativePath,
        name: entry.name,
        extension,
        size: stat.size,
        mtimeMs: Math.trunc(stat.mtimeMs),
      });
    }
  }

  walk(rootDir);
  return results;
}

function detectStrategy(inputRoot, explicitStrategy) {
  if (explicitStrategy && explicitStrategy !== 'auto') {
    return explicitStrategy;
  }

  const children = fs.readdirSync(inputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());
  if (children.some((entry) => fs.existsSync(path.join(inputRoot, entry.name, 'CAPTURE_DONE.flag')))) {
    return 'scenario-folder';
  }
  return 'filename';
}

function findNearestFlag(filePath, rootDir) {
  let currentDir = path.dirname(filePath);
  while (currentDir.startsWith(rootDir)) {
    const candidate = path.join(currentDir, 'CAPTURE_DONE.flag');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    if (currentDir === rootDir) {
      break;
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

function imageSortValue(entry) {
  const index = E2E_ANALYZER_VIEWPORT_ORDER.get(entry.viewportCode) ?? Number.MAX_SAFE_INTEGER;
  return `${String(index).padStart(4, '0')}::${entry.relativePath}`;
}

function buildScenarioFolderSets(inputRoot, options) {
  const children = fs.readdirSync(inputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const sets = [];

  for (const child of children) {
    const childRoot = path.join(inputRoot, child.name);
    const images = listImageFiles(childRoot, options)
      .map((image) => ({
        ...image,
        setRelativePath: path.relative(childRoot, image.absolutePath),
        viewportCode: normalizeViewportCode(parseViewportTokenFromName(path.parse(image.name).name)),
      }))
      .sort((left, right) => imageSortValue(left).localeCompare(imageSortValue(right)));

    if (images.length === 0) {
      continue;
    }

    const flagPath = path.join(childRoot, 'CAPTURE_DONE.flag');
    const isComplete = fs.existsSync(flagPath) || Boolean(options.includeIncomplete);
    const presentViewportCodes = sortViewportCodes(
      Array.from(new Set(images.map((image) => image.viewportCode).filter(Boolean))),
    );
    const missingViewportCodes = options.expectedViewports.filter(
      (code) => !presentViewportCodes.includes(code),
    );
    const fingerprint = createFingerprint({
      expectedViewports: options.expectedViewports,
      includeIncomplete: Boolean(options.includeIncomplete),
      images: images.map((image) => ({
        relativePath: image.relativePath,
        size: image.size,
        mtimeMs: image.mtimeMs,
      })),
    });

    sets.push({
      setId: slugify(child.name),
      displayName: child.name,
      strategy: 'scenario-folder',
      inputRoot,
      sourceRoot: childRoot,
      sourceRootRelative: relativeRepoPath(childRoot),
      completionSignal: fs.existsSync(flagPath) ? 'capture-done-flag' : 'manual-override',
      isComplete,
      expectedViewportCodes: options.expectedViewports,
      presentViewportCodes,
      missingViewportCodes,
      imageCount: images.length,
      latestMtimeMs: Math.max(...images.map((image) => image.mtimeMs)),
      images,
      fingerprint,
    });
  }

  return sets;
}

function buildFilenameSets(inputRoot, options) {
  const groups = new Map();
  const images = listImageFiles(inputRoot, options);

  for (const image of images) {
    const stem = path.parse(image.name).name;
    const token = parseViewportTokenFromName(stem);
    const viewportCode = normalizeViewportCode(token);
    const setStem = viewportCode ? stripViewportToken(stem, token) : stem;
    const relativeDir = path.dirname(image.relativePath) === '.' ? '' : path.dirname(image.relativePath);
    const groupSeed = relativeDir ? `${relativeDir}__${setStem}` : setStem;
    const groupId = slugify(groupSeed);

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        setId: groupId,
        displayName: relativeDir ? `${relativeDir}/${setStem}` : setStem,
        strategy: 'filename',
        inputRoot,
        sourceRoot: inputRoot,
        sourceRootRelative: relativeRepoPath(inputRoot),
        images: [],
      });
    }

    groups.get(groupId).images.push({
      ...image,
      setRelativePath: image.relativePath,
      viewportCode,
      viewportToken: token,
      flagPath: findNearestFlag(image.absolutePath, inputRoot),
    });
  }

  return Array.from(groups.values())
    .map((group) => {
      group.images.sort((left, right) => imageSortValue(left).localeCompare(imageSortValue(right)));
      const presentViewportCodes = sortViewportCodes(
        Array.from(new Set(group.images.map((image) => image.viewportCode).filter(Boolean))),
      );
      const missingViewportCodes = options.expectedViewports.filter(
        (code) => !presentViewportCodes.includes(code),
      );
      const flagPath = group.images.find((image) => image.flagPath)?.flagPath ?? null;
      const isComplete = flagPath != null
        || Boolean(options.includeIncomplete)
        || missingViewportCodes.length === 0;
      const completionSignal = flagPath
        ? 'capture-done-flag'
        : missingViewportCodes.length === 0
          ? 'viewport-matrix'
          : 'incomplete';
      const fingerprint = createFingerprint({
        expectedViewports: options.expectedViewports,
        includeIncomplete: Boolean(options.includeIncomplete),
        images: group.images.map((image) => ({
          relativePath: image.relativePath,
          size: image.size,
          mtimeMs: image.mtimeMs,
        })),
      });

      return {
        ...group,
        completionSignal,
        isComplete,
        expectedViewportCodes: options.expectedViewports,
        presentViewportCodes,
        missingViewportCodes,
        imageCount: group.images.length,
        latestMtimeMs: Math.max(...group.images.map((image) => image.mtimeMs)),
        fingerprint,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function buildSetTask(set, reportDir, options) {
  const imageRows = set.images.map((image, index) => {
    const viewport = image.viewportCode ? viewportLabel(image.viewportCode) : 'variant/unknown';
    const absolutePath = image.absolutePath;
    return `| ${index + 1} | ${viewport} | ${image.relativePath} | [open](${absolutePath}) |`;
  });

  const viewportRows = options.expectedViewports.map((code) => {
    const viewport = E2E_ANALYZER_VIEWPORT_MAP[code];
    const present = set.presentViewportCodes.includes(code) ? 'yes' : 'no';
    return `| ${code} | ${viewport.name} | ${viewport.width}x${viewport.height} | ${present} |`;
  });

  return `# E2E Analyzer Task — ${set.displayName}

Generated: ${isoTimestamp()}
Set ID: \`${set.setId}\`
Source strategy: \`${set.strategy}\`
Source root: \`${set.sourceRootRelative}\`
Completion signal: \`${set.completionSignal}\`
Expected viewport order: \`${options.expectedViewports.join(' -> ')}\`

## Contract

- Analyze **every image in this set** with sub-agents. No omissions.
- Treat this file as the execution contract for the current set.
- If \`codex-mode=agent-all\`, run the full \`agent-all\` pipeline after analysis for actionable UI/UX defects.
- If this set is incomplete, analyze the currently available images immediately and apply fixes that are already actionable. Future screenshots may reopen the same set.
- Do not revert unrelated local changes in the repository.
- Write analysis artifacts into \`${relativeRepoPath(reportDir)}\`.

## Viewport Matrix

| Code | Device | Size | Present |
|------|--------|------|---------|
${viewportRows.join('\n')}

## Image Set

| # | Viewport | Relative Path | File |
|---|----------|---------------|------|
${imageRows.join('\n')}

## Required Outputs

- \`analysis.md\` — full set analysis with per-image findings and grouped root causes
- \`findings.json\` — machine-readable summary of image-level findings
- \`remediation.md\` — whether \`agent-all\` ran, what changed, what remains

## Acceptance Criteria

- Every image listed above is explicitly accounted for
- Findings are grouped by image and by root cause
- If code changes are made, relevant docs/tasks are updated in the same run
- Final response matches the analyzer result schema
`;
}

function buildCodexPrompt(set, reportDir, taskPath, options) {
  const analysisPath = path.join(reportDir, 'analysis.md');
  const findingsPath = path.join(reportDir, 'findings.json');
  const remediationPath = path.join(reportDir, 'remediation.md');
  const modeLine = options.codexMode === 'agent-all'
    ? 'Use the `agent-all` skill after image analysis for actionable fixes. Do not stop at analysis-only.'
    : 'Analyze only. Do not change application code; produce findings and remediation handoff only.';

  return `이 저장소의 E2E 스크린샷 셋을 분석해.

작업 문서: ${taskPath}
리포트 디렉토리: ${reportDir}

반드시 수행:
1. ${taskPath}를 실행 계약으로 따른다.
2. 첨부된 이미지를 하나도 빠짐없이 모두 분석한다.
3. 이미지 분석은 서브에이전트를 사용해 병렬로 수행한다.
4. DESIGN.md, .impeccable.md, AGENTS.md, 관련 코드/문서를 필요한 만큼 읽고 판단한다.
5. per-image findings와 cross-cutting root cause를 정리한다.
6. ${modeLine}
7. 아래 파일을 직접 갱신한다.
   - ${analysisPath}
   - ${findingsPath}
   - ${remediationPath}
8. 코드 변경이 있으면 repo-relative 경로 목록을 \`changed_files\`에 넣는다.
9. 최종 응답은 JSON schema를 만족해야 한다.

JSON 응답 규칙:
- status: completed | blocked | no-action
- set_id: ${set.setId}
- images_analyzed: 실제 분석한 이미지 개수
- issues_found: actionable issue 개수
- agent_all_ran: true/false
- changed_files: 코드/문서 변경 파일의 repo-relative 경로 배열 (없으면 [])
- report_path: ${analysisPath}
- remediation_path: ${remediationPath}
- notes: 짧은 요약
`;
}

function reportPaths(queueRoot, setId) {
  const reportDir = path.join(baseDirs(queueRoot).reportsDir, setId);
  return {
    reportDir,
    manifestPath: path.join(reportDir, 'set-manifest.json'),
    taskPath: path.join(reportDir, 'task.md'),
    promptPath: path.join(reportDir, 'codex-prompt.md'),
    resultPath: path.join(reportDir, 'codex-result.json'),
    stdoutPath: path.join(reportDir, 'codex.stdout.log'),
    stderrPath: path.join(reportDir, 'codex.stderr.log'),
    runMetaPath: path.join(reportDir, 'run-meta.json'),
  };
}

function prepareSetArtifacts(queueRoot, set, options, dryRun = false) {
  const paths = reportPaths(queueRoot, set.setId);
  if (dryRun) {
    return paths;
  }
  ensureDir(paths.reportDir);
  writeJson(paths.manifestPath, {
    ...set,
    inputRootRelative: relativeRepoPath(set.inputRoot),
    generatedAt: isoTimestamp(),
  });
  writeText(paths.taskPath, buildSetTask(set, paths.reportDir, options));
  writeText(paths.promptPath, buildCodexPrompt(set, paths.reportDir, paths.taskPath, options));
  return paths;
}

function buildScanResult(inputRoot, options) {
  if (!fs.existsSync(inputRoot)) {
    throw new Error(`Input root not found: ${inputRoot}`);
  }

  const strategy = detectStrategy(inputRoot, options.strategy);
  const sets = strategy === 'scenario-folder'
    ? buildScenarioFolderSets(inputRoot, options)
    : buildFilenameSets(inputRoot, options);

  return {
    strategy,
    sets,
  };
}

function updateObservedState(queueRoot, state, set, status) {
  state.sets[set.setId] = {
    setId: set.setId,
    displayName: set.displayName,
    fingerprint: set.fingerprint,
    status,
    imageCount: set.imageCount,
    isComplete: Boolean(set.isComplete),
    latestMtimeMs: set.latestMtimeMs ?? null,
    completionSignal: set.completionSignal ?? null,
    inputRootRelative: relativeRepoPath(set.inputRoot),
    reportDirRelative: relativeRepoPath(reportPaths(queueRoot, set.setId).reportDir),
    updatedAt: isoTimestamp(),
  };
}

function scanAndQueue(inputRoot, queueRoot, options) {
  const state = loadState(queueRoot);
  const { sets, strategy } = buildScanResult(inputRoot, options);
  const queued = [];
  const observed = [];
  const nowMs = Date.now();

  for (const set of sets) {
    const previous = state.sets[set.setId] ?? null;
    const changed = !previous || previous.fingerprint !== set.fingerprint;
    const recentlyChanged = set.latestMtimeMs != null
      && (nowMs - set.latestMtimeMs) <= options.incompleteWindowSeconds * 1000;
    const shouldQueueIncomplete = options.dispatchIncomplete && !set.isComplete && recentlyChanged;
    const nextStatus = (set.isComplete || shouldQueueIncomplete) ? 'pending' : 'observed';

    prepareSetArtifacts(queueRoot, set, options, options.dryRun);

    if (!changed) {
      observed.push({ setId: set.setId, status: previous.status ?? nextStatus, changed: false });
      continue;
    }

    updateObservedState(queueRoot, state, set, nextStatus);
    if (nextStatus === 'pending') {
      writeQueueEntry(queueRoot, 'pending', {
        setId: set.setId,
        displayName: set.displayName,
        queuedAt: isoTimestamp(),
        imageCount: set.imageCount,
        fingerprint: set.fingerprint,
        completionSignal: set.completionSignal,
        isComplete: Boolean(set.isComplete),
        latestMtimeMs: set.latestMtimeMs ?? null,
        reportDirRelative: relativeRepoPath(reportPaths(queueRoot, set.setId).reportDir),
        inputRootRelative: relativeRepoPath(set.inputRoot),
      }, options.dryRun);
      queued.push(set.setId);
    } else if (!options.dryRun) {
      clearQueueEntry(queueRoot, set.setId);
    }

    observed.push({ setId: set.setId, status: nextStatus, changed: true });
  }

  saveState(queueRoot, state, options.dryRun);

  return {
    strategy,
    totalSets: sets.length,
    queued,
    observed,
  };
}

function recoverStaleRunningJobs(queueRoot, options) {
  const state = loadState(queueRoot);
  const lock = loadLock(queueRoot);
  const running = loadQueueEntries(queueRoot, 'running');
  const staleLock = lock && !processExists(lock.pid);

  if (!staleLock && lock) {
    return { recovered: 0, activeLock: true };
  }

  if (staleLock) {
    clearLock(queueRoot, options.dryRun);
  }

  let recovered = 0;
  for (const entry of running) {
    writeQueueEntry(queueRoot, 'pending', {
      ...entry,
      queuedAt: isoTimestamp(),
      recoveredAt: isoTimestamp(),
      recoveryReason: staleLock ? 'stale-lock' : 'orphan-running-entry',
    }, options.dryRun);
    if (state.sets[entry.setId]) {
      state.sets[entry.setId].status = 'pending';
      state.sets[entry.setId].updatedAt = isoTimestamp();
    }
    recovered += 1;
  }

  saveState(queueRoot, state, options.dryRun);
  return { recovered, activeLock: false };
}

function selectPendingEntries(queueRoot, options) {
  let entries = loadQueueEntries(queueRoot, 'pending')
    .sort((left, right) => String(left.queuedAt).localeCompare(String(right.queuedAt)));
  if (options.setId) {
    entries = entries.filter((entry) => entry.setId === options.setId);
  }
  return entries.slice(0, options.maxDispatch);
}

function loadSetManifest(queueRoot, setId) {
  return readJson(reportPaths(queueRoot, setId).manifestPath, null);
}

function markState(queueRoot, setId, status, extra = {}, dryRun = false) {
  const state = loadState(queueRoot);
  if (!state.sets[setId]) {
    state.sets[setId] = { setId };
  }
  state.sets[setId] = {
    ...state.sets[setId],
    status,
    updatedAt: isoTimestamp(),
    ...extra,
  };
  saveState(queueRoot, state, dryRun);
}

function runCodexForSet(queueRoot, set, options) {
  const paths = reportPaths(queueRoot, set.setId);
  const prompt = buildCodexPrompt(set, paths.reportDir, paths.taskPath, options);
  if (options.dryRun) {
    return {
      ok: true,
      dryRun: true,
      result: {
        status: 'no-action',
        set_id: set.setId,
        images_analyzed: 0,
        issues_found: 0,
        agent_all_ran: false,
        changed_files: [],
        report_path: relativeRepoPath(paths.reportDir),
        remediation_path: relativeRepoPath(path.join(paths.reportDir, 'remediation.md')),
        notes: 'dry-run',
      },
    };
  }

  writeText(paths.promptPath, prompt);

  const args = [
    'exec',
    '--cd',
    REPO_ROOT,
    '--sandbox',
    'danger-full-access',
    '--model',
    options.model,
    '-c',
    `reasoning_effort="${options.reasoningEffort}"`,
    '--output-schema',
    RESULT_SCHEMA_PATH,
    '-o',
    paths.resultPath,
  ];

  for (const image of set.images) {
    args.push('--image', image.absolutePath);
  }

  args.push('-');

  const result = spawnSync('codex', args, {
    cwd: REPO_ROOT,
    input: prompt,
    encoding: 'utf8',
    timeout: options.codexTimeoutSeconds * 1000,
    maxBuffer: 32 * 1024 * 1024,
  });

  writeText(paths.stdoutPath, result.stdout ?? '');
  writeText(paths.stderrPath, result.stderr ?? '');

  if (result.error) {
    return {
      ok: false,
      error: result.error.message,
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      error: `codex exec exited with code ${result.status ?? 1}`,
    };
  }

  const payload = readJson(paths.resultPath, null);
  if (!payload) {
    return {
      ok: false,
      error: 'codex result JSON missing or invalid',
    };
  }

  return {
    ok: true,
    result: payload,
  };
}

function dispatchPending(queueRoot, options) {
  const recovery = recoverStaleRunningJobs(queueRoot, options);
  if (recovery.activeLock) {
    return {
      dispatched: [],
      skipped: 'active-lock',
    };
  }

  const entries = selectPendingEntries(queueRoot, options);
  if (entries.length === 0) {
    return {
      dispatched: [],
      skipped: 'no-pending',
    };
  }

  const lockPayload = {
    pid: process.pid,
    hostname: os.hostname(),
    startedAt: isoTimestamp(),
    setIds: entries.map((entry) => entry.setId),
  };
  saveLock(queueRoot, lockPayload, options.dryRun);

  const dispatched = [];

  try {
    for (const entry of entries) {
      const set = loadSetManifest(queueRoot, entry.setId);
      if (!set) {
        writeQueueEntry(queueRoot, 'failed', {
          ...entry,
          failedAt: isoTimestamp(),
          failureReason: 'missing set manifest',
        }, options.dryRun);
        markState(queueRoot, entry.setId, 'failed', { failureReason: 'missing set manifest' }, options.dryRun);
        dispatched.push({ setId: entry.setId, status: 'failed', reason: 'missing manifest' });
        continue;
      }

      if (options.runCodex && set.imageCount > options.maxImages) {
        writeQueueEntry(queueRoot, 'staged', {
          ...entry,
          stagedAt: isoTimestamp(),
          stageReason: `image-count>${options.maxImages}`,
        }, options.dryRun);
        markState(queueRoot, entry.setId, 'staged', { stageReason: `image-count>${options.maxImages}` }, options.dryRun);
        dispatched.push({ setId: entry.setId, status: 'staged', reason: 'too-many-images' });
        continue;
      }

      if (!options.runCodex) {
        writeQueueEntry(queueRoot, 'staged', {
          ...entry,
          stagedAt: isoTimestamp(),
          stageReason: 'run-codex-disabled',
        }, options.dryRun);
        markState(queueRoot, entry.setId, 'staged', { stageReason: 'run-codex-disabled' }, options.dryRun);
        dispatched.push({ setId: entry.setId, status: 'staged', reason: 'run-codex-disabled' });
        continue;
      }

      writeQueueEntry(queueRoot, 'running', {
        ...entry,
        startedAt: isoTimestamp(),
      }, options.dryRun);
      markState(queueRoot, entry.setId, 'running', {}, options.dryRun);

      const preRunDirtyFiles = options.runCodex ? snapshotDirtyFiles() : new Set();
      const codex = runCodexForSet(queueRoot, set, options);
      const commitResult = codex.ok
        ? autoCommitSet(entry.setId, codex.result?.changed_files ?? [], preRunDirtyFiles, options)
        : { status: 'not-run', commitSha: null, reason: codex.error ?? 'codex-failed', changedFiles: [] };
      const paths = reportPaths(queueRoot, entry.setId);
      writeJson(paths.runMetaPath, {
        setId: entry.setId,
        codexMode: options.codexMode,
        runCodex: options.runCodex,
        autoCommit: options.autoCommit,
        imageCount: set.imageCount,
        completedAt: isoTimestamp(),
        ok: codex.ok,
        result: codex.result ?? null,
        error: codex.error ?? null,
        commitResult,
      });

      if (!codex.ok) {
        writeQueueEntry(queueRoot, 'failed', {
          ...entry,
          failedAt: isoTimestamp(),
          failureReason: codex.error,
          reportDirRelative: relativeRepoPath(paths.reportDir),
        }, options.dryRun);
        markState(queueRoot, entry.setId, 'failed', {
          failureReason: codex.error,
          reportDirRelative: relativeRepoPath(paths.reportDir),
        }, options.dryRun);
        dispatched.push({ setId: entry.setId, status: 'failed', reason: codex.error });
        continue;
      }

      writeQueueEntry(queueRoot, 'completed', {
        ...entry,
        completedAt: isoTimestamp(),
        codexResult: codex.result,
        commitResult,
        reportDirRelative: relativeRepoPath(paths.reportDir),
      }, options.dryRun);
      markState(queueRoot, entry.setId, 'completed', {
        reportDirRelative: relativeRepoPath(paths.reportDir),
        codexResult: codex.result,
        commitResult,
      }, options.dryRun);
      dispatched.push({ setId: entry.setId, status: 'completed', result: codex.result, commitResult });
    }
  } finally {
    clearLock(queueRoot, options.dryRun);
  }

  return {
    dispatched,
    skipped: null,
  };
}

function printStatus(queueRoot, options) {
  const state = loadState(queueRoot);
  const counts = Object.fromEntries([
    ...QUEUE_STATUSES.map((status) => [status, loadQueueEntries(queueRoot, status).length]),
    ['observed', Object.values(state.sets).filter((set) => set.status === 'observed').length],
  ]);

  console.log(`queueRoot: ${relativeRepoPath(queueRoot)}`);
  console.log(`updatedAt: ${state.updatedAt ?? 'n/a'}`);
  console.log(`pending=${counts.pending} running=${counts.running} staged=${counts.staged} completed=${counts.completed} failed=${counts.failed} observed=${counts.observed}`);

  const entries = Object.values(state.sets)
    .filter((set) => !options.setId || set.setId === options.setId)
    .sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')));

  if (entries.length === 0) {
    return;
  }

  console.log('');
  for (const entry of entries.slice(0, 20)) {
    console.log(`${entry.setId} | ${entry.status} | images=${entry.imageCount ?? 0} | updated=${entry.updatedAt ?? 'n/a'}`);
  }
}

function parseArgs(argv) {
  const command = argv[2];
  if (!command) {
    usage();
  }

  const options = {
    inputRoot: DEFAULT_INPUT_ROOT,
    queueRoot: DEFAULT_QUEUE_ROOT,
    strategy: 'auto',
    expectedViewports: [...E2E_ANALYZER_VIEWPORT_CODES],
    includeIncomplete: false,
    includeUnknown: false,
    runCodex: false,
    codexMode: 'agent-all',
    dispatchIncomplete: false,
    incompleteWindowSeconds: DEFAULT_INCOMPLETE_WINDOW_SECONDS,
    autoCommit: false,
    commitLabel: DEFAULT_COMMIT_LABEL,
    model: DEFAULT_MODEL,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
    codexTimeoutSeconds: DEFAULT_CODEX_TIMEOUT_SECONDS,
    pollSeconds: DEFAULT_POLL_SECONDS,
    maxDispatch: DEFAULT_MAX_DISPATCH,
    maxImages: DEFAULT_MAX_IMAGES,
    setId: null,
    dryRun: false,
  };

  for (let index = 3; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--input-root') options.inputRoot = path.resolve(argv[++index] ?? options.inputRoot);
    else if (token === '--queue-root') options.queueRoot = path.resolve(argv[++index] ?? options.queueRoot);
    else if (token === '--strategy') options.strategy = argv[++index] ?? options.strategy;
    else if (token === '--expected-viewports') {
      options.expectedViewports = sortViewportCodes(
        String(argv[++index] ?? '')
          .split(',')
          .map((entry) => normalizeViewportCode(entry))
          .filter(Boolean),
      );
    } else if (token === '--include-incomplete') options.includeIncomplete = true;
    else if (token === '--include-unknown') options.includeUnknown = true;
    else if (token === '--run-codex') options.runCodex = true;
    else if (token === '--codex-mode') options.codexMode = argv[++index] ?? options.codexMode;
    else if (token === '--dispatch-incomplete') options.dispatchIncomplete = true;
    else if (token === '--incomplete-window-seconds') options.incompleteWindowSeconds = Math.max(30, Number(argv[++index] ?? DEFAULT_INCOMPLETE_WINDOW_SECONDS) || DEFAULT_INCOMPLETE_WINDOW_SECONDS);
    else if (token === '--auto-commit') options.autoCommit = true;
    else if (token === '--commit-label') options.commitLabel = slugify(argv[++index] ?? DEFAULT_COMMIT_LABEL);
    else if (token === '--model') options.model = argv[++index] ?? options.model;
    else if (token === '--reasoning-effort') options.reasoningEffort = argv[++index] ?? options.reasoningEffort;
    else if (token === '--codex-timeout-seconds') options.codexTimeoutSeconds = Math.max(30, Number(argv[++index] ?? DEFAULT_CODEX_TIMEOUT_SECONDS) || DEFAULT_CODEX_TIMEOUT_SECONDS);
    else if (token === '--poll-seconds') options.pollSeconds = Math.max(5, Number(argv[++index] ?? DEFAULT_POLL_SECONDS) || DEFAULT_POLL_SECONDS);
    else if (token === '--max-dispatch') options.maxDispatch = Math.max(1, Number(argv[++index] ?? DEFAULT_MAX_DISPATCH) || DEFAULT_MAX_DISPATCH);
    else if (token === '--max-images') options.maxImages = Math.max(1, Number(argv[++index] ?? DEFAULT_MAX_IMAGES) || DEFAULT_MAX_IMAGES);
    else if (token === '--set-id') options.setId = argv[++index] ?? null;
    else if (token === '--dry-run') options.dryRun = true;
    else usage();
  }

  if (!['auto', 'filename', 'scenario-folder'].includes(options.strategy)) {
    throw new Error(`Unsupported strategy: ${options.strategy}`);
  }
  if (!['agent-all', 'analyze-only'].includes(options.codexMode)) {
    throw new Error(`Unsupported codex mode: ${options.codexMode}`);
  }
  if (options.expectedViewports.length === 0) {
    throw new Error('expected viewport list must not be empty');
  }

  return { command, options };
}

function runScan(options) {
  const result = scanAndQueue(options.inputRoot, options.queueRoot, options);
  console.log(`strategy=${result.strategy} totalSets=${result.totalSets} queued=${result.queued.length}`);
  if (result.queued.length > 0) {
    console.log(`queued set ids: ${result.queued.join(', ')}`);
  }
}

function runDispatch(options) {
  const result = dispatchPending(options.queueRoot, options);
  if (result.skipped) {
    console.log(`dispatch skipped: ${result.skipped}`);
    return;
  }
  if (result.dispatched.length === 0) {
    console.log('dispatch: nothing to do');
    return;
  }
  for (const entry of result.dispatched) {
    const commitSuffix = entry.commitResult?.status === 'committed'
      ? ` [commit ${entry.commitResult.commitSha.slice(0, 7)}]`
      : entry.commitResult?.status && entry.commitResult.status !== 'disabled'
        ? ` [commit ${entry.commitResult.status}${entry.commitResult.reason ? `:${entry.commitResult.reason}` : ''}]`
        : '';
    console.log(`${entry.setId} -> ${entry.status}${entry.reason ? ` (${entry.reason})` : ''}${commitSuffix}`);
  }
}

function runTick(options) {
  runScan(options);
  runDispatch(options);
}

function runWatch(options) {
  for (;;) {
    runTick(options);
    console.log(`sleeping ${options.pollSeconds}s`);
    sleepSeconds(options.pollSeconds);
  }
}

function main() {
  const { command, options } = parseArgs(process.argv);

  if (command === 'status') {
    printStatus(options.queueRoot, options);
    return;
  }

  if (command === 'scan') {
    runScan(options);
    return;
  }

  if (command === 'dispatch') {
    runDispatch(options);
    return;
  }

  if (command === 'tick') {
    runTick(options);
    return;
  }

  if (command === 'watch') {
    runWatch(options);
    return;
  }

  usage();
}

main();
