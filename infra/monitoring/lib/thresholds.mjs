// Single source for alarm rules: the install plan builds CloudWatch alarms from RULES and the
// Slack formatter reads titles/runbook anchors from it, so a threshold lives in exactly one place.

export const NAMESPACES = { prod: 'Teameet/Ops/Prod', alpha: 'Teameet/Ops/Alpha' };
export const CONTAINERS = ['web', 'api', 'worker', 'nginx'];
export const HEAP_CONTAINERS = ['web', 'api', 'worker'];

export const SPIKE_5XX_MIN_COUNT = 15;
export const SPIKE_5XX_MIN_RATIO = 0.02;

/**
 * Value of the 5xx-spike metric-math expression for one 5-minute window.
 * Mirrors SPIKE_5XX_EXPRESSION so the expression can be checked against real numbers offline.
 */
export function spike5xxValue({ errors, requests, deployWindow = 0 }) {
  return errors >= SPIKE_5XX_MIN_COUNT && errors >= SPIKE_5XX_MIN_RATIO * requests && deployWindow < 1
    ? 1
    : 0;
}

export const SPIKE_5XX_EXPRESSION =
  `IF(FILL(m1,0)>=${SPIKE_5XX_MIN_COUNT} AND FILL(m1,0)>=${SPIKE_5XX_MIN_RATIO}*FILL(m2,0) AND FILL(m3,0)<1,1,0)`;

const custom = (metricName, { stat = 'Sum', period = 60, dimensions } = {}) => ({
  kind: 'custom', metricName, stat, period, dimensions,
});
const aws = (namespace, metricName, dimensionName, { stat = 'Average', period = 300 } = {}) => ({
  kind: 'aws', namespace, metricName, dimensionName, stat, period,
});

/**
 * op: CloudWatch comparison operator. missing: treat-missing-data.
 * scope: 'prod' | 'both' (alpha keeps only the `both` rules, as warnings — see alphaRules).
 * event: a one-off occurrence that clears itself a minute later, so recoveries are not posted.
 * group: alarms of one cause; the Lambda posts one message per incident (lib/dedupe.mjs).
 */
