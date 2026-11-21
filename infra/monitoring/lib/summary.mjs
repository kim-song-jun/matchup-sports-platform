// Pure parts of the daily summary: which metrics to read, and how hourly datapoints and Cost Explorer
// rows become the numbers formatDailySummary prints. The AWS calls live in lambda-handler.mjs.
import { CONTAINERS, HEAP_CONTAINERS, NAMESPACES } from './thresholds.mjs';

const KST_OFFSET_MS = 9 * 3_600_000;
const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' (KST) -> [start, end) in epoch ms of that KST calendar day. */
export function kstDayWindow(dateKst) {
  const start = Date.parse(`${dateKst}T00:00:00Z`) - KST_OFFSET_MS;
  return { startMs: start, endMs: start + DAY_MS };
}

export const kstDateOf = (ms) => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);

/** The KST day that just ended, for a run at `nowMs` (09:00 KST summarises yesterday). */
export const yesterdayKst = (nowMs) => kstDateOf(nowMs - DAY_MS);

export const reduceSeries = (values, how) => {
  const present = values.filter((v) => v !== null && v !== undefined);
  if (present.length === 0) return null;
  if (how === 'sum') return present.reduce((a, b) => a + b, 0);
  if (how === 'max') return Math.max(...present);
  if (how === 'min') return Math.min(...present);
  throw new Error(`unknown reduction: ${how}`);
};

const ops = (key, metricName, stat, reduce, extra = {}) => ({ key, metricName, stat, reduce, ...extra });

export const SUMMARY_METRICS = [
  ops('requests', 'NginxRequests', 'Sum', 'sum'),
  ops('errors5xx', 'Nginx5xx', 'Sum', 'sum'),
  ops('bots', 'BotRequests', 'Sum', 'sum'),
  ops('webMemPctMax', 'WebMemPct', 'Maximum', 'max'),
  ops('memAvailableMinMB', 'MemAvailableMB', 'Minimum', 'min'),
  ops('swapMaxMB', 'SwapUsedMB', 'Maximum', 'max'),
  ops('diskUsedPct', 'DiskUsedPct', 'Maximum', 'max'),
  ...CONTAINERS.map((c) => ops(`restarts:${c}`, 'Restarts', 'Sum', 'sum', { container: c })),
  ...HEAP_CONTAINERS.map((c) => ops(`heapOom:${c}`, 'HeapOom', 'Sum', 'sum', { container: c })),
];

/** GetMetricData queries (hourly buckets) for the prod namespace. Ids are safe identifiers. */
export function summaryQueries(env) {
  return SUMMARY_METRICS.map((m, i) => ({
    Id: `q${i}`,
    MetricStat: {
      Metric: {
        Namespace: NAMESPACES[env],
        MetricName: m.metricName,
        ...(m.container ? { Dimensions: [{ Name: 'Container', Value: m.container }] } : {}),
      },
      Period: 3600,
      Stat: m.stat,
    },
    ReturnData: true,
  }));
}

/**
 * `series[i]` = { timestamps: ms[], values: number[] } for SUMMARY_METRICS[i].
 * The 8-day window is cut into the summarised day and the 7 days before it.
 */
export function buildSummary({ env, dateKst, series, rds = {}, alarms = {}, cost = null }) {
  const { startMs, endMs } = kstDayWindow(dateKst);
  const inDay = (s) => s.values.filter((_, i) => s.timestamps[i] >= startMs && s.timestamps[i] < endMs);
  const prior7 = (s) => s.values.filter((_, i) => s.timestamps[i] >= startMs - 7 * DAY_MS && s.timestamps[i] < startMs);
  const byKey = Object.fromEntries(SUMMARY_METRICS.map((m, i) => [m.key, { m, s: series[i] ?? { timestamps: [], values: [] } }]));
  const day = (key) => reduceSeries(inDay(byKey[key].s), byKey[key].m.reduce);

  const sumBy = (prefix, names) => {
    const parts = names.map((c) => day(`${prefix}:${c}`));
    return { byName: Object.fromEntries(names.map((c, i) => [c, parts[i] ?? 0])), any: parts.some((p) => p !== null) };
  };
  const restarts = sumBy('restarts', CONTAINERS);
  const heap = sumBy('heapOom', HEAP_CONTAINERS);
  const prior = reduceSeries(prior7(byKey.requests.s), 'sum');

  return {
    env,
    date: dateKst,
    requests: day('requests'),
    requestsAvg7d: prior === null ? null : prior / 7,
    bots: day('bots'),
    errors5xx: day('errors5xx'),
    restarts: restarts.any ? restarts.byName : null,
    heapOom: heap.any ? Object.values(heap.byName).reduce((a, b) => a + b, 0) : null,
    webMemPctMax: day('webMemPctMax'),
    memAvailableMinMB: day('memAvailableMinMB'),
    swapMaxMB: day('swapMaxMB'),
    diskUsedPct: day('diskUsedPct'),
    rdsFreeMemMinMB: rds.freeMemMinBytes == null ? null : rds.freeMemMinBytes / 1024 ** 2,
    rdsFreeStorageGB: rds.freeStorageMinBytes == null ? null : rds.freeStorageMinBytes / 1024 ** 3,
    alarmsFired: alarms.fired ?? null,
    alarmsOpen: alarms.open ?? null,
    cost,
  };
}

/**
 * Cost Explorer daily rows ([{date:'YYYY-MM-DD', usd}]) -> the figures the summary prints.
 * Today's and yesterday's rows are still filling in, so the last confirmed day is two days back.
 */
export function summarizeCost(rows, todayKst, forecastRestUsd = null) {
  const byDate = new Map(rows.map((r) => [r.date, r.usd]));
  const confirmedMs = Date.parse(`${todayKst}T00:00:00Z`) - 2 * DAY_MS;
  const confirmedDate = new Date(confirmedMs).toISOString().slice(0, 10);
  if (!byDate.has(confirmedDate)) return null;

  const month = todayKst.slice(0, 7);
  const sumWhere = (pred) => rows.filter((r) => pred(r.date)).reduce((a, r) => a + r.usd, 0);
  const monthToDate = sumWhere((d) => d.startsWith(month) && d <= confirmedDate);
  const [y, m] = todayKst.split('-').map(Number);
  const lastMonthKey = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const lastRows = rows.filter((r) => r.date.startsWith(lastMonthKey));
  return {
    confirmedDate: confirmedDate.slice(5),
    confirmedDay: byDate.get(confirmedDate),
    monthToDate,
    forecast: forecastRestUsd === null ? null : monthToDate + forecastRestUsd,
    lastMonth: lastRows.length ? lastRows.reduce((a, r) => a + r.usd, 0) : null,
  };
}
