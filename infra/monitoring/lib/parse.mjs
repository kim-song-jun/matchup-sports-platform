// Pure parsers for what the collector reads on the host. No I/O here so every shape can be
// tested against real log lines.

const TS_PREFIX = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) /;

// nginx `combined`: $remote_addr - $remote_user [$time_local] "$request" $status $bytes "$referer" "$ua"
const NGINX_COMBINED =
  /^\S+ \S+ \S+ \[[^\]]+\] "(?:[^"\\]|\\.)*" (\d{3}) \S+ "(?:[^"\\]|\\.)*" "((?:[^"\\]|\\.)*)"/;

/** Only the status code and a bot label survive; the IP, path and raw UA never leave this function. */
export function parseNginxLine(rawLine) {
  const line = rawLine.replace(TS_PREFIX, '');
  const m = NGINX_COMBINED.exec(line);
  if (!m) return null;
  return { status: Number(m[1]), bot: botKind(m[2]) };
}

const NAMED_BOTS = [
  ['GPTBot', /GPTBot/i],
  ['ClaudeBot', /ClaudeBot|Claude-User|Claude-SearchBot/i],
  ['Bytespider', /Bytespider/i],
  ['meta-externalagent', /meta-externalagent/i],
  ['Googlebot', /Googlebot/i],
];
const OTHER_BOT = /bot\b|crawler|spider|slurp|Yeti|ChatGPT-User|facebookexternalhit|Applebot|bingbot/i;

/** null for people, a bot name for the named ones, 'other' for the rest of the bot family. */
export function botKind(userAgent) {
  for (const [name, pattern] of NAMED_BOTS) if (pattern.test(userAgent)) return name;
  return OTHER_BOT.test(userAgent) ? 'other' : null;
}

// nginx error log, written to stderr and so part of `docker logs`:
//   2026/11/20 01:50:35 [error] 29#29: *1 limiting requests, excess: 60.500 by zone "v1api", client: ...
// The access log has no field for it: a rejected request is an ordinary 503 line.
const LIMIT_REQ_REJECTION = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} \[\w+\] \d+#\d+: \*\d+ limiting requests, excess: /;

/** True for the error-log line nginx writes each time `limit_req` rejects a request (not the dry-run one). */
export function isRateLimitRejection(rawLine) {
  return LIMIT_REQ_REJECTION.test(rawLine.replace(TS_PREFIX, ''));
}

/**
 * `errors5xx` is what the server answered wrongly. `limit_req` rejections come back as 503 too but say the
 * server is fine, so they are counted apart in `rateLimited` and taken out of `errors5xx`.
 */
export function summarizeNginx(lines) {
  const out = { requests: 0, errors5xx: 0, rateLimited: 0, bots: 0, botsByName: {} };
  let status503 = 0;
  for (const line of lines) {
    if (isRateLimitRejection(line)) { out.rateLimited += 1; continue; }
    const parsed = parseNginxLine(line);
    if (!parsed) continue;
    out.requests += 1;
    if (parsed.status >= 500 && parsed.status <= 599) out.errors5xx += 1;
    if (parsed.status === 503) status503 += 1;
    if (parsed.bot) {
      out.bots += 1;
      out.botsByName[parsed.bot] = (out.botsByName[parsed.bot] ?? 0) + 1;
    }
  }
  // Only a 503 can be a rejection, and every rejection left exactly one 503 access line.
  out.errors5xx -= Math.min(out.rateLimited, status503);
  return out;
}

const HEAP_FATAL = /FATAL ERROR:.*(heap limit|heap out of memory)/i;

// RFC3339 with a variable-length fraction -> comparable fixed-width string.
function comparableTs(ts) {
  const [head, frac = ''] = ts.replace('Z', '').split('.');
  return `${head}.${frac.padEnd(9, '0')}`;
}

