// Lambda entry: SNS alarm notification or the daily scheduler tick -> one Slack message.
// The webhook URL is read from SSM Parameter Store (SecureString) at cold start and never logged.
import { formatAlarmNotification, formatDailySummary, scrub } from './lib/format.mjs';
import {
  buildSummary, kstDateOf, summarizeCost, summaryQueries, yesterdayKst, SUMMARY_METRICS,
} from './lib/summary.mjs';

// Same shape check as apps/v1_api/src/common/slack/slack-webhook.ts.
const SLACK_WEBHOOK = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;
const SLACK_TIMEOUT_MS = 5_000;
const DAY_MS = 86_400_000;

export async function postToSlack(webhookUrl, text, fetchFn = fetch) {
  if (!SLACK_WEBHOOK.test(webhookUrl)) throw new Error('webhook parameter is not a Slack Incoming Webhook URL');
  const res = await fetchFn(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  });
  const body = (await res.text()).trim();
  if (!res.ok || body !== 'ok') throw new Error(`Slack webhook failed (${res.status}): ${body.slice(0, 100)}`);
}

/** SNS record body -> text, or null when the notification carries nothing worth posting. */
export async function messageForSnsRecord(record, lookupAlarmedAt) {
  const raw = record.Sns?.Message ?? '';
  let alarm;
  try { alarm = JSON.parse(raw); } catch {
    // A plain-text publish (for example from a maintenance script): forward it, scrubbed.
    const subject = scrub(record.Sns?.Subject ?? '');
    return `[공지][운영] ${subject ? `${subject}\n` : ''}${scrub(raw).slice(0, 500)}`;
  }
  if (alarm?.NewStateValue === 'OK') {
    const alarmedAt = await lookupAlarmedAt(alarm.AlarmName);
    return formatAlarmNotification(alarm, { alarmedAt });
  }
  return formatAlarmNotification(alarm);
}

export async function handler(event, deps = defaultDeps()) {
  const webhook = await deps.getWebhook();
  const messages = [];
  if (Array.isArray(event?.Records)) {
    for (const record of event.Records) {
      const text = await messageForSnsRecord(record, deps.lookupAlarmedAt);
      if (text) messages.push(text);
    }
  } else if (event?.mode === 'daily-summary') {
    messages.push(formatDailySummary(await deps.loadSummary('prod', yesterdayKst(Date.now()))));
  } else {
    throw new Error('unsupported event shape');
  }
  // Every message is attempted; a failure is thrown at the end so Lambda reports it (and retries).
  const failures = [];
  for (const text of messages) {
    try { await deps.post(webhook, text); } catch (err) { failures.push(err.message); }
  }
  if (failures.length) throw new Error(failures.join('; '));
  return { posted: messages.length };
}

function defaultDeps() {
  const region = process.env.AWS_REGION;
  let webhookPromise;
  return {
    getWebhook: () => {
      webhookPromise ??= (async () => {
        const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
        const out = await new SSMClient({ region }).send(
          new GetParameterCommand({ Name: process.env.WEBHOOK_PARAM, WithDecryption: true }));
        return out.Parameter.Value;
      })();
      return webhookPromise;
    },
    post: (url, text) => postToSlack(url, text),
    lookupAlarmedAt: (name) => lookupAlarmedAt(region, name),
    loadSummary: (env, dateKst) => loadSummary({ region, env, dateKst, rdsId: process.env.RDS_ID }),
  };
}

// Last transition into ALARM, so a recovery can say how long it lasted. A failed lookup only drops the duration.
async function lookupAlarmedAt(region, alarmName) {
  try {
    const { CloudWatchClient, DescribeAlarmHistoryCommand } = await import('@aws-sdk/client-cloudwatch');
    const out = await new CloudWatchClient({ region }).send(new DescribeAlarmHistoryCommand({
      AlarmName: alarmName, HistoryItemType: 'StateUpdate', MaxRecords: 20, ScanBy: 'TimestampDescending',
    }));
    const hit = (out.AlarmHistoryItems ?? []).find((i) => /to ALARM/.test(i.HistorySummary ?? ''));
    return hit ? hit.Timestamp.toISOString() : undefined;
  } catch (err) {
    console.error(`alarm history lookup failed: ${err.name}`);
    return undefined;
  }
}

