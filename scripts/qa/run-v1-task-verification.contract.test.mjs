import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants,
  cpSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { test } from 'node:test';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const planSHA = 'dc4ecb2f76592799f8460135d9ea755a6e8fd768de17a29af7e61cf2b21508dd';
const workload = 'task-1-host-supervisor-v1';
const image = 'teameet-v1-verification:node22-pnpm9.15.4';

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    timeout: options.timeout ?? 30_000,
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function immutableReceiptAt(receiptPath, value) {
  return immutableBytesAt(receiptPath, Buffer.from(JSON.stringify(stable(value))));
}

function immutableBytesAt(receiptPath, bytes) {
  const descriptor = openSync(
    receiptPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o444,
  );
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    chmodSync(receiptPath, 0o444);
  } finally {
    closeSync(descriptor);
  }
  const parent = openSync(
    dirname(receiptPath),
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
  return { path: receiptPath, sha256: sha256(bytes) };
}

function immutableReceipt(directory, value) {
  return immutableReceiptAt(join(directory, 'host-supervisor.json'), value);
}

function candidateFixture() {
  const temporaryDirectory = mkdtempSync(
    '/private/tmp/teameet-v1-candidate-contract-',
  );
  const worktree = join(temporaryDirectory, 'worktree');
  const index = join(temporaryDirectory, 'index');
  mkdirSync(worktree);
  const archive = spawnSync('git', ['archive', '--format=tar', 'HEAD'], {
    cwd: repoRoot,
    encoding: null,
    maxBuffer: 512 * 1024 * 1024,
  });
  assert.equal(archive.status, 0, archive.stderr?.toString('utf8'));
  const extracted = spawnSync('tar', ['-xf', '-', '-C', worktree], {
    input: archive.stdout,
    encoding: 'utf8',
  });
  assert.equal(extracted.status, 0, extracted.stderr);
  const ledgerText = readFileSync(
    join(worktree, '.github/tasks/127-v1-team-tournament-operations-game-record.md'),
    'utf8',
  );
  const ledgerMatch = ledgerText.match(
    /<!-- TASK127_LEDGER_JSON_BEGIN -->\s*```json\n([\s\S]*?)\n```\s*<!-- TASK127_LEDGER_JSON_END -->/,
  );
  assert.ok(ledgerMatch);
  const ledger = JSON.parse(ledgerMatch[1]);
  const fixtureOnlyPaths = [
    '.omo/plans/teameet-team-tournament-operations-v1.md',
    '.omo/evidence/approved-task-1-clean-restart-v0-dc4ecb2f.json',
    '.omo/evidence/task-1-task127-clean-restart-cursor-dc4ecb2f.json',
    '.omo/evidence/task-1-host-pressure-override-dc4ecb2f-r2.json',
    '.omo/evidence/task-1-v0-execution-consumption-dc4ecb2f.json',
    '.omo/evidence/task-1-rollback-a-recovered.json',
    '.omo/evidence/task-1-host-supervisor-receipt-dc4ecb2f-r3.json',
  ];
  for (const path of [
    ...ledger.unrelatedDirty.paths.map((entry) => entry.path),
    ...fixtureOnlyPaths,
  ]) {
    const source = join(repoRoot, path);
    const target = join(worktree, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
  const gitEnvironment = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    LANG: 'C.UTF-8',
    TZ: 'UTC',
    GIT_DIR: join(repoRoot, '.git'),
    GIT_WORK_TREE: worktree,
    GIT_INDEX_FILE: index,
  };
  const indexResult = spawnSync('git', ['read-tree', 'HEAD'], {
    cwd: worktree,
    env: gitEnvironment,
    encoding: 'utf8',
  });
  assert.equal(indexResult.status, 0, indexResult.stderr);
  const sourceManifestPath =
    '/private/tmp/teameet-ulw-evidence/teameet-team-tournament-operations-v1/tree-sha256/a48c8be7ff1a23ed7511c89a8f8167eb48382dc0/attempt-50863f5b-9aba-4be1-833b-bef8558241cd/source-manifest.json';
  const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8'));
  const candidateSHA = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: worktree,
    env: gitEnvironment,
    encoding: 'utf8',
  }).stdout.trim();
  const candidate = immutableReceiptAt(
    join(temporaryDirectory, 'candidate.json'),
    {
      schemaVersion: 1,
      phase: 'candidate',
      baselineSHA: '71f67b0d24e272eecd216cebb31eefbd66c9ca02',
      restartHeadSHA: 'a4823d2f575d9396323421024a81a63dacf0cf67',
      candidateSHA,
      sourceTreeSHA: sourceManifest.sourceTreeSHA,
      sourceManifestPath,
      sourceManifestSHA:
        '4e39da5d4d994705c8167b9061fa4f14a0ad95b354f6e5e0bdfd00b1551d70ae',
      planSHA,
      approvalReceipt: {
        path: '.omo/evidence/approved-task-1-clean-restart-v0-dc4ecb2f.json',
        sha256: 'd30d3688ef97b0cefabfad3e6deb8343bb9e8b8f017bae0ff91572be901527ae',
      },
      task127CursorReceipt: {
        path: '.omo/evidence/task-1-task127-clean-restart-cursor-dc4ecb2f.json',
        sha256: '0946bd0170f9034fdc4c5d99803e2b0ecf7afb46344988e9903933bcee55d9a7',
      },
      overrideReceipt: {
        path: '.omo/evidence/task-1-host-pressure-override-dc4ecb2f-r2.json',
        sha256: '84ab59119f5f83bcffed1478faa50b185b0c02bbb3ca5ecc37822a3c49e92748',
      },
      consumptionReceipt: {
        path: '.omo/evidence/task-1-v0-execution-consumption-dc4ecb2f.json',
        sha256: '6cfd41dcbb56bbb07fe3dfb5eb208f2449b8dbb90cef6742618b75481d8ecac4',
      },
      ownedPathBlobs: sourceManifest.entries.map(({ path, candidate: entry }) => ({
        path,
        mode: entry.mode,
        blobSHA: entry.blob,
      })),
      createdAt: '2026-07-30T10:00:00.000Z',
    },
  );
  return {
    candidate,
    candidateSHA,
    environment: {
      ...gitEnvironment,
      OMO_SELECTED_PLAN_SHA: planSHA,
    },
    evidenceRoot: join(temporaryDirectory, 'evidence'),
    sourceManifest,
    sourceManifestPath,
    worktree,
    cleanup: () => rmSync(temporaryDirectory, { recursive: true, force: true }),
  };
}

