'use client';

import Link from 'next/link';
import { Card, EmptyState } from '@/components/v1-ui/primitives';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import { LiveBadge } from './live-badge';
import {
  fixtureStatusLabel,
  formatScoreline,
  isCorrectedOrVoid,
  resultStateLabel,
} from './format';
import type { PublicScheduleEntry, PublicStandingRow, PublicTournamentScheduleResponse } from './types';

function sideLabel(side: PublicScheduleEntry['home']): string {
  return side?.teamName ?? '미정';
}

function ScheduleResultBadge({ entry }: { entry: PublicScheduleEntry }) {
  if (!isCorrectedOrVoid(entry.resultState)) return null;
  const tone = entry.resultState === 'void' ? 'var(--red500)' : 'var(--blue500)';
  const bg = entry.resultState === 'void' ? 'var(--red50)' : 'var(--blue50)';
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: tone,
        background: bg,
        borderRadius: 6,
        padding: '2px 6px',
      }}
    >
      {resultStateLabel(entry.resultState)}
    </span>
  );
}

function venueLabel(entry: PublicScheduleEntry): string | null {
  if (!entry.venue && !entry.fieldName) return null;
  if (entry.venue && entry.fieldName) return `${entry.venue} (${entry.fieldName})`;
  return entry.venue ?? entry.fieldName;
}

function ScheduleRow({ tournamentId, entry }: { tournamentId: string; entry: PublicScheduleEntry }) {
  const dateLabel = formatTournamentDateTimeShort(entry.scheduledAt);
  const venue = venueLabel(entry);
  return (
    <Link
      href={`/tournaments/${tournamentId}/matches/${entry.fixtureId}`}
      className="tm-pressable"
      style={{
        display: 'block',
        padding: '12px 16px',
        minHeight: 44,
        borderTop: '1px solid var(--grey100)',
        textDecoration: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)' }}>
          {entry.groupName ?? entry.round}
          {entry.legNumber > 1 ? ` ${entry.legNumber}차` : ''}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-caption)', display: 'flex', gap: 6, alignItems: 'center' }}>
          {dateLabel ?? '일정 미정'}
          {entry.status === 'live' ? <LiveBadge clock={entry.clock} /> : ` · ${fixtureStatusLabel(entry.status)}`}
          <ScheduleResultBadge entry={entry} />
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, textAlign: 'right', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
          {sideLabel(entry.home)}
        </span>
        <span
          className="tab-num"
          style={{
            flex: '0 0 64px',
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 800,
            color: 'var(--text-strong)',
            background: 'var(--grey50)',
            borderRadius: 8,
            padding: '4px 0',
          }}
        >
          {formatScoreline(entry.score, entry.scoreStatus)}
        </span>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
          {sideLabel(entry.away)}
        </span>
      </div>
      {venue ? (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-caption)' }}>{venue}</div>
      ) : null}
    </Link>
  );
}

function StandingsTable({ rows }: { rows: readonly PublicStandingRow[] }) {
  const groups = new Map<string, { groupName: string; rows: PublicStandingRow[] }>();
  for (const row of rows) {
    const bucket = groups.get(row.groupId) ?? { groupName: row.groupName, rows: [] };
    bucket.rows.push(row);
    groups.set(row.groupId, bucket);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from(groups.entries()).map(([groupId, group]) => (
        <Card key={groupId} pad={0}>
          <div
            style={{
              padding: '10px 16px',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text-caption)',
              borderBottom: '1px solid var(--grey100)',
            }}
          >
            {group.groupName}
          </div>
          {[...group.rows]
            .sort((a, b) => a.position - b.position)
            .map((row) => (
              <div
                key={row.teamId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderTop: '1px solid var(--grey100)',
                }}
              >
                <span style={{ width: 20, fontSize: 13, fontWeight: 700, color: 'var(--text-caption)' }}>
                  {row.position}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                  {row.teamName}
                </span>
                <span className="tab-num" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {row.wins}승 {row.draws}무 {row.losses}패
                </span>
                <span className="tab-num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
                  {row.points}점
                </span>
              </div>
            ))}
        </Card>
      ))}
    </div>
  );
}

export function ScheduleContent({
  tournamentId,
  data,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  tournamentId: string;
  data: PublicTournamentScheduleResponse;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}) {
  if (!data.bracketPublished) {
    return (
      <div style={{ padding: '40px 20px' }}>
        <EmptyState title="대진표가 아직 공개되지 않았어요" sub="대회 운영진이 대진을 확정하면 일정이 공개돼요." />
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {data.standings.length > 0 ? (
        <section>
          <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>
            조별 순위
          </h3>
          <StandingsTable rows={data.standings} />
        </section>
      ) : null}

      <section>
        <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>
          경기 일정
        </h3>
        {data.items.length === 0 ? (
          <EmptyState title="아직 확정된 일정이 없어요" sub="경기 시간이 정해지면 여기에 표시돼요." />
        ) : (
          <Card pad={0}>
            {data.items.map((entry) => (
              <ScheduleRow key={entry.fixtureId} tournamentId={tournamentId} entry={entry} />
            ))}
          </Card>
        )}
        {hasNextPage ? (
          <button
            type="button"
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
            style={{ marginTop: 12 }}
            disabled={isFetchingNextPage}
            onClick={onLoadMore}
          >
            {isFetchingNextPage ? '불러오는 중…' : '더 보기'}
          </button>
        ) : null}
      </section>

      {data.unscheduled.length > 0 ? (
        <section>
          <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>
            시간 미정 경기
          </h3>
          <Card pad={0}>
            {data.unscheduled.map((entry) => (
              <ScheduleRow key={entry.fixtureId} tournamentId={tournamentId} entry={entry} />
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
