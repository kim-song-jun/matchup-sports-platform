'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Star, User } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

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
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={14}
          className={i <= rating ? 'text-amber-400' : 'text-gray-200'}
          fill={i <= rating ? 'currentColor' : 'none'}
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
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-[15px] font-medium text-gray-700">로그인이 필요합니다</p>
        <Link href="/login" className="mt-4 inline-block rounded-lg bg-blue-500 px-6 py-2.5 text-[14px] font-semibold text-white">로그인</Link>
      </div>
    );
  }

  const avgScore = mockReviewsReceived.reduce((sum, r) => sum + r.rating, 0) / mockReviewsReceived.length;
  const ratingDistribution = [5, 4, 3, 2, 1].map((r) => ({
    rating: r,
    count: mockReviewsReceived.filter((rev) => rev.rating === r).length,
  }));

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-lg p-2 -ml-2 hover:bg-gray-100 active:scale-[0.98] transition-all min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">내가 받은 평가</h1>
      </header>
      <div className="hidden lg:block mb-6 px-5 lg:px-0 pt-4">
        <h2 className="text-[24px] font-bold text-gray-900">내가 받은 평가</h2>
        <p className="text-[14px] text-gray-400 mt-1">다른 사용자들이 남긴 평가를 확인하세요</p>
      </div>

      <div className="px-5 lg:px-0 pb-8">
        {/* Summary */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5 mb-4">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-[36px] font-black text-gray-900">{avgScore.toFixed(1)}</p>
              <StarRating rating={Math.round(avgScore)} />
              <p className="text-[12px] text-gray-400 mt-1">{mockReviewsReceived.length}개 평가</p>
            </div>
            <div className="flex-1 space-y-1.5">
              {ratingDistribution.map((d) => (
                <div key={d.rating} className="flex items-center gap-2">
                  <span className="text-[12px] text-gray-500 w-3">{d.rating}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full"
                      style={{ width: `${(d.count / mockReviewsReceived.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-[12px] text-gray-400 w-4 text-right">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Review List */}
        <div className="space-y-3">
          {mockReviewsReceived.map((review) => (
            <div key={review.id} className="rounded-2xl bg-white border border-gray-100 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 shrink-0">
                  <User size={18} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-gray-900">{review.reviewerName}</span>
                    <span className="text-[12px] text-gray-400">{review.date}</span>
                  </div>
                  <div className="mt-0.5">
                    <StarRating rating={review.rating} />
                  </div>
                  <p className="text-[14px] text-gray-700 mt-2">{review.comment}</p>
                  <p className="text-[12px] text-gray-400 mt-1.5">{review.matchTitle}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