function cleanRestartFixture() {
  const temporaryDirectory = mkdtempSync(
    '/private/tmp/teameet-v1-clean-restart-contract-',
  );
  const worktree = join(temporaryDirectory, 'worktree');
  mkdirSync(worktree);
  const archive = spawnSync(
    'git',
    ['archive', '--format=tar', 'a4823d2f575d9396323421024a81a63dacf0cf67'],
    {
      cwd: repoRoot,
      encoding: null,
      maxBuffer: 512 * 1024 * 1024,
    },
  );
  assert.equal(archive.status, 0, archive.stderr?.toString('utf8'));
  const extracted = spawnSync('tar', ['-xf', '-', '-C', worktree], {
    input: archive.stdout,
    encoding: 'utf8',
  });
  assert.equal(extracted.status, 0, extracted.stderr);
  const initialized = spawnSync('git', ['init', '--initial-branch=dev'], {
    cwd: worktree,
    encoding: 'utf8',
  });
  assert.equal(initialized.status, 0, initialized.stderr);
  const objectsInfo = join(worktree, '.git/objects/info');
  mkdirSync(objectsInfo, { recursive: true });
  writeFileSync(
    join(objectsInfo, 'alternates'),
    `${join(repoRoot, '.git/objects')}\n`,
  );
  writeFileSync(
    join(worktree, '.git/info/exclude'),
    `${readFileSync(join(repoRoot, '.git/info/exclude'), 'utf8')}\n.omo/\n`,
  );
  const head = spawnSync(
    'git',
    ['update-ref', 'refs/heads/dev', 'a4823d2f575d9396323421024a81a63dacf0cf67'],
    { cwd: worktree, encoding: 'utf8' },
  );
  assert.equal(head.status, 0, head.stderr);
  const index = spawnSync('git', ['read-tree', 'HEAD'], {
    cwd: worktree,
    encoding: 'utf8',
  });
  assert.equal(index.status, 0, index.stderr);
  const ledgerText = readFileSync(
    join(worktree, '.github/tasks/127-v1-team-tournament-operations-game-record.md'),
    'utf8',
  );
  const ledgerMatch = ledgerText.match(
    /<!-- TASK127_LEDGER_JSON_BEGIN -->\s*```json\n([\s\S]*?)\n```\s*<!-- TASK127_LEDGER_JSON_END -->/,
  );
  assert.ok(ledgerMatch);
  const ledger = JSON.parse(ledgerMatch[1]);
  const ownedPaths = ledger.ownership.find(({ todo }) => todo === 1).outputs;
  const fixtureOnlyPaths = [
    '.omo/plans/teameet-team-tournament-operations-v1.md',
    '.omo/evidence/approved-task-1-clean-restart-v0-dc4ecb2f.json',
    '.omo/evidence/task-1-task127-clean-restart-cursor-dc4ecb2f.json',
    '.omo/evidence/task-1-host-pressure-override-dc4ecb2f-r2.json',
    '.omo/evidence/task-1-v0-execution-consumption-dc4ecb2f.json',
    '.omo/evidence/task-1-rollback-a-recovered.json',
  ];
  for (const path of [
    ...ownedPaths,
    ...ledger.unrelatedDirty.paths.map((entry) => entry.path),
    ...fixtureOnlyPaths,
  ]) {
    const source = join(repoRoot, path);
    const target = join(worktree, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
  return {
    worktree: repoRoot,
    evidenceRoot: join(temporaryDirectory, 'evidence'),
    environment: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LANG: 'C.UTF-8',
      TZ: 'UTC',
      GIT_DIR: join(worktree, '.git'),
      GIT_WORK_TREE: repoRoot,
      GIT_INDEX_FILE: join(worktree, '.git/index'),
      OMO_SELECTED_PLAN_SHA: planSHA,
    },
    cleanup: () => rmSync(temporaryDirectory, { recursive: true, force: true }),
  };
}

function docker(args, expectedStatus = 0) {
  const result = spawnSync('docker', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(
    result.status,
    expectedStatus,
    `docker ${args.join(' ')}\nstdout=${result.stdout}\nstderr=${result.stderr}`,
  );
  return result.stdout.trim();
}

function realDockerSupervisorProbe() {
  const attemptId = randomUUID();
  const suffix = attemptId.replaceAll('-', '').slice(0, 20);
  const containerName = `teameet-v1-t1-probe-${suffix}`;
  const networkName = `teameet-v1-t1-net-${suffix}`;
  const volumeName = `teameet-v1-t1-cache-${suffix}`;
  const label = `com.teameet.verification.attempt=${attemptId}`;
  let containerCreated = false;
  let networkCreated = false;
  let volumeCreated = false;
  try {
    docker(['network', 'create', '--label', `com.teameet.verification.workload=${workload}`, '--label', label, networkName]);
    networkCreated = true;
    docker(['volume', 'create', '--label', `com.teameet.verification.workload=${workload}`, '--label', label, volumeName]);
    volumeCreated = true;
    docker([
      'create',
      '--name',
      containerName,
      '--label',
      `com.teameet.verification.workload=${workload}`,
      '--label',
      label,
      '--cpus',
      '1',
      '--memory',
      '4g',
      '--pids-limit',
      '256',
      '--network',
      networkName,
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,nodev,size=64m',
      '--mount',
      `type=volume,src=${volumeName},dst=/verification/cache`,
      '--entrypoint',
      'node',
      image,
      '-e',
      'process.on(\"SIGTERM\",()=>process.exit(0));setInterval(()=>{},1000)',
    ]);
    containerCreated = true;
    docker(['start', containerName]);
    const inspect = JSON.parse(docker(['inspect', containerName]))[0];
    assert.equal(inspect.HostConfig.NanoCpus, 1_000_000_000);
    assert.equal(inspect.HostConfig.Memory, 4_294_967_296);
    assert.equal(inspect.HostConfig.PidsLimit, 256);
    assert.equal(inspect.HostConfig.ReadonlyRootfs, true);
    assert.equal(inspect.HostConfig.Privileged, false);
    assert.equal(inspect.HostConfig.NetworkMode, networkName);
    assert.equal(
      inspect.Mounts.some((mount) => mount.Destination === '/var/run/docker.sock'),
      false,
    );
    docker(['kill', '--signal', 'TERM', containerName]);
    docker(['wait', containerName]);
  } finally {
    if (containerCreated) {
      spawnSync('docker', ['rm', '--force', containerName], { encoding: 'utf8' });
    }
    if (volumeCreated) {
      spawnSync('docker', ['volume', 'rm', '--force', volumeName], { encoding: 'utf8' });
    }
    if (networkCreated) {
      spawnSync('docker', ['network', 'rm', networkName], { encoding: 'utf8' });
    }
  }
  assert.equal(
    docker(['ps', '-aq', '--filter', `label=com.teameet.verification.attempt=${attemptId}`]),
    '',
  );
  assert.equal(
    docker(['network', 'ls', '-q', '--filter', `label=com.teameet.verification.attempt=${attemptId}`]),
    '',
  );
  assert.equal(
    docker(['volume', 'ls', '-q', '--filter', `label=com.teameet.verification.attempt=${attemptId}`]),
    '',
  );
  return attemptId;
}

test('current a482 bound-source validator contract', () => {
  const result = runNode([
    'scripts/qa/verify-team-tournament-bound-sources.mjs',
    '--pdf-sha',
    '1558110dc711d421f7c4eea5cd98accc528180e625e1980578f92e1256806d50',
    '--preview-sha',
    '7d8e101ad27a6a227f1a525a729888aa4286845b5a6819aaa034b57cc55ba9f1',
    '--design-commit',
    '71f67b0d24e272eecd216cebb31eefbd66c9ca02',
    '--design-sha',
    '3ee8aedd03c507a7b7540bc9134e52abf49e8210a30d338bca2a899beca0f8a2',
  ]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(
    {
      code: output.code,
      pdf: output.pdf.sha256,
      preview: output.preview.sha256,
      design: output.design.sha256,
      designCommit: output.design.commit,
    },
    {
      code: 'BOUND_SOURCES_OK',
      pdf: '1558110dc711d421f7c4eea5cd98accc528180e625e1980578f92e1256806d50',
      preview: '7d8e101ad27a6a227f1a525a729888aa4286845b5a6819aaa034b57cc55ba9f1',
      design: '3ee8aedd03c507a7b7540bc9134e52abf49e8210a30d338bca2a899beca0f8a2',
      designCommit: '71f67b0d24e272eecd216cebb31eefbd66c9ca02',
    },
  );
});

test('plan-schema Task-1 candidate receipt binds the committed source manifest', () => {
  const fixture = candidateFixture();
  try {
    const result = runNode(
      [
        resolve(repoRoot, 'scripts/qa/run-v1-task-verification.mjs'),
        '--task',
        '1',
        '--phase',
        'candidate',
        '--plan-sha',
        planSHA,
        '--candidate-receipt',
        fixture.candidate.path,
        '--candidate-receipt-sha',
        fixture.candidate.sha256,
        '--require-host-supervisor-receipt',
        resolve(repoRoot, '.omo/evidence/task-1-host-supervisor-receipt-dc4ecb2f-r3.json'),
        '--require-host-supervisor-receipt-sha',
        '5d5190feb0af56e763b06e3b699b1c7f060e0f05f36ce15b09bdfcd7b45d5300',
        '--evidence-root',
        fixture.evidenceRoot,
        '--',
        'node',
        'scripts/qa/validate-team-tournament-ledger.mjs',
        '.github/tasks/127-v1-team-tournament-operations-game-record.md',
        '--verify-clean-restart-cursor-chain',
        '--verify-rollback-clean-state',
        '--verify-source-manifest',
        '--pdf-sha',
        '1558110dc711d421f7c4eea5cd98accc528180e625e1980578f92e1256806d50',
        '--preview-sha',
        '7d8e101ad27a6a227f1a525a729888aa4286845b5a6819aaa034b57cc55ba9f1',
        '--design-commit',
        '71f67b0d24e272eecd216cebb31eefbd66c9ca02',
        '--design-sha',
        '3ee8aedd03c507a7b7540bc9134e52abf49e8210a30d338bca2a899beca0f8a2',
      ],
      {
        cwd: fixture.worktree,
        env: fixture.environment,
        timeout: 120_000,
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.phase, 'candidate');
    assert.equal(receipt.candidateSHA, fixture.candidateSHA);
    assert.equal(receipt.liveHead, fixture.candidateSHA);
    assert.equal(receipt.sourceTreeSHA, fixture.sourceManifest.sourceTreeSHA);
    assert.equal(receipt.sourceManifestPath, fixture.sourceManifestPath);
    assert.equal(
      receipt.sourceManifestSHA,
      '4e39da5d4d994705c8167b9061fa4f14a0ad95b354f6e5e0bdfd00b1551d70ae',
    );
    assert.equal(receipt.payloadExitCode, 0);
    assert.equal(receipt.verdict, 'accepted');
    assert.deepEqual(receipt.cleanup, {
      containers: 0,
      networks: 0,
      volumes: 0,
      overlays: 0,
      publishedPorts: 0,
      hostBrowserPids: 0,
      tempRoots: 0,
    });
  } finally {
    fixture.cleanup();
  }
});

test('trusted host supervisor contract', () => {
  const probeAttemptId = realDockerSupervisorProbe();
  const restart = cleanRestartFixture();
  const temporaryDirectory = mkdtempSync(
    '/private/tmp/teameet-v1-supervisor-contract-',
  );
  try {
    const dockerInfo = JSON.parse(docker(['info', '--format', '{{json .}}']));
    const supervisorValue = {
      schemaVersion: 1,
      receiptType: 'task-1-host-supervisor-gate',
      gateId: 'HOST-SUPERVISOR',
      taskId: 1,
      workloadId: workload,
      planSHA,
      approvalReceipt: {
        path: '.omo/evidence/approved-task-1-clean-restart-v0-dc4ecb2f.json',
        sha256: 'd30d3688ef97b0cefabfad3e6deb8343bb9e8b8f017bae0ff91572be901527ae',
      },
      task127CursorReceipt: {
        path: '.omo/evidence/task-1-task127-clean-restart-cursor-dc4ecb2f.json',
        sha256: '0946bd0170f9034fdc4c5d99803e2b0ecf7afb46344988e9903933bcee55d9a7',
      },
      overrideReceipt: {
        path: '.omo/evidence/task-1-host-pressure-override-dc4ecb2f-r2.json',
        sha256: '84ab59119f5f83bcffed1478faa50b185b0c02bbb3ca5ecc37822a3c49e92748',
      },
      consumptionReceipt: {
        path: '.omo/evidence/task-1-v0-execution-consumption-dc4ecb2f.json',
        sha256: '6cfd41dcbb56bbb07fe3dfb5eb208f2449b8dbb90cef6742618b75481d8ecac4',
      },
      docker: {
        context: docker(['context', 'show']),
        serverId: dockerInfo.ID,
        serverVersion: dockerInfo.ServerVersion,
        operatingSystem: dockerInfo.OperatingSystem,
        ostype: dockerInfo.OSType,
      },
      probes: {
        attemptId: probeAttemptId,
        create: true,
        start: true,
        inspect: true,
        interrupt: true,
        stop: true,
        remove: true,
      },
      cleanup: {
        containers: 0,
        networks: 0,
        volumes: 0,
        overlays: 0,
        publishedPorts: 0,
        hostBrowserPids: 0,
        tempRoots: 0,
      },
      createdAt: new Date().toISOString(),
      verdict: 'APPROVE',
    };
    const supervisor = immutableReceipt(temporaryDirectory, supervisorValue);
    const trailingSupervisor = immutableBytesAt(
      join(temporaryDirectory, 'host-supervisor-trailing.json'),
      Buffer.from(`${JSON.stringify(stable(supervisorValue))}\n`),
    );
    const hostilePayload = [
      'const fs=require("node:fs");',
      'if(process.getuid?.()===0)process.exit(31);',
      'if(fs.existsSync("/var/run/docker.sock"))process.exit(32);',
      'if(Object.keys(process.env).some(k=>/(TOKEN|SECRET|PASSWORD|SSH|AWS|GOOGLE|AZURE)/i.test(k)))process.exit(35);',
      'try{fs.writeFileSync("/verification/source/.task1-readonly-probe","x");process.exit(33)}catch{}',
      'if(!fs.existsSync("/verification/source/.github/tasks/127-v1-team-tournament-operations-game-record.md"))process.exit(34);',
      'process.stdout.write(JSON.stringify({contained:true,dockerSocket:false,sourceReadonly:true}))',
    ].join('');
    const wrapperArguments = (payloadScript, hostReceipt = supervisor) => [
        resolve(repoRoot, 'scripts/qa/run-v1-task-verification.mjs'),
        '--task',
        '1',
        '--phase',
        'clean-restart',
        '--plan-sha',
        planSHA,
        '--baseline-sha',
        '71f67b0d24e272eecd216cebb31eefbd66c9ca02',
        '--restart-head-sha',
        'a4823d2f575d9396323421024a81a63dacf0cf67',
        '--predecessor-chain',
        '71f67b0d24e272eecd216cebb31eefbd66c9ca02,a84a6e5277c4d29f9281140dca6a630fb5a2ca15,d444649adaf1ba88c3dddd755f6728135d8476b4,a4823d2f575d9396323421024a81a63dacf0cf67',
        '--candidate-sha',
        'null',
        '--require-task127-cursor-mode',
        'clean-restart-initial',
        '--require-task127-cursor-receipt',
        '.omo/evidence/task-1-task127-clean-restart-cursor-dc4ecb2f.json',
        '--require-task127-cursor-receipt-sha',
        '0946bd0170f9034fdc4c5d99803e2b0ecf7afb46344988e9903933bcee55d9a7',
        '--require-host-supervisor-receipt',
        hostReceipt.path,
        '--require-host-supervisor-receipt-sha',
        hostReceipt.sha256,
        '--hostile-no-docker-control',
        '--evidence-root',
        restart.evidenceRoot,
        '--',
        'node',
        '-e',
        payloadScript,
      ];
    const wrapperEnvironment = {
          ...restart.environment,
          OMO_REVIEW_RECEIPT_PATH:
            '.omo/evidence/approved-task-1-clean-restart-v0-dc4ecb2f.json',
          OMO_REVIEW_RECEIPT_SHA:
            'd30d3688ef97b0cefabfad3e6deb8343bb9e8b8f017bae0ff91572be901527ae',
          V1_TASK127_CURSOR_RECEIPT_PATH:
            '.omo/evidence/task-1-task127-clean-restart-cursor-dc4ecb2f.json',
          V1_TASK127_CURSOR_RECEIPT_SHA:
            '0946bd0170f9034fdc4c5d99803e2b0ecf7afb46344988e9903933bcee55d9a7',
          V1_HOST_PRESSURE_OVERRIDE_RECEIPT_PATH:
            '.omo/evidence/task-1-host-pressure-override-dc4ecb2f-r2.json',
          V1_HOST_PRESSURE_OVERRIDE_RECEIPT_SHA:
            '84ab59119f5f83bcffed1478faa50b185b0c02bbb3ca5ecc37822a3c49e92748',
          V1_V0_CONSUMPTION_RECEIPT_PATH:
            '.omo/evidence/task-1-v0-execution-consumption-dc4ecb2f.json',
          V1_V0_CONSUMPTION_RECEIPT_SHA:
            '6cfd41dcbb56bbb07fe3dfb5eb208f2449b8dbb90cef6742618b75481d8ecac4',
        };
    const result = runNode(
      wrapperArguments(hostilePayload),
      {
        cwd: restart.worktree,
        env: wrapperEnvironment,
        timeout: 120_000,
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.verdict, 'accepted');
    assert.equal(receipt.payloadExitCode, 0);
    assert.equal(receipt.candidateSHA, null);
    assert.equal(receipt.containerRuntime.cpus, 1);
    assert.equal(receipt.containerRuntime.memoryBytes, 4_294_967_296);
    assert.equal(receipt.containerRuntime.pidsLimit, 256);
    assert.equal(receipt.containerRuntime.privileged, false);
    assert.equal(receipt.containerRuntime.dockerSocketMounted, false);
    assert.equal(receipt.sourceMount.readonly, true);
    assert.deepEqual(receipt.cleanup, {
      containers: 0,
      networks: 0,
      volumes: 0,
      overlays: 0,
      publishedPorts: 0,
      hostBrowserPids: 0,
      tempRoots: 0,
    });
    const trailing = runNode(
      wrapperArguments('process.exit(0)', trailingSupervisor),
      { cwd: restart.worktree, env: wrapperEnvironment, timeout: 120_000 },
    );
    assert.notEqual(trailing.status, 0, trailing.stdout);
    assert.match(trailing.stderr, /HOST_SUPERVISOR_RECEIPT_INVALID/);
    const misleading = runNode(
      wrapperArguments(
        'process.stdout.write(\"VERDICT=accepted\");process.stderr.write(\"real failure\");process.exit(23)',
      ),
      { cwd: restart.worktree, env: wrapperEnvironment, timeout: 120_000 },
    );
    assert.equal(misleading.status, 23, misleading.stderr);
    const misleadingReceipt = JSON.parse(misleading.stderr);
    assert.equal(misleadingReceipt.verdict, 'rejected');
    assert.equal(misleadingReceipt.payloadExitCode, 23);
    assert.deepEqual(misleadingReceipt.cleanup, receipt.cleanup);

    const hung = runNode(
      wrapperArguments('setInterval(()=>{},1000)'),
      { cwd: restart.worktree, env: wrapperEnvironment, timeout: 120_000 },
    );
    assert.notEqual(hung.status, 0, hung.stdout);
    const hungReceipt = JSON.parse(hung.stderr);
    assert.equal(hungReceipt.verdict, 'rejected');
    assert.deepEqual(hungReceipt.cleanup, receipt.cleanup);

    const durable = immutableReceiptAt(
      resolve(
        repoRoot,
        '.omo/evidence/task-1-host-supervisor-receipt-dc4ecb2f-r4.json',
      ),
      {
        ...supervisorValue,
        wrapperProbe: {
          receiptPath: receipt.receiptPath,
          receiptSHA: receipt.receiptSHA,
          sourceTreeSHA: receipt.sourceTreeSHA,
          payloadExitCode: receipt.payloadExitCode,
          verdict: receipt.verdict,
        },
        adversarial: {
          hostileEnvironmentDenied: true,
          misleadingSuccessNonzeroExit: misleadingReceipt.payloadExitCode,
          hungTimeoutRejected: true,
          sourceReadonly: true,
          dockerControlDenied: true,
          zeroResidualAfterEveryProbe: true,
        },
      },
    );
    process.stdout.write(`V1_HOST_SUPERVISOR_RECEIPT_PATH=${durable.path}\n`);
    process.stdout.write(`V1_HOST_SUPERVISOR_RECEIPT_SHA=${durable.sha256}\n`);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    restart.cleanup();
  }
});
