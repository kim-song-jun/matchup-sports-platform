'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ClipboardEdit, Wallet, ListChecks, Grid2x2, GitFork, Trophy } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { EmptyState, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { useV1Tournaments, useV1MasterSports } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { cssUrl } from '@/lib/assets';
import { TournamentCard } from './tournament-card';
import type { V1TournamentListItem } from '@/types/api';

export default function TournamentsPage() {
  return (
    <AppChrome title="대회" activeTab="tournaments" showNotifications>
      <TournamentsListContent />
    </AppChrome>
  );
}

const TOURNAMENT_LIST_ERROR_FALLBACK = '대회 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';

function getTournamentListErrorMessage(err: unknown): string {
  const message = extractErrorMessage(err, TOURNAMENT_LIST_ERROR_FALLBACK);
  const maybeApiError = err as { code?: unknown; statusCode?: unknown } | null;

  if (
    maybeApiError?.code === 'UNAUTHENTICATED' ||
    maybeApiError?.statusCode === 401 ||
    /authentication is required/i.test(message)
  ) {
    return '세션 정보를 확인하는 중 문제가 생겼어요. 로그인 상태를 새로고침한 뒤 목록을 다시 불러와 주세요.';
  }

  return message;
}

/* ── Main content (client component for data fetching) ── */

