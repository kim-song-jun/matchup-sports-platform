'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Calendar, Clock, Users, Pencil, Trash2, AlertTriangle, Info } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { useMyMatches } from '@/hooks/use-api';

const mockMyMatches = [
  {
    id: 'match-1',
    title: '강남 풋살파크 주말 매치',
    sportType: 'futsal',
    matchDate: '2026-03-28',
    startTime: '14:00',
    endTime: '16:00',
    venue: '강남 풋살파크 A구장',
    currentPlayers: 8,
    maxPlayers: 10,
    fee: 15000,
    status: 'open',
  },
  {
    id: 'match-2',
    title: '잠실 농구 픽업게임',
    sportType: 'basketball',
    matchDate: '2026-03-30',
    startTime: '19:00',
    endTime: '21:00',
    venue: '잠실 실내체육관',
    currentPlayers: 6,
    maxPlayers: 10,
    fee: 10000,
    status: 'open',
  },
  {
    id: 'match-3',
    title: '배드민턴 복식 매치',
    sportType: 'badminton',
    matchDate: '2026-03-22',
    startTime: '10:00',
    endTime: '12:00',
    venue: '마포 배드민턴장',
    currentPlayers: 4,
    maxPlayers: 4,
    fee: 8000,
    status: 'completed',
  },
];

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};

const statusLabel: Record<string, { text: string; style: string }> = {
  open: { text: '모집중', style: 'bg-blue-50 text-blue-600' },
  full: { text: '마감', style: 'bg-gray-100 text-gray-600' },
  completed: { text: '완료', style: 'bg-green-50 text-green-600' },
  cancelled: { text: '취소됨', style: 'bg-red-50 text-red-500' },
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n) + '원';
}

export default function MyMatchesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const { data: apiData } = useMyMatches();
  const usingMock = !apiData?.items;
  const apiMatches = apiData?.items?.map((m) => ({
    id: m.id,
    title: m.title,
    sportType: m.sportType,
    matchDate: m.matchDate,
    startTime: m.startTime,
    endTime: m.endTime,
    venue: m.venue?.name || '',
    currentPlayers: m.currentPlayers,
    maxPlayers: m.maxPlayers,
    fee: m.fee,
    status: m.status,
  }));
  const [localMatches, setLocalMatches] = useState(mockMyMatches);
  const matches = apiMatches ?? localMatches;
  const setMatches = setLocalMatches;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-[15px] font-medium text-gray-700">로그인이 필요합니다</p>
        <Link href="/login" className="mt-4 inline-block rounded-lg bg-blue-500 px-6 py-2.5 text-[14px] font-semibold text-white">로그인</Link>
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    try {
      await api.patch(`/matches/${id}`, { status: 'cancelled' });
      setMatches(prev => prev.map(m => m.id === id ? { ...m, status: 'cancelled' } : m));
      toast('success', '매치가 취소되었어요');
    } catch {
      toast('error', '취소하지 못했어요. 다시 시도해주세요');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-lg p-2 -ml-2 hover:bg-gray-100 active:scale-[0.98] transition-all min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">내가 만든 매치</h1>
      </header>
      <div className="hidden lg:block mb-6 px-5 lg:px-0 pt-4">
        <h2 className="text-[22px] font-bold text-gray-900">내가 만든 매치</h2>
        <p className="text-[14px] text-gray-400 mt-1">내가 생성한 매치를 관리하세요</p>
      </div>

      {usingMock && (
        <div className="mx-5 lg:mx-0 mb-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-2.5">
          <Info size={16} className="text-amber-500 shrink-0" />
          <span className="text-[13px] text-amber-700">API 연동 전 샘플 데이터가 표시되고 있습니다</span>
        </div>
      )}

      <div className="px-5 lg:px-0 space-y-3 pb-8">
        {matches.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 p-16 text-center">
            <Calendar size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-600">만든 매치가 없어요</p>
          </div>
        ) : (
          matches.map((match) => {
            const st = statusLabel[match.status] || statusLabel.open;
            return (
              <div key={match.id} className="rounded-2xl bg-white border border-gray-100 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-500">
                      {sportLabel[match.sportType]}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${st.style}`}>
                      {st.text}
                    </span>
                  </div>
                  <span className="text-[13px] font-semibold text-gray-900">{formatCurrency(match.fee)}</span>
                </div>

                <Link href={`/matches/${match.id}`}>
                  <h3 className="text-[15px] font-semibold text-gray-900 hover:text-blue-500 transition-colors">{match.title}</h3>
                </Link>

                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                    <Calendar size={13} />
                    <span>{match.matchDate} ({['일','월','화','수','목','금','토'][new Date(match.matchDate).getDay()]})</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                    <Clock size={13} />
                    <span>{match.startTime} ~ {match.endTime}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                    <MapPin size={13} />
                    <span>{match.venue}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                    <Users size={13} />
                    <span>{match.currentPlayers}/{match.maxPlayers}명</span>
                  </div>
                </div>

                {match.status !== 'cancelled' && match.status !== 'completed' && (
                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`/matches/${match.id}/edit`}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil size={14} />
                      수정
                    </Link>
                    <button
                      onClick={() => setDeleteTarget(match.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-50 py-2.5 text-[13px] font-semibold text-red-500 hover:bg-red-100 transition-colors"
                    >
                      <Trash2 size={14} />
                      취소
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 className="text-[17px] font-bold text-gray-900 text-center">매치를 취소하시겠어요?</h3>
            <p className="text-[14px] text-gray-500 text-center mt-2">취소하면 참가자들에게 알림이 발송돼요. 이 작업은 되돌릴 수 없어요.</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl bg-gray-100 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
              >
                돌아가기
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 rounded-xl bg-red-500 py-3 text-[14px] font-semibold text-white hover:bg-red-600 transition-colors"
              >
                취소하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
