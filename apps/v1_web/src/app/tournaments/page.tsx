'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, SectionTitle } from '@/components/v1-ui/primitives';
import { TrophyIcon } from '@/components/v1-ui/icons';
import { useV1Tournaments } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1TournamentListItem, V1TournamentStatus } from '@/types/api';

export default function TournamentsPage() {
  return (
    <AppChrome title="대회" activeTab="tournaments" showNotifications>
      <TournamentsListContent />
    </AppChrome>
  );
}

/* ── Status helpers ── */

type StatusConfig = {
  badgeClass: string;
  label: string;
};

function getTournamentStatusConfig(status: V1TournamentStatus): StatusConfig {
  switch (status) {
    case 'open':
      return { badgeClass: 'tm-badge-blue', label: '모집중' };
    case 'in_progress':
      return { badgeClass: 'tm-badge-green', label: '진행중' };
    case 'completed':
      return { badgeClass: 'tm-badge-grey', label: '종료' };
    case 'closed':
      return { badgeClass: 'tm-badge-grey', label: '마감' };
    case 'cancelled':
      return { badgeClass: 'tm-badge-red', label: '취소' };
    default:
      return { badgeClass: 'tm-badge-grey', label: status };
  }
}

function formatTournamentDate(dateStr: string | null): string {
  if (!dateStr) return '날짜 미정';
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[d.getDay()];
  return `${month}/${day} (${weekday})`;
}

function formatEntryFee(fee: number): string {
  if (fee === 0) return '무료';
  return `${fee.toLocaleString('ko-KR')}원`;
}

/* ── Main content (client component for data fetching) ── */

