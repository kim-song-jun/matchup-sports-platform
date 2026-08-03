'use client';

import Link from 'next/link';
import { Card, EmptyState, KPIStat } from '@/components/v1-ui/primitives';
import { formatTournamentDateShort } from '@/lib/date-utils';
import { teamRecordResultLabel } from './format';
import type { PublicTeamRecordItem, PublicTeamRecordsResponse } from './types';

const RESULT_COLOR: Record<string, string> = {
  WON: 'var(--blue500)',
  LOST: 'var(--red500)',
  DRAWN: 'var(--text-caption)',
};

function TeamRecordRow({ item }: { item: PublicTeamRecordItem }) {
  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--grey100)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-caption)' }}>
          {formatTournamentDateShort(item.officialAt) ?? ''}
          {item.tournamentTitle ? ` · ${item.tournamentTitle}` : ''}
        </span>
        {item.isCorrected ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--blue500)',
              background: 'var(--blue50)',
              borderRadius: 6,
              padding: '2px 6px',
            }}
          >
            정정됨
          </span>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          className="tab-num"
          style={{ fontSize: 14, fontWeight: 800, color: RESULT_COLOR[item.result] ?? 'var(--text-strong)', width: 20 }}
        >
          {teamRecordResultLabel(item.result)}
        </span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
          {item.opponentTeamName ?? '상대 미상'}
        </span>
        <span className="tab-num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>
          {item.goalsFor} : {item.goalsAgainst}
        </span>
      </div>
    </div>
  );
}

export function TeamRecordsContent({
  data,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  data: PublicTeamRecordsResponse;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <KPIStat label="경기" value={data.summary.played} unit="경기" />
          <KPIStat label="승·무·패" value={`${data.summary.won}·${data.summary.drawn}·${data.summary.lost}`} />
          <KPIStat label="득실차" value={data.summary.goalsFor - data.summary.goalsAgainst} />
        </div>
      </Card>

      <section>
        <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>경기 기록</h3>
        {data.items.length === 0 ? (
          <EmptyState title="아직 공식 경기 기록이 없어요" sub="대회·팀매치 결과가 확정되면 이곳에 표시돼요." />
        ) : (
          <Card pad={0}>
            {data.items.map((item) =>
              item.tournamentId ? (
                <Link
                  key={item.gameId}
                  href={`/tournaments/${item.tournamentId}`}
                  style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                >
                  <TeamRecordRow item={item} />
                </Link>
              ) : (
                <div key={item.gameId}>
                  <TeamRecordRow item={item} />
                </div>
              ),
            )}
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
    </div>
  );
}
