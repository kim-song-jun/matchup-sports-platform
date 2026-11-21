// Decides whether an alarm of a cause group becomes a Slack message. Pure: the Lambda passes in the
// alarm history it read, so the decision is testable against real sequences.
//
// One OOM death fires `web-restart` and `heap-oom` seconds apart: that pair is one occurrence. The same
// alarm firing again is another occurrence, however close, so a crash loop (a restart every 2 minutes)
// is counted instead of looking like a single restart.

/** Different alarms of the group closer than this to the first one belong to the same occurrence. */
export const SIBLING_GAP_MS = 3 * 60_000;
/** Occurrences stay one repeat run while each follows the previous within this gap. */
export const REPEAT_GAP_MS = 30 * 60_000;
/** The n-th occurrence of a run that is posted; the others stay in CloudWatch and the daily summary. */
export const POST_AT_OCCURRENCE = [1, 3, 6, 12, 24, 48, 96];
/** How far back the Lambda reads history: a run older than this is counted from here. */
export const HISTORY_LOOKBACK_MS = 6 * 3_600_000;
/**
 * A state alarm of a cause group (`restart-loop`) flips ALARM/OK every few minutes in a slow loop. Its recovery
 * is posted only when the alarm stayed OK this long: the Lambda waits, then reads the history again.
 */
export const RECOVERY_QUIET_MS = 10 * 60_000;
/** The same transition can appear with a few ms of difference between the SNS message and the history. */
const SAME_TRANSITION_MS = 5_000;

function mergeTransitions(transitions, current) {
  const all = [...transitions, current].sort((a, b) => a.atMs - b.atMs || a.name.localeCompare(b.name));
  return all.filter((t, i) => !all.slice(0, i).some((u) => u.name === t.name && Math.abs(u.atMs - t.atMs) <= SAME_TRANSITION_MS));
}

// An occurrence starts with its first transition; a later one joins only when it is a different alarm
// that fired within SIBLING_GAP_MS of that first transition (anchored on the first, never chained).
function clusterOccurrences(transitions) {
  const clusters = [];
  for (const t of transitions) {
    const last = clusters.at(-1);
    if (last && t.atMs - last[0].atMs <= SIBLING_GAP_MS && !last.some((u) => u.name === t.name)) last.push(t);
    else clusters.push([t]);
  }
  return clusters;
}

/**
 * @param {{name: string, changeMs: number, transitions: {name: string, atMs: number}[]}} input
 *   transitions: ALARM transitions of every alarm in the group (this one may be missing: history lags).
 * @returns {{post: false, reason: string, occurrence?: number} |
 *   {post: true, occurrence: number, spanMinutes: number, alongside: string[]}}
 *   occurrence: n-th of the current repeat run; spanMinutes: minutes from the run's first occurrence to this one.
 */
export function decideGroupAlarm({ name, changeMs, transitions }) {
  const clusters = clusterOccurrences(mergeTransitions(transitions, { name, atMs: changeMs }));
  const index = clusters.findIndex((c) => c.some((t) => t.name === name && Math.abs(t.atMs - changeMs) <= SAME_TRANSITION_MS));
  const cluster = clusters[index];
  const leader = cluster[0];
  if (leader.name !== name || Math.abs(leader.atMs - changeMs) > SAME_TRANSITION_MS) return { post: false, reason: 'merged-into-earlier-alarm' };

  let first = index;
  while (first > 0 && clusters[first][0].atMs - clusters[first - 1][0].atMs <= REPEAT_GAP_MS) first -= 1;
  const occurrence = index - first + 1;
  if (!POST_AT_OCCURRENCE.includes(occurrence)) return { post: false, reason: 'repeat-throttled', occurrence };
  const spanMinutes = Math.round((leader.atMs - clusters[first][0].atMs) / 60_000);
  return { post: true, occurrence, spanMinutes, alongside: [...new Set(cluster.map((t) => t.name).filter((n) => n !== name))] };
}

/**
 * Whether the OK transition of a grouped state alarm ends the loop (post the recovery) or only a pause in it.
 * Every repeat run posts its 1st ALARM, so a run that ends quiet always has a message to recover.
 * @param {{name: string, changeMs: number, transitions: {name: string, atMs: number}[]}} input
 *   transitions: ALARM transitions read at least RECOVERY_QUIET_MS after `changeMs`.
 * @returns {{post: false, reason: 'loop-continues'} | {post: true, runStartMs?: number}}
 *   runStartMs: first ALARM of the repeat run that just ended (the recovery reports the whole run's length).
 */
export function decideRecovery({ name, changeMs, transitions }) {
  const mine = transitions.filter((t) => t.name === name).map((t) => t.atMs).sort((a, b) => a - b);
  if (mine.some((atMs) => atMs > changeMs + SAME_TRANSITION_MS)) return { post: false, reason: 'loop-continues' };
  const before = mine.filter((atMs) => atMs <= changeMs + SAME_TRANSITION_MS);
  if (!before.length) return { post: true };
  let start = before.length - 1;
  while (start > 0 && before[start] - before[start - 1] <= REPEAT_GAP_MS) start -= 1;
  return { post: true, runStartMs: before[start] };
}
