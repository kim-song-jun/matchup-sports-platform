// Builds the list of AWS CLI steps that create (or remove) the alerting stack, as data.
// install.mjs prints them (default) or runs them (--apply). Nothing here touches AWS.
import {
  alarmName, HEALTH_CHECKS, NAMESPACES, rulesFor, SPIKE_5XX_EXPRESSION,
} from './thresholds.mjs';

export const DEFAULTS = {
  region: 'ap-northeast-2',
  healthRegion: 'us-east-1',
  host: 'teameet.co.kr',
  webhookParam: '/teameet/ops/slack-webhook',
  topicName: 'teameet-prod-ops-alerts',
  healthTopicName: 'teameet-ops-alerts-use1',
  lambdaName: 'teameet-ops-slack',
  lambdaRole: 'teameet-ops-slack-lambda',
  schedulerRole: 'teameet-ops-summary-scheduler',
  scheduleName: 'teameet-ops-daily-summary',
  includeAlpha: true,
};

const q = (name) => `<${name}>`;
export const hasPlaceholder = (text) => /<[A-Z_]+>/.test(text);

/** Resource policy of the Lambda role. The webhook parameter is the only secret it can read. */
export function lambdaPolicy(p) {
  return {
    Version: '2012-10-17',
    Statement: [
      { Sid: 'Logs', Effect: 'Allow', Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        Resource: `arn:aws:logs:${p.region}:{{account}}:log-group:/aws/lambda/${p.lambdaName}:*` },
      { Sid: 'ReadWebhook', Effect: 'Allow', Action: 'ssm:GetParameter',
        Resource: `arn:aws:ssm:${p.region}:{{account}}:parameter${p.webhookParam}` },
      { Sid: 'DecryptWebhook', Effect: 'Allow', Action: 'kms:Decrypt',
        Resource: `arn:aws:kms:${p.region}:{{account}}:key/*`,
        Condition: { StringEquals: { 'kms:ViaService': `ssm.${p.region}.amazonaws.com` } } },
      { Sid: 'ReadMetricsForSummary', Effect: 'Allow',
        Action: ['cloudwatch:GetMetricData', 'cloudwatch:DescribeAlarms', 'cloudwatch:DescribeAlarmHistory'], Resource: '*' },
      { Sid: 'ReadCost', Effect: 'Allow', Action: ['ce:GetCostAndUsage', 'ce:GetCostForecast'], Resource: '*' },
    ],
  };
}

/** What the server's instance role needs, per environment: publish into its own namespace only. */
export function serverPolicy(env) {
  return {
    Version: '2012-10-17',
    Statement: [{
      Sid: 'PublishOpsMetrics', Effect: 'Allow', Action: 'cloudwatch:PutMetricData', Resource: '*',
      Condition: { StringEquals: { 'cloudwatch:namespace': NAMESPACES[env] } },
    }],
  };
}

const trust = (service) => ({
  Version: '2012-10-17',
  Statement: [{ Effect: 'Allow', Principal: { Service: service }, Action: 'sts:AssumeRole' }],
});

const metric = (id, namespace, metricName, period, stat, dimensions) => ({
  Id: id,
  MetricStat: { Metric: { Namespace: namespace, MetricName: metricName, ...(dimensions ? { Dimensions: dimensions } : {}) }, Period: period, Stat: stat },
  ReturnData: true,
});