export const RULES = [
  { id: 'web-restart', scope: 'both', severity: 'critical', event: true, group: 'process-exit', title: '컨테이너가 다시 시작됐어요',
    anchor: 'web-재시작', source: { kind: 'sum-containers', metricName: 'Restarts', containers: CONTAINERS, period: 60 },
    op: 'GreaterThanOrEqualToThreshold', threshold: 1, evaluationPeriods: 1, datapointsToAlarm: 1, missing: 'notBreaching' },
  { id: 'heap-oom', scope: 'both', severity: 'critical', event: true, group: 'process-exit', title: 'heap 부족으로 프로세스가 죽었어요',
    anchor: 'heap-부족', source: { kind: 'sum-containers', metricName: 'HeapOom', containers: HEAP_CONTAINERS, period: 60 },
    op: 'GreaterThanOrEqualToThreshold', threshold: 1, evaluationPeriods: 1, datapointsToAlarm: 1, missing: 'notBreaching' },
  // State alarm (recovers, so it posts [회복]): a loop faster than one minute keeps the `event` alarms above in
  // ALARM, where CloudWatch sends nothing more. 3 of the last 10 minutes with a restart ends that silence.
  { id: 'restart-loop', scope: 'both', severity: 'critical', title: '컨테이너가 계속 다시 시작되고 있어요(재시작 루프)',
    anchor: '재시작-루프', source: { kind: 'sum-containers', metricName: 'Restarts', containers: CONTAINERS, period: 60 },
    op: 'GreaterThanOrEqualToThreshold', threshold: 1, evaluationPeriods: 10, datapointsToAlarm: 3, missing: 'notBreaching' },
  { id: 'web-memory-high', scope: 'prod', severity: 'warning', title: 'web 메모리가 한도에 가까워요',
    anchor: 'web-메모리', source: custom('WebMemPct', { stat: 'Maximum' }),
    op: 'GreaterThanOrEqualToThreshold', threshold: 85, evaluationPeriods: 10, datapointsToAlarm: 10, missing: 'notBreaching' },
  { id: '5xx-spike', scope: 'prod', severity: 'critical', title: '5xx 오류가 늘었어요',
    anchor: '5xx-급증', source: { kind: 'spike-5xx', period: 300 },
    op: 'GreaterThanOrEqualToThreshold', threshold: 1, evaluationPeriods: 2, datapointsToAlarm: 2, missing: 'notBreaching' },
  { id: 'mem-available-low', scope: 'prod', severity: 'warning', title: '서버 사용 가능 메모리가 적어요',
    anchor: '서버-메모리', source: custom('MemAvailableMB', { stat: 'Minimum' }),
    op: 'LessThanThreshold', threshold: 200, evaluationPeriods: 5, datapointsToAlarm: 5, missing: 'notBreaching' },
  { id: 'mem-available-critical', scope: 'prod', severity: 'critical', title: '서버 사용 가능 메모리가 거의 없어요',
    anchor: '서버-메모리', source: custom('MemAvailableMB', { stat: 'Minimum' }),
    op: 'LessThanThreshold', threshold: 100, evaluationPeriods: 3, datapointsToAlarm: 3, missing: 'notBreaching' },
  { id: 'swap-high', scope: 'prod', severity: 'warning', title: 'swap 을 많이 쓰고 있어요',
    anchor: 'swap', source: custom('SwapUsedMB', { stat: 'Maximum' }),
    op: 'GreaterThanThreshold', threshold: 1200, evaluationPeriods: 10, datapointsToAlarm: 10, missing: 'notBreaching' },
  { id: 'disk-high', scope: 'both', severity: 'warning', title: '디스크가 80% 를 넘었어요',
    anchor: '디스크', source: custom('DiskUsedPct', { stat: 'Maximum', period: 300 }),
    op: 'GreaterThanOrEqualToThreshold', threshold: 80, evaluationPeriods: 2, datapointsToAlarm: 2, missing: 'notBreaching' },
  { id: 'disk-critical', scope: 'prod', severity: 'critical', title: '디스크가 90% 를 넘었어요',
    anchor: '디스크', source: custom('DiskUsedPct', { stat: 'Maximum', period: 300 }),
    op: 'GreaterThanOrEqualToThreshold', threshold: 90, evaluationPeriods: 2, datapointsToAlarm: 2, missing: 'notBreaching' },
  { id: 'collector-silent', scope: 'both', severity: 'critical', title: '수집기가 끊겼어요(서버가 멈췄을 수 있어요)',
    anchor: '수집기-끊김', source: custom('Heartbeat'),
    op: 'LessThanThreshold', threshold: 1, evaluationPeriods: 5, datapointsToAlarm: 5, missing: 'breaching' },
  { id: 'collector-step-failed', scope: 'both', severity: 'warning', title: '수집기의 일부 단계가 계속 실패해요',
    anchor: '수집기-단계-실패', source: custom('StepFailures', { stat: 'Maximum' }),
    op: 'GreaterThanOrEqualToThreshold', threshold: 1, evaluationPeriods: 5, datapointsToAlarm: 5, missing: 'notBreaching' },
  { id: 'origin-cert-expiring', scope: 'prod', severity: 'warning', title: '오리진 인증서 만료가 가까워요',
    anchor: '인증서', source: custom('OriginCertDays', { stat: 'Minimum', period: 86400 }),
    op: 'LessThanThreshold', threshold: 20, evaluationPeriods: 1, datapointsToAlarm: 1, missing: 'ignore' },
  { id: 'ec2-cpu-high', scope: 'prod', severity: 'warning', title: '서버 CPU 가 계속 높아요',
    anchor: 'cpu', source: aws('AWS/EC2', 'CPUUtilization', 'InstanceId'),
    op: 'GreaterThanOrEqualToThreshold', threshold: 85, evaluationPeriods: 3, datapointsToAlarm: 3, missing: 'notBreaching' },
  { id: 'ec2-credit-low', scope: 'prod', severity: 'warning', title: 'CPU 크레딧 잔고가 적어요',
    anchor: 'cpu', source: aws('AWS/EC2', 'CPUCreditBalance', 'InstanceId', { stat: 'Minimum' }),
    op: 'LessThanThreshold', threshold: 60, evaluationPeriods: 1, datapointsToAlarm: 1, missing: 'notBreaching' },
  { id: 'ec2-credit-surplus', scope: 'prod', severity: 'warning', title: 'CPU 초과 크레딧 요금이 붙고 있어요',
    anchor: 'cpu', source: aws('AWS/EC2', 'CPUSurplusCreditsCharged', 'InstanceId', { stat: 'Maximum' }),
    op: 'GreaterThanThreshold', threshold: 0, evaluationPeriods: 1, datapointsToAlarm: 1, missing: 'notBreaching' },
  { id: 'ec2-status-check', scope: 'prod', severity: 'critical', title: '서버 상태 검사가 실패했어요',
    anchor: '서버-자체', source: aws('AWS/EC2', 'StatusCheckFailed', 'InstanceId', { stat: 'Maximum', period: 60 }),
    op: 'GreaterThanOrEqualToThreshold', threshold: 1, evaluationPeriods: 2, datapointsToAlarm: 2, missing: 'breaching' },
  { id: 'rds-cpu-high', scope: 'prod', severity: 'warning', title: 'RDS CPU 가 높아요',
    anchor: 'rds', source: aws('AWS/RDS', 'CPUUtilization', 'DBInstanceIdentifier'),
    op: 'GreaterThanOrEqualToThreshold', threshold: 60, evaluationPeriods: 3, datapointsToAlarm: 3, missing: 'notBreaching' },
  { id: 'rds-memory-low', scope: 'prod', severity: 'warning', title: 'RDS 남는 메모리가 적어요',
    anchor: 'rds', source: aws('AWS/RDS', 'FreeableMemory', 'DBInstanceIdentifier', { stat: 'Minimum' }),
    op: 'LessThanThreshold', threshold: 35 * 1024 * 1024, evaluationPeriods: 3, datapointsToAlarm: 3, missing: 'notBreaching' },
  { id: 'rds-connections-high', scope: 'prod', severity: 'warning', title: 'RDS 연결 수가 늘었어요',
    anchor: 'rds', source: aws('AWS/RDS', 'DatabaseConnections', 'DBInstanceIdentifier', { stat: 'Maximum' }),
    op: 'GreaterThanOrEqualToThreshold', threshold: 40, evaluationPeriods: 2, datapointsToAlarm: 2, missing: 'notBreaching' },
  { id: 'rds-storage-low', scope: 'prod', severity: 'warning', title: 'RDS 저장 공간이 적어요',
    anchor: 'rds', source: aws('AWS/RDS', 'FreeStorageSpace', 'DBInstanceIdentifier', { stat: 'Minimum' }),
    op: 'LessThanThreshold', threshold: 4 * 1024 ** 3, evaluationPeriods: 1, datapointsToAlarm: 1, missing: 'notBreaching' },
];

