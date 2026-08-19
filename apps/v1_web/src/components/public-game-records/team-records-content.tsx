'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { Card, EmptyState, KPIStat } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { formatTournamentDateShort } from '@/lib/date-utils';
import {
  formatClock,
  periodLabel,
  presentParticipantName,
  teamRecordResultLabel,
} from './format';
import { resultChipStyle, resultStripeStyle } from './result-emphasis';
import type { PublicTeamRecordItem, PublicTeamRecordsResponse } from './types';
import { usePublicMatch } from './use-public-game-records';

function recordHref(item: PublicTeamRecordItem): string | null {
  if (item.tournamentId && item.fixtureId) {
    return '/tournaments/' + item.tournamentId + '/matches/' + item.fixtureId;
  }
  if (item.tournamentId) return '/tournaments/' + item.tournamentId;
  if (item.teamMatchId) return '/team-matches/' + item.teamMatchId;
  return null;
}

function RecordDetails({ item }: { item: PublicTeamRecordItem }) {
  const tournamentId = item.tournamentId ?? '';
  const fixtureId = item.fixtureId ?? '';
  const match = usePublicMatch(tournamentId, fixtureId);
  const goals = match.data?.events.filter((event) => event.type === 'GOAL') ?? [];
  const href = recordHref(item);

  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 14,
        borderTop: '1px solid var(--grey100)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {item.round ? (
        <span className='tm-text-caption' style={{ color: 'var(--text-caption)' }}>
          {item.round}
        </span>
      ) : null}
      {item.tournamentId && item.fixtureId ? (
        match.isPending ? (
          <span className='tm-text-caption' style={{ color: 'var(--text-caption)' }}>
            경기 기록을 불러오는 중입니다.
          </span>
        ) : match.isError ? (
          <span className='tm-text-caption' role='alert' style={{ color: 'var(--red600)' }}>
            경기 기록을 불러오지 못했습니다.
          </span>
        ) : goals.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {goals.map((event, index) => (
              <div
                key={event.sideId + '-' + (event.participantId ?? 'withheld') + '-' + (event.clockMs ?? index)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
              >
                <span className='tm-text-caption' style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
                  ⚽ {presentParticipantName(event.participantName)}
                  {event.jerseyNumber !== null ? ' #' + event.jerseyNumber : ''}
                </span>
                <span className='tm-text-caption tab-num' style={{ color: 'var(--text-caption)', flexShrink: 0 }}>
                  {event.period !== null ? periodLabel(event.period) : ''}
                  {event.clockMs !== null ? ' ' + formatClock(event.clockMs) : ''}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span className='tm-text-caption' style={{ color: 'var(--text-caption)' }}>
            등록된 득점 기록이 없습니다.
          </span>
        )
      ) : (
        <span className='tm-text-caption' style={{ color: 'var(--text-caption)' }}>
          이 경기의 공개 상세 기록은 제공되지 않습니다.
        </span>
      )}
      {href ? (
        <Link href={href} className='tm-btn tm-btn-sm tm-btn-neutral' style={{ alignSelf: 'flex-start' }}>
          경기 상세 보기
        </Link>
      ) : null}
    </div>
  );
}

function TeamRecordRow({
  item,
  teamId,
  teamName,
  teamLogoUrl,
  expanded,
  onToggle,
}: {
  item: PublicTeamRecordItem;
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const expandable = Boolean(item.tournamentId && item.fixtureId);

  return (
    <div
      style={{
        padding: '14px 16px 14px 12px',
        borderTop: '1px solid var(--grey100)',
        ...resultStripeStyle(item.result),
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={resultChipStyle(item.result)}>{teamRecordResultLabel(item.result)}</span>
          <span style={{ fontSize: 12, color: 'var(--text-caption)' }}>
            {formatTournamentDateShort(item.officialAt) ?? ''}
            {item.tournamentTitle ? ' · ' + item.tournamentTitle : ''}
          </span>
        </span>
        {expandable ? (
          <button
            type='button'
            aria-label={expanded ? '경기 기록 접기' : '경기 기록 펼치기'}
            aria-expanded={expanded}
            onClick={onToggle}
            style={{
              border: 0,
              background: 'transparent',
              color: 'var(--text-caption)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
              cursor: 'pointer',
            }}
          >
            <ChevronDown
              size={18}
              aria-hidden
              style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 160ms ease',
              }}
            />
          </button>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <TeamAvatar seed={teamId} name={teamName} logoUrl={teamLogoUrl} size='sm' />
          <span
            className='tm-text-caption'
            style={{ fontWeight: 600, color: 'var(--text-strong)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {teamName}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <span className='tab-num' style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)' }}>
            {item.goalsFor} : {item.goalsAgainst}
          </span>
          {item.penalties ? (
            <span className='tm-text-caption tab-num' style={{ color: 'var(--text-caption)', fontWeight: 600 }}>
              승부차기 {item.penalties.for} : {item.penalties.against}
            </span>
          ) : null}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <TeamAvatar seed={item.opponentTeamId ?? item.gameId} name={item.opponentTeamName ?? '상대 미상'} logoUrl={item.opponentTeamLogoUrl} size='sm' />
          <span
            className='tm-text-caption'
            style={{ fontWeight: 600, color: 'var(--text-strong)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {item.opponentTeamName ?? '상대 미상'}
          </span>
        </div>
      </div>
      {expanded ? <RecordDetails item={item} /> : null}
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
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);

  return (
    <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <KPIStat label='경기' value={data.summary.played} unit='경기' />
          <KPIStat label='승·무·패' value={data.summary.won + '·' + data.summary.drawn + '·' + data.summary.lost} />
          <KPIStat label='득실차' value={data.summary.goalsFor - data.summary.goalsAgainst} />
        </div>
      </Card>

      <section>
        <h3 className='tm-hub-section-title' style={{ marginBottom: 10 }}>경기 기록</h3>
        {data.items.length === 0 ? (
          <EmptyState title='아직 공식 경기 기록이 없어요' sub='대회·팀 매치 결과가 확정되면 이곳에 표시돼요.' />
        ) : (
          <Card pad={0}>
            {data.items.map((item) => (
              <TeamRecordRow
                key={item.gameId}
                item={item}
                teamId={data.teamId}
                teamName={data.teamName}
                teamLogoUrl={data.teamLogoUrl}
                expanded={expandedGameId === item.gameId}
                onToggle={() => setExpandedGameId((current) => (current === item.gameId ? null : item.gameId))}
              />
            ))}
          </Card>
        )}
        {hasNextPage ? (
          <button
            type='button'
            className='tm-btn tm-btn-md tm-btn-neutral tm-btn-block'
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
