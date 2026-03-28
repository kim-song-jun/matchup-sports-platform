'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, MapPin, Pencil, Trash2, AlertTriangle, UserCheck, Info } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { useMercenaryPosts } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';

const mockMercenaryPosts = [
  {
    id: 'merc-1',
    title: '토요일 풋살 용병 1명 급구',
    sportType: 'futsal',
    matchDate: '2026-03-28',
    startTime: '14:00',
    endTime: '16:00',
    venue: '강남 풋살파크',
    fee: 10000,
    status: 'open',
    applicants: 2,
  },
  {
    id: 'merc-2',
    title: '농구 3:3 용병 모집',
    sportType: 'basketball',
    matchDate: '2026-04-01',
    startTime: '19:00',
    endTime: '21:00',
    venue: '잠실 실내체육관',
    fee: 0,
    status: 'closed',
    applicants: 4,
  },
];

function formatCurrency(n: number) {
  return n === 0 ? '무료' : new Intl.NumberFormat('ko-KR').format(n) + '원';
}

export default function MyMercenaryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const { data: apiData } = useMercenaryPosts();
  const usingMock = !apiData?.items;
  const apiPosts = apiData?.items?.map((p) => ({
    id: p.id,
    title: p.description || '용병 모집',
    sportType: p.sportType,
    matchDate: p.matchDate,
    startTime: '',
    endTime: '',
    venue: '',
    fee: 0,
    status: p.status,
    applicants: 0,
  }));
  const [localPosts, setLocalPosts] = useState(mockMercenaryPosts);
  const posts = apiPosts ?? localPosts;
  const setPosts = setLocalPosts;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-md font-medium text-gray-700">로그인이 필요합니다</p>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-blue-500 px-6 py-2.5 text-base font-bold text-white">로그인</Link>
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/mercenary/${id}`);
      setPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'cancelled' } : p));
      toast('success', '모집글이 취소되었어요');
    } catch {
      toast('error', '취소하지 못했어요. 다시 시도해주세요');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-xl p-2 -ml-2 hover:bg-gray-100 active:scale-[0.98] transition-[colors,transform] min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">내 용병 모집</h1>
      </header>
      <div className="hidden lg:block mb-6 px-5 lg:px-0 pt-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">내 용병 모집</h2>
        <p className="text-base text-gray-500 mt-1">용병 모집글을 관리하세요</p>
      </div>

      {usingMock && (
        <div className="mx-5 lg:mx-0 mb-3 flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-700 px-4 py-2.5">
          <Info size={16} className="text-gray-500 shrink-0" />
          <span className="text-sm text-gray-500">API 연동 전 샘플 데이터가 표시되고 있습니다</span>
        </div>
      )}

      <div className="px-5 lg:px-0 space-y-3 pb-8">
        {posts.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="용병 모집글이 없어요"
            description="용병을 모집해보세요"
            action={{ label: '용병 모집하기', href: '/mercenary/new' }}
          />
        ) : posts.map((post) => (
          <div key={post.id} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                {sportLabel[post.sportType]}
              </span>
              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                post.status === 'open' ? 'text-blue-500' :
                post.status === 'closed' ? 'bg-gray-100 text-gray-500' :
                'bg-red-50 text-red-500'
              }`}>
                {post.status === 'open' ? '모집중' : post.status === 'closed' ? '마감' : '취소됨'}
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white ml-auto">{formatCurrency(post.fee)}</span>
            </div>

            <Link href={`/mercenary`}>
              <h3 className="text-md font-semibold text-gray-900 dark:text-white hover:text-blue-500 transition-colors truncate">{post.title}</h3>
            </Link>

            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <Calendar size={13} /><span>{post.matchDate}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <Clock size={13} /><span>{post.startTime} ~ {post.endTime}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <MapPin size={13} /><span>{post.venue}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-blue-500">
                <UserCheck size={13} /><span>신청 {post.applicants}명</span>
              </div>
            </div>

            {post.status === 'open' && (
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/mercenary/${post.id}/edit`}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 dark:bg-gray-700 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <Pencil size={14} />
                  수정
                </Link>
                <button
                  onClick={() => setDeleteTarget(post.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-50 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={14} />
                  취소
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">모집글을 취소하시겠어요?</h3>
            <p className="text-base text-gray-500 text-center mt-2">취소하면 신청한 용병들에게 알림이 발송돼요.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl bg-gray-100 py-3 text-base font-semibold text-gray-700 hover:bg-gray-200 transition-colors">돌아가기</button>
              <button onClick={() => handleDelete(deleteTarget)} className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 transition-colors">취소하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
