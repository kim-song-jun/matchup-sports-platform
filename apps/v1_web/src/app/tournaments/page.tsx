'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { EmptyState, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { TrophyIcon } from '@/components/v1-ui/icons';
import { useV1Tournaments, useV1MasterSports } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { formatTournamentDateShort, formatEntryFee } from '@/lib/date-utils';
import type { V1TournamentListItem, V1TournamentStatus } from '@/types/api';

export default function TournamentsPage() {
  return (
    <AppChrome title="대회" activeTab="tournaments" showNotifications>
      <TournamentsListContent />
    </AppChrome>
  );
}

/* ── Prize formatter ── */
function formatPrize(amount: number): string {
  if (amount >= 10000) {
    const man = Math.floor(amount / 10000);
    const rem = amount % 10000;
    if (rem === 0) return `${man.toLocaleString('ko-KR')}만원`;
    return `${man.toLocaleString('ko-KR')}만 ${rem.toLocaleString('ko-KR')}원`;
  }
  return `${amount.toLocaleString('ko-KR')}원`;
}

/* ── Status helpers ── */

type StatusConfig = {
  badgeClass: string;
  label: string;
};

function getTournamentStatusConfig(status: V1TournamentStatus): StatusConfig {
  switch (status) {
    case 'open':
      return { badgeClass: 'tm-badge-blue', label: '모집 중' };
    case 'in_progress':
      return { badgeClass: 'tm-badge-green', label: '진행 중' };
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

/* ── Main content (client component for data fetching) ── */

function TournamentsListContent() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allItems, setAllItems] = useState<V1TournamentListItem[]>([]);
  // D3: 종목 필터 — null = '전체'
  const [activeSportCode, setActiveSportCode] = useState<string | null>(null);

  /* D3: 데이터드리븐 종목 필터 — DB seed 기준 유효한 종목만 노출 (하드코딩 제거) */
  const { data: sportsData } = useV1MasterSports();
  const filterSports: Array<{ code: string; label: string }> = (sportsData ?? [])
    .filter((s) => s.code)
    .map((s) => ({ code: s.code as string, label: s.name }));

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

  // Derive featured tournament: max prizePool among open items; tie-break by closest scheduledAt
  const openWithPrize = pageItems.filter(
    (item) => item.status === 'open' && item.prizePool != null && item.prizePool > 0,
  );
  const featured: V1TournamentListItem | null = openWithPrize.length > 0
    ? openWithPrize.reduce((best, cur) => {
        const bestPrize = best.prizePool ?? 0;
        const curPrize = cur.prizePool ?? 0;
        if (curPrize > bestPrize) return cur;
        if (curPrize === bestPrize) {
          // Tie-break: earlier scheduledAt wins (closer to now)
          const bestDate = best.scheduledAt ? new Date(best.scheduledAt).getTime() : Infinity;
          const curDate = cur.scheduledAt ? new Date(cur.scheduledAt).getTime() : Infinity;
          return curDate < bestDate ? cur : best;
        }
        return best;
      })
    : null;

  const maxPrize = featured?.prizePool ?? 0;

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
    <div className="tm-tournament-list" style={{ padding: '0 0 48px' }}>

      {/* ── Compact featured banner — 최고 상금 모집중 대회 1개, 탭하면 상세로 ── */}
      {featured ? (
        <Link
          href={`/tournaments/${featured.id}`}
          aria-label={`${featured.title} 자세히 보기`}
          style={{
            display: 'block',
            margin: '12px 20px 0',
            padding: '16px 18px',
            borderRadius: 16,
            background: 'linear-gradient(135deg, var(--blue500) 0%, var(--blue600) 100%)',
            color: 'var(--static-white)',
            textDecoration: 'none',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: 'var(--overlay-white-18)', fontSize: 'var(--font-size-caption)', fontWeight: 700 }}>
            <TrophyIcon size={12} strokeWidth={2} aria-hidden="true" />
            상금 걸린 대회
          </span>
          <div className="tm-text-body-lg" style={{ color: 'var(--static-white)', marginTop: 10 }}>{featured.title}</div>
          <div className="tm-text-caption" style={{ color: 'var(--overlay-white-85)', marginTop: 4 }}>
            {featured.scheduledAt ? (formatTournamentDateShort(featured.scheduledAt) ?? '날짜 미정') : '날짜 미정'}
            {' · '}
            {featured.confirmedCount}/{featured.teamCount}팀 확정
            {featured.venue ? ` · ${featured.venue}` : ''}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            {maxPrize > 0 ? (
              <span style={{ fontWeight: 800, fontSize: 'var(--font-size-subhead)', letterSpacing: '-0.5px' }}>최대 {formatPrize(maxPrize)}</span>
            ) : (
              <span />
            )}
            <span style={{ background: 'var(--static-white)', color: 'var(--blue600)', fontWeight: 700, fontSize: 'var(--font-size-label)', borderRadius: 999, padding: '6px 14px', lineHeight: 1, display: 'inline-block' }}>자세히 보기 →</span>
          </div>
        </Link>
      ) : null}

      {/* ── Tournament list (리스트 우선 — 대회 탭의 핵심) ── */}
      <section id="tournament-list" aria-labelledby="tournament-list-heading" style={{ marginTop: 28, padding: '0 20px' }}>
        <div style={{ marginLeft: -20, marginRight: -20 }}>
          <SectionTitle title="대회 목록" />
        </div>
        <div id="tournament-list-heading" className="sr-only">진행 중인 대회 목록</div>

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
              padding: '0 12px',
              borderRadius: 999,
              fontSize: 'var(--font-size-caption)',
              fontWeight: activeSportCode === null ? 700 : 500,
              background: activeSportCode === null ? 'var(--blue500)' : 'var(--grey100)',
              color: activeSportCode === null ? 'var(--static-white)' : 'var(--text-body)',
              border: 'none',
              cursor: 'pointer',
              /* a11y: 터치 타깃 최소 44px (WCAG 2.5.5) */
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              lineHeight: 1,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            전체
          </button>

          {filterSports.map(({ code, label }) => {
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
                  padding: '0 10px',
                  borderRadius: 999,
                  fontSize: 'var(--font-size-caption)',
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? accent.badgeBg : 'var(--grey100)',
                  color: isActive ? accent.badgeText : 'var(--text-body)',
                  border: isActive ? `1.5px solid ${accent.dot}` : '1.5px solid transparent',
                  cursor: 'pointer',
                  /* a11y: 터치 타깃 최소 44px (WCAG 2.5.5) */
                  minHeight: 44,
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
            title="현재 모집 중인 대회가 없어요"
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

      {/* ── 진행 방식 (슬림 안내 — 리스트 아래) ── */}
      <section
        aria-labelledby="process-flow-heading"
        className="tm-tournament-promo-section"
        style={{ paddingTop: 28, paddingBottom: 4 }}
      >
        <h2 id="process-flow-heading" className="tm-tournament-promo-section-title">대회는 이렇게 진행돼요</h2>
        <div className="tm-tournament-promo-steps">
          {PROCESS_STEPS.map((step, i) => (
            <div key={step.label} className="tm-tournament-promo-step">
              <div className="tm-tournament-promo-step-icon" aria-hidden="true" style={{ color: 'var(--blue500)' }}>
                {step.icon}
              </div>
              <span className="tm-tournament-promo-step-num" aria-hidden="true">{i + 1}</span>
              <span className="tm-tournament-promo-step-label">{step.label}</span>
              <span className="tm-tournament-promo-step-sub" aria-hidden="true">{step.sub}</span>
              {i < PROCESS_STEPS.length - 1 ? (
                <span className="tm-tournament-promo-step-connector" aria-hidden="true" />
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── Inline icon components (stroke=currentColor, 24 viewBox, 1.8 strokeWidth) ── */

/** 신청: 연필로 양식 작성 — 팀 정보 입력 단계 */
function IconPencilForm({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

/** 결제: 체크 표시가 있는 지갑 — 참가비 결제 완료 */
function IconWalletCheck({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
      <path d="M16 2H8L4 7h16l-4-5z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

/** 선수 명단: 체크리스트 — 선수 등록 확인 */
function IconCheckList({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

/** 조별 리그: 격자 표 — 조 편성·리그 경기 */
function IconGrid({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

/** 결선 토너먼트: 토너먼트 브라켓 — 단판 승부 */
function IconTournamentBracket({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* 왼쪽 두 씨드 */}
      <rect x="2" y="4" width="5" height="3" rx="1" />
      <rect x="2" y="10" width="5" height="3" rx="1" />
      {/* 왼쪽 브라켓 connector */}
      <path d="M7 5.5h3v6H7" />
      {/* 가운데 */}
      <rect x="10" y="7" width="5" height="3" rx="1" />
      {/* 오른쪽 connector */}
      <path d="M15 8.5h3" />
      {/* 결승 */}
      <rect x="18" y="7" width="4" height="3" rx="1" />
    </svg>
  );
}

/* ── Static data ── */

const PROCESS_STEPS: Array<{ icon: React.ReactNode; label: string; sub: string }> = [
  { icon: <IconPencilForm size={20} />,        label: '신청',      sub: '팀 정보 입력' },
  { icon: <IconWalletCheck size={20} />,       label: '결제',      sub: '참가비 납부' },
  { icon: <IconCheckList size={20} />,         label: '선수 명단', sub: '로스터 확정' },
  { icon: <IconGrid size={20} />,              label: '조별 리그', sub: '라운드 로빈' },
  { icon: <IconTournamentBracket size={20} />, label: '결선',      sub: '단판 토너먼트' },
  { icon: <TrophyIcon size={20} strokeWidth={1.8} />, label: '우승', sub: '시상 및 정산' },
];

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
              {formatTournamentDateShort(item.scheduledAt) ?? '날짜 미정'}
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
            aria-label={`총 상금 ${formatPrize(item.prizePool)}`}
          >
            <TrophyIcon size={12} color="var(--orange500)" aria-hidden="true" />
            <span
              className="tm-text-caption"
              style={{ color: 'var(--text-strong)', fontWeight: 600 }}
            >
              총 상금 {formatPrize(item.prizePool)}
            </span>
          </div>
        ) : null}

        {/* #7: Bottom row: entry fee(강조) + team fill rate(마감 임박 배지) */}
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
          {/* #7: 참가비 — text-strong + weight700로 시각 강도 격상 */}
          <span className="tm-text-label" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>
            참가비 {formatEntryFee(item.entryFee)}
          </span>
          <span className="tm-text-caption" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* #7: 확정 팀 ≥80% 이상이면 '거의 마감' orange 배지 */}
            {item.teamCount > 0 && item.confirmedCount / item.teamCount >= 0.8
              ? <span className="tm-badge tm-badge-orange">거의 마감</span>
              : null}
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