function TournamentsListContent() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allItems, setAllItems] = useState<V1TournamentListItem[]>([]);
  // D3: 종목 필터 — null = '전체'
  const [activeSportId, setActiveSportId] = useState<string | null>(null);

  /* D3: 데이터드리븐 종목 필터 — DB seed 기준 유효한 종목만 노출 (하드코딩 제거) */
  const { data: sportsData } = useV1MasterSports();
  const filterSports: Array<{ id: string; code: string; label: string }> = (sportsData ?? [])
    .filter((s) => s.id)
    .map((s) => ({ id: s.id, code: s.code ?? s.id, label: s.name }));

  const { data, isLoading, isError, error, isFetching, refetch } = useV1Tournaments({
    cursor,
    limit: 20,
    sportId: activeSportId ?? undefined,
  });

  // Accumulate pages when cursor is set
  const pageItems = data?.items ?? [];
  const displayItems: V1TournamentListItem[] = cursor
    ? [...allItems, ...pageItems.filter((item) => !allItems.some((prev) => prev.id === item.id))]
    : pageItems;

  const hasNext = data?.pageInfo?.hasNext ?? false;

  // Derive featured tournament: admin-enabled promo; priority first, then closest scheduledAt.
  const promoItems = pageItems.filter(
    (item) => item.status === 'open' && item.promoListEnabled,
  );
  const featured: V1TournamentListItem | null = promoItems.length > 0
    ? promoItems.reduce((best, cur) => {
        if (cur.promoListPriority > best.promoListPriority) return cur;
        if (cur.promoListPriority < best.promoListPriority) return best;
        const bestDate = best.scheduledAt ? new Date(best.scheduledAt).getTime() : Infinity;
        const curDate = cur.scheduledAt ? new Date(cur.scheduledAt).getTime() : Infinity;
        return curDate < bestDate ? cur : best;
      })
    : null;
  const featuredTitle = featured?.promoListTitle?.trim() || featured?.title || '';
  const featuredSubtitle = featured?.promoListSubtitle?.trim() || '';
  const featuredBadge = featured?.promoListBadgeText?.trim() || '추천 대회';
  const featuredImageUrl = featured?.promoListImageUrl?.trim();
  const featuredFacts = featured
    ? [
        featured.promoListDateText?.trim(),
        featured.promoListTeamsText?.trim(),
        featured.promoListLocationText?.trim(),
      ].filter(Boolean).join(' · ')
    : '';
  const featuredPrizeText = featured?.promoListPrizeText?.trim() || '';

  const handleLoadMore = () => {
    if (!data?.pageInfo?.nextCursor) return;
    setAllItems(displayItems);
    setCursor(data.pageInfo.nextCursor);
  };

  /** D3: 종목 칩 선택 — 페이지/누적 목록 리셋 후 필터 적용 */
  const handleSportFilter = (code: string | null) => {
    setActiveSportId(code);
    setCursor(undefined);
    setAllItems([]);
  };

  const activeSportLabel = activeSportId
    ? filterSports.find((sport) => sport.id === activeSportId)?.label
    : null;

  return (
    <div className="tm-tournament-list" style={{ padding: '0 0 48px' }}>

      {/* ── Compact featured banner — admin-enabled promo tournament ── */}
      {featured ? (
        <Link
          href={`/tournaments/${featured.id}`}
          aria-label={`${featuredTitle} 자세히 보기`}
          className="tm-tournament-featured-banner"
          style={{
            display: 'block',
            marginTop: 12,
            padding: '16px 18px',
            borderRadius: 16,
            background: featuredImageUrl ? `${cssUrl(featuredImageUrl)} center/cover` : 'linear-gradient(135deg, var(--blue500) 0%, var(--blue600) 100%)',
            color: 'var(--static-white)',
            textDecoration: 'none',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {featuredImageUrl ? <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'var(--scrim-dark-32)' }} /> : null}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: 'var(--overlay-white-18)', fontSize: 'var(--font-size-caption)', fontWeight: 700 }}>
              <Trophy size={12} strokeWidth={2} aria-hidden="true" />
              {featuredBadge}
            </span>
            <div className="tm-text-body-lg" style={{ color: 'var(--static-white)', marginTop: 10 }}>{featuredTitle}</div>
            {featuredSubtitle ? (
              <div className="tm-text-caption" style={{ color: 'var(--overlay-white-85)', marginTop: 4 }}>
                {featuredSubtitle}
              </div>
            ) : null}
            {featuredFacts ? (
              <div className="tm-text-caption" style={{ color: 'var(--overlay-white-85)', marginTop: 4 }}>
                {featuredFacts}
              </div>
            ) : null}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
              <span className="tm-text-caption" style={{ color: 'var(--overlay-white-85)', fontWeight: 700, minWidth: 0, whiteSpace: 'pre-wrap' }}>{featuredPrizeText}</span>
              <span style={{ background: 'var(--static-white)', color: 'var(--blue700)', fontWeight: 700, fontSize: 'var(--font-size-label)', borderRadius: 999, padding: '6px 14px', lineHeight: 1, display: 'inline-block', flexShrink: 0 }}>자세히 보기 →</span>
            </div>
          </div>
        </Link>
      ) : null}

      {/* ── Tournament list (리스트 우선 — 대회 탭의 핵심) ── */}
      <section id="tournament-list" aria-labelledby="tournament-list-heading" className="tm-tournament-list-section" style={{ marginTop: 28 }}>
        <div style={{ marginLeft: -20, marginRight: -20 }}>
          <SectionTitle title="대회 목록" />
        </div>
        <div id="tournament-list-heading" className="sr-only">진행 중인 대회 목록</div>

        {/* D3: 종목 필터 칩 — 컬러+텍스트 병행으로 a11y 준수. 스타일은 .tm-sport-chip (globals.css) */}
        <div role="group" aria-label="종목 필터" className="tm-sport-chip-row">
          {/* 전체 칩 */}
          <button
            type="button"
            onClick={() => handleSportFilter(null)}
            aria-pressed={activeSportId === null}
            aria-label="전체 종목"
            className={`tm-sport-chip${activeSportId === null ? ' is-active' : ''}`}
          >
            전체
          </button>

          {filterSports.map(({ id, code, label }) => {
            const accent = getSportAccent(code);
            const isActive = activeSportId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSportFilter(id)}
                aria-pressed={isActive}
                aria-label={`${label} 종목만 보기`}
                className={`tm-sport-chip${isActive ? ' is-active' : ''}`}
              >
                {/* 종목 색깔 점 — 종목별 실제 액센트 컬러로 컬러+텍스트 병행 */}
                <span
                  aria-hidden="true"
                  className="tm-sport-chip-dot"
                  style={{ background: isActive ? 'var(--static-white)' : accent.dot }}
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
            title="대회 목록을 불러오지 못했어요"
            message={getTournamentListErrorMessage(error)}
            onRetry={() => void refetch()}
            retryLabel="목록 다시 불러오기"
          />
        ) : displayItems.length === 0 ? (
          <EmptyState
            title={activeSportLabel ? `${activeSportLabel} 모집 중인 대회가 없어요` : '현재 모집 중인 대회가 없어요'}
            sub={activeSportLabel ? '다른 종목을 선택하거나 새로운 대회 알림을 기다려 주세요.' : '새로운 대회가 열리면 앱 알림으로 안내드릴게요.'}
            icon={<Trophy size={36} strokeWidth={1.5} />}
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

      <section
        aria-labelledby="process-flow-heading"
        className="tm-tournament-promo-section"
        style={{ paddingTop: 28, paddingBottom: 4 }}
      >
        <h2 id="process-flow-heading" className="tm-tournament-promo-section-title">대회는 이렇게 진행돼요</h2>
        <div className="tm-tournament-promo-steps">
          {PROCESS_STEPS.map((step) => (
            <div key={step.label} className="tm-tournament-promo-step">
              <div className="tm-tournament-promo-step-icon" aria-hidden="true" style={{ color: 'var(--blue500)' }}>
                {step.icon}
              </div>
              <div className="tm-tournament-promo-step-text">
                <span className="tm-tournament-promo-step-label">{step.label}</span>
                <span className="tm-tournament-promo-step-sub" aria-hidden="true">{step.sub}</span>
                <span className="tm-tournament-promo-step-desc" aria-hidden="true">{step.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── Static data ── */

const PROCESS_STEPS: Array<{ icon: React.ReactNode; label: string; sub: string; desc: string }> = [
  { icon: <ClipboardEdit size={22} strokeWidth={1.8} />, label: '신청',      sub: '팀 정보 입력', desc: '원하는 대회를 찾아 팀 정보와 참가 인원을 입력해요.' },
  { icon: <Wallet size={22} strokeWidth={1.8} />,        label: '결제',      sub: '참가비 납부', desc: '참가비를 결제하면 신청이 접수돼요.' },
  { icon: <ListChecks size={22} strokeWidth={1.8} />,    label: '선수 명단', sub: '로스터 확정', desc: '함께 뛸 선수 명단을 등록하고 로스터를 확정해요.' },
  { icon: <Grid2x2 size={22} strokeWidth={1.8} />,       label: '조별 리그', sub: '라운드 로빈', desc: '같은 조 팀들과 라운드 로빈으로 순위를 가려요.' },
  { icon: <GitFork size={22} strokeWidth={1.8} />,       label: '결선',      sub: '단판 토너먼트', desc: '조별 순위에 따라 단판 토너먼트로 우승팀을 가려요.' },
  { icon: <Trophy size={22} strokeWidth={1.8} />, label: '우승', sub: '시상 및 정산', desc: '최종 순위에 따라 시상과 상금 정산이 진행돼요.' },
];

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
