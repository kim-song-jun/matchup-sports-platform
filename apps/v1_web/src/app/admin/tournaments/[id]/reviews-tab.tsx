'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Star } from 'lucide-react';
import { publicAssetPath } from '@/lib/assets';
import { useV1AdminTournamentReviews, useV1HideReview, useV1UnhideReview } from '@/hooks/use-v1-api';
import type { V1AdminTournamentReview } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { AdminEmpty } from '@/components/admin';
import { formatDate } from './tournament-admin-shared';
import {
  SimpleModal,
  textareaCls,
} from './tournament-detail-shared';


// ── ReviewsTab (리뷰 모더레이션) ──────────────────────────────────────────

const REVIEWS_PAGE_SIZE = 10;

export function ReviewsTab({
  tournamentId,
  showToast,
}: {
  tournamentId: string;
  showToast: (msg: string, v?: 'success' | 'error') => void;
}) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [hideTarget, setHideTarget] = useState<V1AdminTournamentReview | null>(null);
  const [hideReason, setHideReason] = useState('');

  const { data, isPending, isError, error, refetch, isFetching } = useV1AdminTournamentReviews(
    tournamentId,
    { page, pageSize: REVIEWS_PAGE_SIZE, search: search || undefined },
  );
  const hideReview = useV1HideReview(tournamentId);
  const unhideReview = useV1UnhideReview(tournamentId);

  const reviews = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / REVIEWS_PAGE_SIZE));

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const closeHideModal = () => {
    if (hideReview.isPending) return;
    setHideTarget(null);
    setHideReason('');
  };

  const handleHideConfirm = () => {
    if (!hideTarget) return;
    hideReview.mutate(
      { reviewId: hideTarget.id, reason: hideReason.trim() || undefined },
      {
        onSuccess: (res) => {
          showToast(res.alreadyHidden ? '이미 숨겨진 리뷰예요.' : '리뷰를 숨겼어요.', 'success');
          setHideTarget(null);
          setHideReason('');
        },
        onError: (err) => showToast(extractErrorMessage(err, '처리에 실패했어요.'), 'error'),
      },
    );
  };

  const handleUnhide = (review: V1AdminTournamentReview) => {
    unhideReview.mutate(
      { reviewId: review.id },
      {
        onSuccess: (res) => {
          showToast(res.alreadyVisible ? '이미 공개된 리뷰예요.' : '리뷰를 다시 공개했어요.', 'success');
        },
        onError: (err) => showToast(extractErrorMessage(err, '처리에 실패했어요.'), 'error'),
      },
    );
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <h3 className="text-[15px] font-bold text-[var(--text-strong)]">리뷰 관리</h3>
        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
          부적절한 리뷰를 숨기거나 다시 공개할 수 있어요. 숨긴 리뷰는 사용자 화면에서 보이지 않아요.
        </p>
      </div>

      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <label htmlFor="review-search" className="sr-only">리뷰 검색</label>
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
            aria-hidden="true"
          >
            <Search size={16} />
          </span>
          <input
            id="review-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="작성자, 팀명, 후기 내용으로 검색"
            className="w-full h-[44px] pl-9 pr-3 text-[13px] bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
          />
        </div>
        <button
          type="submit"
          className="h-[44px] px-4 inline-flex items-center justify-center bg-[var(--surface-soft)] text-[var(--text-body)] text-[13px] font-semibold rounded-xl hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          검색
        </button>
      </form>

      {isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-[var(--card-surface)] rounded-xl border border-[var(--border)] p-3.5 animate-pulse">
              <div className="h-3.5 w-1/3 rounded bg-[var(--surface-soft)]" />
              <div className="mt-2 h-2.5 w-2/3 rounded bg-[var(--surface-soft)]" />
              <div className="mt-3 h-10 rounded-lg bg-[var(--surface-soft)]" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] py-10 px-4 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-[var(--red700)] font-medium">
            {extractErrorMessage(error, '리뷰를 불러오지 못했어요.')}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-sm text-[var(--blue700)] hover:bg-[var(--blue50)] underline underline-offset-2 min-h-[44px] px-3 rounded transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            다시 시도하기
          </button>
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <AdminEmpty
            title={search ? '검색 결과가 없어요' : '등록된 리뷰가 없어요'}
            description={
              search
                ? '다른 검색어로 다시 시도해보세요.'
                : '참가팀의 후기가 등록되면 여기에서 볼 수 있어요.'
            }
          />
        </div>
      ) : (
        <>
          <p className="text-[12px] text-[var(--text-muted)] mb-2">총 {total}개</p>
          <div className="flex flex-col gap-3" style={{ opacity: isFetching ? 0.6 : 1 }}>
            {reviews.map((review) => (
              <ReviewModerationCard
                key={review.id}
                review={review}
                onHide={() => { setHideTarget(review); setHideReason(''); }}
                onUnhide={() => handleUnhide(review)}
                unhidePending={unhideReview.isPending}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="이전 페이지"
                className="w-[44px] h-[44px] inline-flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-soft)] disabled:opacity-40 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <span className="text-[13px] text-[var(--text-muted)] tabular-nums">{page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="다음 페이지"
                className="w-[44px] h-[44px] inline-flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-soft)] disabled:opacity-40 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}

      <SimpleModal
        open={!!hideTarget}
        title="리뷰 숨기기"
        onClose={closeHideModal}
        pending={hideReview.isPending}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[var(--text-muted)]">
            이 리뷰를 사용자에게 숨길까요? 숨긴 리뷰는 관리자만 볼 수 있어요.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="hide-reason" className="text-[13px] text-[var(--text-strong)]">숨김 사유 (선택)</label>
            <textarea
              id="hide-reason"
              value={hideReason}
              onChange={(e) => setHideReason(e.target.value)}
              disabled={hideReview.isPending}
              rows={3}
              maxLength={200}
              placeholder="예: 욕설/비방 신고 접수"
              className={textareaCls}
            />
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] text-right">{hideReason.length}/200</p>
          </div>
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={closeHideModal}
              disabled={hideReview.isPending}
              className="flex-1 h-[44px] rounded-xl text-[13px] text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleHideConfirm}
              disabled={hideReview.isPending}
              className="flex-1 h-[44px] rounded-xl text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              {hideReview.isPending ? '처리 중...' : '숨기기'}
            </button>
          </div>
        </div>
      </SimpleModal>
    </div>
  );
}

// ── ReviewsTab 카드 컴포넌트 ────────────────────────────────────────────────

function ReviewModerationCard({
  review,
  onHide,
  onUnhide,
  unhidePending,
}: {
  review: V1AdminTournamentReview;
  onHide: () => void;
  onUnhide: () => void;
  unhidePending: boolean;
}) {
  const isHidden = !!review.hiddenAt;
  const letter = (review.authorNickname || '?').charAt(0);
  const photoUrls = review.photoUrls ?? [];

  return (
    <div
      className={[
        'rounded-xl border p-3.5',
        isHidden ? 'bg-[var(--surface-soft)] border-[var(--border)]' : 'bg-[var(--card-surface)] border-[var(--border)]',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        {review.authorProfileImageUrl ? (
          <img
            src={publicAssetPath(review.authorProfileImageUrl)}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="w-9 h-9 rounded-full object-cover shrink-0"
          />
        ) : (
          <div
            aria-hidden="true"
            className="w-9 h-9 rounded-full bg-[var(--grey300)] text-[var(--text-muted)] text-[13px] font-semibold flex items-center justify-center shrink-0"
          >
            {letter}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[13px] font-semibold text-[var(--text-strong)] truncate">{review.authorNickname}</p>
            {review.teamName && (
              <span className="text-[12px] text-[var(--text-muted)] truncate">· {review.teamName}</span>
            )}
            {isHidden && (
              <span className="inline-flex items-center h-5 px-2 rounded-full bg-[var(--card-surface)] border border-[var(--border)] text-[var(--text-muted)] text-[length:var(--font-size-caption)] font-semibold">
                숨김
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="inline-flex items-center gap-0.5" aria-label={`별점 ${review.rating}점`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={13}
                  aria-hidden="true"
                  className={i < review.rating ? 'fill-[var(--orange500)] stroke-[var(--orange500)]' : 'fill-none stroke-gray-300'}
                />
              ))}
            </span>
            <span className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{formatDate(review.createdAt)}</span>
          </div>
        </div>
      </div>

      {review.comment && (
        <p className="text-[13px] text-[var(--text-body)] mt-2.5 leading-relaxed whitespace-pre-wrap break-words">
          {review.comment}
        </p>
      )}

      {photoUrls.length > 0 && (
        <div className="flex gap-2 mt-2.5 flex-wrap">
          {photoUrls.map((url) => (
            <a
              key={url}
              href={publicAssetPath(url)}
              target="_blank"
              rel="noreferrer"
              className="block w-14 h-14 rounded-lg overflow-hidden border border-[var(--border)] shrink-0"
            >
              <img src={publicAssetPath(url)} alt="" loading="lazy" className="w-full h-full object-cover" />
            </a>
          ))}
        </div>
      )}

      {isHidden && review.hiddenReason && (
        <p className="text-[12px] text-[var(--text-muted)] mt-2.5 bg-[var(--card-surface)] border border-[var(--border)] rounded-lg px-3 py-2">
          숨김 사유: {review.hiddenReason}
        </p>
      )}

      <div className="mt-3">
        {isHidden ? (
          <button
            type="button"
            onClick={onUnhide}
            disabled={unhidePending}
            className="w-full h-[44px] rounded-xl text-[13px] font-semibold text-[var(--blue700)] bg-[var(--blue50)] hover:bg-blue-100 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            {unhidePending ? '처리 중...' : '공개로 전환'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onHide}
            className="w-full h-[44px] rounded-xl text-[13px] font-semibold text-[var(--red700)] bg-[var(--red50)] hover:bg-red-100 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            숨기기
          </button>
        )}
      </div>
    </div>
  );
}
