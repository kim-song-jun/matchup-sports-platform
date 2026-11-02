import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import test from 'node:test';

const script = new URL('../release/sync-alpha-verification-env.sh', import.meta.url).pathname;

function run(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'alpha-verification-sync-'));
  const log = join(dir, 'calls');
  const remote = join(dir, 'remote');
  const fakeAws = join(dir, 'aws');
  writeFileSync(fakeAws, `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1 $2" == 'ssm put-parameter' ]]; then
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == --cli-input-json ]]; then payload="\${2#file://}"; break; fi
    shift
  done
  jq -r 'if .Type == "SecureString" then .Name else error("not secure") end' "$payload" >> "$FAKE_LOG"
elif [[ "$1 $2" == 'ssm send-command' ]]; then
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == --parameters ]]; then printf '%s' "$2" | jq -r '.commands[0]' > "$FAKE_REMOTE"; break; fi
    shift
  done
  echo command-test
elif [[ "$1 $2" == 'ssm get-command-invocation' ]]; then
  echo Success
fi
`);
  chmodSync(fakeAws, 0o755);
  const env = {
    ...process.env,
    INSTANCE_ID: 'i-0123456789abcdef0', AWS_REGION: 'ap-northeast-2',
    SECRET_SMS_PROVIDER: 'gabia', SECRET_GABIA_SMS_ID: 'dummy-id', SECRET_GABIA_API_KEY: 'dummy-key',
    SECRET_GABIA_SENDER_NUMBER: '01012345678', SECRET_SOLAPI_API_KEY: 'other-key',
    SECRET_SOLAPI_API_SECRET: 'other-secret', SECRET_SOLAPI_SENDER_NUMBER: '01012345678',
    FAKE_LOG: log, FAKE_REMOTE: remote, PATH: `${dir}:${process.env.PATH}`, ...overrides,
  };
  try {
    const result = spawnSync('bash', [script], { encoding: 'utf8', env });
    let calls = ''; let remoteScript = '';
    try { calls = readFileSync(log, 'utf8'); } catch { /* the input was rejected before any call */ }
    try { remoteScript = readFileSync(remote, 'utf8'); } catch { /* no remote command was submitted */ }
    const syntax = remoteScript ? spawnSync('bash', ['-n'], { input: remoteScript, encoding: 'utf8' }) : null;
    return { result, calls, remoteScript, syntax };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('selected SMS provider is synced and the remote command never contains secret values', () => {
  for (const [provider, expected] of [
    ['gabia', ['SMS_PROVIDER', 'GABIA_SMS_ID', 'GABIA_API_KEY', 'GABIA_SENDER_NUMBER']],
    ['solapi', ['SMS_PROVIDER', 'SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_SENDER_NUMBER']],
  ]) {
    const { result, calls, remoteScript, syntax } = run({ SECRET_SMS_PROVIDER: provider });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(calls.trim().split('\n').map((line) => line.split('/').pop()), expected);
    assert.equal(syntax?.status, 0, syntax?.stderr);
    assert.match(remoteScript, /ALPHA_SES_ACCESS_KEY_ID ALPHA_SES_SECRET_ACCESS_KEY/);
    assert.match(remoteScript, /\/home\/ec2-user\/\.teameet-alpha-runtime\/\.env/);
    assert.doesNotMatch(remoteScript, /dummy-id|dummy-key|other-secret|01012345678/);
  }
});

test('unknown provider or an incomplete credential set fails before changing SSM', () => {
  for (const overrides of [
    { SECRET_SMS_PROVIDER: 'unexpected' },
    { SECRET_SMS_PROVIDER: 'gabia', SECRET_GABIA_API_KEY: '' },
    { SECRET_SMS_PROVIDER: 'solapi', SECRET_SOLAPI_API_SECRET: '' },
  ]) {
    const { result, calls, remoteScript } = run(overrides);
    assert.notEqual(result.status, 0);
    assert.equal(calls, '');
    assert.equal(remoteScript, '');
  }
});

test('host sync preserves unrelated settings and waits for all secrets before replacing stale provider values', () => {
  const { remoteScript } = run();
  const dir = mkdtempSync(join(tmpdir(), 'alpha-verification-host-'));
  const runtime = join(dir, 'runtime-config');
  const fakeAws = join(dir, 'aws');
  const fakeChown = join(dir, 'chown');
  try {
    writeFileSync(runtime, "UNRELATED='keep'\nSOLAPI_API_KEY='old'\n");
    writeFileSync(fakeAws, `#!/usr/bin/env bash
while [[ $# -gt 0 ]]; do
  if [[ "$1" == --name ]]; then key="\${2##*/}"; break; fi
  shift
done
if [[ "$key" == "\${FAKE_FAIL_KEY:-}" ]]; then exit 1; fi
case "$key" in
  SMS_PROVIDER) printf gabia ;;
  ALPHA_SES_ACCESS_KEY_ID) printf TEST_ACCESS ;;
  ALPHA_SES_SECRET_ACCESS_KEY) printf 'TEST/SECRET+KEY' ;;
  GABIA_SMS_ID) printf TEST_ID ;;
  GABIA_API_KEY) printf TEST_API_KEY ;;
  GABIA_SENDER_NUMBER) printf 01012345678 ;;
  *) exit 1 ;;
esac
`);
    writeFileSync(fakeChown, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(fakeAws, 0o755);
    chmodSync(fakeChown, 0o755);
    const localScript = remoteScript
      .replaceAll('/home/ec2-user/teameet/deploy/.env', runtime)
      .replaceAll('/home/ec2-user/.teameet-alpha-runtime/.env', realpathSync(runtime));
    const result = spawnSync('bash', [], { input: localScript, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(result.status, 0, result.stderr);
    const config = readFileSync(runtime, 'utf8');
    assert.match(config, /UNRELATED='keep'/);
    assert.match(config, /SMS_PROVIDER='gabia'/);
    assert.match(config, /ALPHA_SES_SECRET_ACCESS_KEY='TEST\/SECRET\+KEY'/);
    assert.doesNotMatch(config, /SOLAPI_API_KEY=/);
    assert.doesNotMatch(result.stdout + result.stderr, /TEST_SECRET|TEST_API_KEY|01012345678/);

    const original = "UNRELATED='keep'\nSOLAPI_API_KEY='old'\n";
    writeFileSync(runtime, original);
    const failure = spawnSync('bash', [], {
      input: localScript, encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FAKE_FAIL_KEY: 'GABIA_API_KEY' },
    });
    assert.notEqual(failure.status, 0);
    assert.equal(readFileSync(runtime, 'utf8'), original);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
