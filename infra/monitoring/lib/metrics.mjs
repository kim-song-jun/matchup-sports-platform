import { CONTAINERS, HEAP_CONTAINERS } from './thresholds.mjs';

// docker container name -> short label used as the `Container` dimension.
export const CONTAINER_LABELS = {
  teameet_v1_web: 'web',
  teameet_v1_api: 'api',
  teameet_v1_game_operations_worker: 'worker',
  teameet_nginx: 'nginx',
};

// Alpha pages on heartbeat, restarts, heap and disk; the collector's own CollectorSeconds / StepFailures
// ride along, so it publishes just these six.
const ALPHA_METRICS = new Set(['Heartbeat', 'Restarts', 'HeapOom', 'DiskUsedPct', 'CollectorSeconds', 'StepFailures']);

/**
 * Steps whose failure makes a published zero meaningless (restart and heap counters come from them).
 * Every other step only owns its own metric, which is skipped when the step fails.
 */
export const isCriticalStep = (name) => name === 'docker-inspect' || name.startsWith('docker-logs-');

/**
 * sample -> CloudWatch PutMetricData entries. Zero counts are published on purpose: an alarm that
 * never sees a datapoint cannot tell "nothing happened" from "collector is down".
 * Heartbeat is published only when the critical steps succeeded: a collector that cannot see containers
 * goes silent. An optional step that fails (certificate, nginx log, df) surfaces as StepFailures instead,
 * so it never looks like a stopped server.
 */
export function buildMetricData(env, sample, { botNames = false } = {}) {
  const ts = new Date(sample.nowMs).toISOString();
  // A step that failed leaves its value null: skip the metric instead of publishing a made-up 0.
  const entry = (MetricName, Value, Unit = 'Count', Dimensions) =>
    Value === null || Value === undefined || Number.isNaN(Value)
      ? null
      : { MetricName, Value, Unit, Timestamp: ts, ...(Dimensions ? { Dimensions } : {}) };
  const byContainer = (name, names, values) =>
    names.map((c) => entry(name, values[c] ?? 0, 'Count', [{ Name: 'Container', Value: c }]));

  const data = [
    ...byContainer('Restarts', CONTAINERS, sample.restarts),
    ...byContainer('HeapOom', HEAP_CONTAINERS, sample.heapOom),
    entry('Deploys', sample.deploys),
    entry('DeployWindow', sample.deployWindow),
    entry('Nginx5xx', sample.nginx?.errors5xx),
    entry('NginxRequests', sample.nginx?.requests),
    entry('NginxRateLimited', sample.nginx?.rateLimited),
    entry('BotRequests', sample.nginx?.bots),
    entry('WebMemPct', sample.webMemPct, 'Percent'),
    entry('MemAvailableMB', sample.memAvailableMB, 'Megabytes'),
    entry('SwapUsedMB', sample.swapUsedMB, 'Megabytes'),
    entry('DiskUsedPct', sample.diskUsedPct, 'Percent'),
    entry('CollectorSeconds', sample.collectorSeconds, 'Seconds'),
    entry('StepFailures', sample.failed.length),
  ];
  if (botNames && sample.nginx) {
    for (const [bot, n] of Object.entries(sample.nginx.botsByName)) {
      data.push(entry('BotRequests', n, 'Count', [{ Name: 'Bot', Value: bot }]));
    }
  }
  if (sample.originCertDays !== undefined) data.push(entry('OriginCertDays', sample.originCertDays, 'Count'));
  if (!sample.failed.some(isCriticalStep)) data.push(entry('Heartbeat', 1));

  const present = data.filter(Boolean);
  return env === 'alpha' ? present.filter((d) => ALPHA_METRICS.has(d.MetricName)) : present;
}