export function alarmMetrics(env, rule, p) {
  const ns = NAMESPACES[env];
  const s = rule.source;
  if (s.kind === 'custom') return [metric('m1', ns, s.metricName, s.period, s.stat)];
  if (s.kind === 'aws') {
    const value = s.dimensionName === 'InstanceId' ? p.instanceIds[env] : p.rdsId;
    return [metric('m1', s.namespace, s.metricName, s.period, s.stat, [{ Name: s.dimensionName, Value: value }])];
  }
  if (s.kind === 'sum-containers') {
    const parts = s.containers.map((c, i) => ({
      ...metric(`m${i + 1}`, ns, s.metricName, s.period, 'Sum', [{ Name: 'Container', Value: c }]), ReturnData: false,
    }));
    const sum = s.containers.map((_, i) => `FILL(m${i + 1},0)`).join('+');
    return [...parts, { Id: 'e1', Expression: sum, Label: s.metricName, ReturnData: true }];
  }
  if (s.kind === 'spike-5xx') {
    return [
      { ...metric('m1', ns, 'Nginx5xx', s.period, 'Sum'), ReturnData: false },
      { ...metric('m2', ns, 'NginxRequests', s.period, 'Sum'), ReturnData: false },
      { ...metric('m3', ns, 'DeployWindow', s.period, 'Maximum'), ReturnData: false },
      { Id: 'e1', Expression: SPIKE_5XX_EXPRESSION, Label: '5xx spike', ReturnData: true },
    ];
  }
  throw new Error(`unknown rule source: ${s.kind}`);
}

function putAlarmArgs({ region, name, description, op, threshold, evaluationPeriods, datapointsToAlarm, missing, topic, metrics }) {
  return ['cloudwatch', 'put-metric-alarm', '--region', region, '--alarm-name', name,
    '--alarm-description', description, '--comparison-operator', op, '--threshold', String(threshold),
    '--evaluation-periods', String(evaluationPeriods), '--datapoints-to-alarm', String(datapointsToAlarm),
    '--treat-missing-data', missing, '--alarm-actions', topic, '--ok-actions', topic,
    '--metrics', JSON.stringify(metrics)];
}

const resolve = (p) => ({
  ...DEFAULTS,
  ...p,
  instanceIds: { prod: p.prodInstanceId ?? q('PROD_INSTANCE_ID'), alpha: p.alphaInstanceId ?? q('ALPHA_INSTANCE_ID') },
  rdsId: p.rdsId ?? q('RDS_INSTANCE_ID'),
});

export const alarmNames = (p) => {
  const r = resolve(p);
  const names = [];
  for (const env of r.includeAlpha ? ['prod', 'alpha'] : ['prod']) {
    for (const rule of rulesFor(env)) names.push({ env, name: alarmName(env, rule.id) });
  }
  for (const h of HEALTH_CHECKS) names.push({ env: 'prod', name: alarmName('prod', h.id), region: r.healthRegion });
  names.push({ env: 'prod', name: 'teameet-ops-slack-errors' });
  return names;
};

/**
 * Step shape: { id, title, args | notes, policy?, capture?, tolerate? }
 *  - args: aws CLI argument vector (never a shell string)
 *  - capture: name under which stdout is stored; `{{name}}` in later args is replaced by it
 *  - tolerate: stderr pattern meaning "already exists", which is fine on a second run
 *  - readonly: step only reads (safe to run before anything is created)
 */
