'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { useV1TournamentReviews } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { publicAssetPath } from '@/lib/assets';
import { ReviewCard, RatingStar } from '../awards/awards-page-client';
import type { V1TournamentReview } from '@/types/api';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="tm-skeleton" style={{ height: 96, borderRadius: 12 }} />
      <div className="tm-skeleton" style={{ height: 96, borderRadius: 12 }} />
      <div className="tm-skeleton" style={{ height: 96, borderRadius: 12 }} />
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

function ReviewsTable({ reviews }: { reviews: V1TournamentReview[] }) {
  return (
    <div className="tm-reviews-table-wrap">
      <table className="tm-reviews-table">
        <thead>
          <tr>
            <th>작성자</th>
            <th>팀</th>
            <th>평점</th>
            <th>후기</th>
            <th>사진</th>
            <th>작성일</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((review) => {
            const date = new Date(review.createdAt).toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
            const photoUrls = review.photoUrls ?? [];
            return (
              <tr key={review.id}>
                <td>{review.authorNickname}</td>
                <td className="tm-reviews-table-team">{review.teamName ?? '—'}</td>
                <td>
                  <span className="tm-reviews-table-stars" aria-label={`별점 ${review.rating}점`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <RatingStar key={i} filled={i < review.rating} size={13} />
                    ))}
                  </span>
                </td>
                <td className="tm-reviews-table-comment" title={review.comment ?? undefined}>
                  {review.comment || <span className="tm-reviews-table-empty">—</span>}
                </td>
                <td>
                  {photoUrls.length > 0 ? (
                    <div className="tm-reviews-table-photos">
                      {photoUrls.slice(0, 3).map((url) => (
                        <a key={url} href={publicAssetPath(url)} target="_blank" rel="noreferrer">
                          <img src={publicAssetPath(url)} alt="" loading="lazy" />
                        </a>
                      ))}
                      {photoUrls.length > 3 && (
                        <span className="tm-reviews-table-photo-more">+{photoUrls.length - 3}</span>
                      )}
                    </div>
                  ) : (
                    <span className="tm-reviews-table-empty">—</span>
                  )}
                </td>
                <td className="tm-reviews-table-date">{date}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TournamentReviewsPageClient({ tournamentId }: { tournamentId: string }) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 350);

  // search가 바뀐 렌더에서 즉시 1페이지로 취급 — useEffect로 되돌리면 이전 page로 한 번 더 낭비성 요청이 나감
  const prevSearchRef = useRef(search);
  let effectivePage = page;
  if (prevSearchRef.current !== search) {
    prevSearchRef.current = search;
    effectivePage = 1;
    if (page !== 1) setPage(1);
  }

  const { data, isLoading, isFetching, isError, error, refetch } = useV1TournamentReviews(tournamentId, {
    page: effectivePage,
    pageSize: PAGE_SIZE,
    search,
  });

  const reviews = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppChrome
      title="참가팀 후기"
      backHref={`/tournaments/${tournamentId}/awards`}
      bottomNav={false}
      activeTab="tournaments"
    >
      <div className="tm-tourn-sub-page">
        <h1 className="sr-only">대회 참가팀 후기</h1>
        <div className="tm-reviews-body" style={{ padding: '20px 20px 40px' }}>
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

              <div className="tm-reviews-cards" style={{ opacity: isFetching ? 0.6 : 1 }}>
                {reviews.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>

              <div style={{ opacity: isFetching ? 0.6 : 1 }}>
                <ReviewsTable reviews={reviews} />
              </div>

              <ReviewsPager page={page} totalPages={totalPages} onChange={setPage} />
            </>
          )}
        </div>
      </div>
    </AppChrome>
  );
}
