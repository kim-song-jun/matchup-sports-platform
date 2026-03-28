'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Star, ChevronRight, TrendingUp } from 'lucide-react';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';

interface Review {
  id: string;
  matchTitle: string;
  reviewerName: string;
  targetName: string;
  mannerScore: number;
  skillScore: number;
  date: string;
}

const mockReviews: Review[] = [
  {
    id: 'RV-001',
    matchTitle: '주말 풋살 한판',
    reviewerName: '김민수',
    targetName: '이영진',
    mannerScore: 5,
    skillScore: 4,
    date: '2026-03-22',
  },
  {
    id: 'RV-002',
    matchTitle: '농구 3:3 매치',
    reviewerName: '박지원',
    targetName: '최서현',
    mannerScore: 4,
    skillScore: 5,
    date: '2026-03-21',
  },
  {
    id: 'RV-003',
    matchTitle: '배드민턴 복식 매치',
    reviewerName: '정대현',
    targetName: '한지훈',
    mannerScore: 3,
    skillScore: 3,
    date: '2026-03-20',
  },
  {
    id: 'RV-004',
    matchTitle: '풋살 리그전',
    reviewerName: '윤서연',
    targetName: '오준혁',
    mannerScore: 5,
    skillScore: 5,
    date: '2026-03-19',
  },
  {
    id: 'RV-005',
    matchTitle: '토요일 오전 친선전',
    reviewerName: '장민호',
    targetName: '송태양',
    mannerScore: 4,
    skillScore: 4,
    date: '2026-03-18',
  },
  {
    id: 'RV-006',
    matchTitle: '아이스하키 입문 매치',
    reviewerName: '이코치',
    targetName: '김하늘',
    mannerScore: 5,
    skillScore: 3,
    date: '2026-03-17',
  },
  {
    id: 'RV-007',
    matchTitle: '농구 5:5 매치',
    reviewerName: '최영진',
    targetName: '박준서',
    mannerScore: 2,
    skillScore: 4,
    date: '2026-03-16',
  },
  {
    id: 'RV-008',
    matchTitle: '풋살 경쟁전',
    reviewerName: '한지훈',
    targetName: '정대현',
    mannerScore: 4,
    skillScore: 3,
    date: '2026-03-15',
  },
];

function renderStars(score: number) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={14}
          className={s <= score ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-gray-600'}
        />
      ))}
      <span className="ml-1 text-xs font-semibold text-gray-700 dark:text-gray-300">{score.toFixed(1)}</span>
    </div>
  );
}

export default function AdminReviewsPage() {
  const [search, setSearch] = useState('');

  const filtered = mockReviews.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.matchTitle.toLowerCase().includes(q) ||
      r.reviewerName.toLowerCase().includes(q) ||
      r.targetName.toLowerCase().includes(q)
    );
  });

  const totalReviews = mockReviews.length;
  const avgManner = mockReviews.reduce((sum, r) => sum + r.mannerScore, 0) / totalReviews;
  const avgSkill = mockReviews.reduce((sum, r) => sum + r.skillScore, 0) / totalReviews;
  const avgTotal = (avgManner + avgSkill) / 2;

  const handleDownloadCSV = () => {
    downloadCSV(
      filtered.map((r) => ({
        매치: r.matchTitle,
        평가자: r.reviewerName,
        대상: r.targetName,
        매너점수: r.mannerScore,
        실력점수: r.skillScore,
        날짜: r.date,
      })),
      '평가'
    );
  };

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-4">
        <Link href="/admin/dashboard" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">관리자</Link>
        <ChevronRight size={12} />
        <span className="text-gray-700 dark:text-gray-300 font-medium">평가</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">평가 관리</h1>
          <p className="text-base text-gray-400 mt-1">매치 후 평가 현황을 확인하세요</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 hover:shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-[colors,shadow]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalReviews}</p>
          <p className="text-sm text-gray-400 mt-0.5">총 평가수</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 hover:shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-[colors,shadow]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
              <Star size={20} />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{avgTotal.toFixed(1)}</p>
          <p className="text-sm text-gray-400 mt-0.5">전체 평균</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 hover:shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-[colors,shadow]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-500">
              <Star size={20} />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{avgManner.toFixed(1)}</p>
          <p className="text-sm text-gray-400 mt-0.5">평균 매너점수</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 hover:shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition-[colors,shadow]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
              <Star size={20} />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{avgSkill.toFixed(1)}</p>
          <p className="text-sm text-gray-400 mt-0.5">평균 스킬점수</p>
        </div>
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '매치명 또는 평가자/대상 검색' }}
        onDownload={handleDownloadCSV}
        count={filtered.length}
        countLabel="건"
      />

      {/* Table */}
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
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-base font-medium text-gray-900 dark:text-white truncate max-w-[180px]">{r.matchTitle}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 text-xs font-bold text-blue-500 dark:text-blue-400">
                        {r.reviewerName.charAt(0)}
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.reviewerName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300">
                        {r.targetName.charAt(0)}
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.targetName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">{renderStars(r.mannerScore)}</td>
                  <td className="px-5 py-3.5">{renderStars(r.skillScore)}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
