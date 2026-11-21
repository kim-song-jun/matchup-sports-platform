import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../install.mjs';
import {
  alarmMetrics, buildInstallPlan, buildTeardownPlan, DEFAULTS, lambdaPolicy, serverPolicy,
} from '../lib/plan.mjs';
import { assertApplicable, normalizeCapture, renderCommand, runPlan } from '../lib/run-plan.mjs';
import { RULES, rulesFor, HEALTH_CHECKS } from '../lib/thresholds.mjs';

const ids = { prodInstanceId: 'i-prod', alphaInstanceId: 'i-alpha', rdsId: 'rds-main' };
const INSTALL = fileURLToPath(new URL('../install.mjs', import.meta.url));

const isAwsWrite = (step) => step.args && !step.readonly;

test('the dry-run CLI prints a plan and exits 0 without calling aws', () => {
  // PATH holds no `aws`: if the dry run tried to call it, the run would fail.
  const res = spawnSync(process.execPath, [INSTALL], { encoding: 'utf8', env: { PATH: '', HOME: '/nonexistent' } });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /미리보기/);
  assert.match(res.stdout, /aws iam put-role-policy/);
  assert.match(res.stdout, /aws cloudwatch put-metric-alarm/);
  assert.doesNotMatch(res.stdout, /실제로 만들어요/);
});

test('--apply is the only way to leave dry-run', () => {
  assert.equal(parseArgs([]).apply, false);
  assert.equal(parseArgs(['--dry-run']).apply, false);
  assert.equal(parseArgs(['--apply']).apply, true);
  assert.throws(() => parseArgs(['--aply']), /unknown argument/);
  assert.throws(() => parseArgs(['--rds-id']), /needs a value/);
});

test('dry run never invokes exec or the zip builder', async () => {
  const calls = [];
  const out = [];
  await runPlan(buildInstallPlan({}), {
    apply: false, exec: async (a) => { calls.push(a); return ''; }, log: (l) => out.push(l),
    buildZip: async () => { calls.push('zip'); return '/x'; },
  });
  assert.deepEqual(calls, []);
  assert.ok(out.length > 40);
});

test('apply refuses before the first call while instance/RDS ids are still placeholders', async () => {
  const calls = [];
  await assert.rejects(
    runPlan(buildInstallPlan({}), { apply: true, exec: async (a) => { calls.push(a); return ''; }, log() {}, buildZip: async () => '/x' }),
    /--prod-instance-id/,
  );
  assert.deepEqual(calls, [], 'nothing may be created when the plan is incomplete');
});

test('apply runs steps in order and threads captured values (account, health check ids, zip)', async () => {
  const calls = [];
  const exec = async (args) => {
    calls.push(args);
    if (args[0] === 'sts') return '111122223333\n';
    if (args[0] === 'route53') return `hc-${args.includes('teameet-ops-health-api') ? 'api' : 'web'}\n`;
    return '';
  };
  await runPlan(buildInstallPlan(ids), { apply: true, exec, log() {}, buildZip: async () => '/tmp/lambda.zip' });
  assert.equal(calls[0][0], 'sts');
  const flat = calls.map((c) => c.join(' '));
  assert.ok(!flat.some((c) => c.includes('{{')), 'every token was substituted');
  assert.ok(flat.some((c) => c.includes('fileb:///tmp/lambda.zip')));
  assert.ok(flat.some((c) => c.includes('arn:aws:iam::111122223333:role/teameet-ops-slack-lambda')));
  const healthAlarm = calls.find((c) => c.includes('teameet-prod-health-api'));
  assert.ok(healthAlarm.join(' ').includes('"Value":"hc-'));
  const order = (needle) => flat.findIndex((c) => c.includes(needle));
  assert.ok(order('ssm get-parameter') < order('iam create-role'), 'webhook check comes before anything is created');
  assert.ok(order('lambda create-function') < order('sns subscribe'));
  assert.ok(order('route53 create-health-check') < order('teameet-prod-health-api'));
});

test('apply stops at the first real failure and reports which step', async () => {
  const exec = async (args) => {
    if (args[0] === 'ssm') throw Object.assign(new Error('x'), { stderr: 'ParameterNotFound' });
    return '';
  };
  await assert.rejects(
    runPlan(buildInstallPlan(ids), { apply: true, exec, log() {}, buildZip: async () => '/x' }),
    /webhook-exists 실패.*SecureString/s,
  );
});

