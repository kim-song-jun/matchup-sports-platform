'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { useV1Reviews, useV1Tournament, useV1TournamentReviews } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { hasStoredV1Session } from '@/lib/session-storage';
import { TournamentFixtureReviewEntrySection } from '@/components/tournaments/tournament-venue-retention-sections';
import { ReviewCard, ReviewFormModal, useTournamentReviewWriteGate } from '../awards/awards-page-client';
import type { V1TournamentDetail } from '@/types/api';

const PAGE_SIZE = 10;
const PAGER_WINDOW = 5;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function getPageWindow(current: number, total: number): number[] {
  if (total <= PAGER_WINDOW) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - Math.floor(PAGER_WINDOW / 2));
  const end = Math.min(total, start + PAGER_WINDOW - 1);
  start = Math.max(1, end - PAGER_WINDOW + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function ReviewsListSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tm-skeleton" style={{ height: 96, borderRadius: 'var(--radius-control)' }} />
      <div className="tm-skeleton" style={{ height: 96, borderRadius: 'var(--radius-control)' }} />
      <div className="tm-skeleton" style={{ height: 96, borderRadius: 'var(--radius-control)' }} />
    </div>
  );
}

function ReviewsPager({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = getPageWindow(page, totalPages);

  return (
    <nav className="tm-reviews-pager" aria-label="후기 페이지네이션">
      <button
        type="button"
        className="tm-reviews-pager-btn"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="이전 페이지"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      {pages[0] > 1 && <span className="tm-reviews-pager-ellipsis">…</span>}
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          className={`tm-reviews-pager-num${p === page ? ' is-active' : ''}`}
          onClick={() => onChange(p)}
          aria-current={p === page ? 'page' : undefined}
        >
          {p}
        </button>
      ))}
      {pages[pages.length - 1] < totalPages && <span className="tm-reviews-pager-ellipsis">…</span>}
      <button
        type="button"
        className="tm-reviews-pager-btn"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="다음 페이지"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}

/**
 * 이 대회의 **경기별** 후기 진입 — 대회 후기(대회 자체 별점·코멘트)와는 다른 것이라
 * 나란히 둔다. 예전엔 대회 상세에 있었다가 시상 화면(`/awards`)으로 옮겨졌는데,
 * 그러면 "리뷰할 수 있는 경기"를 보려고 **"최종 결과·시상"을 눌러야** 했다 — 후기를
 * 쓰러 온 사람이 시상 화면을 거쳐야 하는 건, 후기 링크가 시상 화면으로 가던 원래
 * 문제(오너 지적)를 방향만 바꿔 되풀이한 것이다. 후기는 후기 화면에 모은다.
 */
function FixtureReviewsSection({ tournament }: { tournament: V1TournamentDetail }) {
  const hasSession = hasStoredV1Session();
  const hasCompletedFixture = tournament.fixtures.some(
    (fixture) => fixture.status === 'completed' && fixture.result !== null,
  );
  const query = useV1Reviews(
    { tab: 'pending', tournamentId: tournament.id, limit: 50 },
    { enabled: hasSession && hasCompletedFixture },
  );
  if (!hasSession || !hasCompletedFixture) return null;

  const state = query.isError
    ? { status: 'error' as const, items: [], onRetry: () => void query.refetch() }
    : query.isPending || query.isFetching
      ? { status: 'loading' as const, items: [] }
      : { status: 'ready' as const, items: query.data?.items ?? [] };

  return <TournamentFixtureReviewEntrySection fixtures={tournament.fixtures} state={state} />;
}

