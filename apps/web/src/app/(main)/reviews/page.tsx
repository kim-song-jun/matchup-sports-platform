'use client';

import { useState } from 'react';
import { ArrowLeft, Star, CheckCircle2, MessageSquareText, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import { usePendingReviews } from '@/hooks/use-api';
import type { PendingReview } from '@/types/api';

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20';

const softCard =
  'rounded-[24px] border border-slate-200/60 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/78 dark:shadow-black/10';

export default function ReviewsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: pending, isLoading } = usePendingReviews();

  const pendingReviews = Array.isArray(pending) ? pending : [];
  const summary = [
    { label: '대기 평가', value: pendingReviews.length, icon: Star },
    { label: '코멘트 가능', value: pendingReviews.length, icon: MessageSquareText },
    { label: '평가 대상', value: new Set(pendingReviews.map((review) => review.target.id)).size, icon: Users },
  ];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <section className="px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} overflow-hidden p-6 sm:p-7`}>
          <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
            <div className="max-w-2xl">
              <div className="eyebrow-chip">
                <Star size={14} />
                MatchUp Reviews
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                경기 후 평가는 짧고 명확해야 합니다.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                함께 운동한 상대를 빠르게 평가하고, 실력과 매너 기록이 다음 매칭에 반영되도록 정리했습니다.
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              <ArrowLeft size={14} />
              이전 화면
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {summary.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    <Icon size={14} />
                    {item.label}
                  </div>
                  <p className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{item.value}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-5 @3xl:px-0 mt-4">
        {!isAuthenticated ? (
          <EmptyState
            icon={Star}
            title="로그인 후 평가를 확인할 수 있어요"
            description="참가한 매치가 끝나면 이 화면에서 상대를 평가할 수 있습니다."
            action={{ label: '로그인', href: '/login' }}
          />
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((item) => (
              <div key={item} className="h-[220px] rounded-[24px] bg-slate-100/80 dark:bg-slate-900/70 skeleton-shimmer" />
            ))}
          </div>
        ) : pendingReviews.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="작성할 평가가 없어요"
            description="최근 매치의 평가를 모두 마쳤습니다."
          />
        ) : (
          <div className="space-y-3 stagger-children">
            {pendingReviews.map((review, index) => (
              <ReviewCard key={`${review.matchId}-${review.target.id}-${index}`} review={review} toast={toast} queryClient={queryClient} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewCard({
  review,
  toast,
  queryClient,
}: {
  review: PendingReview;
  toast: (type: 'success' | 'error' | 'info', message: string) => void;
  queryClient: QueryClient;
}) {
  const [skillRating, setSkillRating] = useState(3);
  const [mannerRating, setMannerRating] = useState(3);
  const [comment, setComment] = useState('');
  const [expanded, setExpanded] = useState(false);

  const submitMutation = useMutation({
    mutationFn: () =>
      api.post('/reviews', {
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
    <div className={`${softCard} p-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200/70 bg-white/70 text-sm font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
            {review.target?.nickname?.charAt(0)}
          </div>
          <div>
            <p className="text-base font-semibold text-slate-950 dark:text-white">{review.target?.nickname}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{review.matchTitle}</p>
          </div>
        </div>

        <button
          onClick={() => setExpanded((prev) => !prev)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            expanded
              ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
              : 'border border-slate-200/70 bg-white/70 text-slate-700 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900'
          }`}
        >
          {expanded ? '접기' : '평가하기'}
        </button>
      </div>

      {expanded && (
        <div className="mt-5 space-y-4 animate-slide-up">
          <div className="grid gap-3 sm:grid-cols-2">
            <RatingRow label="실력" value={skillRating} onChange={setSkillRating} />
            <RatingRow label="매너" value={mannerRating} onChange={setMannerRating} />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">코멘트</label>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              placeholder="한 줄로도 충분합니다. 다음 매칭에 도움이 되는 코멘트를 남겨주세요."
              className="input-surface min-h-[112px] px-4 py-3 text-base outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="w-full rounded-full bg-slate-950 py-3.5 text-base font-bold text-white transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/20 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950"
          >
            {submitMutation.isPending ? '제출 중...' : '평가 제출'}
          </button>
        </div>
      )}
    </div>
  );
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200/70 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/70">
      <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            onClick={() => onChange(score)}
            aria-label={`${score}점`}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Star
              size={24}
              className={score <= value ? 'text-amber-400' : 'text-slate-200 dark:text-slate-700'}
              fill={score <= value ? 'currentColor' : 'none'}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
