'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useCreateTournament } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { sportLabel } from '@/lib/constants';
import type { CreateTournamentInput } from '@/types/api';

const sportOptions = ['soccer', 'futsal', 'basketball', 'badminton', 'ice_hockey', 'swimming', 'tennis'];

export default function TournamentNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const createTournament = useCreateTournament();
  const teamName = searchParams.get('teamName') ?? undefined;
  const venueName = searchParams.get('venueName') ?? undefined;

  const [form, setForm] = useState<CreateTournamentInput>({
    title: '',
    sportType: 'soccer',
    eventDate: '',
    description: '',
    entryFee: 0,
    teamId: searchParams.get('teamId') ?? undefined,
    venueId: searchParams.get('venueId') ?? undefined,
  });

  function updateField<K extends keyof CreateTournamentInput>(key: K, value: CreateTournamentInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.eventDate) {
      toast('error', '제목과 일정은 필수입니다.');
      return;
    }

    try {
      const created = await createTournament.mutateAsync({
        ...form,
        title: form.title.trim(),
        description: form.description?.trim() || undefined,
        entryFee: typeof form.entryFee === 'number' ? form.entryFee : undefined,
      });
      toast('success', '대회를 등록했어요.');
      router.push(`/tournaments/${created.id}`);
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast('error', message || '대회 등록에 실패했어요.');
    }
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-base text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">대회 등록</h1>
      </header>

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/tournaments" className="hover:text-gray-600 transition-colors">대회</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">대회 등록</span>
      </div>

      <div className="px-5 @3xl:px-0 max-w-[760px] space-y-5 pb-8">
        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
          {(form.teamId || form.venueId) && (
            <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
              {form.teamId
                ? `${teamName ?? '선택한 팀'} 허브에 연결됩니다.`
                : `${venueName ?? '선택한 장소'} 허브에 연결됩니다.`}
            </div>
          )}
          <div>
            <label htmlFor="tournament-title" className={labelClass}>대회명</label>
            <input id="tournament-title" className={inputClass} value={form.title} onChange={(event) => updateField('title', event.target.value)} />
          </div>
          <div>
            <label htmlFor="tournament-sport" className={labelClass}>종목</label>
            <select id="tournament-sport" className={inputClass} value={form.sportType} onChange={(event) => updateField('sportType', event.target.value)}>
              {sportOptions.map((sportType) => (
                <option key={sportType} value={sportType}>{sportLabel[sportType] || sportType}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tournament-date" className={labelClass}>일정</label>
              <input id="tournament-date" type="date" className={inputClass} value={form.eventDate} onChange={(event) => updateField('eventDate', event.target.value)} />
            </div>
            <div>
              <label htmlFor="tournament-fee" className={labelClass}>참가비</label>
              <input id="tournament-fee" type="number" className={inputClass} value={form.entryFee ?? ''} onChange={(event) => updateField('entryFee', event.target.value ? Number(event.target.value) : undefined)} />
            </div>
          </div>
          <div>
            <label htmlFor="tournament-description" className={labelClass}>설명</label>
            <textarea id="tournament-description" className={`${inputClass} min-h-[110px]`} value={form.description ?? ''} onChange={(event) => updateField('description', event.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="rounded-xl bg-gray-100 dark:bg-gray-700 px-5 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            취소
          </button>
          <button onClick={() => void handleSubmit()} disabled={createTournament.isPending} className="rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
            {createTournament.isPending ? '등록 중...' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
