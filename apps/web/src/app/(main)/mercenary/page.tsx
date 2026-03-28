'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserPlus, Search, Star } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useMercenaryPosts } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { sportLabel, levelLabel } from '@/lib/constants';
import { formatMatchDate, formatCurrency } from '@/lib/utils';

const sportFilters = [
  { key: '', label: '전체' },
  { key: 'soccer', label: '축구' },
  { key: 'futsal', label: '풋살' },
];

const positionLabel: Record<string, string> = {
  GK: '골키퍼',
  DF: '수비수',
  MF: '미드필더',
  FW: '공격수',
  ALL: '포지션 무관',
};

interface MercenaryPost {
  id: string;
  teamName: string;
  sportType: string;
  matchDate: string;
  startTime: string;
  venue: string;
  position: string;
  levelRequired: number;
  fee: number;
  count: number;
  notes?: string;
  mannerScore: number;
}

const mockPosts: MercenaryPost[] = [
  {
    id: 'merc-1',
    teamName: 'FC 한강',
    sportType: 'soccer',
    matchDate: '2026-03-22',
    startTime: '14:00',
    venue: '난지천 풋살장 A',
    position: 'GK',
    levelRequired: 3,
    fee: 30000,
    count: 1,
    notes: '골키퍼 장갑 지참 필수',
    mannerScore: 4.7,
  },
  {
    id: 'merc-2',
    teamName: '성수 유나이티드',
    sportType: 'futsal',
    matchDate: '2026-03-23',
    startTime: '10:00',
    venue: '성수 실내풋살장',
    position: 'ALL',
    levelRequired: 2,
    fee: 0,
    count: 2,
    mannerScore: 4.3,
  },
  {
    id: 'merc-3',
    teamName: '강남 FC',
    sportType: 'soccer',
    matchDate: '2026-03-23',
    startTime: '16:00',
    venue: '양재천 축구장',
    position: 'FW',
    levelRequired: 4,
    fee: 20000,
    count: 1,
    notes: '화이트 유니폼 착용',
    mannerScore: 4.8,
  },
  {
    id: 'merc-4',
    teamName: '마포 킥커즈',
    sportType: 'futsal',
    matchDate: '2026-03-24',
    startTime: '20:00',
    venue: '홍대 풋살파크',
    position: 'MF',
    levelRequired: 3,
    fee: 15000,
    count: 2,
    mannerScore: 4.1,
  },
  {
    id: 'merc-5',
    teamName: '영등포 스타즈',
    sportType: 'soccer',
    matchDate: '2026-03-25',
    startTime: '19:00',
    venue: '여의도 축구장',
    position: 'DF',
    levelRequired: 3,
    fee: 0,
    count: 1,
    notes: '친선 경기입니다. 편하게 와주세요!',
    mannerScore: 4.5,
  },
  {
    id: 'merc-6',
    teamName: '잠실 레인저스',
    sportType: 'futsal',
    matchDate: '2026-03-26',
    startTime: '21:00',
    venue: '잠실 실내체육관',
    position: 'FW',
    levelRequired: 5,
    fee: 50000,
    count: 1,
    notes: '리그 경기. 실력자만 지원 바랍니다.',
    mannerScore: 4.9,
  },
];


export default function MercenaryPage() {
  const [activeSport, setActiveSport] = useState('');
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { data: apiData } = useMercenaryPosts();

  // API 데이터가 있으면 사용, 없으면 목업 데이터로 폴백
  // API MercenaryPost 타입과 로컬 인터페이스가 다를 수 있으므로 any로 캐스팅
  const posts: MercenaryPost[] = (apiData?.items as unknown as MercenaryPost[]) ?? mockPosts;

  const filtered = activeSport
    ? posts.filter((p) => p.sportType === activeSport)
    : posts;

  async function handleApply(id: string) {
    try {
      await api.post(`/mercenary/${id}/apply`);
      setAppliedIds((prev) => new Set(prev).add(id));
      toast('success', '용병 신청이 완료되었어요');
    } catch {
      toast('error', '신청에 실패했어요. 잠시 후 다시 시도해주세요');
    }
  }

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in dark:bg-gray-900">
      <header className="px-5 @3xl:px-0 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">용병 모집</h1>
          <Link href="/my/mercenary" className="text-sm text-gray-500 hover:text-gray-600 transition-colors">
            내 모집/신청
          </Link>
        </div>
        <Link
          href="/mercenary/new"
          className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
        >
          <UserPlus size={16} strokeWidth={2.5} />
          용병 모집하기
        </Link>
      </header>

      {/* 필터 칩 */}
      <div className="px-5 @3xl:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {sportFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveSport(f.key)}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              activeSport === f.key
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-white text-gray-600 border border-gray-200 active:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-5 @3xl:px-0 mb-3">
        <p className="text-sm text-gray-500">{filtered.length}개의 모집글</p>
      </div>

      {/* 모집글 리스트 */}
      <div className="px-5 @3xl:px-0">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title={activeSport ? `${sportLabel[activeSport]} 용병 모집이 없어요` : '용병 모집이 없어요'}
            description="직접 용병을 모집해보세요"
            action={{ label: '용병 모집하기', href: '/mercenary/new' }}
          />
        ) : (
          <div className="flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2 stagger-children">
            {filtered.map((post) => {
              const isApplied = appliedIds.has(post.id);

              return (
                <div
                  key={post.id}
                  className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 duration-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1 text-xs text-gray-500">
                        <span>{sportLabel[post.sportType]}</span>
                        <span className="text-gray-200">·</span>
                        <span>{positionLabel[post.position]}</span>
                        {post.fee === 0 && (
                          <>
                            <span className="text-gray-200">·</span>
                            <span className="text-green-600 font-semibold">무료</span>
                          </>
                        )}
                      </div>
                      <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {post.teamName}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-amber-500 shrink-0">
                      <Star size={12} fill="currentColor" />
                      <span className="font-semibold">{(post.mannerScore ?? 0).toFixed(1)}</span>
                    </div>
                  </div>

                  <p className="mt-2.5 text-sm text-gray-500 leading-relaxed">
                    {formatMatchDate(post.matchDate)} {post.startTime}
                    <span className="text-gray-300 mx-1">·</span>
                    {post.venue}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {levelLabel[post.levelRequired]} 이상
                    <span className="text-gray-300 mx-1">·</span>
                    <span className={`font-semibold ${post.fee === 0 ? 'text-green-600' : 'text-gray-800 dark:text-gray-200'}`}>
                      {formatCurrency(post.fee)}
                    </span>
                  </p>

                  {post.notes && (
                    <p className="mt-2 text-xs text-gray-500 truncate">{post.notes}</p>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {post.count}명 모집
                    </span>
                    <button
                      onClick={() => handleApply(post.id)}
                      disabled={isApplied}
                      className={`rounded-xl px-5 py-2 text-sm font-bold transition-colors ${
                        isApplied
                          ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                          : 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700'
                      }`}
                    >
                      {isApplied ? '신청완료' : '신청'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