test('a second apply tolerates "already exists" but not other errors', async () => {
  const calls = [];
  const exec = async (args) => {
    calls.push(args[1]);
    if (args[1] === 'create-role') throw Object.assign(new Error('boom'), { stderr: 'EntityAlreadyExists: role exists' });
    return args[0] === 'sts' ? '111122223333' : '';
  };
  await runPlan(buildInstallPlan(ids), { apply: true, exec, log() {}, buildZip: async () => '/x' });
  assert.ok(calls.includes('put-role-policy'), 'continues after the tolerated error');
  const bad = async (args) => { if (args[1] === 'create-role') throw Object.assign(new Error('AccessDenied'), { stderr: 'AccessDenied' }); return ''; };
  await assert.rejects(runPlan(buildInstallPlan(ids), { apply: true, exec: bad, log() {}, buildZip: async () => '/x' }), /role 실패/);
});

test('plan creates one alarm per rule (prod + alpha subset) plus Lambda-errors and 2 health alarms', () => {
  const alarms = buildInstallPlan(ids).filter((s) => s.args?.[1] === 'put-metric-alarm');
  assert.equal(alarms.length, rulesFor('prod').length + rulesFor('alpha').length + 1 + HEALTH_CHECKS.length);
  assert.equal(buildInstallPlan({ ...ids, includeAlpha: false }).filter((s) => s.id.startsWith('alarm-alpha')).length, 0);
  for (const a of alarms) {
    assert.ok(a.args.includes('--alarm-actions') && a.args.includes('--ok-actions'), 'recovery must notify too');
  }
});

test('the webhook is only ever referenced by parameter name', () => {
  const text = JSON.stringify(buildInstallPlan(ids));
  assert.ok(!/hooks\.slack\.com/.test(text));
  assert.ok(text.includes(DEFAULTS.webhookParam));
  const read = buildInstallPlan(ids).find((s) => s.id === 'webhook-exists');
  assert.ok(!read.args.includes('--with-decryption'), 'existence check must not read the secret');
});

test('Lambda role: reads exactly one SSM parameter, decrypt only via SSM, nothing writes', () => {
  const policy = lambdaPolicy({ ...DEFAULTS });
  const statements = Object.fromEntries(policy.Statement.map((s) => [s.Sid, s]));
  assert.equal(statements.ReadWebhook.Resource, 'arn:aws:ssm:ap-northeast-2:{{account}}:parameter/teameet/ops/slack-webhook');
  assert.deepEqual(statements.DecryptWebhook.Condition.StringEquals, { 'kms:ViaService': 'ssm.ap-northeast-2.amazonaws.com' });
  const actions = policy.Statement.flatMap((s) => [s.Action].flat());
  assert.ok(actions.every((a) => !/^(\*|.*:\*)$/.test(a)), 'no wildcard actions');
  assert.ok(!actions.some((a) => /Put|Delete|Create(?!Log)|Update|Publish|Invoke/.test(a.split(':')[1]) && !a.startsWith('logs:')));
});

test('server policy can publish only into its own namespace', () => {
  for (const [env, ns] of [['prod', 'Teameet/Ops/Prod'], ['alpha', 'Teameet/Ops/Alpha']]) {
    const [s] = serverPolicy(env).Statement;
    assert.equal(s.Action, 'cloudwatch:PutMetricData');
    assert.deepEqual(s.Condition.StringEquals, { 'cloudwatch:namespace': ns });
  }
  assert.notEqual(JSON.stringify(serverPolicy('prod')), JSON.stringify(serverPolicy('alpha')));
});

test('the server policies are printed for the operator, never applied by the script', () => {
  const notes = buildInstallPlan(ids).filter((s) => s.note);
  assert.equal(notes.length, 2);
  assert.ok(notes.every((s) => !s.args));
});

test('alarm metrics: restarts sum the four containers, FILLing gaps with 0', () => {
  const m = alarmMetrics('prod', RULES.find((r) => r.id === 'web-restart'), { instanceIds: {}, rdsId: '' });
  const containers = m.filter((x) => x.MetricStat).map((x) => x.MetricStat.Metric.Dimensions[0].Value);
  assert.deepEqual(containers, ['web', 'api', 'worker', 'nginx']);
  assert.equal(m.at(-1).Expression, 'FILL(m1,0)+FILL(m2,0)+FILL(m3,0)+FILL(m4,0)');
  assert.deepEqual(m.filter((x) => x.ReturnData).map((x) => x.Id), ['e1']);
});

