'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { TrophyIcon } from '@/components/v1-ui/icons';
import { useV1Tournaments } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { getSportAccent } from '@/lib/v1-sport-accent';

/* ── Sport filter chip data ── (codes must match v1Sport.code in DB) */
const FILTER_SPORTS: Array<{ code: string; label: string }> = [
  { code: 'soccer',     label: '축구' },
  { code: 'futsal',     label: '풋살' },
  { code: 'basketball', label: '농구' },
  { code: 'baseball',   label: '야구' },
  { code: 'volleyball', label: '배구' },
  { code: 'badminton',  label: '배드민턴' },
  { code: 'tennis',     label: '테니스' },
  { code: 'running',    label: '러닝' },
  { code: 'swimming',   label: '수영' },
  { code: 'cycling',    label: '사이클' },
  { code: 'golf',       label: '골프' },
];
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
  // D3: 종목 필터 — null = '전체'
  const [activeSportCode, setActiveSportCode] = useState<string | null>(null);

  const { data, isLoading, isError, error, isFetching, refetch } = useV1Tournaments({
    cursor,
    limit: 20,
    sportId: activeSportCode ?? undefined,
  });

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

  /** D3: 종목 칩 선택 — 페이지/누적 목록 리셋 후 필터 적용 */
  const handleSportFilter = (code: string | null) => {
    setActiveSportCode(code);
    setCursor(undefined);
    setAllItems([]);
  };

  return (
    <div className="tm-tournament-list" style={{ padding: '0 20px 48px' }}>
      {/* ── Hero banner ── */}
      <section aria-labelledby="tournament-hero-heading" style={{ marginTop: 24 }}>
        <Card pad={0} className="tm-tournament-hero-card" style={{ overflow: 'hidden' }}>
          {/* Gradient visual strip */}
          <div className="tm-tournament-hero-visual" aria-hidden="true">
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: 'rgba(255,255,255,0.18)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--static-white)',
              }}
            >
              <TrophyIcon size={32} strokeWidth={1.6} />
            </div>
            <span
              className="tm-text-micro"
              style={{ color: 'rgba(255,255,255,0.92)' }}
            >
              상금 대회
            </span>
          </div>

          {/* Body: copy (left) + stats (right on desktop) */}
          <div className="tm-tournament-hero-body">
            <div className="tm-tournament-hero-copy">
              <h1
                id="tournament-hero-heading"
                className="tm-text-heading"
                style={{ color: 'var(--text-strong)', marginBottom: 4 }}
              >
                팀과 함께 대회에서 겨뤄보세요
              </h1>
              <p className="tm-text-label" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                조별 리그부터 결승 토너먼트까지, 상위 팀에게 상금을 드려요.
              </p>
            </div>

            {/* Desktop-only right stats/CTA column */}
            <div className="tm-tournament-hero-stats tm-show-desktop" aria-label="대회 안내">
              <div className="tm-tournament-hero-stat-item">
                <span className="tm-text-label" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>진행 방식</span>
                <span className="tm-text-body" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>조별 리그 → 토너먼트</span>
              </div>
              <div className="tm-tournament-hero-stat-item">
                <span className="tm-text-label" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>참가 대상</span>
                <span className="tm-text-body" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>모든 종목 팀</span>
              </div>
              <Link
                href="#tournament-list"
                className="tm-btn tm-btn-md tm-btn-primary"
                style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                aria-label="대회 목록으로 이동"
              >
                <TrophyIcon size={15} strokeWidth={1.8} aria-hidden="true" />
                대회 둘러보기
              </Link>
            </div>
          </div>
        </Card>
      </section>

      {/* ── Tournament list ── */}
      <section id="tournament-list" aria-labelledby="tournament-list-heading" style={{ marginTop: 28 }}>
        <div style={{ marginLeft: -20, marginRight: -20 }}>
          <SectionTitle title="대회 목록" />
        </div>
        <div id="tournament-list-heading" className="sr-only">대회 목록</div>

        {/* D3: 종목 필터 칩 — 컬러+텍스트 병행으로 a11y 준수 */}
        <div
          role="group"
          aria-label="종목 필터"
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            marginTop: 10,
            marginBottom: 12,
          }}
        >
          {/* 전체 칩 */}
          <button
            type="button"
            onClick={() => handleSportFilter(null)}
            aria-pressed={activeSportCode === null}
            aria-label="전체 종목"
            className="tm-btn"
            style={{
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: 'var(--font-size-caption)',
              fontWeight: activeSportCode === null ? 700 : 500,
              background: activeSportCode === null ? 'var(--blue500)' : 'var(--grey100)',
              color: activeSportCode === null ? 'var(--static-white)' : 'var(--text-body)',
              border: 'none',
              cursor: 'pointer',
              minHeight: 32,
              lineHeight: 1,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            전체
          </button>

          {FILTER_SPORTS.map(({ code, label }) => {
            const accent = getSportAccent(code);
            const isActive = activeSportCode === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => handleSportFilter(code)}
                aria-pressed={isActive}
                aria-label={`${label} 종목만 보기`}
                className="tm-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 'var(--font-size-caption)',
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? accent.badgeBg : 'var(--grey100)',
                  color: isActive ? accent.badgeText : 'var(--text-body)',
                  border: isActive ? `1.5px solid ${accent.dot}` : '1.5px solid transparent',
                  cursor: 'pointer',
                  minHeight: 32,
                  lineHeight: 1,
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                }}
              >
                {/* 종목 색깔 점 — 컬러 단독이 아닌 텍스트와 병행 */}
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: isActive ? accent.dot : 'var(--grey400)',
                    flexShrink: 0,
                  }}
                />
                {label}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <TournamentSkeletonList />
        ) : isError ? (
          <ErrorState
            message={extractErrorMessage(error, '대회 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')}
            onRetry={() => void refetch()}
          />
        ) : displayItems.length === 0 ? (
          <EmptyState
            title="아직 열린 대회가 없어요"
            sub="새로운 대회가 열리면 앱 알림으로 안내드릴게요."
            icon={<TrophyIcon size={36} strokeWidth={1.5} />}
          />
        ) : (
          <>
            <div
              role="list"
              aria-label="대회 목록"
              className="tm-tournament-list-grid"
              style={{ marginTop: 4 }}
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
  const sportAccent = getSportAccent(item.sport.code);

  return (
    <div role="listitem">
      <Link
        className="tm-card tm-pressable"
        href={`/tournaments/${item.id}`}
        style={{ display: 'block', padding: '16px 16px 14px', textDecoration: 'none' }}
        aria-label={`${item.title} — ${sportAccent.label} — ${status.label}`}
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

        {/* Sport identity chip + meta row */}
        <div
          style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px' }}
        >
          {/* Sport chip: colored dot + Korean label */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '2px 8px',
              borderRadius: 999,
              background: sportAccent.badgeBg,
              flexShrink: 0,
            }}
            aria-label={`종목: ${sportAccent.label}`}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: sportAccent.dot,
                flexShrink: 0,
              }}
            />
            <span
              className="tm-text-caption"
              style={{ color: sportAccent.badgeText, fontWeight: 600, lineHeight: 1 }}
            >
              {sportAccent.label}
            </span>
          </span>

          {/* Date + venue */}
          {item.scheduledAt ? (
            <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
              {formatTournamentDate(item.scheduledAt)}
            </span>
          ) : null}
          {item.venue ? (
            <span
              className="tm-text-caption"
              style={{
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 160,
              }}
            >
              {item.venue}
            </span>
          ) : null}
        </div>

        {/* Prize pool line — shown only when present */}
        {item.prizePool != null ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 8,
              padding: '3px 8px',
              borderRadius: 999,
              background: 'var(--orange50)',
            }}
            aria-label={`총 상금 ${item.prizePool.toLocaleString('ko-KR')}원`}
          >
            <TrophyIcon size={12} color="var(--orange500)" aria-hidden="true" />
            <span
              className="tm-text-caption"
              style={{ color: 'var(--text-strong)', fontWeight: 600 }}
            >
              총 상금 {item.prizePool.toLocaleString('ko-KR')}원
            </span>
          </div>
        ) : null}

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
          <span className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
            참가비 {formatEntryFee(item.entryFee)}
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