/**
 * `docker logs --timestamps` overlaps between runs, so each fatal line is counted once:
 * only lines newer than the last timestamp already counted.
 */
export function countNewHeapOom(lines, lastCounted = null) {
  let count = 0;
  let newest = lastCounted;
  for (const line of lines) {
    const prefix = TS_PREFIX.exec(line);
    if (!prefix || !HEAP_FATAL.test(line)) continue;
    const ts = comparableTs(prefix[1]);
    if (lastCounted && ts <= comparableTs(lastCounted)) continue;
    count += 1;
    if (!newest || ts > comparableTs(newest)) newest = prefix[1];
  }
  return { count, lastCounted: newest };
}

export function parseMeminfo(text) {
  const kb = (key) => {
    const m = new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(text);
    if (!m) throw new Error(`/proc/meminfo has no ${key}`);
    return Number(m[1]);
  };
  return {
    memAvailableMB: Math.round(kb('MemAvailable') / 1024),
    swapUsedMB: Math.round((kb('SwapTotal') - kb('SwapFree')) / 1024),
  };
}

/** `df -P /` output -> used percent of the root filesystem. */
export function parseDfUsedPct(text) {
  const row = text.trim().split('\n').at(-1)?.trim().split(/\s+/);
  const pct = /^(\d+)%$/.exec(row?.[4] ?? '');
  if (!pct) throw new Error('unexpected df output');
  return Number(pct[1]);
}

/** `docker stats --format '{{.MemPerc}}'` -> 21.34 */
export function parseMemPerc(text) {
  const m = /^\s*(\d+(?:\.\d+)?)%\s*$/.exec(text);
  if (!m) throw new Error(`unexpected MemPerc: ${text.trim().slice(0, 20)}`);
  return Number(m[1]);
}

/** `openssl x509 -enddate -noout` -> days left (floored). */
export function parseCertDaysLeft(text, nowMs) {
  const m = /^notAfter=(.+)$/m.exec(text);
  const end = m ? Date.parse(m[1].replace(/\s+GMT$/, ' UTC')) : NaN;
  if (Number.isNaN(end)) throw new Error('unexpected openssl enddate output');
  return Math.floor((end - nowMs) / 86_400_000);
}

export const DEPLOY_WINDOW_MS = 3 * 60_000;

/**
 * Same container id with a new StartedAt = restart; a new id under the same name = redeploy.
 * (RestartCount resets on `docker restart`, so it cannot be used.) First sight of a name is a baseline.
 */
export function diffContainers(prev, current, nowMs) {
  const restarts = {};
  let deploys = 0;
  let oomKilledRestarts = 0;
  const known = {};
  for (const c of current) {
    known[c.name] = { id: c.id, startedAt: c.startedAt };
    const before = prev?.containers?.[c.name];
    if (!before) continue;
    if (before.id !== c.id) deploys += 1;
    else if (before.startedAt !== c.startedAt) {
      restarts[c.name] = (restarts[c.name] ?? 0) + 1;
      if (c.oomKilled) oomKilledRestarts += 1;
    }
  }
  const prevUntil = prev?.deployUntilMs ?? 0;
  const deployUntilMs = deploys > 0 ? nowMs + DEPLOY_WINDOW_MS : prevUntil;
  return { restarts, deploys, oomKilledRestarts, containers: known, deployUntilMs, deployWindow: nowMs < deployUntilMs ? 1 : 0 };
}

/** Keeps timestamped log lines strictly newer than `last`; returns them and the newest timestamp seen. */
export function linesAfter(lines, last = null) {
  const kept = [];
  let newest = last;
  for (const line of lines) {
    const prefix = TS_PREFIX.exec(line);
    if (!prefix) continue;
    if (last && comparableTs(prefix[1]) <= comparableTs(last)) continue;
    kept.push(line);
    if (!newest || comparableTs(prefix[1]) > comparableTs(newest)) newest = prefix[1];
  }
  return { lines: kept, newest };
}
