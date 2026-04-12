'use client';

import { Star } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useToast } from '@/components/ui/toast';
import { useState } from 'react';
import { usePendingReviews } from '@/hooks/use-api';
import type { PendingReview } from '@/types/api';
import type { QueryClient } from '@tanstack/react-query';

export default function ReviewsPage() {
  useRequireAuth();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pending, isLoading } = usePendingReviews();

  const pendingReviews = Array.isArray(pending) ? pending : [];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <MobileGlassHeader title="내 평가" subtitle="매치가 끝나면 함께한 선수들을 평가해주세요." showBack />
      <div className="hidden @3xl:block px-5 @3xl:px-0 pt-4 pb-3">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">내 평가</h1>
        <p className="text-sm text-gray-500 mt-1">매치가 끝나면 함께한 선수들을 평가해주세요</p>
      </div>

      <div className="px-5 @3xl:px-0 mt-4">
        {isLoading ? (
          <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}</div>
        ) : pendingReviews.length === 0 ? (
          <EmptyState
            icon={Star}
            title="작성할 평가가 없어요"
            description="매치가 완료되면 평가 요청이 도착해요"
          />
        ) : (
          <div className="space-y-3 stagger-children">
            {pendingReviews.map((review: PendingReview, idx: number) => (
              <ReviewCard key={idx} review={review} toast={toast} queryClient={queryClient} />
            ))}
          </div>
        )}
        <div className="h-24" />
      </div>
    </div>
  );
}

function ReviewCard({ review, toast, queryClient }: { review: PendingReview; toast: (type: 'success' | 'error' | 'info', message: string) => void; queryClient: QueryClient }) {
  const [skillRating, setSkillRating] = useState(3);
  const [mannerRating, setMannerRating] = useState(3);
  const [comment, setComment] = useState('');
  const [expanded, setExpanded] = useState(false);
  const commentId = `review-comment-${review.matchId}-${review.target?.id}`;

  const submitMutation = useMutation({
    mutationFn: () => api.post('/reviews', {
      matchId: review.matchId,
      targetId: review.target.id,
      skillRating,
      mannerRating,
      comment: comment || undefined,
    }) as Promise<unknown>,
    onSuccess: () => {
      toast('success', '평가가 제출되었어요');
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
    onError: () => toast('error', '평가 제출에 실패했어요. 잠시 후 다시 시도해주세요'),
  });

  return (
    <div className="rounded-2xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
            {review.target?.nickname?.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{review.target?.nickname}</p>
            <p className="text-xs text-gray-500">{review.matchTitle}</p>
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)}
          className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors">
          {expanded ? '접기' : '평가하기'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 animate-slide-up">
          <RatingRow label="실력" value={skillRating} onChange={setSkillRating} />
          <RatingRow label="매너" value={mannerRating} onChange={setMannerRating} />
          <div>
            <label htmlFor={commentId} className="text-sm font-semibold text-gray-700 mb-1 block">코멘트 (선택)</label>
            <textarea id={commentId} value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="한 마디 남겨주세요"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 dark:bg-gray-700 px-3 py-2.5 text-base outline-none focus:border-blue-300 resize-none" />
          </div>
          <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
            className="w-full rounded-xl bg-blue-500 py-3 text-base font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors">
            {submitMutation.isPending ? '제출 중...' : '평가 제출'}
          </button>
        </div>
      )}
    </div>
  );
}

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <span className="text-sm font-semibold text-gray-700 mb-1 block">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onChange(n)} aria-label={`${n}점`} className="p-1.5 min-w-11 min-h-[44px] flex items-center justify-center">
            <Star size={24} className={n <= value ? 'text-amber-400' : 'text-gray-200'} fill={n <= value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
    </div>
  );
}
