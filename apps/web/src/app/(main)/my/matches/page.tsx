'use client';

import { useState } from 'react';
import type { ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Calendar, Clock, Users, Pencil, Trash2, AlertTriangle, Info, Trophy, TrendingUp, TrendingDown, Minus, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { useMyMatches } from '@/hooks/use-api';
import { sportLabel } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20';

const softCard =
  'rounded-[24px] border border-slate-200/60 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/78 dark:shadow-black/10';

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

const mockParticipatedMatches = [
  { id: 'hist-1', title: '주말 풋살 친선전', sport: 'futsal', date: '2026-03-22', venue: '마포 풋살파크', result: 'win' as const, eloChange: +15, players: '5v5' },
  { id: 'hist-2', title: '배드민턴 복식 매치', sport: 'badminton', date: '2026-03-20', venue: '강남 배드민턴장', result: 'loss' as const, eloChange: -8, players: '2v2' },
  { id: 'hist-3', title: '농구 3:3 픽업', sport: 'basketball', date: '2026-03-18', venue: '잠실 실내체육관', result: 'win' as const, eloChange: +12, players: '3v3' },
  { id: 'hist-4', title: '축구 11인제 리그', sport: 'soccer', date: '2026-03-15', venue: '월드컵공원 축구장', result: 'draw' as const, eloChange: +2, players: '11v11' },
  { id: 'hist-5', title: '테니스 단식', sport: 'tennis', date: '2026-03-12', venue: '올림픽테니스장', result: 'win' as const, eloChange: +18, players: '1v1' },
];

const statusLabel: Record<string, { text: string; style: string }> = {
  open: { text: '모집중', style: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200' },
  full: { text: '마감', style: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200' },
  completed: { text: '완료', style: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  cancelled: { text: '취소됨', style: 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200' },
};

const resultConfig: Record<string, { text: string; style: string; icon: typeof TrendingUp }> = {
  win: { text: '승', style: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200', icon: TrendingUp },
  loss: { text: '패', style: 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200', icon: TrendingDown },
  draw: { text: '무', style: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: Minus },
};

function getDayLabel(dateStr: string) {
  return ['일', '월', '화', '수', '목', '금', '토'][new Date(dateStr).getDay()];
}

type Tab = 'participated' | 'created';

export default function MyMatchesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const { data: apiData } = useMyMatches();
  const usingMock = !apiData?.items;
  const apiMatches = apiData?.items?.map((match) => ({
    id: match.id,
    title: match.title,
    sportType: match.sportType,
    matchDate: match.matchDate,
    startTime: match.startTime,
    endTime: match.endTime,
    venue: match.venue?.name || '',
    currentPlayers: match.currentPlayers,
    maxPlayers: match.maxPlayers,
    fee: match.fee,
    status: match.status,
  }));
  const [localMatches, setLocalMatches] = useState(mockMyMatches);
  const matches = apiMatches ?? (process.env.NODE_ENV === 'development' ? localMatches : []);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('participated');

  if (!isAuthenticated) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={Trophy}
          title="로그인 후 매치 기록을 확인할 수 있어요"
          description="참가 이력과 운영한 매치를 이 화면에서 함께 관리합니다."
          action={{ label: '로그인', href: '/login' }}
        />
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    try {
      await api.patch(`/matches/${id}`, { status: 'cancelled' });
      setLocalMatches((previous) => previous.map((match) => (match.id === id ? { ...match, status: 'cancelled' } : match)));
      toast('success', '매치가 취소되었어요');
    } catch {
      toast('error', '취소하지 못했어요. 다시 시도해주세요');
    }

    setDeleteTarget(null);
  };

  const participatedData = process.env.NODE_ENV === 'development' ? mockParticipatedMatches : [];
  const totalWins = participatedData.filter((match) => match.result === 'win').length;
  const totalLosses = participatedData.filter((match) => match.result === 'loss').length;
  const totalDraws = participatedData.filter((match) => match.result === 'draw').length;
  const totalElo = participatedData.reduce((sum, match) => sum + match.eloChange, 0);
  const openMatches = matches.filter((match) => match.status === 'open').length;

  const summary = activeTab === 'participated'
    ? [
        { label: '전적', value: `${totalWins} / ${totalLosses} / ${totalDraws}` },
        { label: '총 매치', value: `${participatedData.length}경기` },
        { label: 'ELO 변동', value: `${totalElo >= 0 ? '+' : ''}${totalElo}` },
      ]
    : [
        { label: '운영 매치', value: `${matches.length}건` },
        { label: '모집중', value: `${openMatches}건` },
        { label: '누적 참가자', value: `${matches.reduce((sum, match) => sum + match.currentPlayers, 0)}명` },
      ];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <section className="px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} overflow-hidden p-6 sm:p-7`}>
          <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
            <div className="max-w-2xl">
              <div className="eyebrow-chip">
                <Trophy size={14} />
                MatchUp Match History
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                참가 기록과 운영 기록을 같은 밀도로 봅니다.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                전적과 ELO 흐름, 내가 연 매치의 모집 상태를 한 화면에서 전환하며 확인할 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => router.back()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <ArrowLeft size={14} />
                이전 화면
              </button>
              <Link
                href={activeTab === 'created' ? '/matches/new' : '/matches'}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/20 dark:bg-white dark:text-slate-950"
              >
                <Plus size={14} />
                {activeTab === 'created' ? '매치 만들기' : '매치 찾기'}
              </Link>
            </div>
          </div>

          <div className="mt-6 segmented-control scrollbar-hide overflow-x-auto pb-1">
            {([
              { key: 'participated' as Tab, label: '참가 매치' },
              { key: 'created' as Tab, label: '내가 만든 매치' },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`segmented-pill shrink-0 ${activeTab === tab.key ? 'is-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {summary.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {usingMock && (
        <section className="px-5 @3xl:px-0 mt-4">
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-400/10 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <Info size={15} className="shrink-0" />
              API 연동 전 샘플 데이터가 표시되고 있습니다.
            </div>
          </div>
        </section>
      )}

      <section className="px-5 @3xl:px-0 mt-4 pb-8">
        {activeTab === 'participated' ? (
          participatedData.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="참가한 매치가 없어요"
              description="첫 참가 기록이 생기면 여기서 흐름을 확인할 수 있어요."
              action={{ label: '매치 찾기', href: '/matches' }}
            />
          ) : (
            <div className="space-y-3 stagger-children">
              {participatedData.map((match) => {
                const result = resultConfig[match.result];
                const ResultIcon = result.icon;
                return (
                  <Link key={match.id} href={`/matches/${match.id}`} className={`${softCard} block p-4 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:hover:bg-slate-900`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {sportLabel[match.sport] || match.sport}
                        </span>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{match.players}</span>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${result.style}`}>
                        <ResultIcon size={12} />
                        {result.text}
                      </span>
                    </div>

                    <h3 className="mt-3 text-base font-semibold text-slate-950 dark:text-white">{match.title}</h3>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <InfoBox icon={Calendar} label="일정" value={`${match.date} (${getDayLabel(match.date)})`} />
                      <InfoBox icon={MapPin} label="장소" value={match.venue} />
                      <InfoBox
                        icon={Trophy}
                        label="레이팅 변동"
                        value={`${match.eloChange >= 0 ? '+' : ''}${match.eloChange} ELO`}
                        valueClassName={match.eloChange >= 0 ? 'text-blue-600 dark:text-blue-300' : 'text-rose-600 dark:text-rose-300'}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        ) : matches.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="만든 매치가 없어요"
            description="첫 매치를 열어 모집과 운영 경험을 시작해보세요."
            action={{ label: '매치 만들기', href: '/matches/new' }}
          />
        ) : (
          <div className="space-y-3 stagger-children">
            {matches.map((match) => {
              const status = statusLabel[match.status] || statusLabel.open;
              return (
                <div key={match.id} className={`${softCard} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {sportLabel[match.sportType]}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.style}`}>
                        {status.text}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-950 dark:text-white">{formatCurrency(match.fee)}</span>
                  </div>

                  <Link href={`/matches/${match.id}`}>
                    <h3 className="mt-3 text-base font-semibold text-slate-950 transition-colors hover:text-blue-600 dark:text-white dark:hover:text-blue-300">
                      {match.title}
                    </h3>
                  </Link>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <InfoBox icon={Calendar} label="일정" value={`${match.matchDate} (${getDayLabel(match.matchDate)})`} />
                    <InfoBox icon={Clock} label="시간" value={`${match.startTime} ~ ${match.endTime}`} />
                    <InfoBox icon={MapPin} label="장소" value={match.venue} />
                    <InfoBox icon={Users} label="참가자" value={`${match.currentPlayers}/${match.maxPlayers}명`} />
                  </div>

                  {match.status !== 'cancelled' && match.status !== 'completed' && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/matches/${match.id}/edit`}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
                      >
                        <Pencil size={14} />
                        수정
                      </Link>
                      <button
                        onClick={() => setDeleteTarget(match.id)}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-950/30"
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
        )}
      </section>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-xl dark:bg-slate-950">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-400/10">
              <AlertTriangle size={24} className="text-rose-500" />
            </div>
            <h3 className="text-center text-lg font-bold text-slate-950 dark:text-white">매치를 취소하시겠어요?</h3>
            <p className="mt-2 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
              취소하면 참가자들에게 알림이 발송되며, 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-full bg-slate-100 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                돌아가기
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 rounded-full bg-rose-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-rose-600"
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

function InfoBox({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
        <Icon size={12} />
        {label}
      </div>
      <p className={`mt-2 text-sm font-medium text-slate-700 dark:text-slate-200 ${valueClassName || ''}`}>{value}</p>
    </div>
  );
}