/** Route 53 health checks live in us-east-1; the target path is part of the rule, the host is a parameter. */
export const HEALTH_CHECKS = [
  { id: 'health-api', path: '/api/v1/health', title: '외부에서 /api/v1/health 가 안 열려요', anchor: '외부-헬스' },
  { id: 'health-web', path: '/landing', title: '외부에서 /landing 이 안 열려요', anchor: '외부-헬스' },
];

/** Alpha keeps the `both` rules only, and never pages: everything is demoted to warning. */
export function rulesFor(env) {
  if (env === 'prod') return RULES;
  return RULES.filter((r) => r.scope === 'both').map((r) => ({ ...r, severity: 'warning' }));
}

export const alarmName = (env, ruleId) => `teameet-${env}-${ruleId}`;

/** Alarm names of one cause group in one environment. */
export const groupAlarmNames = (env, group) =>
  rulesFor(env).filter((r) => r.group === group).map((r) => alarmName(env, r.id));

const BY_ALARM_NAME = new Map(
  ['prod', 'alpha'].flatMap((env) => rulesFor(env).map((r) => [alarmName(env, r.id), { ...r, env }])),
);
for (const h of HEALTH_CHECKS) {
  BY_ALARM_NAME.set(alarmName('prod', h.id), { ...h, env: 'prod', severity: 'critical' });
}

export const describeAlarm = (name) => BY_ALARM_NAME.get(name) ?? null;

/**
 * CloudWatch semantics for one alarm: the last `evaluationPeriods` datapoints, `null` = no data.
 * Used offline to replay real sequences against a rule before any alarm is created.
 */
export function evaluateRule(rule, values) {
  const window = values.slice(-rule.evaluationPeriods);
  const breaches = (v) => {
    switch (rule.op) {
      case 'GreaterThanOrEqualToThreshold': return v >= rule.threshold;
      case 'GreaterThanThreshold': return v > rule.threshold;
      case 'LessThanThreshold': return v < rule.threshold;
      case 'LessThanOrEqualToThreshold': return v <= rule.threshold;
      default: throw new Error(`unsupported comparison operator: ${rule.op}`);
    }
  };
  let breaching = 0;
  let known = 0;
  for (const v of window) {
    if (v === null || v === undefined) {
      if (rule.missing === 'breaching') { breaching += 1; known += 1; }
      else if (rule.missing === 'notBreaching') known += 1;
      continue;
    }
    known += 1;
    if (breaches(v)) breaching += 1;
  }
  if (breaching >= rule.datapointsToAlarm) return 'ALARM';
  if (known < rule.evaluationPeriods && window.length < rule.evaluationPeriods) return 'INSUFFICIENT_DATA';
  return known === 0 ? 'INSUFFICIENT_DATA' : 'OK';
}
