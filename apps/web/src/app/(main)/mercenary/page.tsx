'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, MapPin, UserPlus, Search, Shield, Star, DollarSign } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useMercenaryPosts } from '@/hooks/use-api';
import { api } from '@/lib/api';

const sportFilters = [
  { key: '', label: '전체' },
  { key: 'soccer', label: '축구' },
  { key: 'futsal', label: '풋살' },
];

const sportLabel: Record<string, string> = {
  soccer: '축구',
  futsal: '풋살',
};

const positionLabel: Record<string, string> = {
  GK: '골키퍼',
  DF: '수비수',
  MF: '미드필더',
  FW: '공격수',
  ALL: '포지션 무관',
};

const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

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

function formatMatchDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`;
}

function formatFee(fee: number): string {
  if (fee === 0) return '무료';
  return new Intl.NumberFormat('ko-KR').format(fee) + '원';
}

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
      <header className="px-5 lg:px-0 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-bold text-gray-900 dark:text-white">용병 모집</h1>
          <Link href="/my/mercenary" className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors">
            내 모집/신청
          </Link>
        </div>
        <Link
          href="/mercenary/new"
          className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
        >
          <UserPlus size={16} strokeWidth={2.5} />
          용병 모집하기
        </Link>
      </header>

      {/* 필터 칩 */}
      <div className="px-5 lg:px-0 mb-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {sportFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveSport(f.key)}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all ${
              activeSport === f.key
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-white text-gray-600 border border-gray-200 active:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-5 lg:px-0 mb-3">
        <p className="text-[13px] text-gray-400">{filtered.length}개의 모집글</p>
      </div>

      {/* 모집글 리스트 */}
      <div className="px-5 lg:px-0">
        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <Search size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">
              {activeSport ? `${sportLabel[activeSport]} 용병 모집이 없어요` : '용병 모집이 없어요'}
            </p>
            <p className="text-[13px] text-gray-400 mt-1">직접 용병을 모집해보세요</p>
          </div>
        ) : (
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 stagger-children">
            {filtered.map((post) => {
              const isApplied = appliedIds.has(post.id);

              return (
                <div
                  key={post.id}
                  className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 duration-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="shrink-0 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-500">
                          {sportLabel[post.sportType]}
                        </span>
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                          {positionLabel[post.position]}
                        </span>
                        {post.fee === 0 && (
                          <span className="rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-600">
                            무료
                          </span>
                        )}
                      </div>
                      <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">
                        {post.teamName}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1 text-[12px] text-amber-500 shrink-0">
                      <Star size={12} fill="currentColor" />
                      <span className="font-semibold">{(post.mannerScore ?? 0).toFixed(1)}</span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-y-1.5 gap-x-4">
                    <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                      <Calendar size={15} className="text-gray-400" />
                      <span>{formatMatchDate(post.matchDate)} {post.startTime}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                      <MapPin size={15} className="text-gray-400" />
                      <span className="truncate">{post.venue}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                      <Shield size={15} className="text-gray-400" />
                      <span>Lv.{post.levelRequired} {levelLabel[post.levelRequired]} 이상</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[13px]">
                      <DollarSign size={15} className="text-gray-400" />
                      <span className={`font-semibold ${post.fee === 0 ? 'text-green-600' : 'text-gray-800'}`}>
                        {formatFee(post.fee)}
                      </span>
                    </div>
                  </div>

                  {post.notes && (
                    <p className="mt-2 text-[12px] text-gray-400 truncate">{post.notes}</p>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[12px] text-gray-400">
                      {post.count}명 모집
                    </span>
                    <button
                      onClick={() => handleApply(post.id)}
                      disabled={isApplied}
                      className={`rounded-xl px-5 py-2 text-[13px] font-semibold transition-colors ${
                        isApplied
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
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

      <div className="h-6" />
    </div>
  );
}