export function buildInstallPlan(input) {
  const p = resolve(input);
  const topic = `arn:aws:sns:${p.region}:{{account}}:${p.topicName}`;
  const healthTopic = `arn:aws:sns:${p.healthRegion}:{{account}}:${p.healthTopicName}`;
  const fn = `arn:aws:lambda:${p.region}:{{account}}:function:${p.lambdaName}`;
  const steps = [];
  const add = (s) => steps.push(s);

  add({ id: 'account', title: '계정 확인(읽기)', readonly: true, capture: 'account',
    args: ['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'] });
  add({ id: 'webhook-exists', title: '웹훅 매개변수가 있는지 확인(값은 읽지 않아요)', readonly: true,
    failHint: `${p.webhookParam} 가 없어요. 사용자가 SecureString 으로 먼저 넣어야 해요(런북 1단계).`,
    args: ['ssm', 'get-parameter', '--region', p.region, '--name', p.webhookParam, '--query', 'Parameter.Name', '--output', 'text'] });
  add({ id: 'topic', title: `SNS 주제 ${p.topicName} (이미 있으면 그대로)`,
    args: ['sns', 'create-topic', '--region', p.region, '--name', p.topicName] });
  add({ id: 'role', title: `Lambda 실행 역할 ${p.lambdaRole}`, tolerate: 'EntityAlreadyExists',
    args: ['iam', 'create-role', '--role-name', p.lambdaRole, '--assume-role-policy-document', JSON.stringify(trust('lambda.amazonaws.com'))] });
  const lambdaDoc = lambdaPolicy(p);
  add({ id: 'role-policy', title: '역할 정책(웹훅 매개변수 하나만 읽어요)', policy: lambdaDoc,
    args: ['iam', 'put-role-policy', '--role-name', p.lambdaRole, '--policy-name', 'ops-slack', '--policy-document', JSON.stringify(lambdaDoc)] });
  add({ id: 'package', title: 'Lambda 압축 파일 만들기(lambda-handler.mjs + lib/)', local: 'package' });
  const lambdaEnv = JSON.stringify({ Variables: { WEBHOOK_PARAM: p.webhookParam, RDS_ID: p.rdsId } });
  const wait = (id, state) => ({ id, title: `Lambda 상태 기다리기(${state})`, readonly: true,
    args: ['lambda', 'wait', state, '--region', p.region, '--function-name', p.lambdaName] });
  add({ id: 'lambda', title: `Lambda ${p.lambdaName}`, tolerate: 'ResourceConflict',
    args: ['lambda', 'create-function', '--region', p.region, '--function-name', p.lambdaName, '--runtime', 'nodejs22.x',
      '--handler', 'lambda-handler.handler', '--timeout', '20', '--memory-size', '128',
      '--role', `arn:aws:iam::{{account}}:role/${p.lambdaRole}`, '--zip-file', 'fileb://{{zip}}'] });
  add(wait('lambda-wait-1', 'function-active-v2'));
  add({ id: 'lambda-code', title: 'Lambda 코드 갱신(다시 실행해도 같은 결과)',
    args: ['lambda', 'update-function-code', '--region', p.region, '--function-name', p.lambdaName, '--zip-file', 'fileb://{{zip}}'] });
  add(wait('lambda-wait-2', 'function-updated-v2'));
  add({ id: 'lambda-config', title: 'Lambda 환경 변수(웹훅 매개변수 이름 · RDS 이름만, 비밀값 없음)',
    args: ['lambda', 'update-function-configuration', '--region', p.region, '--function-name', p.lambdaName, '--environment', lambdaEnv] });
  add(wait('lambda-wait-3', 'function-updated-v2'));
  add({ id: 'perm-sns', title: '서울 SNS 주제가 Lambda 를 부를 수 있게', tolerate: 'ResourceConflict',
    args: ['lambda', 'add-permission', '--region', p.region, '--function-name', p.lambdaName, '--statement-id', 'sns-seoul',
      '--action', 'lambda:InvokeFunction', '--principal', 'sns.amazonaws.com', '--source-arn', topic] });
  add({ id: 'subscribe', title: '주제 → Lambda 구독(기존 메일 구독은 그대로)',
    args: ['sns', 'subscribe', '--region', p.region, '--topic-arn', topic, '--protocol', 'lambda', '--notification-endpoint', fn] });

  for (const e of p.includeAlpha ? ['prod', 'alpha'] : ['prod']) {
    for (const rule of rulesFor(e)) {
      add({ id: `alarm-${e}-${rule.id}`, title: `경보 ${alarmName(e, rule.id)}`,
        args: putAlarmArgs({ region: p.region, name: alarmName(e, rule.id), description: rule.title, op: rule.op,
          threshold: rule.threshold, evaluationPeriods: rule.evaluationPeriods, datapointsToAlarm: rule.datapointsToAlarm,
          missing: rule.missing, topic, metrics: alarmMetrics(e, rule, p) }) });
    }
  }
  add({ id: 'alarm-lambda-errors', title: 'Lambda 가 실패하면 메일로(두 번째 길)',
    args: putAlarmArgs({ region: p.region, name: 'teameet-ops-slack-errors', description: 'Slack 전달 Lambda 오류', op: 'GreaterThanOrEqualToThreshold',
      threshold: 1, evaluationPeriods: 1, datapointsToAlarm: 1, missing: 'notBreaching', topic,
      metrics: [metric('m1', 'AWS/Lambda', 'Errors', 300, 'Sum', [{ Name: 'FunctionName', Value: p.lambdaName }])] }) });

  add({ id: 'health-topic', title: `us-east-1 SNS 주제 ${p.healthTopicName}`,
    args: ['sns', 'create-topic', '--region', p.healthRegion, '--name', p.healthTopicName] });
  add({ id: 'perm-sns-use1', title: 'us-east-1 주제가 서울 Lambda 를 부를 수 있게', tolerate: 'ResourceConflict',
    args: ['lambda', 'add-permission', '--region', p.region, '--function-name', p.lambdaName, '--statement-id', 'sns-use1',
      '--action', 'lambda:InvokeFunction', '--principal', 'sns.amazonaws.com', '--source-arn', healthTopic] });
  add({ id: 'subscribe-use1', title: 'us-east-1 주제 → 서울 Lambda 구독',
    args: ['sns', 'subscribe', '--region', p.healthRegion, '--topic-arn', healthTopic, '--protocol', 'lambda', '--notification-endpoint', fn] });
  for (const h of HEALTH_CHECKS) {
    const config = { Type: 'HTTPS', FullyQualifiedDomainName: p.host, Port: 443, ResourcePath: h.path, RequestInterval: 30, FailureThreshold: 3, EnableSNI: true };
    add({ id: h.id, title: `Route 53 헬스 체크 ${h.path}`, capture: h.id,
      args: ['route53', 'create-health-check', '--caller-reference', `teameet-ops-${h.id}`, '--health-check-config', JSON.stringify(config),
        '--query', 'HealthCheck.Id', '--output', 'text'], tolerate: 'HealthCheckAlreadyExists' });
    add({ id: `alarm-${h.id}`, title: `경보 ${alarmName('prod', h.id)}`,
      args: putAlarmArgs({ region: p.healthRegion, name: alarmName('prod', h.id), description: h.title, op: 'LessThanThreshold', threshold: 1,
        evaluationPeriods: 3, datapointsToAlarm: 3, missing: 'breaching', topic: healthTopic,
        metrics: [metric('m1', 'AWS/Route53', 'HealthCheckStatus', 60, 'Minimum', [{ Name: 'HealthCheckId', Value: `{{${h.id}}}` }])] }) });
  }

  add({ id: 'scheduler-role', title: `하루 요약 스케줄러 역할 ${p.schedulerRole}`, tolerate: 'EntityAlreadyExists',
    args: ['iam', 'create-role', '--role-name', p.schedulerRole, '--assume-role-policy-document', JSON.stringify(trust('scheduler.amazonaws.com'))] });
  const invoke = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: 'lambda:InvokeFunction', Resource: fn }] };
  add({ id: 'scheduler-policy', title: '스케줄러는 이 Lambda 만 부를 수 있어요', policy: invoke,
    args: ['iam', 'put-role-policy', '--role-name', p.schedulerRole, '--policy-name', 'invoke-ops-slack', '--policy-document', JSON.stringify(invoke)] });
  const target = { Arn: fn, RoleArn: `arn:aws:iam::{{account}}:role/${p.schedulerRole}`, Input: JSON.stringify({ mode: 'daily-summary' }) };
  add({ id: 'schedule', title: '매일 09:00 KST 하루 요약', tolerate: 'ConflictException',
    args: ['scheduler', 'create-schedule', '--region', p.region, '--name', p.scheduleName, '--schedule-expression', 'cron(0 9 * * ? *)',
      '--schedule-expression-timezone', 'Asia/Seoul', '--flexible-time-window', 'Mode=OFF', '--target', JSON.stringify(target)] });

  for (const e of p.includeAlpha ? ['prod', 'alpha'] : ['prod']) {
    const doc = serverPolicy(e);
    add({ id: `server-policy-${e}`, title: `[직접 붙이기] ${e} 서버 역할에 PutMetricData(이 스크립트는 붙이지 않아요)`, policy: doc, note: true });
  }
  return steps;
}

