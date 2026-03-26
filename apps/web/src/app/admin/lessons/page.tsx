'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GraduationCap, Pencil } from 'lucide-react';
import { useAdminLessons } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { AdminToolbar, downloadCSV } from '@/components/admin/admin-toolbar';
import type { Lesson } from '@/types/api';

const typeLabel: Record<string, string> = { group_lesson: '그룹 레슨', practice_match: '연습 경기', free_practice: '자유 연습', clinic: '클리닉' };
const statusLabel: Record<string, string> = { open: '진행중', closed: '마감', completed: '완료', cancelled: '취소' };
const statusColor: Record<string, string> = { open: 'bg-green-50 text-green-600', closed: 'bg-gray-100 text-gray-500', completed: 'bg-blue-50 text-blue-600', cancelled: 'bg-red-50 text-red-500' };

function formatDate(d: string) { return new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }); }
function formatCurrency(n: number) { return n === 0 ? '무료' : new Intl.NumberFormat('ko-KR').format(n) + '원'; }

export default function AdminLessonsPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const router = useRouter();
  const { data, isLoading } = useAdminLessons();
  const { toast } = useToast();

  const lessons = Array.isArray(data) ? data : [];
  const filtered = lessons
    .filter((l: Lesson) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return l.title.toLowerCase().includes(q) || l.host?.nickname?.toLowerCase().includes(q);
    })
    .filter((l: Lesson) => {
      if (filter === 'all') return true;
      if (filter === 'active') return l.status === 'open';
      if (filter === 'completed') return l.status === 'completed';
      if (filter === 'cancelled') return l.status === 'cancelled';
      return true;
    });

  const handleDownload = () => {
    downloadCSV(
      filtered.map((l: Lesson) => ({
        제목: l.title,
        종목: l.sportType,
        타입: typeLabel[l.type] || l.type,
        일시: `${formatDate(l.lessonDate)} ${l.startTime}`,
        인원: `${l.currentParticipants}/${l.maxParticipants}`,
        참가비: formatCurrency(l.fee),
        상태: statusLabel[l.status] || l.status,
      })),
      'lessons',
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-bold text-gray-900">강좌 관리</h1>
          <p className="text-[14px] text-gray-400 mt-1">등록된 강좌를 관리하세요</p>
        </div>
        <Link href="/lessons" className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-blue-600">
          <GraduationCap size={16} /> 강좌 등록
        </Link>
      </div>

      <AdminToolbar
        search={{ value: search, onChange: setSearch, placeholder: '강좌명 또는 코치명 검색' }}
        filters={[
          { key: 'all', label: '전체' },
          { key: 'active', label: '진행중' },
          { key: 'completed', label: '완료' },
          { key: 'cancelled', label: '취소' },
        ]}
        activeFilter={filter}
        onFilterChange={setFilter}
        count={filtered.length}
        countLabel="건의 강좌"
        onDownload={handleDownload}
      />

      <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">강좌명</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">유형</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">일시</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">인원</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">수강료</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">상태</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">등록자</th>
              <th className="px-5 py-3 text-[12px] font-medium text-gray-500 uppercase">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? Array.from({length:3}).map((_,i) => (
              <tr key={i}><td colSpan={8} className="px-5 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
            )) : filtered.map((l: Lesson) => (
              <tr key={l.id} className="hover:bg-gray-50 transition-colors cursor-pointer" role="link" tabIndex={0} onClick={() => router.push(`/admin/lessons/${l.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/admin/lessons/${l.id}`); }}>
                <td className="px-5 py-3.5">
                  <p className="text-[14px] font-medium text-gray-900 truncate max-w-[200px]">{l.title}</p>
                  <p className="text-[11px] text-gray-400">{l.sportType} · {l.venueName}</p>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{typeLabel[l.type] || l.type}</td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{formatDate(l.lessonDate)} {l.startTime}</td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{l.currentParticipants}/{l.maxParticipants}</td>
                <td className="px-5 py-3.5 text-[13px] text-gray-800 font-medium">{formatCurrency(l.fee)}</td>
                <td className="px-5 py-3.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor[l.status] || 'bg-gray-100'}`}>{statusLabel[l.status] || l.status}</span>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-gray-600">{l.host?.nickname}</td>
                <td className="px-5 py-3.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); toast('info', '강좌 수정 페이지 준비 중입니다'); }}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:text-blue-500 transition-colors"
                  >
                    <Pencil size={12} />
                    수정
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center">
                  <GraduationCap size={24} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-[14px] text-gray-400">아직 등록된 강좌가 없어요</p>
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
