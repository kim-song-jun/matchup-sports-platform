'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Search, Star } from 'lucide-react';
import { publicAssetPath } from '@/lib/assets';
import { useV1AdminTournamentReviews, useV1HideReview, useV1UnhideReview } from '@/hooks/use-v1-api';
import type { V1AdminTournamentReview } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { AdminEmpty, AdminListSkeleton } from '@/components/admin';
import { PaginationBar } from '@/components/v1-ui/pagination-bar';
import { formatDate } from './tournament-admin-shared';
import {
  SimpleModal,
  textareaCls,
} from './tournament-detail-shared';


// ── ReviewsTab (리뷰 모더레이션) ──────────────────────────────────────────

const REVIEWS_PAGE_SIZE = 10;

export function ReviewsTab({
  tournamentId,
  canWrite,
  showToast,
}: {
  tournamentId: string;
  canWrite: boolean;
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
    <div className="tm-content-enter p-4">
      <div className="mb-4">
        <h3 className="text-[15px] font-bold text-[var(--text-strong)]">리뷰 관리</h3>
        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
          부적절한 리뷰를 숨기거나 다시 공개할 수 있어요. 숨긴 리뷰는 사용자 화면에서 보이지 않아요.
        </p>
      </div>

      {!canWrite && (
        <p
          className="mb-4 rounded-xl bg-[var(--surface-soft)] px-4 py-3 text-xs text-[var(--text-muted)]"
          role="status"
        >
          조회 전용 권한으로 접속했어요. 리뷰를 숨기거나 다시 공개하려면 운영 권한이 필요해요.
        </p>
      )}

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

      {/* 수제 스켈레톤·에러 블록이 공용 컴포넌트의 분기를 마크업까지 복제하고 있었다 —
          표준(AdminListSkeleton / AdminEmpty+재시도)으로 교체. 리뷰 카드 자체는 아바타·
          별점·사진이 있는 도메인 카드라 AdminCardList 로 뭉개지 않고 유지한다. */}
      {isPending ? (
        <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <AdminListSkeleton rows={4} />
        </div>
      ) : isError ? (
        <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <AdminEmpty
            title="리뷰를 불러오지 못했어요"
            description={extractErrorMessage(error, '잠시 후 다시 시도해 주세요.')}
            action={
              <button
                type="button"
                onClick={() => void refetch()}
                className="min-h-[44px] px-4 rounded-lg border border-[var(--border)] font-semibold focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                다시 시도
              </button>
            }
          />
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
                canWrite={canWrite}
                onHide={() => { setHideTarget(review); setHideReason(''); }}
                onUnhide={() => handleUnhide(review)}
                unhidePending={unhideReview.isPending}
              />
            ))}
          </div>

          {/* 수제 Prev/Next 페이저는 공용 PaginationBar 가 막으려던 접근성 회귀(범위
              텍스트·aria-current·생략구간)를 그대로 재현하고 있었다 — 공용 바로 교체. */}
          {totalPages > 1 && (
            <PaginationBar
              page={page}
              totalPages={totalPages}
              total={total}
              limit={REVIEWS_PAGE_SIZE}
              onPageChange={setPage}
              loading={isFetching}
              label="리뷰 목록 페이지"
            />
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
          <div className="flex flex-col gap-2">
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
  canWrite,
  onHide,
  onUnhide,
  unhidePending,
}: {
  review: V1AdminTournamentReview;
  canWrite: boolean;
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
        'rounded-xl border p-4',
        isHidden ? 'bg-[var(--surface-soft)] border-[var(--border)]' : 'bg-[var(--card-surface)] border-[var(--border)]',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        {review.authorProfileImageUrl ? (
          <Image
            src={publicAssetPath(review.authorProfileImageUrl)}
            alt=""
            aria-hidden="true"
            loading="lazy"
            width={36}
            height={36}
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
          <div className="flex items-center gap-2 flex-wrap">
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
        <p className="text-[13px] text-[var(--text-body)] mt-3 leading-relaxed whitespace-pre-wrap break-words">
          {review.comment}
        </p>
      )}

      {photoUrls.length > 0 && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {photoUrls.map((url) => (
            <a
              key={url}
              href={publicAssetPath(url)}
              target="_blank"
              rel="noreferrer"
              className="block w-14 h-14 rounded-lg overflow-hidden border border-[var(--border)] shrink-0"
            >
              <Image
                src={publicAssetPath(url)}
                alt=""
                loading="lazy"
                width={56}
                height={56}
                className="w-full h-full object-cover"
              />
            </a>
          ))}
        </div>
      )}

      {isHidden && review.hiddenReason && (
        <p className="text-[12px] text-[var(--text-muted)] mt-3 bg-[var(--card-surface)] border border-[var(--border)] rounded-lg px-3 py-2">
          숨김 사유: {review.hiddenReason}
        </p>
      )}

      {canWrite && (
        <div className="mt-3">
          {isHidden ? (
            <button
              type="button"
              onClick={onUnhide}
              disabled={unhidePending}
              className="w-full h-[44px] rounded-xl text-[13px] font-semibold text-[var(--blue700)] bg-[var(--blue50)] hover:bg-[var(--blue100)] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              {unhidePending ? '처리 중...' : '공개로 전환'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onHide}
              className="w-full h-[44px] rounded-xl text-[13px] font-semibold text-[var(--red700)] bg-[var(--red50)] hover:bg-[var(--red100)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              숨기기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
