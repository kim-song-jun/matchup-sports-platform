const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const kstDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });

/** First Saturday at least two weeks out and the following Sunday (KST `YYYY-MM-DD`): one calendar week, never in the past. */
export function upcomingWeekend(): [saturday: string, sunday: string] {
  const from = Date.now() + 14 * DAY_MS;
  for (let offset = 0; offset < 7; offset += 1) {
    const at = from + offset * DAY_MS;
    if (new Date(at + KST_OFFSET_MS).getUTCDay() === 6) return [kstDate.format(new Date(at)), kstDate.format(new Date(at + DAY_MS))];
  }
  throw new Error('unreachable: every 7-day window contains a Saturday');
}
