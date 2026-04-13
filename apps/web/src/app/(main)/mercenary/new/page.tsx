'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, ChevronRight, Shield, Users } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useCreateMercenaryPost, useMyTeams } from '@/hooks/use-api';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { levelLabel, sportCardAccent, sportLabel } from '@/lib/constants';
import { extractErrorMessage, formatCurrency } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';

const positionOptions = [
  { value: 'GK', label: '골키퍼 (GK)' },
  { value: 'DF', label: '수비수 (DF)' },
  { value: 'MF', label: '미드필더 (MF)' },
  { value: 'FW', label: '공격수 (FW)' },
  { value: 'ALL', label: '포지션 무관' },
];

const levelOptions = [1, 2, 3, 4, 5];
const countOptions = [1, 2, 3, 4, 5];

interface FormState {
  teamId: string;
  matchDate: string;
  venue: string;
  position: string;
  count: number;
  level: number;
  fee: string;
  notes: string;
}

const initialForm: FormState = {
  teamId: '',
  matchDate: '',
  venue: '',
  position: '',
  count: 1,
  level: 3,
  fee: '0',
  notes: '',
};

export default function NewMercenaryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTeamId = searchParams.get('teamId');
  const { toast } = useToast();
  useRequireAuth();

  const { data: myTeams = [], isLoading: teamsLoading } = useMyTeams();
  const createMutation = useCreateMercenaryPost();
  const [form, setForm] = useState<FormState>(initialForm);

  useEffect(() => {
    if (!requestedTeamId || form.teamId) {
      return;
    }

    if (myTeams.some((team) => team.id === requestedTeamId)) {
      setForm((current) => ({ ...current, teamId: requestedTeamId }));
    }
  }, [form.teamId, myTeams, requestedTeamId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  const selectedTeam = myTeams.find((team) => team.id === form.teamId) ?? null;
  const selectedAccent = selectedTeam ? sportCardAccent[selectedTeam.sportType] : null;

  const canSubmit = Boolean(
    selectedTeam &&
      form.matchDate &&
      form.venue.trim() &&
      form.position,
  );

  function handleSubmit() {
    if (!selectedTeam || !canSubmit) {
      return;
    }

    createMutation.mutate(
      {
        teamId: selectedTeam.id,
        sportType: selectedTeam.sportType,
        matchDate: form.matchDate,
        venue: form.venue.trim(),
        position: form.position,
        count: form.count,
        level: form.level,
        fee: Number(form.fee) || 0,
        notes: form.notes.trim() || undefined,
      },
      {
        onSuccess: (createdPost) => {
          toast('success', '용병 모집글이 등록되었어요');
          router.push(`/mercenary/${createdPost.id}`);
        },
        onError: (error) => {
          toast('error', extractErrorMessage(error, '등록에 실패했어요. 잠시 후 다시 시도해주세요'));
        },
      },
    );
  }

  if (!teamsLoading && myTeams.length === 0) {
    return (
      <div className="pt-[var(--safe-area-top)] animate-fade-in px-5 @3xl:px-0">
        <MobileGlassHeader className="mb-4 gap-3">
          <button
            aria-label="뒤로 가기"
            onClick={() => router.back()}
            className="glass-mobile-icon-button flex min-h-[44px] min-w-11 items-center justify-center rounded-xl"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">용병 모집하기</h1>
        </MobileGlassHeader>
        <EmptyState
          icon={Users}
          title="팀을 먼저 만들어주세요"
          description="용병 모집은 소속된 팀이 있어야 가능해요"
          action={{ label: '팀 만들기', href: '/teams/new' }}
        />
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      <MobileGlassHeader className="gap-3">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="glass-mobile-icon-button flex min-h-[44px] min-w-11 items-center justify-center rounded-xl"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">용병 모집하기</h1>
      </MobileGlassHeader>

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6 px-5 @3xl:px-0 pt-4">
        <Link href="/mercenary" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          용병 모집
        </Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-200">새 모집글</span>
      </div>

      <div className="px-5 @3xl:px-0 @3xl:max-w-[720px] pb-10">
        <div className="mt-4 space-y-5">
          <FormField label="팀 선택" htmlFor="merc-team" required>
            <Select
              id="merc-team"
              value={form.teamId}
              onChange={(event) => update('teamId', event.target.value)}
            >
              <option value="">팀을 선택하세요</option>
              {teamsLoading ? (
                <option disabled>불러오는 중...</option>
              ) : (
                myTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))
              )}
            </Select>
          </FormField>

          {selectedTeam && (
            <div className={`rounded-2xl border border-gray-100 dark:border-gray-700 p-4 ${selectedAccent?.tint ?? 'bg-gray-50 dark:bg-gray-800/60'}`}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80 dark:bg-gray-900/50">
                  <Shield size={18} className="text-gray-700 dark:text-gray-200" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{selectedTeam.name}</p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    종목은 팀 정보 기준으로 자동 고정돼요.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${selectedAccent?.badge ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {sportLabel[selectedTeam.sportType] ?? selectedTeam.sportType}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      생성 후 상세 페이지에서 신청 현황을 바로 관리할 수 있어요.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <FormField label="경기 날짜" htmlFor="merc-match-date" required>
            <Input
              id="merc-match-date"
              type="date"
              value={form.matchDate}
              onChange={(event) => update('matchDate', event.target.value)}
            />
          </FormField>

          <FormField label="장소" htmlFor="merc-venue" required>
            <Input
              id="merc-venue"
              type="text"
              value={form.venue}
              onChange={(event) => update('venue', event.target.value)}
              maxLength={200}
              placeholder="예: 난지천 풋살장 A"
            />
          </FormField>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              필요 포지션 <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {positionOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => update('position', option.value)}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors min-h-[44px] ${
                    form.position === option.value
                      ? 'border-blue-500 bg-blue-500 text-white dark:border-blue-500 dark:bg-blue-500 dark:text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">모집 인원</label>
            <div className="flex gap-2">
              {countOptions.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => update('count', count)}
                  className={`flex-1 rounded-xl border py-2.5 text-base font-semibold transition-colors min-h-[44px] ${
                    form.count === count
                      ? 'border-blue-500 bg-blue-500 text-white dark:border-blue-500 dark:bg-blue-500 dark:text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {count}명
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">레벨 요구</label>
            <div className="flex gap-2 flex-wrap">
              {levelOptions.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => update('level', level)}
                  className={`rounded-xl border px-5 py-2.5 text-base font-semibold transition-colors min-h-[44px] ${
                    form.level === level
                      ? 'border-blue-500 bg-blue-500 text-white dark:border-blue-500 dark:bg-blue-500 dark:text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {levelLabel[level]}
                </button>
              ))}
            </div>
          </div>

          <FormField label="참가비 (원)" htmlFor="merc-fee">
            <Input
              id="merc-fee"
              type="number"
              value={form.fee}
              onChange={(event) => update('fee', event.target.value)}
              min={0}
              placeholder="0 = 무료"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formatCurrency(Number(form.fee) || 0)}
            </p>
          </FormField>

          <FormField label="요청사항 (선택)" htmlFor="merc-notes">
            <Textarea
              id="merc-notes"
              value={form.notes}
              onChange={(event) => update('notes', event.target.value)}
              maxLength={500}
              placeholder="유니폼 색상, 준비물, 기타 안내 등"
              rows={4}
              className="resize-none"
            />
          </FormField>

          <div className="mt-6">
            <button
              type="button"
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
                  상세로 등록하기
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
