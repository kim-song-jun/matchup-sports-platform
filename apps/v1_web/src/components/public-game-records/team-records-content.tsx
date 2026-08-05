'use client';

import Link from 'next/link';
import { Card, EmptyState, KPIStat } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { formatTournamentDateShort } from '@/lib/date-utils';
import { teamRecordResultLabel } from './format';
import type { PublicTeamRecordItem, PublicTeamRecordsResponse } from './types';

const RESULT_COLOR: Record<string, string> = {
  WON: 'var(--blue500)',
  LOST: 'var(--red500)',
  DRAWN: 'var(--text-caption)',
};

/** 대회 소스면 대회 상세로, 팀매치 소스면 팀매치 상세로 — exactly-one-source라 항상 둘 중
 * 하나만 있다(V1Game의 CHECK 제약, public-team-records.service.ts 주석 참고). */
function recordHref(item: PublicTeamRecordItem): string | null {
  if (item.tournamentId) return `/tournaments/${item.tournamentId}`;
  if (item.teamMatchId) return `/team-matches/${item.teamMatchId}`;
  return null;
}

/** 05/06번 팀매치 결과 화면이 쓰는 "팀 로고 · 점수 · 팀 로고" 스코어박스 톤을 그대로
 * 가져왔다 — 이전엔 텍스트 한 줄(결과·상대팀명·점수)뿐이라 같은 데이터인데도 대회/매치
 * 상세보다 훨씬 밋밋해 보였다. */
function TeamRecordRow({ item, teamId, teamName }: { item: PublicTeamRecordItem; teamId: string; teamName: string }) {
  return (
    <div style={{ padding: '14px 16px', borderTop: '1px solid var(--grey100)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            className="tab-num"
            style={{ fontSize: 12, fontWeight: 800, color: RESULT_COLOR[item.result] ?? 'var(--text-strong)' }}
          >
            {teamRecordResultLabel(item.result)}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-caption)' }}>
            {formatTournamentDateShort(item.officialAt) ?? ''}
            {item.tournamentTitle ? ` · ${item.tournamentTitle}` : ''}
          </span>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <TeamAvatar seed={teamId} name={teamName} size="sm" />
          <span
            className="tm-text-caption"
            style={{ fontWeight: 600, color: 'var(--text-strong)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {teamName}
          </span>
        </div>
        <span className="tab-num" style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)', flexShrink: 0 }}>
          {item.goalsFor} : {item.goalsAgainst}
        </span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <TeamAvatar seed={item.opponentTeamId ?? item.gameId} name={item.opponentTeamName ?? '상대 미상'} size="sm" />
          <span
            className="tm-text-caption"
            style={{ fontWeight: 600, color: 'var(--text-strong)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {item.opponentTeamName ?? '상대 미상'}
          </span>
        </div>
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
            {data.items.map((item) => {
              const href = recordHref(item);
              return href ? (
                <Link
                  key={item.gameId}
                  href={href}
                  style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                >
                  <TeamRecordRow item={item} teamId={data.teamId} teamName={data.teamName} />
                </Link>
              ) : (
                <div key={item.gameId}>
                  <TeamRecordRow item={item} teamId={data.teamId} teamName={data.teamName} />
                </div>
              );
            })}
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
