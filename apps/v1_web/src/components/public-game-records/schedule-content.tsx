'use client';

import Link from 'next/link';
import { Film } from 'lucide-react';
import { Card, EmptyState } from '@/components/v1-ui/primitives';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import { LiveBadge } from './live-badge';
import {
  fixtureStatusLabel,
  formatGoalMinute,
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

/**
 * 득점자 요약 -- 골이 하나도 없으면 이 함수 자체가 `null`을 반환해 빈 줄을
 * 아예 렌더하지 않는다(요구사항: "골이 없으면 그 줄 자체를 렌더하지 마라").
 *
 * 홈/원정 분리: 스코어 행이 이미 "홈은 오른쪽 정렬, 원정은 왼쪽 정렬"로 좌우를
 * 확립해 뒀으므로, 득점자도 그 축을 그대로 이어받아 3열 그리드(`FixtureCard`의
 * 득점자 그리드와 동일한 `1fr auto 1fr` 패턴, `tournament-detail-client.tsx`)로
 * 나눈다. 예시 문구("⚽ 10' 김골키 · 45' 김골키")처럼 한 줄로 이어붙이는 방식은
 * 390px 폭에서 "어느 팀 골인지"를 시간순 나열만으로는 알 수 없다는 문제가 있다
 * (2:0 같은 스코어에서 이게 실제 정보 손실이다) -- 이미 검증된 좌우분리 패턴을
 * 그대로 재사용해 폭 문제와 팀 귀속 모호성을 동시에 해결한다. 이름이 null(동의
 * 없음)인 골은 이름을 지어내지 않고 시간만 남긴다. jerseyNumber는 DTO에는 있지만
 * 좁은 카드에 다 욱여넣으면 오히려 안 읽히므로 이 컴포넌트는 의도적으로 쓰지
 * 않는다(상세 페이지 타임라인에서는 등번호까지 보여준다).
 */
function ScorerSummary({ scorers }: { scorers: PublicScheduleEntry['scorers'] }) {
  if (scorers.length === 0) return null;
  const home = scorers.filter((scorer) => scorer.side === 'home');
  const away = scorers.filter((scorer) => scorer.side === 'away');
  const goalLine = (scorer: PublicScheduleEntry['scorers'][number], index: number) => (
    <div key={index}>
      {formatGoalMinute(scorer.clockMs)}
      {scorer.participantName ? ` ${scorer.participantName}` : ''}
    </div>
  );
  return (
    <div
      role="list"
      aria-label="득점자"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 20px 1fr',
        gap: 6,
        marginTop: 4,
        fontSize: 11,
        color: 'var(--text-caption)',
      }}
    >
      <div style={{ textAlign: 'right' }}>{home.map(goalLine)}</div>
      <div aria-hidden="true" style={{ textAlign: 'center' }}>⚽</div>
      <div style={{ textAlign: 'left' }}>{away.map(goalLine)}</div>
    </div>
  );
}

function VideoBadge({ hasVideo }: { hasVideo: boolean }) {
  if (!hasVideo) return null;
  return (
    <span
      aria-label="경기 영상 있음"
      style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--blue500)' }}
    >
      <Film size={12} aria-hidden="true" />
    </span>
  );
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
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-caption)', display: 'flex', gap: 6, alignItems: 'center' }}>
          {entry.groupName ?? entry.round}
          {entry.legNumber > 1 ? ` ${entry.legNumber}차` : ''}
          <VideoBadge hasVideo={entry.hasVideo} />
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
      <ScorerSummary scorers={entry.scorers} />
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
              <Link
                key={row.teamId}
                href={`/teams/${row.teamId}/records`}
                className="tm-pressable"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  minHeight: 44,
                  borderTop: '1px solid var(--grey100)',
                  textDecoration: 'none',
                  color: 'inherit',
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
              </Link>
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
