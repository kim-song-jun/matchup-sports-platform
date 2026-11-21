// Decides whether an alarm of a cause group becomes a Slack message. Pure: the Lambda passes in the
// alarm history it read, so the decision is testable against real sequences.
//
// One OOM death fires `web-restart` and `heap-oom` seconds apart. They are one incident, and a restart
// that repeats every few minutes is one story too: post the first, then only at escalation points.

/** Transitions of one group closer than this belong to the same incident. */
export const INCIDENT_GAP_MS = 3 * 60_000;
/** Incidents are counted over this window. */
export const REPEAT_WINDOW_MS = 30 * 60_000;
/** The n-th incident inside the window that is posted; the others stay in CloudWatch and the daily summary. */
export const POST_AT_INCIDENT = [1, 3, 6, 12, 24];
/** The same transition can appear with a few ms of difference between the SNS message and the history. */
const SAME_TRANSITION_MS = 5_000;

function mergeTransitions(transitions, current) {
  const all = [...transitions, current].sort((a, b) => a.atMs - b.atMs || a.name.localeCompare(b.name));
  return all.filter((t, i) => !all.slice(0, i).some((u) => u.name === t.name && Math.abs(u.atMs - t.atMs) <= SAME_TRANSITION_MS));
}

function clusterIncidents(transitions) {
  const clusters = [];
  for (const t of transitions) {
    const last = clusters.at(-1);
    if (last && t.atMs - last.at(-1).atMs <= INCIDENT_GAP_MS) last.push(t);
    else clusters.push([t]);
  }
  return clusters;
}

/**
 * @param {{name: string, changeMs: number, transitions: {name: string, atMs: number}[]}} input
 *   transitions: ALARM transitions of every alarm in the group (this one may be missing: history lags).
 * @returns {{post: false, reason: string} | {post: true, incident: number, alongside: string[]}}
 */
export function decideGroupAlarm({ name, changeMs, transitions }) {
  const merged = mergeTransitions(transitions, { name, atMs: changeMs });
  const clusters = clusterIncidents(merged);
  const index = clusters.findIndex((c) => c.some((t) => t.name === name && Math.abs(t.atMs - changeMs) <= SAME_TRANSITION_MS));
  const cluster = clusters[index];
  const leader = cluster[0];
  if (leader.name !== name || Math.abs(leader.atMs - changeMs) > SAME_TRANSITION_MS) return { post: false, reason: 'merged-into-earlier-alarm' };

  const incident = clusters.slice(0, index + 1).filter((c) => c[0].atMs >= changeMs - REPEAT_WINDOW_MS).length;
  if (!POST_AT_INCIDENT.includes(incident)) return { post: false, reason: 'repeat-throttled', incident };
  return { post: true, incident, alongside: [...new Set(cluster.map((t) => t.name).filter((n) => n !== name))] };
}
