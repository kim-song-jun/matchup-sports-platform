'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, MapPin, Users, Pencil, Trash2, AlertTriangle, Eye } from 'lucide-react';

const mockTeamMatches = [
  {
    id: 'tm-1',
    title: '주말 풋살 팀매치 모집',
    sportType: 'futsal',
    matchDate: '2026-04-05',
    startTime: '15:00',
    endTime: '17:00',
    venue: '잠실 풋살파크',
    teamName: 'FC 서울라이트',
    status: 'recruiting',
    applicants: 3,
  },
  {
    id: 'tm-2',
    title: '농구 3:3 팀전 상대 구합니다',
    sportType: 'basketball',
    matchDate: '2026-04-12',
    startTime: '19:00',
    endTime: '21:00',
    venue: '강남 실내체육관',
    teamName: '강남 슬래머즈',
    status: 'matched',
    applicants: 5,
  },
];

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키',
};

const statusLabel: Record<string, { text: string; style: string }> = {
  recruiting: { text: '모집중', style: 'bg-blue-50 text-blue-600' },
  matched: { text: '매칭완료', style: 'bg-green-50 text-green-600' },
  cancelled: { text: '취소됨', style: 'bg-red-50 text-red-500' },
};

export default function MyTeamMatchesPage() {
  const router = useRouter();
  const [posts, setPosts] = useState(mockTeamMatches);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, status: 'cancelled' } : p));
    setDeleteTarget(null);
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button onClick={() => router.back()} className="rounded-lg p-1.5 -ml-1.5">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">내 팀 매칭 모집글</h1>
      </header>
      <div className="hidden lg:block mb-6 px-5 lg:px-0 pt-4">
        <h2 className="text-[24px] font-bold text-gray-900">내 팀 매칭 모집글</h2>
        <p className="text-[14px] text-gray-400 mt-1">팀 매칭 모집 현황을 관리하세요</p>
      </div>

      <div className="px-5 lg:px-0 space-y-3 pb-8">
        {posts.map((post) => {
          const st = statusLabel[post.status] || statusLabel.recruiting;
          return (
            <div key={post.id} className="rounded-2xl bg-white border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-500">
                  {sportLabel[post.sportType]}
                </span>
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${st.style}`}>
                  {st.text}
                </span>
                <span className="text-[12px] text-gray-400 ml-auto">{post.teamName}</span>
              </div>

              <Link href={`/team-matches/${post.id}`}>
                <h3 className="text-[15px] font-semibold text-gray-900 hover:text-blue-500 transition-colors">{post.title}</h3>
              </Link>

              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                  <Calendar size={13} /><span>{post.matchDate}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                  <Clock size={13} /><span>{post.startTime} ~ {post.endTime}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                  <MapPin size={13} /><span>{post.venue}</span>
                </div>
              </div>

              {post.status !== 'cancelled' && (
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/team-matches/${post.id}`}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-4 py-2.5 text-[13px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
                  >
                    <Eye size={14} />
                    신청현황
                    <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[11px] font-bold text-white">{post.applicants}</span>
                  </Link>
                  <button
                    onClick={() => router.push(`/team-matches/${post.id}`)}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 px-4 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Pencil size={14} />
                    수정
                  </button>
                  <button
                    onClick={() => setDeleteTarget(post.id)}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-red-50 px-4 py-2.5 text-[13px] font-semibold text-red-500 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={14} />
                    취소
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 className="text-[17px] font-bold text-gray-900 text-center">모집글을 취소하시겠어요?</h3>
            <p className="text-[14px] text-gray-500 text-center mt-2">취소하면 신청한 팀들에게 알림이 발송됩니다.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl bg-gray-100 py-3 text-[14px] font-semibold text-gray-700">돌아가기</button>
              <button onClick={() => handleDelete(deleteTarget)} className="flex-1 rounded-xl bg-red-500 py-3 text-[14px] font-semibold text-white">취소하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
