'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useMyTeams, useCreateMercenaryPost } from '@/hooks/use-api';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { formatCurrency } from '@/lib/utils';

const positionOptions = [
  { value: 'GK', label: '골키퍼 (GK)' },
  { value: 'DF', label: '수비수 (DF)' },
  { value: 'MF', label: '미드필더 (MF)' },
  { value: 'FW', label: '공격수 (FW)' },
  { value: 'ALL', label: '포지션 무관' },
];

const levelOptions = [
  { value: 1, label: '입문' },
  { value: 2, label: '초급' },
  { value: 3, label: '중급' },
  { value: 4, label: '상급' },
  { value: 5, label: '고수' },
];

const countOptions = [1, 2, 3, 4, 5];

interface FormData {
  teamId: string;
  matchDate: string;
  startTime: string;
  venue: string;
  position: string;
  count: number;
  levelRequired: number;
  fee: string;
  notes: string;
}

const initialForm: FormData = {
  teamId: '',
  matchDate: '',
  startTime: '',
  venue: '',
  position: '',
  count: 1,
  levelRequired: 3,
  fee: '0',
  notes: '',
};

export default function NewMercenaryPage() {
  const router = useRouter();
  const { toast } = useToast();
  useRequireAuth();

  const { data: myTeams, isLoading: teamsLoading } = useMyTeams();
  const createMutation = useCreateMercenaryPost();
  const [form, setForm] = useState<FormData>(initialForm);
  const [submitted, setSubmitted] = useState(false);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit =
    !!form.teamId &&
    !!form.matchDate &&
    !!form.startTime &&
    !!form.venue &&
    !!form.position;

  function handleSubmit() {
    if (!canSubmit) return;
    createMutation.mutate(
      {
        teamId: form.teamId,
        matchDate: form.matchDate,
        startTime: form.startTime,
        venue: form.venue,
        position: form.position,
        count: form.count,
        level: form.levelRequired,
        fee: Number(form.fee) || 0,
        notes: form.notes || undefined,
      } as unknown as Parameters<typeof createMutation.mutate>[0],
      {
        onSuccess: () => {
          toast('success', '용병 모집글이 등록되었어요');
          setSubmitted(true);
          setTimeout(() => router.push('/mercenary'), 1200);
        },
        onError: () => {
          toast('error', '등록에 실패했어요. 잠시 후 다시 시도해주세요');
        },
      },
    );
  }

  if (submitted) {
    return (
      <div className="pt-[var(--safe-area-top)] animate-fade-in">
        <div className="flex flex-col items-center justify-center py-32 px-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 dark:bg-green-900/20 mb-4">
            <Check size={28} className="text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">모집글이 등록되었어요</h2>
          <p className="text-base text-gray-500 dark:text-gray-400">용병 모집 목록에서 확인할 수 있습니다</p>
        </div>
      </div>
    );
  }

  // No teams guard
  if (!teamsLoading && (!myTeams || myTeams.length === 0)) {
    return (
      <div className="pt-[var(--safe-area-top)] animate-fade-in px-5 @3xl:px-0">
        <header className="@3xl:hidden flex items-center gap-3 py-3 border-b border-gray-50 dark:border-gray-800 mb-4">
          <button
            aria-label="뒤로 가기"
            onClick={() => router.back()}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">용병 모집하기</h1>
        </header>
        <EmptyState
          icon={Users}
          title="팀을 먼저 만들어주세요"
          description="용병 모집은 소속된 팀이 있어야 가능합니다"
          action={{ label: '팀 만들기', href: '/teams/new' }}
        />
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      {/* Header */}
      <header className="@3xl:hidden px-5 pt-4 pb-3 flex items-center gap-3 border-b border-gray-50 dark:border-gray-800">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.98] transition-[colors,transform] min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">용병 모집하기</h1>
      </header>

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6 px-5 @3xl:px-0 pt-4">
        <Link href="/mercenary" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">용병 모집</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-200">새 모집글</span>
      </div>

      <div className="px-5 @3xl:px-0 @3xl:max-w-[700px] pb-8">
        <div className="space-y-5 mt-4">
          {/* 팀 선택 */}
          <div>
            <label htmlFor="merc-team" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              팀 선택 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                id="merc-team"
                value={form.teamId}
                onChange={(e) => update('teamId', e.target.value)}
                className="w-full appearance-none rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-3.5 text-base text-gray-900 dark:text-white bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 dark:focus:border-blue-500 transition-colors min-h-[44px]"
              >
                <option value="">팀을 선택하세요</option>
                {teamsLoading ? (
                  <option disabled>불러오는 중...</option>
                ) : (
                  myTeams?.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))
                )}
              </select>
              <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 경기 날짜 */}
          <div>
            <label htmlFor="merc-match-date" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              경기 날짜 <span className="text-red-500">*</span>
            </label>
            <input
              id="merc-match-date"
              type="date"
              value={form.matchDate}
              onChange={(e) => update('matchDate', e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-3.5 text-base text-gray-900 dark:text-white bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 dark:focus:border-blue-500 transition-colors min-h-[44px]"
            />
          </div>

          {/* 시작 시간 */}
          <div>
            <label htmlFor="merc-start-time" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              시작 시간 <span className="text-red-500">*</span>
            </label>
            <input
              id="merc-start-time"
              type="time"
              value={form.startTime}
              onChange={(e) => update('startTime', e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-3.5 text-base text-gray-900 dark:text-white bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 dark:focus:border-blue-500 transition-colors min-h-[44px]"
            />
          </div>

          {/* 장소 */}
          <div>
            <label htmlFor="merc-venue" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              장소 <span className="text-red-500">*</span>
            </label>
            <input
              id="merc-venue"
              type="text"
              value={form.venue}
              onChange={(e) => update('venue', e.target.value)}
              maxLength={200}
              placeholder="예: 난지천 풋살장 A"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-3.5 text-base text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 dark:focus:border-blue-500 transition-colors min-h-[44px]"
            />
          </div>

          {/* 포지션 */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              필요 포지션 <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {positionOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update('position', opt.value)}
                  className={`rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-colors min-h-[44px] ${
                    form.position === opt.value
                      ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900'
                      : 'border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-200 dark:hover:border-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 모집 인원 */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">모집 인원</label>
            <div className="flex gap-2">
              {countOptions.map((c) => (
                <button
                  key={c}
                  onClick={() => update('count', c)}
                  className={`flex-1 rounded-xl border-2 py-2.5 text-base font-semibold transition-colors min-h-[44px] ${
                    form.count === c
                      ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900'
                      : 'border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-200 dark:hover:border-gray-600'
                  }`}
                >
                  {c}명
                </button>
              ))}
            </div>
          </div>

          {/* 레벨 요구 */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">레벨 요구</label>
            <div className="flex gap-2 flex-wrap">
              {levelOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update('levelRequired', opt.value)}
                  className={`rounded-xl border-2 px-5 py-2.5 text-base font-semibold transition-colors min-h-[44px] ${
                    form.levelRequired === opt.value
                      ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900'
                      : 'border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-200 dark:hover:border-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 비용 */}
          <div>
            <label htmlFor="merc-fee" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">참가비 (원)</label>
            <input
              id="merc-fee"
              type="number"
              value={form.fee}
              onChange={(e) => update('fee', e.target.value)}
              min={0}
              placeholder="0 = 무료"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-3.5 text-base text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 dark:focus:border-blue-500 transition-colors min-h-[44px]"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatCurrency(Number(form.fee) || 0)}</p>
          </div>

          {/* 요청사항 */}
          <div>
            <label htmlFor="merc-notes" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">요청사항 (선택)</label>
            <textarea
              id="merc-notes"
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              maxLength={500}
              placeholder="유니폼 색상, 준비물, 기타 안내 등"
              rows={4}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-3.5 text-base text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 dark:focus:border-blue-500 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Submit */}
        <div className="mt-6">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || createMutation.isPending}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
          >
            {createMutation.isPending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                등록 중...
              </>
            ) : (
              <>
                <Check size={16} />
                모집글 등록
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
