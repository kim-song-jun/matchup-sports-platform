'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserPlus, ChevronRight, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

type MercenaryStatus = 'recruiting' | 'closed' | 'completed';

interface MercenaryPost {
  id: string;
  teamName: string;
  sportType: string;
  position: string;
  matchDate: string;
  applicationCount: number;
  status: MercenaryStatus;
}

const mockMercenaries: MercenaryPost[] = [
  {
    id: 'MRC-001',
    teamName: 'FC 강남유나이티드',
    sportType: 'futsal',
    position: '골키퍼',
    matchDate: '2026-03-28',
    applicationCount: 4,
    status: 'recruiting',
  },
  {
    id: 'MRC-002',
    teamName: '마포 킥커즈',
    sportType: 'soccer',
    position: '공격수',
    matchDate: '2026-03-29',
    applicationCount: 7,
    status: 'recruiting',
  },
  {
    id: 'MRC-003',
    teamName: '서초 FC',
    sportType: 'futsal',
    position: '수비수',
    matchDate: '2026-03-22',
    applicationCount: 2,
    status: 'closed',
  },
  {
    id: 'MRC-004',
    teamName: '용산 스트라이커즈',
    sportType: 'soccer',
    position: '미드필더',
    matchDate: '2026-03-15',
    applicationCount: 5,
    status: 'completed',
  },
  {
    id: 'MRC-005',
    teamName: '성동 유나이티드',
    sportType: 'futsal',
    position: '윙어',
    matchDate: '2026-03-30',
    applicationCount: 1,
    status: 'recruiting',
  },
];

const sportLabel: Record<string, string> = {
  futsal: '풋살', soccer: '축구', basketball: '농구', badminton: '배드민턴', ice_hockey: '아이스하키',
};

const statusLabel: Record<MercenaryStatus, string> = {
  recruiting: '모집중', closed: '마감', completed: '완료',
};

const statusColor: Record<MercenaryStatus, string> = {
  recruiting: 'bg-blue-50 text-blue-500',
  closed: 'bg-gray-100 text-gray-500',
  completed: 'bg-green-50 text-green-600',
};

export default function AdminMercenaryPage() {
  const { toast } = useToast();
  const [posts, setPosts] = useState<MercenaryPost[]>(mockMercenaries);

  const handleDelete = (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    toast('success', '용병 모집글이 삭제되었어요');
  };

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px] text-gray-400 mb-4">
        <Link href="/admin/dashboard" className="hover:text-gray-600 transition-colors">관리자</Link>
        <ChevronRight size={12} />
        <span className="text-gray-700 font-medium">용병</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-bold text-gray-900">용병 관리</h1>
          <p className="text-[14px] text-gray-400 mt-1">용병 모집글을 관리하세요</p>
        </div>
        <div className="flex items-center gap-2">
          <UserPlus size={20} className="text-blue-500" />
          <span className="text-[14px] font-semibold text-gray-700">{posts.length}건</span>
        </div>
      </div>

      <p className="text-[13px] text-gray-400 mb-3">{posts.length}건의 용병 모집</p>

      {/* Table */}
      <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">ID</th>
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">팀명</th>
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">종목</th>
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">포지션</th>
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">날짜</th>
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">신청수</th>
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">상태</th>
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {posts.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 text-[13px] font-mono text-gray-500">{m.id}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-white text-[11px] font-black">
                        {m.teamName.charAt(0)}
                      </div>
                      <span className="text-[14px] font-medium text-gray-900 whitespace-nowrap">{m.teamName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-gray-600 whitespace-nowrap">{sportLabel[m.sportType] || m.sportType}</td>
                  <td className="px-5 py-3.5">
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[12px] font-semibold text-gray-700">
                      {m.position}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-gray-600 whitespace-nowrap">{m.matchDate}</td>
                  <td className="px-5 py-3.5 text-[13px] text-gray-600 text-center">{m.applicationCount}건</td>
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${statusColor[m.status]}`}>
                      {statusLabel[m.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {posts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <UserPlus size={24} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-[14px] text-gray-400">아직 용병 모집글이 없어요</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
