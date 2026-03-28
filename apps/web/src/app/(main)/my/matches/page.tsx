'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Calendar, Clock, Users, Pencil, Trash2, AlertTriangle, Info, Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { useMyMatches } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';

/* ── "내가 만든 매치" mock data ── */
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

/* ── "참가 매치" mock data ── */
const mockParticipatedMatches = [
  { id: 'hist-1', title: '주말 풋살 친선전', sport: 'futsal', date: '2026-03-22', venue: '마포 풋살파크', result: 'win' as const, eloChange: +15, players: '5v5' },
  { id: 'hist-2', title: '배드민턴 복식 매치', sport: 'badminton', date: '2026-03-20', venue: '강남 배드민턴장', result: 'loss' as const, eloChange: -8, players: '2v2' },
  { id: 'hist-3', title: '농구 3:3 픽업', sport: 'basketball', date: '2026-03-18', venue: '잠실 실내체육관', result: 'win' as const, eloChange: +12, players: '3v3' },
  { id: 'hist-4', title: '축구 11인제 리그', sport: 'soccer', date: '2026-03-15', venue: '월드컵공원 축구장', result: 'draw' as const, eloChange: +2, players: '11v11' },
  { id: 'hist-5', title: '테니스 단식', sport: 'tennis', date: '2026-03-12', venue: '올림픽테니스장', result: 'win' as const, eloChange: +18, players: '1v1' },
];

const statusLabel: Record<string, { text: string; style: string }> = {
  open: { text: '모집중', style: 'bg-gray-100 text-gray-500' },
  full: { text: '마감', style: 'bg-gray-100 text-gray-600' },
  completed: { text: '완료', style: 'text-blue-500' },
  cancelled: { text: '취소됨', style: 'bg-red-50 text-red-500' },
};

const resultConfig: Record<string, { text: string; style: string; icon: typeof TrendingUp }> = {
  win:  { text: '승', style: 'bg-blue-50 text-blue-600 border-blue-100', icon: TrendingUp },
  loss: { text: '패', style: 'bg-red-50 text-red-500 border-red-100', icon: TrendingDown },
  draw: { text: '무', style: 'bg-gray-100 text-gray-500 border-gray-200', icon: Minus },
};

function getDayLabel(dateStr: string) {
  return ['일','월','화','수','목','금','토'][new Date(dateStr).getDay()];
}

