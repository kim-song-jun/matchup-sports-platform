'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Star, TrendingUp } from 'lucide-react';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useAdminReviews } from '@/hooks/use-api';
import type { AdminReview } from '@/types/api';

function renderStars(score: number) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          size={14}
          className={value <= score ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-gray-600'}
        />
      ))}
      <span className="ml-1 text-xs font-semibold text-gray-700 dark:text-gray-300">{score.toFixed(1)}</span>
    </div>
  );
}

function getMatchTitle(review: AdminReview) {
  return review.match?.title ?? review.matchTitle ?? '매치 정보 없음';
}

function getReviewerName(review: AdminReview) {
  return review.author?.nickname ?? review.reviewerName ?? '알 수 없음';
}

function getTargetName(review: AdminReview) {
  return review.target?.nickname ?? review.targetName ?? '알 수 없음';
}

export default function AdminReviewsPage() {
  const [search, setSearch] = useState('');
  const { data = [], isLoading, isError, refetch } = useAdminReviews();

  const filtered = useMemo(() => {
    return data.filter((review) => {
      const query = search.toLowerCase();
      return !search
        || getMatchTitle(review).toLowerCase().includes(query)
        || getReviewerName(review).toLowerCase().includes(query)
        || getTargetName(review).toLowerCase().includes(query);
    });
  }, [data, search]);

  const totalReviews = filtered.length;
  const avgManner = totalReviews > 0
    ? filtered.reduce((sum, review) => sum + (review.mannerRating ?? 0), 0) / totalReviews
    : 0;
  const avgSkill = totalReviews > 0
    ? filtered.reduce((sum, review) => sum + (review.skillRating ?? 0), 0) / totalReviews
    : 0;
  const avgTotal = totalReviews > 0 ? (avgManner + avgSkill) / 2 : 0;

  const handleDownloadCSV = () => {
    downloadCSV(
      filtered.map((review) => ({
        매치: getMatchTitle(review),
        평가자: getReviewerName(review),
        대상: getTargetName(review),
        매너점수: review.mannerRating ?? 0,
        실력점수: review.skillRating ?? 0,
        날짜: review.createdAt,
      })),
      '평가',
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-4">
        <Link href="/admin/dashboard" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">관리자</Link>
        <ChevronRight size={12} />
        <span className="text-gray-700 dark:text-gray-300 font-medium">평가</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">평가 관리</h1>
          <p className="text-base text-gray-500 mt-1">실제 리뷰와 평점만 표시합니다</p>
        </div>
      </div>

      <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="총 평가수" value={totalReviews} icon={TrendingUp} iconColor="bg-blue-50 text-blue-500" />
        <SummaryCard label="전체 평균" value={avgTotal.toFixed(1)} icon={Star} iconColor="bg-amber-50 text-amber-600" />
        <SummaryCard label="평균 매너점수" value={avgManner.toFixed(1)} icon={Star} iconColor="bg-green-50 text-green-500" />
        <SummaryCard label="평균 스킬점수" value={avgSkill.toFixed(1)} icon={Star} iconColor="bg-purple-50 text-purple-500" />
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '매치명 또는 평가자/대상 검색' }}
        onDownload={handleDownloadCSV}
        count={filtered.length}
        countLabel="건"
      />

      {isLoading ? (
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-lg bg-gray-50 dark:bg-gray-700" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message="평가 목록을 불러오지 못했어요" onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
          <EmptyState
            icon={Star}
            title="표시할 평가가 없어요"
            description="실제 리뷰가 등록되면 여기에 표시돼요"
            size="sm"
          />
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">매치</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">평가자</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">대상</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">매너점수</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">스킬점수</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase whitespace-nowrap">날짜</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {filtered.map((review) => (
                  <tr key={review.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="text-base font-medium text-gray-900 dark:text-white truncate max-w-[220px]">
                        {getMatchTitle(review)}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {getReviewerName(review)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {getTargetName(review)}
                    </td>
                    <td className="px-5 py-3.5">{renderStars(review.mannerRating ?? 0)}</td>
                    <td className="px-5 py-3.5">{renderStars(review.skillRating ?? 0)}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(review.createdAt).toLocaleDateString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  iconColor,
}: {
  label: string;
  value: string | number;
  icon: typeof TrendingUp;
  iconColor: string;
}) {
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 hover:shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-[colors,shadow]">
      <div className="flex items-center justify-between mb-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconColor}`}>
          <Icon size={20} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
