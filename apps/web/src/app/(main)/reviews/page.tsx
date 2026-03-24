'use client';

import { ArrowLeft, Star, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/toast';
import { useState } from 'react';
import Link from 'next/link';
import { usePendingReviews } from '@/hooks/use-api';
import type { PendingReview } from '@/types/api';
import type { QueryClient } from '@tanstack/react-query';

export default function ReviewsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pending, isLoading } = usePendingReviews();

  const pendingReviews = Array.isArray(pending) ? pending : [];

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0">
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-lg p-2 -ml-2 hover:bg-gray-100 active:scale-[0.98] transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"><ArrowLeft size={20} className="text-gray-700" /></button>
        <h1 className="text-[16px] font-semibold text-gray-900">내 평가</h1>
      </header>
      <div className="hidden lg:block mb-6">
        <h2 className="text-[24px] font-bold text-gray-900">내 평가</h2>
        <p className="text-[14px] text-gray-400 mt-1">매치가 끝나면 함께한 선수들을 평가해주세요</p>
      </div>

      <div className="px-5 lg:px-0">
        {!isAuthenticated ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <Star size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">로그인 후 확인할 수 있어요</p>
            <Link href="/login" className="mt-4 inline-block rounded-lg bg-gray-900 px-6 py-2.5 text-[14px] font-semibold text-white">로그인</Link>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-50" />)}</div>
        ) : pendingReviews.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <Star size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">작성할 평가가 없어요</p>
            <p className="text-[13px] text-gray-400 mt-1">매치가 완료되면 평가 요청이 도착합니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingReviews.map((review: PendingReview, idx: number) => (
              <ReviewCard key={idx} review={review} toast={toast} queryClient={queryClient} />
            ))}
          </div>
        )}
      </div>
      <div className="h-8" />
    </div>
  );
}

function ReviewCard({ review, toast, queryClient }: { review: PendingReview; toast: (type: 'success' | 'error' | 'info', message: string) => void; queryClient: QueryClient }) {
  const [skillRating, setSkillRating] = useState(3);
  const [mannerRating, setMannerRating] = useState(3);
  const [comment, setComment] = useState('');
  const [expanded, setExpanded] = useState(false);

  const submitMutation = useMutation({
    mutationFn: () => api.post('/reviews', {
      matchId: review.matchId,
      targetId: review.target.id,
      skillRating,
      mannerRating,
      comment: comment || undefined,
    }) as Promise<unknown>,
    onSuccess: () => {
      toast('success', '평가가 제출되었습니다');
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
    onError: () => toast('error', '평가 제출에 실패했습니다'),
  });

  return (
    <div className="rounded-2xl bg-white border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
            {review.target?.nickname?.charAt(0)}
          </div>
          <div>
            <p className="text-[14px] font-semibold text-gray-900">{review.target?.nickname}</p>
            <p className="text-[12px] text-gray-400">{review.matchTitle}</p>
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          {expanded ? '접기' : '평가하기'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 animate-slide-up">
          <RatingRow label="실력" value={skillRating} onChange={setSkillRating} />
          <RatingRow label="매너" value={mannerRating} onChange={setMannerRating} />
          <div>
            <label className="text-[13px] font-semibold text-gray-700 mb-1 block">코멘트 (선택)</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="한 마디 남겨주세요"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[14px] outline-none focus:border-blue-300 resize-none" />
          </div>
          <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
            className="w-full rounded-xl bg-blue-500 py-3 text-[14px] font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors">
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
      <span className="text-[13px] font-semibold text-gray-700 mb-1 block">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onChange(n)} aria-label={`${n}점`} className="p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <Star size={24} className={n <= value ? 'text-amber-400' : 'text-gray-200'} fill={n <= value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
    </div>
  );
}
