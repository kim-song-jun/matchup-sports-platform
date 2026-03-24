'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search, AlertCircle, ChevronRight, Clock, Filter,
} from 'lucide-react';

type DisputeType = 'no_show' | 'late' | 'level_mismatch' | 'misconduct';
type DisputeStatus = 'pending' | 'investigating' | 'resolved' | 'dismissed';

interface Dispute {
  id: string;
  reporterTeam: string;
  reportedTeam: string;
  matchDate: string;
  type: DisputeType;
  status: DisputeStatus;
  createdAt: string;
}

const mockDisputes: Dispute[] = [
  {
    id: 'D-001',
    reporterTeam: 'FC 강남유나이티드',
    reportedTeam: '서초 FC',
    matchDate: '2026-03-15',
    type: 'no_show',
    status: 'pending',
    createdAt: '2026-03-15',
  },
  {
    id: 'D-002',
    reporterTeam: '마포 킥커즈',
    reportedTeam: '용산 스트라이커즈',
    matchDate: '2026-03-12',
    type: 'misconduct',
    status: 'investigating',
    createdAt: '2026-03-12',
  },
  {
    id: 'D-003',
    reporterTeam: '성동 유나이티드',
    reportedTeam: 'FC 송파',
    matchDate: '2026-03-10',
    type: 'level_mismatch',
    status: 'resolved',
    createdAt: '2026-03-10',
  },
  {
    id: 'D-004',
    reporterTeam: '관악 FC',
    reportedTeam: '노원 블루스',
    matchDate: '2026-03-08',
    type: 'late',
    status: 'pending',
    createdAt: '2026-03-08',
  },
  {
    id: 'D-005',
    reporterTeam: '종로 드래곤즈',
    reportedTeam: '강서 유나이티드',
    matchDate: '2026-03-05',
    type: 'misconduct',
    status: 'dismissed',
    createdAt: '2026-03-06',
  },
  {
    id: 'D-006',
    reporterTeam: '동작 FC',
    reportedTeam: '영등포 스타즈',
    matchDate: '2026-03-01',
    type: 'no_show',
    status: 'resolved',
    createdAt: '2026-03-01',
  },
];

const typeLabel: Record<DisputeType, string> = {
  no_show: '노쇼', late: '지각', level_mismatch: '실력 차이', misconduct: '비매너',
};
const typeColor: Record<DisputeType, string> = {
  no_show: 'bg-red-50 text-red-600',
  late: 'bg-amber-50 text-amber-600',
  level_mismatch: 'bg-gray-100 text-gray-600',
  misconduct: 'bg-red-50 text-red-500',
};

const statusLabel: Record<DisputeStatus, string> = {
  pending: '대기중', investigating: '조사중', resolved: '해결됨', dismissed: '기각됨',
};
const statusColor: Record<DisputeStatus, string> = {
  pending: 'bg-gray-100 text-gray-600',
  investigating: 'bg-blue-50 text-blue-500',
  resolved: 'bg-green-50 text-green-500',
  dismissed: 'bg-gray-100 text-gray-500',
};

const statusFilters: { value: string; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '대기중' },
  { value: 'investigating', label: '조사중' },
  { value: 'resolved', label: '해결됨' },
  { value: 'dismissed', label: '기각됨' },
];

export default function AdminDisputesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = mockDisputes.filter((d) => {
    const matchesSearch = !search ||
      d.reporterTeam.toLowerCase().includes(search.toLowerCase()) ||
      d.reportedTeam.toLowerCase().includes(search.toLowerCase()) ||
      d.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = mockDisputes.filter((d) => d.status === 'pending').length;
  const investigatingCount = mockDisputes.filter((d) => d.status === 'investigating').length;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-bold text-gray-900">신고/분쟁 관리</h1>
          <p className="text-[14px] text-gray-400 mt-1">팀 간 분쟁과 신고를 처리하세요</p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600">
              <Clock size={14} />
              대기 {pendingCount}건
            </span>
          )}
          {investigatingCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1.5 text-[12px] font-semibold text-blue-600">
              <AlertCircle size={14} />
              조사중 {investigatingCount}건
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="팀명 또는 ID로 검색"
            className="w-full rounded-xl bg-gray-50 border border-gray-200 py-2.5 pl-9 pr-4 text-[14px] outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter size={14} className="text-gray-400" />
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
                statusFilter === f.value
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[13px] text-gray-400 mb-3">{filtered.length}건의 신고</p>

      <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">ID</th>
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">신고팀</th>
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">피신고팀</th>
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">매치일</th>
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">유형</th>
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">상태</th>
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap">신고일</th>
                <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 text-[13px] font-mono text-gray-500">{d.id}</td>
                  <td className="px-5 py-3.5">
                    <p className="text-[14px] font-medium text-gray-900 whitespace-nowrap">{d.reporterTeam}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="text-[14px] font-medium text-gray-900 whitespace-nowrap">{d.reportedTeam}</p>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-gray-600 whitespace-nowrap">{d.matchDate}</td>
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${typeColor[d.type]}`}>
                      {typeLabel[d.type]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${statusColor[d.status]}`}>
                      {statusLabel[d.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-gray-600 whitespace-nowrap">{d.createdAt}</td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/disputes/${d.id}`}
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
                    <AlertCircle size={24} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-[14px] text-gray-400">검색 조건에 맞는 신고가 없습니다</p>
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