test('alarm metrics: EC2 and RDS rules carry their own dimension values, alpha never reads prod namespaces', () => {
  const p = { instanceIds: { prod: 'i-prod', alpha: 'i-alpha' }, rdsId: 'rds-main' };
  const ec2 = alarmMetrics('prod', RULES.find((r) => r.id === 'ec2-cpu-high'), p)[0].MetricStat.Metric;
  assert.deepEqual(ec2.Dimensions, [{ Name: 'InstanceId', Value: 'i-prod' }]);
  const rds = alarmMetrics('prod', RULES.find((r) => r.id === 'rds-memory-low'), p)[0].MetricStat.Metric;
  assert.deepEqual(rds.Dimensions, [{ Name: 'DBInstanceIdentifier', Value: 'rds-main' }]);
  const alpha = alarmMetrics('alpha', rulesFor('alpha').find((r) => r.id === 'disk-high'), p)[0].MetricStat.Metric;
  assert.equal(alpha.Namespace, 'Teameet/Ops/Alpha');
});

test('the collector-silent alarm treats missing data as breaching, a counter alarm does not', () => {
  const arg = (id) => {
    const a = buildInstallPlan(ids).find((s) => s.id === id).args;
    return a[a.indexOf('--treat-missing-data') + 1];
  };
  assert.equal(arg('alarm-prod-collector-silent'), 'breaching');
  assert.equal(arg('alarm-prod-web-restart'), 'notBreaching');
});

test('teardown removes only what the stack made: the existing topic and backup alarm are never touched', () => {
  const text = JSON.stringify(buildTeardownPlan(ids));
  assert.ok(!text.includes('backup-missing'));
  assert.ok(!buildTeardownPlan(ids).some((s) => s.args?.[1] === 'delete-topic' && s.args.includes('teameet-prod-ops-alerts')));
  const alarmDeletes = buildTeardownPlan(ids).filter((s) => s.args?.[1] === 'delete-alarms');
  assert.equal(alarmDeletes.length, 2);
});

test('teardown skips a step whose target does not exist instead of calling with an empty id', async () => {
  const calls = [];
  const exec = async (args) => { calls.push(args); return args[0] === 'sts' ? '111122223333' : ''; };
  await runPlan(buildTeardownPlan(ids), { apply: true, exec, log() {}, buildZip: async () => '/x' });
  assert.ok(!calls.some((c) => c[1] === 'delete-health-check'));
  assert.ok(!calls.some((c) => c[1] === 'unsubscribe'));
});

test('renderCommand quotes JSON so a printed command can be pasted into a shell', () => {
  assert.equal(renderCommand(['x', 'y z', `it's`]), `aws x 'y z' 'it'\\''s'`);
  assert.doesNotThrow(() => assertApplicable(buildInstallPlan(ids)));
  assert.throws(() => assertApplicable(buildInstallPlan({})), /--prod-instance-id/);
});

test('every put-metric-alarm uses --metrics JSON that parses and has exactly one returned series', () => {
  for (const s of buildInstallPlan(ids).filter((x) => x.args?.[1] === 'put-metric-alarm')) {
    const metrics = JSON.parse(s.args[s.args.indexOf('--metrics') + 1]);
    assert.equal(metrics.filter((m) => m.ReturnData).length, 1, s.id);
  }
});

test('teardown: the CLI text output "None" means nothing was found, so no delete runs', async () => {
  const calls = [];
  const exec = async (args) => {
    calls.push(args);
    if (args[0] === 'sts') return '111122223333\n';
    return args[1] === 'list-health-checks' || args[1] === 'list-subscriptions-by-topic' ? 'None\n' : '';
  };
  await runPlan(buildTeardownPlan(ids), { apply: true, exec, log() {}, buildZip: async () => '/x' });
  assert.ok(!calls.some((c) => c[1] === 'delete-health-check' || c[1] === 'unsubscribe'));
  assert.ok(calls.some((c) => c[1] === 'delete-alarms'), 'unrelated steps still run');
});

test('teardown: several matches stop the run instead of deleting an arbitrary one', async () => {
  const exec = async (args) => (args[0] === 'sts' ? '111122223333' : args[1] === 'list-health-checks' ? 'hc-1\thc-2\n' : '');
  await assert.rejects(runPlan(buildTeardownPlan(ids), { apply: true, exec, log() {}, buildZip: async () => '/x' }), /여러 개/);
  assert.equal(normalizeCapture('  hc-1\n', 'x'), 'hc-1');
});