type Tab = 'participated' | 'created';

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
  const matches = apiMatches ?? (process.env.NODE_ENV === 'development' ? localMatches : []);
  const setMatches = setLocalMatches;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('participated');

  if (!isAuthenticated) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-md font-medium text-gray-700 dark:text-gray-200">로그인이 필요합니다</p>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-blue-500 px-6 py-2.5 text-base font-bold text-white">로그인</Link>
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

  /* ── Participated data with dev guard ── */
  const participatedData = process.env.NODE_ENV === 'development' ? mockParticipatedMatches : [];

  /* ── Stats summary for participated tab ── */
  const totalWins = participatedData.filter(m => m.result === 'win').length;
  const totalLosses = participatedData.filter(m => m.result === 'loss').length;
  const totalDraws = participatedData.filter(m => m.result === 'draw').length;
  const totalElo = participatedData.reduce((sum, m) => sum + m.eloChange, 0);

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      {/* Header */}
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">매치 히스토리</h1>
      </header>
      <div className="hidden lg:block mb-2 px-5 lg:px-0 pt-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">매치 히스토리</h2>
        <p className="text-base text-gray-500 mt-1">참가 기록과 내가 만든 매치를 확인하세요</p>
      </div>

      {/* Tabs */}
      <div className="px-5 lg:px-0 pt-3 pb-1">
        <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-700 p-1">
          {([
            { key: 'participated' as Tab, label: '참가 매치' },
            { key: 'created' as Tab, label: '내가 만든 매치' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 rounded-lg py-2.5 text-base font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {usingMock && (
        <div className="mx-5 lg:mx-0 mt-3 mb-1 flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-700 px-4 py-2.5">
          <Info size={16} className="text-gray-500 shrink-0" />
          <span className="text-sm text-gray-500">API 연동 전 샘플 데이터가 표시되고 있습니다</span>
        </div>
      )}

      {/* ── Tab: 참가 매치 ── */}
      {activeTab === 'participated' && (
        <div className="px-5 lg:px-0 pb-8">
          {/* Stats bar */}
          <div className="mt-3 mb-4 flex items-center gap-3">
            <div className="flex-1 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3 text-center">
              <p className="text-xs font-medium text-gray-500">전적</p>
              <p className="text-md font-bold text-gray-900 dark:text-white mt-0.5">
                <span className="text-blue-500">{totalWins}</span>
                <span className="text-gray-300 mx-0.5">/</span>
                <span className="text-red-400">{totalLosses}</span>
                <span className="text-gray-300 mx-0.5">/</span>
                <span className="text-gray-500">{totalDraws}</span>
              </p>
            </div>
            <div className="flex-1 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3 text-center">
              <p className="text-xs font-medium text-gray-500">총 매치</p>
              <p className="text-md font-bold text-gray-900 dark:text-white mt-0.5">{participatedData.length}경기</p>
            </div>
            <div className="flex-1 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3 text-center">
              <p className="text-xs font-medium text-gray-500">ELO 변동</p>
              <p className={`text-md font-bold mt-0.5 ${totalElo >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                {totalElo >= 0 ? '+' : ''}{totalElo}
              </p>
            </div>
          </div>

          {/* Participated match cards */}
          <div className="space-y-3 stagger-children">
            {participatedData.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="참가한 매치가 없어요"
                description="매치에 참가해보세요"
                action={{ label: '매치 찾기', href: '/matches' }}
              />
            ) : (
              participatedData.map((match) => {
                const rc = resultConfig[match.result];
                const ResultIcon = rc.icon;
                return (
                  <Link key={match.id} href={`/matches/${match.id}`} className="block">
                    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 hover:border-gray-200 transition-[colors,transform] active:scale-[0.995]">
                      <div className="flex items-start justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-500">
                            {sportLabel[match.sport] || match.sport}
                          </span>
                          <span className="text-xs font-medium text-gray-500">{match.players}</span>
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold ${rc.style}`}>
                          <ResultIcon size={13} />
                          {rc.text}
                        </span>
                      </div>

                      <h3 className="text-md font-semibold text-gray-900 dark:text-white truncate">{match.title}</h3>

                      <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {match.date} ({getDayLabel(match.date)})
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />
                          {match.venue}
                        </span>
                      </div>

                      {/* ELO change */}
                      <div className="mt-3 flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
                        <Trophy size={14} className="text-gray-500" />
                        <span className="text-sm text-gray-500">레이팅 변동</span>
                        <span className={`ml-auto text-base font-bold ${match.eloChange >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                          {match.eloChange >= 0 ? '+' : ''}{match.eloChange} ELO
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Tab: 내가 만든 매치 ── */}
      {activeTab === 'created' && (
        <div className="px-5 lg:px-0 space-y-3 pb-8 mt-3 stagger-children">
          {matches.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="만든 매치가 없어요"
              description="첫 매치를 만들어보세요"
              action={{ label: '매치 만들기', href: '/matches/new' }}
            />
          ) : (
            matches.map((match) => {
              const st = statusLabel[match.status] || statusLabel.open;
              return (
                <div key={match.id} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-500">
                        {sportLabel[match.sportType]}
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${st.style}`}>
                        {st.text}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(match.fee)}</span>
                  </div>

                  <Link href={`/matches/${match.id}`}>
                    <h3 className="text-md font-semibold text-gray-900 dark:text-white hover:text-blue-500 transition-colors truncate">{match.title}</h3>
                  </Link>

                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Calendar size={13} />
                      <span>{match.matchDate} ({getDayLabel(match.matchDate)})</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Clock size={13} />
                      <span>{match.startTime} ~ {match.endTime}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <MapPin size={13} />
                      <span>{match.venue}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Users size={13} />
                      <span>{match.currentPlayers}/{match.maxPlayers}명</span>
                    </div>
                  </div>

                  {match.status !== 'cancelled' && match.status !== 'completed' && (
                    <div className="mt-3 flex gap-2">
                      <Link
                        href={`/matches/${match.id}/edit`}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Pencil size={14} />
                        수정
                      </Link>
                      <button
                        onClick={() => setDeleteTarget(match.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-50 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-100 transition-colors"
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
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">매치를 취소하시겠어요?</h3>
            <p className="text-base text-gray-500 text-center mt-2">취소하면 참가자들에게 알림이 발송돼요. 이 작업은 되돌릴 수 없어요.</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 transition-colors"
              >
                돌아가기
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 transition-colors"
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
