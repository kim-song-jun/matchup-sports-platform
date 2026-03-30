'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Star, User, MessageSquareQuote } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { EmptyState } from '@/components/ui/empty-state';

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20';

const softCard =
  'rounded-[24px] border border-slate-200/60 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/78 dark:shadow-black/10';

const mockReviewsReceived = [
  {
    id: 'rev-1',
    reviewerName: '김민수',
    rating: 5,
    comment: '시간 약속을 잘 지키고 매너가 좋았습니다. 또 같이 하고 싶어요!',
    matchTitle: '강남 풋살파크 주말 매치',
    date: '2026-03-18',
  },
  {
    id: 'rev-2',
    reviewerName: '이영희',
    rating: 4,
    comment: '실력이 좋고 팀플레이를 잘 합니다.',
    matchTitle: '잠실 농구 픽업게임',
    date: '2026-03-15',
  },
  {
    id: 'rev-3',
    reviewerName: '박지훈',
    rating: 5,
    comment: '정말 즐겁게 운동했습니다. 적극적이고 배려심 있어요.',
    matchTitle: '마포 배드민턴 복식',
    date: '2026-03-10',
  },
  {
    id: 'rev-4',
    reviewerName: '최서연',
    rating: 4,
    comment: '경기 운영을 잘 해주셔서 편했습니다.',
    matchTitle: '성수 풋살 평일 매치',
    date: '2026-03-05',
  },
  {
    id: 'rev-5',
    reviewerName: '정태욱',
    rating: 5,
    comment: '커뮤니케이션이 좋고 페어플레이 최고입니다.',
    matchTitle: '강남 풋살파크 주중 매치',
    date: '2026-02-28',
  },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((score) => (
        <Star
          key={score}
          size={14}
          className={score <= rating ? 'text-amber-400' : 'text-slate-200 dark:text-slate-700'}
          fill={score <= rating ? 'currentColor' : 'none'}
        />
      ))}
    </div>
  );
}

export default function ReviewsReceivedPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={Star}
          title="로그인 후 받은 평가를 확인할 수 있어요"
          description="매치가 끝나면 다른 참가자들이 남긴 피드백이 이곳에 정리됩니다."
          action={{ label: '로그인', href: '/login' }}
        />
      </div>
    );
  }

  const avgScore = mockReviewsReceived.reduce((sum, review) => sum + review.rating, 0) / mockReviewsReceived.length;
  const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: mockReviewsReceived.filter((review) => review.rating === rating).length,
  }));

  const summary = [
    { label: '평균 평점', value: avgScore.toFixed(1) },
    { label: '누적 평가', value: `${mockReviewsReceived.length}개` },
    { label: '5점 비율', value: `${Math.round((ratingDistribution[0].count / mockReviewsReceived.length) * 100)}%` },
  ];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <section className="px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} overflow-hidden p-6 sm:p-7`}>
          <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
            <div className="max-w-2xl">
              <div className="eyebrow-chip">
                <MessageSquareQuote size={14} />
                MatchUp Reputation
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                받은 평가는 신뢰 지표로 축적됩니다.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                다른 참가자들이 남긴 코멘트와 평점을 한눈에 확인하고, 운영자와 플레이어로서의 인상을 관리할 수 있습니다.
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
            {summary.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 @3xl:px-0 mt-4 grid gap-4 @3xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="solid-panel rounded-[24px] p-5">
          <div className="text-center">
            <p className="text-5xl font-black tracking-tight text-slate-950 dark:text-white">{avgScore.toFixed(1)}</p>
            <div className="mt-3 flex justify-center">
              <StarRating rating={Math.round(avgScore)} />
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{mockReviewsReceived.length}개 평가</p>
          </div>

          <div className="mt-6 space-y-2">
            {ratingDistribution.map((item) => (
              <div key={item.rating} className="flex items-center gap-2">
                <span className="w-3 text-xs text-slate-500 dark:text-slate-400">{item.rating}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-amber-400"
                    style={{ width: `${(item.count / mockReviewsReceived.length) * 100}%` }}
                  />
                </div>
                <span className="w-4 text-right text-xs text-slate-500 dark:text-slate-400">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 stagger-children">
          {mockReviewsReceived.map((review) => (
            <div key={review.id} className={`${softCard} p-4`}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200/70 bg-white/70 dark:border-slate-800 dark:bg-slate-900/70">
                  <User size={18} className="text-slate-500 dark:text-slate-300" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-base font-semibold text-slate-950 dark:text-white">{review.reviewerName}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{review.date}</span>
                  </div>
                  <div className="mt-2">
                    <StarRating rating={review.rating} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{review.comment}</p>
                  <p className="mt-2 text-xs font-medium text-slate-400 dark:text-slate-500">{review.matchTitle}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
