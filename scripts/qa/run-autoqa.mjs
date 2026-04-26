#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  AUTOQA_DIR,
  DEFAULT_SCOPE,
  capturePersonaStorageState,
  countHeadingBlocks,
  ensureAutoqaScaffold,
  isoNow,
  latestRunId,
  loadStatusCursor,
  parseArgs,
  parseYamlFile,
  printJson,
  promoteAdminPersona,
  repoRelative,
  resolveRepoRoot,
  runShell,
  writeCompactHandoff,
  writeFileIfChanged,
  writeStatusCursor,
} from './autoqa-lib.mjs';

const DEFAULT_CRON_SCHEDULE = '*/30 * * * *';

function operatorScript(root, fileName) {
  return path.join(root, 'scripts', 'qa', fileName);
}

function runNodeScript(root, fileName, args = []) {
  const scriptPath = operatorScript(root, fileName);
  const command = ['node', JSON.stringify(scriptPath), ...args.map((arg) => JSON.stringify(String(arg)))].join(' ');
  return runShell(command, { cwd: root });
}

function cronMarker(root) {
  const slug = path.basename(root).replace(/[^A-Za-z0-9._-]+/g, '-');
  return {
    start: `# BEGIN AUTOQA ${slug}`,
    end: `# END AUTOQA ${slug}`,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripManagedCronBlock(content, marker) {
  const pattern = new RegExp(`${escapeRegExp(marker.start)}\\n[\\s\\S]*?${escapeRegExp(marker.end)}\\n?`, 'g');
  return content.replace(pattern, '').trim();
}

function readCrontab(root) {
  const result = runShell('crontab -l', { cwd: root, allowFailure: true });
  if (result.status !== 0) {
    return '';
  }
  return result.stdout.trimEnd();
}

function writeCrontab(root, content) {
  const cronDir = path.join(root, AUTOQA_DIR, 'cron');
  const targetPath = path.join(cronDir, 'autoqa.installed.crontab');
  const relativeTargetPath = repoRelative(root, targetPath);
  writeFileIfChanged(targetPath, content ? `${content.trimEnd()}\n` : '');
  execFileSync('crontab', [relativeTargetPath], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return relativeTargetPath;
}

function cronCommandLine(root, wrapperPath) {
  return `cd ${JSON.stringify(root)} && bash ${JSON.stringify(wrapperPath)} >/dev/null 2>&1`;
}

function currentCronStatus(root) {
  const marker = cronMarker(root);
  const installed = readCrontab(root);
  const pattern = new RegExp(`${escapeRegExp(marker.start)}\\n([\\s\\S]*?)\\n${escapeRegExp(marker.end)}`);
  const match = installed.match(pattern);
  const command = match?.[1]?.trim() ?? null;
  const schedule = command?.split(/\s+/).slice(0, 5).join(' ') ?? null;
  return {
    installed: Boolean(match),
    schedule,
    command,
  };
}

function installCronEntry(root, scope, schedule) {
  const artifacts = ensureCronArtifacts(root, scope, schedule);
  const marker = cronMarker(root);
  const existing = readCrontab(root);
  const preserved = stripManagedCronBlock(existing, marker);
  const managedBlock = [
    marker.start,
    `${schedule} ${cronCommandLine(root, path.join(root, artifacts.wrapper))}`,
    marker.end,
  ].join('\n');
  const merged = [preserved, managedBlock].filter(Boolean).join('\n\n');
  const installedCrontab = writeCrontab(root, merged);
  return {
    ...artifacts,
    installedCrontab,
    schedule,
  };
}

function uninstallCronEntry(root) {
  const marker = cronMarker(root);
  const existing = readCrontab(root);
  const preserved = stripManagedCronBlock(existing, marker);
  const installedCrontab = writeCrontab(root, preserved);
  return {
    installedCrontab,
    status: currentCronStatus(root),
  };
}

function ensureCronArtifacts(root, scope, schedule = DEFAULT_CRON_SCHEDULE) {
  const cronDir = path.join(root, AUTOQA_DIR, 'cron');
  const cronLog = path.join(cronDir, 'autoqa.log');
  const wrapperPath = path.join(cronDir, 'autoqa-cycle.sh');
  const crontabPath = path.join(cronDir, 'autoqa.crontab.example');
  const wrapper = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `cd ${JSON.stringify(root)}`,
    `node scripts/qa/run-autoqa.mjs --scope ${scope} >> ${JSON.stringify(cronLog)} 2>&1`,
  ].join('\n');
  const crontab = [
    '# Example: run the repo-local autoqa operator every 30 minutes',
    `${schedule} ${cronCommandLine(root, wrapperPath)}`,
  ].join('\n');

  writeFileIfChanged(wrapperPath, `${wrapper}\n`);
  runShell(`chmod +x ${JSON.stringify(wrapperPath)}`, { cwd: root });
  writeFileIfChanged(crontabPath, `${crontab}\n`);
  return {
    wrapper: path.join(AUTOQA_DIR, 'cron', 'autoqa-cycle.sh'),
    crontab: path.join(AUTOQA_DIR, 'cron', 'autoqa.crontab.example'),
    log: path.join(AUTOQA_DIR, 'cron', 'autoqa.log'),
    schedule,
  };
}

function statusSummary(root) {
  const cursor = loadStatusCursor(root);
  return {
    phase: cursor.phase,
    run_owner: cursor.run_owner,
    current_scenario: cursor.current_scenario,
    queued_scenarios: cursor.queued_scenarios.length,
    completed_scenarios: cursor.completed_scenarios.length,
    blocked_scenarios: cursor.blocked_scenarios.length,
    open_findings: cursor.open_findings.length,
    latest_run: latestRunId(root),
    findings_total: countHeadingBlocks(path.join(root, AUTOQA_DIR, 'findings.md'), 'F-'),
    fixes_total: countHeadingBlocks(path.join(root, AUTOQA_DIR, 'fixes.md'), 'FIX-'),
    gaps_total: countHeadingBlocks(path.join(root, AUTOQA_DIR, 'feature-gaps.md'), 'FG-'),
    automation: cursor.automation,
    cron: currentCronStatus(root),
    stall: cursor.stall,
  };
}

async function main() {
  const { action, options } = parseArgs(process.argv.slice(2));
  const root = resolveRepoRoot();
  const scope = options.scope ?? DEFAULT_SCOPE;

  if (action === 'init') {
    const created = ensureAutoqaScaffold(root);
    printJson({ ok: true, created });
    return;
  }

  ensureAutoqaScaffold(root);

  if (action === 'status') {
    printJson(statusSummary(root));
    return;
  }

  if (action === 'scenarios') {
    const result = runNodeScript(root, 'run-autoqa-scenarios.mjs', ['all']);
    process.stdout.write(result.stdout);
    return;
  }

  if (action === 'login') {
    const persona = options._[0];
    if (!persona) {
      throw new Error('usage: autoqa login <persona>');
    }
    const config = parseYamlFile(path.join(root, AUTOQA_DIR, 'config.yaml'));
    const cursor = loadStatusCursor(root);
    cursor.last_wake_at = isoNow();
    cursor.stall.last_progress_at = isoNow();
    cursor.stall.last_progress_reason = `login_refresh_requested_${persona}`;
    writeStatusCursor(root, cursor);
    capturePersonaStorageState(root, config, persona);
    if (persona === 'admin') {
      promoteAdminPersona(root, config);
      capturePersonaStorageState(root, config, persona);
    }
    writeCompactHandoff(root, {
      active_task: `autoqa login ${persona}`,
      done: [`refreshed storage state for ${persona}`],
      remaining: ['run cycle or auto operator to execute scenarios'],
      blocker: null,
      next_action: 'run foreground autoqa cycle',
      updated_at: isoNow(),
    });
    printJson({ ok: true, action: 'login', persona });
    return;
  }

  if (action === 'cron') {
    const cronAction = options._[0] ?? 'prepare';
    const schedule = String(options.schedule ?? DEFAULT_CRON_SCHEDULE);
    const cursor = loadStatusCursor(root);

    if (cronAction === 'status') {
      printJson({ ok: true, cron: currentCronStatus(root), artifacts: ensureCronArtifacts(root, scope, schedule) });
      return;
    }

    if (cronAction === 'install') {
      const artifacts = installCronEntry(root, scope, schedule);
      cursor.automation.mode = 'cron';
      cursor.automation.active = true;
      cursor.automation.disabled_reason = null;
      cursor.automation.fallback_mode = 'cron';
      cursor.last_wake_at = isoNow();
      cursor.stall.last_progress_at = isoNow();
      cursor.stall.last_progress_reason = 'cron_installed';
      writeStatusCursor(root, cursor);
      writeCompactHandoff(root, {
        active_task: 'autoqa cron installation',
        done: [
          'refreshed cron-friendly wrapper script',
          'refreshed crontab example',
          `installed host cron schedule ${schedule}`,
        ],
        remaining: [
          'wait for cron tick or run foreground cycle immediately if faster feedback is needed',
        ],
        blocker: null,
        next_action: 'monitor autoqa status or inspect cron log',
        updated_at: isoNow(),
      });
      printJson({ ok: true, action: 'cron_install', artifacts, cron: currentCronStatus(root) });
      return;
    }

    if (cronAction === 'uninstall') {
      const result = uninstallCronEntry(root);
      cursor.automation.mode = 'cron';
      cursor.automation.active = false;
      cursor.automation.disabled_reason = 'cron_uninstalled';
      cursor.automation.fallback_mode = 'foreground';
      cursor.last_wake_at = isoNow();
      cursor.stall.last_progress_at = isoNow();
      cursor.stall.last_progress_reason = 'cron_uninstalled';
      writeStatusCursor(root, cursor);
      writeCompactHandoff(root, {
        active_task: 'autoqa cron removal',
        done: ['removed managed autoqa cron entry'],
        remaining: ['run foreground autoqa manually when needed'],
        blocker: null,
        next_action: 'use pnpm autoqa for on-demand execution',
        updated_at: isoNow(),
      });
      printJson({ ok: true, action: 'cron_uninstall', ...result });
      return;
    }

    if (cronAction !== 'prepare') {
      throw new Error('usage: autoqa cron [prepare|install|status|uninstall] [--schedule "*/30 * * * *"]');
    }

    const artifacts = ensureCronArtifacts(root, scope, schedule);
    cursor.automation.mode = 'cron';
    cursor.automation.active = false;
    cursor.automation.disabled_reason = 'heartbeat_unavailable_use_cron';
    cursor.automation.fallback_mode = 'cron_template';
    cursor.last_wake_at = isoNow();
    cursor.stall.last_progress_at = isoNow();
    cursor.stall.last_progress_reason = 'cron_artifacts_refreshed';
    writeStatusCursor(root, cursor);
    writeCompactHandoff(root, {
      active_task: 'autoqa cron fallback preparation',
      done: [
        'refreshed cron-friendly wrapper script',
        'refreshed crontab example',
      ],
      remaining: [
        'install managed crontab if unattended host-level scheduling is desired',
      ],
      blocker: null,
      next_action: 'run autoqa cron install to arm host cron fallback',
      updated_at: isoNow(),
    });
    printJson({ ok: true, action: 'cron_prepare', artifacts, cron: currentCronStatus(root) });
    return;
  }

  if (action === 'run' || action === 'cycle') {
    const selector = options._[0] ?? 'all';
    const result = runNodeScript(root, 'run-autoqa-cycle.mjs', [action, selector, '--scope', scope, ...(options.limit ? ['--limit', options.limit] : [])]);
    process.stdout.write(result.stdout);
    return;
  }

  const artifacts = ensureCronArtifacts(root, scope);
  const cursor = loadStatusCursor(root);
  cursor.automation.mode = 'heartbeat';
  cursor.automation.active = false;
  cursor.automation.disabled_reason = 'automation_unavailable';
  cursor.automation.fallback_mode = 'foreground';
  cursor.last_wake_at = isoNow();
  cursor.next_wake_reason = 'foreground_fallback_after_auto_operator';
  cursor.stall.last_progress_at = isoNow();
  cursor.stall.last_progress_reason = 'auto_operator_started';
  writeStatusCursor(root, cursor);
  writeCompactHandoff(root, {
    active_task: 'autoqa default operator flow',
    done: [
      'ensured .autoqa scaffold exists',
      'prepared cron-friendly fallback artifacts',
    ],
    remaining: [
      'refresh scenarios',
      'run foreground cycle across selected scenarios',
    ],
    blocker: null,
    next_action: 'run scenario refresh and enter foreground cycle',
    updated_at: isoNow(),
  });

  runNodeScript(root, 'run-autoqa-scenarios.mjs', ['all']);
  runNodeScript(root, 'run-autoqa-cycle.mjs', ['cycle', 'all', '--scope', scope, '--background']);

  const completedCursor = loadStatusCursor(root);
  completedCursor.automation.mode = 'heartbeat';
  completedCursor.automation.active = false;
  completedCursor.automation.disabled_reason = 'automation_unavailable';
  completedCursor.automation.fallback_mode = 'foreground';
  writeStatusCursor(root, completedCursor);

  printJson({
    ok: true,
    action: 'auto',
    scope,
    latest_run: latestRunId(root),
    cron_artifacts: artifacts,
    status: statusSummary(root),
  });
}

await main();