async function loadSummary({ region, env, dateKst, rdsId }) {
  const { CloudWatchClient, GetMetricDataCommand, DescribeAlarmsCommand, DescribeAlarmHistoryCommand } =
    await import('@aws-sdk/client-cloudwatch');
  const cw = new CloudWatchClient({ region });
  const dayStart = Date.parse(`${dateKst}T00:00:00Z`) - 9 * 3_600_000;
  const queries = summaryQueries(env);
  const rdsQueries = rdsId ? ['FreeableMemory', 'FreeStorageSpace'].map((name, i) => ({
    Id: `rds${i}`,
    MetricStat: { Metric: { Namespace: 'AWS/RDS', MetricName: name, Dimensions: [{ Name: 'DBInstanceIdentifier', Value: rdsId }] }, Period: 3600, Stat: 'Minimum' },
    ReturnData: true,
  })) : [];
  const out = await cw.send(new GetMetricDataCommand({
    MetricDataQueries: [...queries, ...rdsQueries],
    StartTime: new Date(dayStart - 7 * DAY_MS), EndTime: new Date(dayStart + DAY_MS),
  }));
  const byId = new Map(out.MetricDataResults.map((r) => [r.Id, r]));
  const series = SUMMARY_METRICS.map((_, i) => {
    const r = byId.get(`q${i}`);
    return { timestamps: (r?.Timestamps ?? []).map((t) => t.getTime()), values: r?.Values ?? [] };
  });
  const minOf = (id) => {
    const r = byId.get(id);
    const inDay = (r?.Values ?? []).filter((_, i) => r.Timestamps[i].getTime() >= dayStart);
    return inDay.length ? Math.min(...inDay) : null;
  };

  const alarmList = await cw.send(new DescribeAlarmsCommand({ AlarmNamePrefix: 'teameet-', StateValue: 'ALARM' }));
  const history = await cw.send(new DescribeAlarmHistoryCommand({
    HistoryItemType: 'StateUpdate', StartDate: new Date(dayStart), EndDate: new Date(dayStart + DAY_MS), MaxRecords: 100,
  }));
  const fired = (history.AlarmHistoryItems ?? []).filter((i) => i.AlarmName.startsWith('teameet-') && /to ALARM/.test(i.HistorySummary ?? '')).length;

  return buildSummary({
    env, dateKst, series,
    rds: { freeMemMinBytes: minOf('rds0'), freeStorageMinBytes: minOf('rds1') },
    alarms: { fired, open: (alarmList.MetricAlarms ?? []).length },
    cost: await loadCost(),
  });
}

// Cost Explorer is global (us-east-1). A failure leaves the cost line out instead of failing the summary.
async function loadCost() {
  try {
    const { CostExplorerClient, GetCostAndUsageCommand, GetCostForecastCommand } = await import('@aws-sdk/client-cost-explorer');
    const ce = new CostExplorerClient({ region: 'us-east-1' });
    const today = kstDateOf(Date.now());
    const [y, m] = today.split('-').map(Number);
    const from = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
    const usage = await ce.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: from, End: today }, Granularity: 'DAILY', Metrics: ['UnblendedCost'],
    }));
    const rows = (usage.ResultsByTime ?? []).map((r) => ({ date: r.TimePeriod.Start, usd: Number(r.Total.UnblendedCost.Amount) }));
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    let rest = null;
    try {
      const forecast = await ce.send(new GetCostForecastCommand({
        TimePeriod: { Start: today, End: nextMonth }, Granularity: 'MONTHLY', Metric: 'UNBLENDED_COST',
      }));
      rest = Number(forecast.Total.Amount);
    } catch (err) { console.error(`cost forecast failed: ${err.name}`); }
    return summarizeCost(rows, today, rest);
  } catch (err) {
    console.error(`cost lookup failed: ${err.name}`);
    return null;
  }
}