function TournamentsListContent() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allItems, setAllItems] = useState<V1TournamentListItem[]>([]);

  const { data, isLoading, isError, error, isFetching } = useV1Tournaments({ cursor, limit: 20 });

  // Accumulate pages when cursor is set
  const pageItems = data?.items ?? [];
  const displayItems: V1TournamentListItem[] = cursor
    ? [...allItems, ...pageItems.filter((item) => !allItems.some((prev) => prev.id === item.id))]
    : pageItems;

  const hasNext = data?.pageInfo?.hasNext ?? false;

  const handleLoadMore = () => {
    if (!data?.pageInfo?.nextCursor) return;
    setAllItems(displayItems);
    setCursor(data.pageInfo.nextCursor);
  };

  return (
    <div style={{ padding: '0 20px 48px' }}>
      {/* ── Hero banner ── */}
      <section aria-labelledby="tournament-hero-heading" style={{ marginTop: 24 }}>
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div
            style={{
              background: 'linear-gradient(135deg, var(--blue500) 0%, var(--blue600) 100%)',
              height: 130,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 8,
            }}
            aria-hidden="true"
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: 'rgba(255,255,255,0.18)',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
              }}
            >
              <TrophyIcon size={32} strokeWidth={1.6} />
            </div>
            <span
              className="tm-text-micro"
              style={{
                color: 'rgba(255,255,255,0.75)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              상금 대회
            </span>
          </div>
          <div style={{ padding: '16px 18px 18px' }}>
            <h1
              id="tournament-hero-heading"
              className="tm-text-heading"
              style={{ color: 'var(--text-strong)', marginBottom: 4 }}
            >
              팀과 함께 대회에서 겨뤄보세요
            </h1>
            <p className="tm-text-label" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
              조별 리그부터 결승 토너먼트까지, 상위 팀에게 실제 상금이 지급돼요.
            </p>
          </div>
        </Card>
      </section>

      {/* ── Tournament list ── */}
      <section aria-labelledby="tournament-list-heading" style={{ marginTop: 28 }}>
        <SectionTitle title="대회 목록" />
        <div id="tournament-list-heading" className="sr-only">대회 목록</div>

        {isLoading ? (
          <TournamentSkeletonList />
        ) : isError ? (
          <TournamentErrorState message={extractErrorMessage(error, '대회 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')} />
        ) : displayItems.length === 0 ? (
          <EmptyState
            title="아직 열린 대회가 없어요"
            sub="새로운 대회가 열리면 앱 알림으로 안내드릴게요."
          />
        ) : (
          <>
            <div
              role="list"
              aria-label="대회 목록"
              style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}
            >
              {displayItems.map((item) => (
                <TournamentCard key={item.id} item={item} />
              ))}
            </div>

            {hasNext ? (
              <button
                className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
                type="button"
                disabled={isFetching}
                onClick={handleLoadMore}
                style={{ marginTop: 16 }}
              >
                {isFetching ? '불러오는 중…' : '더 보기'}
              </button>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

/* ── Tournament card ── */

function TournamentCard({ item }: { item: V1TournamentListItem }) {
  const status = getTournamentStatusConfig(item.status);

  return (
    <div role="listitem">
      <Link
        className="tm-card tm-pressable"
        href={`/tournaments/${item.id}`}
        style={{ display: 'block', padding: '16px 16px 14px', textDecoration: 'none' }}
        aria-label={`${item.title} — ${status.label}`}
      >
        {/* Top row: title + status badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, justifyContent: 'space-between' }}>
          <div
            className="tm-text-body-lg"
            style={{ color: 'var(--text-strong)', flex: 1, minWidth: 0, lineHeight: 1.35 }}
          >
            {item.title}
          </div>
          <span className={`tm-badge ${status.badgeClass}`} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            {status.label}
          </span>
        </div>

        {/* Meta row */}
        <div
          className="tm-text-caption"
          style={{ marginTop: 6, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}
        >
          {item.scheduledAt ? (
            <span>{formatTournamentDate(item.scheduledAt)}</span>
          ) : null}
          {item.venue ? (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
              {item.venue}
            </span>
          ) : null}
        </div>

        {/* Bottom row: entry fee + team count */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid var(--grey100)',
          }}
        >
          <span className="tm-text-body-lg" style={{ color: 'var(--blue500)' }}>
            {formatEntryFee(item.entryFee)}
          </span>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            <span className="tab-num">{item.confirmedCount}</span>
            <span>/</span>
            <span className="tab-num">{item.teamCount}</span>
            <span>팀 확정</span>
          </span>
        </div>
      </Link>
    </div>
  );
}

/* ── Skeleton list ── */

function TournamentSkeletonList() {
  return (
    <div
      aria-busy="true"
      aria-label="대회 목록 불러오는 중"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}
    >
      <TournamentSkeletonCard opacity={1} />
      <TournamentSkeletonCard opacity={0.65} />
      <TournamentSkeletonCard opacity={0.35} />
    </div>
  );
}

function TournamentSkeletonCard({ opacity }: { opacity: number }) {
  return (
    <div
      className="tm-card"
      aria-hidden="true"
      style={{ opacity, padding: '16px 16px 14px', pointerEvents: 'none' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ height: 14, borderRadius: 6, background: 'var(--grey100)', width: '60%' }} />
        <div className="tm-badge tm-badge-grey" style={{ opacity: 0.5, width: 48 }}>&nbsp;</div>
      </div>
      <div style={{ height: 11, borderRadius: 6, background: 'var(--grey100)', width: '44%', marginTop: 8 }} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid var(--grey100)',
        }}
      >
        <div style={{ height: 11, borderRadius: 6, background: 'var(--grey100)', width: '22%' }} />
        <div style={{ height: 11, borderRadius: 6, background: 'var(--grey100)', width: '28%' }} />
      </div>
    </div>
  );
}

/* ── Error state ── */

function TournamentErrorState({ message }: { message: string }) {
  return (
    <Card pad={16} style={{ marginTop: 8, background: 'var(--grey50)' }}>
      <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>대회 목록을 불러오지 못했어요</div>
      <div className="tm-text-caption" style={{ marginTop: 5, lineHeight: 1.55, color: 'var(--text-muted)' }}>
        {message}
      </div>
    </Card>
  );
}
