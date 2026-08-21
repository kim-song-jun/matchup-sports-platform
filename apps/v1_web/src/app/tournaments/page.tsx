'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ClipboardEdit, Wallet, ListChecks, Grid2x2, GitFork, Trophy, Sparkles } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { CompetitionTypeSegment } from '@/components/v1-ui/competition-type-segment';
import { EmptyState, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { TournamentPromoCarousel } from '@/components/tournaments/tournament-promo-carousel';
import { useV1AllTournaments, useV1Tournaments, useV1MasterSports } from '@/hooks/use-v1-api';
import { useMediaQuery, DESKTOP_LIST_MEDIA_QUERY } from '@/hooks/use-media-query';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { PaginationBar } from '@/components/v1-ui/pagination-bar';
import { extractErrorMessage } from '@/lib/error-message';
import { TournamentCard } from './tournament-card';
import type { V1TournamentListItem } from '@/types/api';

export default function TournamentsPage() {
  return (
    <AppChrome title="대회" activeTab="tournaments" showNotifications>
      <CompetitionTypeSegment active="tournament" />
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

const TOURNAMENT_PAGE_SIZE = 20;

/**
 * 대회 목록의 페이지 이동은 화면 폭에 따라 **다른 방식**을 쓴다.
 *
 * - 데스크톱: 페이지 번호. 예전에는 여기서도 "더 보기"만 눌러야 했는데, 20개씩 계속
 *   눌러 내려가는 것 말고는 목록 뒤쪽으로 갈 방법이 없었다(오너 지적: "더보기눌러서
 *   다음다음 넘어가는게 그게 좀 어려운것같고"). 마우스가 있고 하단 바가 항상 보이는
 *   화면에서는 번호가 위치 감각까지 준다("전체 N건 중 21–40").
 * - 모바일: 무한 스크롤. 좁은 화면에서 44px 버튼 열 개를 나열하면 카드보다 페이지 바가
 *   더 눈에 띄고, 엄지로 정확히 누르기도 어렵다. 대신 목록 끝이 보이면 알아서 다음
 *   페이지를 붙인다.
 *
 * 서버는 한 엔드포인트로 둘 다 받는다(`page` ↔ `cursor`, `paginationArgs`).
 */
export function TournamentsListContent() {
  const isDesktop = useMediaQuery(DESKTOP_LIST_MEDIA_QUERY);

  // 데스크톱 = 페이지 번호, 모바일 = 커서 누적. 두 상태를 함께 두고 화면 폭에 맞는
  // 쪽만 서버로 보낸다 — 폭이 바뀌어도(창 리사이즈·회전) 보던 목록이 사라지지 않는다.
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allItems, setAllItems] = useState<V1TournamentListItem[]>([]);
  // D3: 종목 필터 — null = '전체'
  const [activeSportId, setActiveSportId] = useState<string | null>(null);

  /* D3: 데이터드리븐 종목 필터 — DB seed 기준 유효한 종목만 노출 (하드코딩 제거) */
  const { data: sportsData } = useV1MasterSports();
  const filterSports: Array<{ id: string; label: string }> = (sportsData ?? [])
    .filter((s) => s.id)
    .map((s) => ({ id: s.id, label: s.name }));

  const { data, isLoading, isError, error, isFetching, refetch } = useV1Tournaments({
    ...(isDesktop ? { page } : { cursor }),
    limit: TOURNAMENT_PAGE_SIZE,
    sportId: activeSportId ?? undefined,
  });
  const promoTournaments = useV1AllTournaments({
    status: 'open',
    sportId: activeSportId ?? undefined,
  });

  const pageItems = data?.items ?? [];
  // 데스크톱은 페이지를 **교체**하고, 모바일은 **누적**한다.
  const displayItems: V1TournamentListItem[] =
    isDesktop || !cursor
      ? pageItems
      : [...allItems, ...pageItems.filter((item) => !allItems.some((prev) => prev.id === item.id))];

  const hasNext = data?.pageInfo?.hasNext ?? false;
  const totalPages = data?.pageInfo?.totalPages ?? 0;
  const total = data?.pageInfo?.total ?? 0;

  const handleLoadMore = () => {
    if (!data?.pageInfo?.nextCursor || isFetching) return;
    setAllItems(displayItems);
    setCursor(data.pageInfo.nextCursor);
  };

  // 목록 끝 감시자 — 화면에 들어오면 다음 페이지를 이어 붙인다(모바일 전용).
  const sentinelRef = useInfiniteScroll({
    enabled: !isDesktop && hasNext && !isFetching,
    onReachEnd: handleLoadMore,
  });

  const handlePageChange = (next: number) => {
    if (next < 1 || (totalPages > 0 && next > totalPages)) return;
    setPage(next);
    // 페이지를 갈아끼우면 목록 머리로 올려준다 — 안 그러면 새 페이지의 중간부터 보인다.
    // `window.scrollTo` 가 아니라 `scrollIntoView` 인 이유: 이 앱의 스크롤 컨테이너는
    // window 가 아니라 `.tm-scroll-area` 라 window 스크롤은 아무 일도 하지 않는다.
    // 함수 존재를 확인하는 건 구현이 없는 렌더러(jsdom 등)에서 예외로 터지지 않게 하려는
    // 것이다 — 스크롤 위치는 목록을 못 넘기게 만들 만큼 중요한 일이 아니다.
    const anchor = document.getElementById('tournament-list');
    if (anchor !== null && typeof anchor.scrollIntoView === 'function') {
      anchor.scrollIntoView({ block: 'start' });
    }
  };

  /** D3: 종목 칩 선택 — 페이지/누적 목록 리셋 후 필터 적용 */
  const handleSportFilter = (code: string | null) => {
    setActiveSportId(code);
    setPage(1);
    setCursor(undefined);
    setAllItems([]);
  };

  const activeSportLabel = activeSportId
    ? filterSports.find((sport) => sport.id === activeSportId)?.label
    : null;

  return (
    <div className="tm-tournament-list">
      <h1 className="sr-only">스포츠 대회</h1>

      {/* ── 홍보 카드뉴스 캐러셀 — 관리자가 리스트 홍보를 켠 open 대회를 우선순위 순으로 노출 ── */}
      <TournamentPromoCarousel
        items={promoTournaments.data ?? []}
        loading={promoTournaments.isLoading}
        error={promoTournaments.isError}
        onRetry={() => void promoTournaments.refetch()}
      />

      {/* ── 이벤트 허브 배너 — 캠페인 발견 진입점 ── */}
      <div className="tm-tournament-event-hub-entry">
        <Link
          href="/events"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--blue50)',
            border: '1px solid var(--blue100)',
            borderRadius: 14,
            padding: '12px 16px',
            textDecoration: 'none',
          }}
          aria-label="이벤트 허브 — 팀밋 주관 대회 캠페인 모아보기"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={18} style={{ color: 'var(--blue700)', flexShrink: 0 }} aria-hidden="true" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue700)' }}>이벤트 허브</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>팀밋 주관 대회 캠페인 모아보기</div>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue700)', whiteSpace: 'nowrap' }}>바로가기 →</span>
        </Link>
      </div>

      {/* ── Tournament list (리스트 우선 — 대회 탭의 핵심) ── */}
      <section id="tournament-list" aria-labelledby="tournament-list-heading" className="tm-tournament-list-section">
        <SectionTitle title="대회 목록" />
        <div id="tournament-list-heading" className="sr-only">진행 중인 대회 목록</div>

        <div role="group" aria-label="종목 필터" className="tm-sport-chip-row">
          {/* 전체 칩 */}
          <button
            type="button"
            onClick={() => handleSportFilter(null)}
            aria-pressed={activeSportId === null}
            aria-label="전체 종목"
            className={`tm-chip${activeSportId === null ? ' tm-chip-active' : ''}`}
          >
            전체
          </button>

          {filterSports.map(({ id, label }) => {
            const isActive = activeSportId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSportFilter(id)}
                aria-pressed={isActive}
                aria-label={`${label} 종목만 보기`}
                className={`tm-chip${isActive ? ' tm-chip-active' : ''}`}
              >
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
            >
              {displayItems.map((item) => (
                <TournamentCard key={item.id} item={item} />
              ))}
            </div>

            {isDesktop ? (
              totalPages > 1 ? (
                <div style={{ marginTop: 16 }}>
                  <PaginationBar
                    page={data?.pageInfo?.page ?? page}
                    totalPages={totalPages}
                    total={total}
                    limit={TOURNAMENT_PAGE_SIZE}
                    onPageChange={handlePageChange}
                    loading={isFetching}
                    label="대회 목록 페이지"
                  />
                </div>
              ) : null
            ) : (
              <>
                {/* 감시자는 목록 끝에 두고 높이를 주지 않는다 — 카드 사이 간격이 벌어지면
                    안 된다. rootMargin 이 화면 밖 400px 까지 앞당겨 잡는다. */}
                <div ref={sentinelRef} aria-hidden="true" />
                {hasNext ? (
                  // 자동 로딩이 기본이지만 버튼도 남긴다 — IntersectionObserver 가 없는
                  // 환경, 그리고 스크롤 대신 직접 누르고 싶은 사용자를 위한 길이다.
                  // 로딩 중에는 같은 자리에서 상태만 바꿔 목록이 밀리지 않게 한다.
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
                <p aria-live="polite" className="sr-only">
                  {isFetching
                    ? '대회를 더 불러오는 중이에요.'
                    : `대회 ${displayItems.length}개를 보고 있어요.${hasNext ? '' : ' 마지막 목록이에요.'}`}
                </p>
              </>
            )}
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
              <div className="tm-tournament-promo-step-icon" aria-hidden="true" style={{ color: 'var(--text-strong)' }}>
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