/** Reverse order; the existing topic and its mail subscription are never touched. */
export function buildTeardownPlan(input) {
  const p = resolve(input);
  const steps = [];
  const byRegion = new Map();
  for (const a of alarmNames(p)) {
    const region = a.region ?? p.region;
    byRegion.set(region, [...(byRegion.get(region) ?? []), a.name]);
  }
  steps.push({ id: 'account', title: '계정 확인(읽기)', readonly: true, capture: 'account',
    args: ['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'] });
  for (const [region, names] of byRegion) {
    steps.push({ id: `delete-alarms-${region}`, title: `${region} 경보 ${names.length}개 삭제`, args: ['cloudwatch', 'delete-alarms', '--region', region, '--alarm-names', ...names] });
  }
  for (const h of HEALTH_CHECKS) {
    steps.push({ id: `find-${h.id}`, title: `헬스 체크 ${h.path} 찾기(읽기)`, readonly: true, capture: h.id,
      args: ['route53', 'list-health-checks', '--query', `HealthChecks[?CallerReference=='teameet-ops-${h.id}'].Id`, '--output', 'text'] });
    steps.push({ id: `delete-${h.id}`, title: `헬스 체크 ${h.path} 삭제`, args: ['route53', 'delete-health-check', '--health-check-id', `{{${h.id}}}`] });
  }
  steps.push({ id: 'delete-schedule', title: '하루 요약 스케줄 삭제', tolerate: 'ResourceNotFound', args: ['scheduler', 'delete-schedule', '--region', p.region, '--name', p.scheduleName] });
  for (const [region, topicName] of [[p.region, p.topicName], [p.healthRegion, p.healthTopicName]]) {
    steps.push({ id: `find-sub-${region}`, title: `${region} Lambda 구독 찾기(읽기)`, readonly: true, capture: `sub-${region}`,
      args: ['sns', 'list-subscriptions-by-topic', '--region', region, '--topic-arn', `arn:aws:sns:${region}:{{account}}:${topicName}`,
        '--query', `Subscriptions[?contains(Endpoint,':function:${p.lambdaName}')].SubscriptionArn`, '--output', 'text'] });
    steps.push({ id: `unsubscribe-${region}`, title: `${region} Lambda 구독 해제`, args: ['sns', 'unsubscribe', '--region', region, '--subscription-arn', `{{sub-${region}}}`] });
  }
  steps.push({ id: 'delete-lambda', title: 'Lambda 삭제', tolerate: 'ResourceNotFound', args: ['lambda', 'delete-function', '--region', p.region, '--function-name', p.lambdaName] });
  steps.push({ id: 'delete-health-topic', title: `${p.healthTopicName} 삭제(이 스택이 만든 주제)`, args: ['sns', 'delete-topic', '--region', p.healthRegion, '--topic-arn', `arn:aws:sns:${p.healthRegion}:{{account}}:${p.healthTopicName}`] });
  for (const [role, policy] of [[p.schedulerRole, 'invoke-ops-slack'], [p.lambdaRole, 'ops-slack']]) {
    steps.push({ id: `delete-policy-${role}`, title: `${role} 정책 삭제`, tolerate: 'NoSuchEntity', args: ['iam', 'delete-role-policy', '--role-name', role, '--policy-name', policy] });
    steps.push({ id: `delete-role-${role}`, title: `${role} 삭제`, tolerate: 'NoSuchEntity', args: ['iam', 'delete-role', '--role-name', role] });
  }
  return steps;
}
