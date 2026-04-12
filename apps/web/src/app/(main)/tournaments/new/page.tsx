'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { useCreateTournament } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { sportLabel } from '@/lib/constants';
import type { CreateTournamentInput } from '@/types/api';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';

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

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <MobileGlassHeader title="대회 등록" showBack />

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
          <FormField label="대회명" htmlFor="tournament-title">
            <Input id="tournament-title" value={form.title} onChange={(event) => updateField('title', event.target.value)} />
          </FormField>
          <FormField label="종목" htmlFor="tournament-sport">
            <Select id="tournament-sport" value={form.sportType} onChange={(event) => updateField('sportType', event.target.value)}>
              {sportOptions.map((sportType) => (
                <option key={sportType} value={sportType}>{sportLabel[sportType] || sportType}</option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="일정" htmlFor="tournament-date">
              <Input id="tournament-date" type="date" value={form.eventDate} onChange={(event) => updateField('eventDate', event.target.value)} />
            </FormField>
            <FormField label="참가비" htmlFor="tournament-fee">
              <Input id="tournament-fee" type="number" value={form.entryFee ?? ''} onChange={(event) => updateField('entryFee', event.target.value ? Number(event.target.value) : undefined)} />
            </FormField>
          </div>
          <FormField label="설명" htmlFor="tournament-description">
            <Textarea id="tournament-description" className="min-h-[110px]" value={form.description ?? ''} onChange={(event) => updateField('description', event.target.value)} />
          </FormField>
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
