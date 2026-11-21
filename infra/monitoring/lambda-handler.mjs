// Lambda entry: SNS alarm notification or the daily scheduler tick -> one Slack message.
// The webhook URL is read from SSM Parameter Store (SecureString) on every invocation and never logged.
import { decideGroupAlarm, decideRecovery, HISTORY_LOOKBACK_MS, RECOVERY_QUIET_MS } from './lib/dedupe.mjs';
import { formatAlarmNotification, formatDailySummary, scrub } from './lib/format.mjs';
import { describeAlarm, groupAlarmNames } from './lib/thresholds.mjs';
import {
  buildSummary, kstDateOf, summarizeCost, summaryQueries, yesterdayKst, SUMMARY_METRICS,
} from './lib/summary.mjs';

// Same shape check as apps/v1_api/src/common/slack/slack-webhook.ts.
const SLACK_WEBHOOK = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;
const SLACK_TIMEOUT_MS = 5_000;
const DAY_MS = 86_400_000;
// Sibling alarms of one incident flip within seconds; waiting lets every one of them see the others.
const SIBLING_WAIT_MS = 8_000;

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

/**
 * SNS record body -> text, or null when the notification carries nothing worth posting.
 * `deps.sleep` and `deps.loadGroupTransitions` serve the cause groups (see lib/dedupe.mjs).
 */
export async function messageForSnsRecord(record, deps) {
  const raw = record.Sns?.Message ?? '';
  let alarm;
  try { alarm = JSON.parse(raw); } catch {
    // A plain-text publish (for example from a maintenance script): forward it, scrubbed.
    const subject = scrub(record.Sns?.Subject ?? '');
    return `[공지][운영] ${subject ? `${subject}\n` : ''}${scrub(raw).slice(0, 500)}`;
  }
  const known = describeAlarm(String(alarm?.AlarmName ?? ''));
  if (alarm?.NewStateValue === 'OK') {
    // An event clears itself a minute later; posting that would only double the messages.
    if (known?.event) return null;
    if (known?.group) return recoveryForGroup(alarm, known, deps);
    const alarmedAt = await deps.lookupAlarmedAt(alarm.AlarmName);
    return formatAlarmNotification(alarm, { alarmedAt });
  }
  if (alarm?.NewStateValue === 'ALARM' && known?.group) {
    const decision = await decideForGroup(alarm, known, deps);
    if (decision && !decision.post) return null;
    return formatAlarmNotification(alarm, decision ?? {});
  }
  return formatAlarmNotification(alarm);
}

// A grouped state alarm can flip back to ALARM minutes after this OK, so the recovery waits and reads the history
// again; it is posted only when the alarm stayed OK. A failed lookup posts it as it is, like decideForGroup.
async function recoveryForGroup(alarm, known, deps) {
  let verdict = {};
  try {
    await deps.sleep(RECOVERY_QUIET_MS);
    const transitions = await deps.loadGroupTransitions(groupAlarmNames(known.env, known.group));
    verdict = decideRecovery({ name: alarm.AlarmName, changeMs: parseStateChange(alarm.StateChangeTime), transitions });
    if (!verdict.post) return null;
  } catch (err) {
    console.error(`recovery lookup failed: ${err.name ?? err.message}`);
  }
  const alarmedAt = verdict.runStartMs === undefined
    ? await deps.lookupAlarmedAt(alarm.AlarmName) : new Date(verdict.runStartMs).toISOString();
  return formatAlarmNotification(alarm, { alarmedAt });
}

const parseStateChange = (stamp) => Date.parse(stamp.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));

// A failed history lookup posts the alarm as it is: an extra message is better than a missed one.
async function decideForGroup(alarm, known, deps) {
  try {
    await deps.sleep(SIBLING_WAIT_MS);
    const transitions = await deps.loadGroupTransitions(groupAlarmNames(known.env, known.group));
    return decideGroupAlarm({
      name: alarm.AlarmName, changeMs: parseStateChange(alarm.StateChangeTime), transitions,
    });
  } catch (err) {
    console.error(`group lookup failed: ${err.name ?? err.message}`);
    return null;
  }
}

export async function handler(event, deps = defaultDeps()) {
  const webhook = await deps.getWebhook();
  const messages = [];
  if (Array.isArray(event?.Records)) {
    for (const record of event.Records) {
      const text = await messageForSnsRecord(record, deps);
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
    sleep: (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
    loadGroupTransitions: (names) => loadGroupTransitions(region, names),
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

const HISTORY_PAGE_SIZE = 100;
// A 2-minute crash loop writes about 360 records per alarm in 6 hours; the cap bounds the calls of one run.
const HISTORY_MAX_PAGES = 5;

/**
 * ALARM transitions of one alarm since `startDate`, plus its OK transitions (`to: 'OK'`) when `withOk` is set: only a
 * state alarm's OK ends a pause (lib/dedupe.mjs). `send` runs one DescribeAlarmHistory request, so paging (an event
 * alarm also records its OK flips, which fill the first page of a long loop) is testable.
 */
export async function loadAlarmTransitions(send, name, startDate, { withOk = false } = {}) {
  const found = [];
  let nextToken;
  for (let page = 0; page < HISTORY_MAX_PAGES; page += 1) {
    const out = await send({
      AlarmName: name, HistoryItemType: 'StateUpdate', StartDate: startDate, MaxRecords: HISTORY_PAGE_SIZE,
      ScanBy: 'TimestampDescending', ...(nextToken ? { NextToken: nextToken } : {}),
    });
    for (const i of out.AlarmHistoryItems ?? []) {
      const summary = i.HistorySummary ?? '';
      if (/to ALARM/.test(summary)) found.push({ name, atMs: i.Timestamp.getTime() });
      else if (withOk && /to OK/.test(summary)) found.push({ name, atMs: i.Timestamp.getTime(), to: 'OK' });
    }
    nextToken = out.NextToken;
    if (!nextToken) break;
  }
  return found;
}

/**
 * ALARM transitions of every alarm in a cause group since `startDate`, and the OK ones of its state alarms (an event
 * alarm's OK follows each occurrence within a minute and says nothing about a pause).
 */
export async function loadGroupHistory(send, alarmNames, startDate) {
  return (await Promise.all(alarmNames.map((name) =>
    loadAlarmTransitions(send, name, startDate, { withOk: !describeAlarm(name)?.event })))).flat();
}

async function loadGroupTransitions(region, alarmNames) {
  const { CloudWatchClient, DescribeAlarmHistoryCommand } = await import('@aws-sdk/client-cloudwatch');
  const cw = new CloudWatchClient({ region });
  return loadGroupHistory((input) => cw.send(new DescribeAlarmHistoryCommand(input)), alarmNames, new Date(Date.now() - HISTORY_LOOKBACK_MS));
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
