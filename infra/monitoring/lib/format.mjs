// Slack message text for alarms, recoveries and the daily summary. Pure functions: no I/O, no clock
// (callers pass dates in), so the exact output is testable.
import { describeAlarm } from './thresholds.mjs';

export const RUNBOOK_BASE =
  'https://github.com/kim-song-jun/matchup-sports-platform/blob/dev/docs/ops/ops-alerts.md';
const DEFAULT_REGION = 'ap-northeast-2';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const SEVERITY_LABEL = { critical: '긴급', warning: '주의' };
const ENV_LABEL = { prod: '운영', alpha: 'alpha' };

/** Removes anything an SNS body can carry that must not reach a chat channel. */
export function scrub(text) {
  return String(text)
    .replace(/arn:aws[\w-]*:[^\s"'<>)\]]*/g, '')
    .replace(/https:\/\/hooks\.slack\.com\/\S+/g, '[웹훅]')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[IP]')
    .replace(/\b\d{12}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const escapeSlack = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const link = (url, label) => `<${url}|${label}>`;
const parseTime = (isoLike) => Date.parse(isoLike.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));

/** 2026-11-20T01:50:47.803+0000 -> `11-20(금) 10:50 KST` */
export function formatKst(isoLike) {
  const t = parseTime(isoLike);
  if (Number.isNaN(t)) throw new Error(`unparseable time: ${isoLike}`);
  const kst = new Date(t + 9 * 3_600_000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}(${WEEKDAYS[kst.getUTCDay()]}) `
    + `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())} KST`;
}

const regionOf = (alarmArn) =>
  /^arn:aws[\w-]*:cloudwatch:([a-z0-9-]+):/.exec(alarmArn ?? '')?.[1] ?? DEFAULT_REGION;

export const alarmUrl = (name, region = DEFAULT_REGION) =>
  `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#alarmsV2:alarm/${encodeURIComponent(name)}`;

export const alarmListUrl = (region = DEFAULT_REGION) =>
  `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#alarmsV2:`;

function minutesBetween(fromIso, toIso) {
  const ms = parseTime(toIso) - parseTime(fromIso);
  return Number.isNaN(ms) || ms < 0 ? null : Math.max(1, Math.round(ms / 60_000));
}

/**
 * CloudWatch alarm state-change message (the JSON inside an SNS notification) -> Slack text.
 * Returns null for INSUFFICIENT_DATA: alarms that care about missing data are configured to
 * breach, so this state carries no extra information.
 * `context.alarmedAt` (ISO) lets a recovery report how long the alarm lasted.
 */
export function formatAlarmNotification(message, context = {}) {
  const state = message.NewStateValue;
  if (state !== 'ALARM' && state !== 'OK') return null;

  const name = String(message.AlarmName ?? '');
  const known = describeAlarm(name);
  const env = known?.env ?? (name.includes('alpha') ? 'alpha' : 'prod');
  const severity = known?.severity ?? 'warning';
  const title = known?.title ?? name;
  const region = regionOf(message.AlarmArn);
  const when = formatKst(message.StateChangeTime);

  const head = state === 'ALARM'
    ? `[${SEVERITY_LABEL[severity]}][${ENV_LABEL[env]}] ${title}`
    : `[회복][${ENV_LABEL[env]}] ${title} — 평소로 돌아왔어요`;
  const lines = [escapeSlack(scrub(head))];

  if (state === 'ALARM') {
    lines.push(`• 언제: ${when}`);
    const reason = scrub(message.NewStateReason ?? '');
    if (reason) lines.push(`• 무엇: ${escapeSlack(reason.slice(0, 220))}`);
  } else {
    const minutes = context.alarmedAt ? minutesBetween(context.alarmedAt, message.StateChangeTime) : null;
    lines.push(minutes === null
      ? `• 회복: ${when}`
      : `• 경보 ${formatKst(context.alarmedAt)} → 회복 ${when} (${minutes}분)`);
  }
  if (known?.anchor) {
    lines.push(`• 먼저 볼 것: ${link(`${RUNBOOK_BASE}#${encodeURIComponent(known.anchor)}`, '런북')}`);
  }
  lines.push(`• 경보 ${link(alarmUrl(name, region), 'CloudWatch')}`);
  return lines.join('\n');
}

const has = (v) => v !== null && v !== undefined;
const fmtCount = (n) => (n >= 10_000 ? `${(n / 10_000).toFixed(1)}만` : n.toLocaleString('en-US'));
const fmtPct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '0%');
const fmtUsd = (n) => `$${n.toFixed(2)}`;
const fmtDelta = (now, avg) =>
  avg > 0 ? `(7일 평균보다 ${now >= avg ? '+' : '-'}${Math.round((Math.abs(now - avg) / avg) * 100)}%)` : '';

function botDetail(byName = {}) {
  const top = Object.entries(byName).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 2);
  return top.length ? `(${top.map(([k, n]) => `${k} ${fmtCount(n)}`).join(' · ')})` : '';
}

function restartText(restarts) {
  const parts = Object.entries(restarts).filter(([, n]) => n > 0).map(([c, n]) => `${c} ${n}번`);
  return parts.length ? parts.join(', ') : '0번';
}

/**
 * Daily summary for one environment. Every line is optional: a value the Lambda could not read is
 * left out instead of printed as 0, which would look like good news.
 */
export function formatDailySummary(s) {
  const [y, m, d] = s.date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const lines = [
    `[하루 요약][${ENV_LABEL[s.env]}] ${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}(${weekday})`,
  ];

  if (has(s.requests)) {
    const bots = has(s.bots) ? ` · 봇 ${fmtPct(s.bots, s.requests)}${botDetail(s.botsByName)}` : '';
    const delta = has(s.requestsAvg7d) ? fmtDelta(s.requests, s.requestsAvg7d) : '';
    lines.push(`• 요청 ${fmtCount(s.requests)}건${delta}${bots}`);
  }
  const parts = [];
  if (has(s.errors5xx)) {
    const outside = has(s.errors5xxOutsideDeploy) ? `(배포 창 밖 ${fmtCount(s.errors5xxOutsideDeploy)})` : '';
    parts.push(`5xx ${fmtCount(s.errors5xx)}건${outside}`);
  }
  if (s.restarts) parts.push(`재시작 ${restartText(s.restarts)}`);
  if (has(s.heapOom)) parts.push(`heap 부족 ${s.heapOom}번`);
  if (parts.length) lines.push(`• ${parts.join(' · ')}`);

  const mem = [];
  if (has(s.webMemPctMax)) mem.push(`web 최고 ${Math.round(s.webMemPctMax)}%`);
  if (has(s.memAvailableMinMB)) mem.push(`서버 사용 가능 최저 ${Math.round(s.memAvailableMinMB)}MB`);
  if (has(s.swapMaxMB)) mem.push(`swap 최고 ${Math.round(s.swapMaxMB)}MB`);
  if (mem.length) lines.push(`• 메모리: ${mem.join(' · ')}`);

  const store = [];
  if (has(s.diskUsedPct)) store.push(`디스크 ${Math.round(s.diskUsedPct)}%`);
  if (has(s.rdsFreeMemMinMB)) store.push(`RDS 남는 메모리 최저 ${Math.round(s.rdsFreeMemMinMB)}MB`);
  if (has(s.rdsFreeStorageGB)) store.push(`RDS 저장 ${s.rdsFreeStorageGB.toFixed(1)}GB 남음`);
  if (store.length) lines.push(`• ${store.join(' · ')}`);

  if (has(s.healthFailures)) lines.push(`• 외부 헬스 실패 ${s.healthFailures}번`);
  if (s.cost) {
    const forecast = has(s.cost.forecast) ? `(한 달 예상 ${fmtUsd(s.cost.forecast)})` : '';
    const last = has(s.cost.lastMonth) ? ` · 지난달 ${fmtUsd(s.cost.lastMonth)}` : '';
    lines.push(`• 비용: ${s.cost.confirmedDate} 확정 ${fmtUsd(s.cost.confirmedDay)} · 이번 달 ${fmtUsd(s.cost.monthToDate)}${forecast}${last}`);
  }
  if (has(s.alarmsFired) && has(s.alarmsOpen)) {
    lines.push(`• 어제 울린 경보 ${s.alarmsFired}개 · 지금 열린 경보 ${s.alarmsOpen}개 ${link(alarmListUrl(), '경보 목록')}`);
  }
  return lines.join('\n');
}
