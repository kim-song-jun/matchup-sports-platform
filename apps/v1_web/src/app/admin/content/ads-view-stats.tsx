'use client';

import { adChannelLabel } from '@/lib/admin-labels';
import type { V1AdCampaignDetail, V1AdChannel, V1AdChannelTotals } from '@/types/ads';
import { formatCount, formatCtr, formatKstDateTime, todayStats } from './ads-view-model';

function Stat({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-1 text-[length:var(--font-size-body)] font-bold tabular-nums text-[var(--text-strong)]">{value}</dd>
    </div>
  );
}

function ChannelStats({ channel, totals, today }: { channel: V1AdChannel; totals: V1AdChannelTotals; today: V1AdChannelTotals }) {
  const name = adChannelLabel(channel);
  return (
    <section aria-label={`${name} 성과`} className="flex flex-col gap-2">
      <h3 className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">{name} 성과</h3>
      <dl className="tm-on-tint grid grid-cols-2 gap-3 rounded-xl bg-[var(--surface-soft)] p-3">
        <Stat label="누적 노출" value={formatCount(totals.impressions)} />
        <Stat label="누적 클릭" value={formatCount(totals.clicks)} />
        <Stat label="오늘 노출" value={formatCount(today.impressions)} />
        <Stat label="오늘 클릭" value={formatCount(today.clicks)} />
        <Stat label="CTR (클릭 ÷ 노출)" value={formatCtr(totals.impressions, totals.clicks)} wide />
      </dl>
    </section>
  );
}

/**
 * Cumulative and today's counters per configured channel, the daily table, and the measurement caveat.
 * Counts are reported by readers' browsers, so the panel says what they can miss instead of presenting them as exact.
 */
export function AdStatsPanel({
  channels,
  detail,
  today,
  loading,
  error,
  showDaily,
  dailyId,
}: {
  channels: V1AdChannel[];
  detail: V1AdCampaignDetail | undefined;
  /** KST calendar date, `YYYY-MM-DD`. */
  today: string;
  loading: boolean;
  error?: string;
  showDaily: boolean;
  dailyId: string;
}) {
  if (!detail) {
    return (
      <p role={error ? 'alert' : 'status'} className={`text-[length:var(--font-size-body-sm)] ${error ? 'font-medium text-[var(--red700)]' : 'text-[var(--text-muted)]'}`}>
        {error ?? (loading ? '성과를 불러오고 있어요.' : '')}
      </p>
    );
  }

  const { stats } = detail;
  return (
    <>
      {channels.map((channel) => (
        <ChannelStats key={channel} channel={channel} totals={stats[channel]} today={todayStats(stats.daily, channel, today)} />
      ))}

      <div id={dailyId} hidden={!showDaily}>
        {stats.daily.length === 0 ? (
          <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">아직 집계된 날이 없어요.</p>
        ) : (
          <div className="max-h-[320px] overflow-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[320px] text-left text-[length:var(--font-size-body-sm)]">
              <caption className="sr-only">일별 노출·클릭 (한국 시간 기준, 최신 날짜 먼저)</caption>
              <thead className="tm-on-tint sticky top-0 bg-[var(--surface-soft)] text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">날짜</th>
                  <th scope="col" className="px-3 py-2 font-medium">채널</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">노출</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">클릭</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">CTR</th>
                </tr>
              </thead>
              <tbody>
                {stats.daily.map((row) => (
                  <tr key={`${row.date}-${row.channel}`} className="border-t border-[var(--border)] text-[var(--text-body)]">
                    <td className="px-3 py-2 tabular-nums">{row.date}</td>
                    <td className="px-3 py-2">{adChannelLabel(row.channel)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCount(row.impressions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCount(row.clicks)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCtr(row.impressions, row.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[length:var(--font-size-caption)] leading-5 text-[var(--text-muted)]">
        집계는 네트워크 오류·호출 제한으로 일부 누락될 수 있어요. 브라우저가 보낸 값이라 부풀려질 수도 있어서 청구 근거로 쓰지 않아요.{' '}
        {stats.updatedAt ? `집계 갱신: ${formatKstDateTime(stats.updatedAt)}` : '아직 집계된 이벤트가 없어요.'}
      </p>
    </>
  );
}