export function TournamentReviewsPageClient({ tournamentId }: { tournamentId: string }) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [showForm, setShowForm] = useState(false);
  const search = useDebouncedValue(searchInput, 350);

  // search가 바뀐 렌더에서 즉시 1페이지로 취급 — useEffect로 되돌리면 이전 page로 한 번 더 낭비성 요청이 나감
  const prevSearchRef = useRef(search);
  let effectivePage = page;
  if (prevSearchRef.current !== search) {
    prevSearchRef.current = search;
    effectivePage = 1;
    if (page !== 1) setPage(1);
  }

  // 이 화면에 어느 대회의 후기인지 적으려면 대회 자체가 필요하다 — 예전에는 제목이
  // "참가팀 후기" 한 줄뿐이라, 링크를 타고 들어온 사람은 어느 대회 후기를 보고 있는지
  // 화면 어디에서도 알 수 없었다(오너 지적: "참가팀 후기도 명확하게 나왔으면 좋겠고").
  const { data: tournament } = useV1Tournament(tournamentId);
  const { canWrite, isCompleted, isParticipant, alreadyReviewed, hasSession } =
    useTournamentReviewWriteGate(tournamentId, tournament?.status ?? 'draft');

  const { data, isLoading, isFetching, isError, error, refetch } = useV1TournamentReviews(tournamentId, {
    page: effectivePage,
    pageSize: PAGE_SIZE,
    search,
  });

  const reviews = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      {showForm && <ReviewFormModal tournamentId={tournamentId} onClose={() => setShowForm(false)} />}
      <div className="tm-tourn-sub-page">
        <div className="tm-reviews-body" style={{ padding: '20px 20px 40px' }}>
          <header style={{ marginBottom: 16 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-strong)' }}>
              {tournament ? `${tournament.title} 참가팀 후기` : '참가팀 후기'}
            </h1>
            <p className="tm-text-caption" style={{ margin: '4px 0 0', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              이 대회에 참가한 팀의 팀장·운영진이 남긴 후기예요.
            </p>
          </header>

          {/* 후기를 "보러" 온 사람과 "쓰러" 온 사람이 같은 링크로 들어온다 — 쓸 수 있는
              사람에게는 여기서 바로 쓰게 하고(시상 화면까지 되돌아가지 않게), 못 쓰는
              사람에게는 왜 못 쓰는지를 상태별로 알린다. */}
          {canWrite ? (
            <button
              type="button"
              className="tm-btn tm-btn-md tm-btn-primary"
              style={{ display: 'inline-flex', minHeight: 44, margin: '12px 0 4px' }}
              onClick={() => setShowForm(true)}
            >
              + 후기 쓰기
            </button>
          ) : isCompleted && isParticipant && alreadyReviewed ? (
            <div
              className="tm-text-caption"
              style={{
                display: 'inline-block',
                color: 'var(--text-caption)',
                background: 'var(--grey100)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-chip)',
                margin: '12px 0 4px',
              }}
            >
              ✓ 이 대회 후기를 이미 남겼어요
            </div>
          ) : isCompleted && !hasSession ? (
            <div
              className="tm-text-caption"
              style={{ color: 'var(--text-caption)', lineHeight: 1.5, margin: '12px 0 4px' }}
            >
              로그인하면 참가팀의 팀장·운영진은 후기를 작성할 수 있어요.
            </div>
          ) : null}

          {tournament ? <FixtureReviewsSection tournament={tournament} /> : null}

          {/* 소제목은 위의 "리뷰할 수 있는 경기"와 이 목록을 가르는 역할이라 필요하다. 다만
              문구는 "참가팀 후기"가 아니어야 한다 — alpha 실측에서 같은 말이 한 화면에 세 번
              (상단 바 + h1 + 소제목) 나왔다. "전체 후기"는 검색·페이징 대상이 무엇인지도 함께 알린다. */}
          <h2 className="tm-hub-section-title" style={{ margin: '24px 0 12px' }}>
            전체 후기
          </h2>

          <label className="tm-reviews-searchbar">
            <Search size={16} aria-hidden="true" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="작성자, 팀명, 후기 내용으로 검색"
              aria-label="후기 검색"
            />
          </label>

          {isLoading ? (
            <ReviewsListSkeleton />
          ) : isError ? (
            <ErrorState
              message={extractErrorMessage(error, '후기를 불러오지 못했어요.')}
              onRetry={() => void refetch()}
            />
          ) : reviews.length === 0 ? (
            <Card pad={20} style={{ background: 'var(--grey50)', textAlign: 'center' }}>
              <EmptyState
                title={search ? '검색 결과가 없어요' : '아직 등록된 후기가 없어요'}
                sub={search ? '다른 검색어로 다시 시도해보세요.' : '대회 참가팀의 후기가 등록되면 여기에서 볼 수 있어요.'}
              />
            </Card>
          ) : (
            <>
              <div className="tm-reviews-count">총 {total}개의 후기</div>

              {/* 넓은 화면에서는 예전에 같은 데이터를 6열 표로 한 번 더 그렸다 — 별점이
                  칸에 갇히고 후기 본문은 한 줄로 잘려서, 정작 읽으러 온 내용이 가장 안
                  읽히는 형태였다(오너 지적: "이 테이블형식도 이상한것같아"). 이제 모든
                  폭에서 같은 후기 카드를 쓰고, 넓어지면 열 수만 늘린다. */}
              <div className="tm-reviews-cards" style={{ opacity: isFetching ? 0.6 : 1 }}>
                {reviews.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>

              <ReviewsPager page={page} totalPages={totalPages} onChange={setPage} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
