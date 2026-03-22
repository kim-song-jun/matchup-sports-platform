'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Swords, ChevronRight } from 'lucide-react';

type TeamMatchStatus = 'recruiting' | 'approved' | 'completed' | 'cancelled';

interface TeamMatch {
  id: string;
  title: string;
  hostTeam: string;
  sportType: string;
  matchDate: string;
  status: TeamMatchStatus;
  applicationCount: number;
}

const mockTeamMatches: TeamMatch[] = [
  {
    id: 'TM-001',
    title: '주말 친선경기 모집합니다',
    hostTeam: 'FC 강남유나이티드',
    sportType: 'futsal',
    matchDate: '2026-03-28',
    status: 'recruiting',
    applicationCount: 3,
  },
  {
    id: 'TM-002',
    title: '실력 비슷한 팀 구합니다 (중급)',
    hostTeam: '마포 킥커즈',
    sportType: 'soccer',
    matchDate: '2026-03-29',
    status: 'recruiting',
    applicationCount: 5,
  },
  {
    id: 'TM-003',
    title: '토요일 오전 경쟁전',
    hostTeam: '서초 FC',
    sportType: 'futsal',
    matchDate: '2026-03-22',
    status: 'approved',
    applicationCount: 1,
  },
  {
    id: 'TM-004',
    title: '3월 리그전 2차',
    hostTeam: '용산 스트라이커즈',
    sportType: 'soccer',
    matchDate: '2026-03-15',
    status: 'completed',
    applicationCount: 4,
  },
  {
    id: 'TM-005',
    title: '금요일 저녁 친선전',
    hostTeam: '성동 유나이티드',
    sportType: 'futsal',
    matchDate: '2026-03-20',
    status: 'cancelled',
    applicationCount: 2,
  },
  {
    id: 'TM-006',
    title: '일요일 오후 매너 매치',
    hostTeam: '송파 FC',
    sportType: 'soccer',
    matchDate: '2026-03-30',
    status: 'recruiting',
    applicationCount: 0,
  },
];

const sportLabel: Record<string, string> = {
  futsal: '풋살', soccer: '축구', basketball: '농구', badminton: '배드민턴', ice_hockey: '아이스하키',
};

const statusLabel: Record<TeamMatchStatus, string> = {
  recruiting: '모집중', approved: '매칭완료', completed: '경기완료', cancelled: '취소됨',
};

const statusColor: Record<TeamMatchStatus, string> = {
  recruiting: 'bg-blue-50 text-blue-500',
  approved: 'bg-green-50 text-green-600',
  completed: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-50 text-red-500',
};

export default function AdminTeamMatchesPage() {
  const [search, setSearch] = useState('');

  const filtered = mockTeamMatches.filter((tm) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      tm.title.toLowerCase().includes(q) ||
      tm.hostTeam.toLowerCase().includes(q) ||
      tm.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px] text-gray-400 mb-4">
        <Link href="/admin/dashboard" className="hover:text-gray-600 transition-colors">관리자</Link>
        <ChevronRight size={12} />
        <span className="text-gray-700 font-medium">팀 매칭</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-bold text-gray-900">팀 매칭 관리</h1>
          <p className="text-[14px] text-gray-400 mt-1">팀 간 매칭 모집글을 관리하세요</p>
        </div>
        <div className="flex items-center gap-2">
          <Swords size={20} className="text-blue-500" />
          <span className="text-[14px] font-semibold text-gray-700">{mockTeamMatches.length}건</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="제목 또는 팀명으로 검색"
          className="w-full rounded-xl bg-gray-50 border border-gray-200 py-2.5 pl-9 pr-4 text-[14px] outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
        />
      </div>

      <p className="text-[13px] text-gray-400 mb-3">{filtered.length}건의 팀 매칭</p>

      {/* Table */}
      <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase whitespace-nowrap">ID</th>
                <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase whitespace-nowrap">제목</th>
                <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase whitespace-nowrap">호스트팀</th>
                <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase whitespace-nowrap">종목</th>
                <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase whitespace-nowrap">날짜</th>
                <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase whitespace-nowrap">상태</th>
                <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase whitespace-nowrap">신청수</th>
                <th className="px-5 py-3 text-[12px] font-semibold text-gray-500 uppercase whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((tm) => (
                <tr key={tm.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 text-[13px] font-mono text-gray-500">{tm.id}</td>
                  <td className="px-5 py-3.5">
                    <p className="text-[14px] font-medium text-gray-900 truncate max-w-[220px]">{tm.title}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-white text-[11px] font-black">
                        {tm.hostTeam.charAt(0)}
                      </div>
                      <span className="text-[13px] text-gray-700 whitespace-nowrap">{tm.hostTeam}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-gray-600 whitespace-nowrap">{sportLabel[tm.sportType] || tm.sportType}</td>
                  <td className="px-5 py-3.5 text-[13px] text-gray-600 whitespace-nowrap">{tm.matchDate}</td>
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${statusColor[tm.status]}`}>
                      {statusLabel[tm.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-gray-600 text-center">{tm.applicationCount}건</td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/team-matches/${tm.id}`}
                      className="flex items-center gap-1 text-[13px] font-medium text-blue-500 hover:text-blue-600 whitespace-nowrap"
                    >
                      상세
                      <ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <Swords size={24} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-[14px] text-gray-400">검색 조건에 맞는 팀 매칭이 없습니다</p>
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
