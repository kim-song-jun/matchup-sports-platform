'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import { useCreateTeamMatch, useMyTeams } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { ErrorState } from '@/components/ui/error-state';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { SKILL_GRADES, MATCH_TYPES, getGradeInfo } from '@/lib/skill-grades';
import type { SkillGrade, MatchType } from '@/lib/skill-grades';
import type { CreateTeamMatchInput } from '@/types/api';
import { formatCurrency } from '@/lib/utils';
import { sportLabel } from '@/lib/constants';
import { Toggle } from '@/components/ui/toggle';

const STEPS = ['종목', '장소/일시', '경기조건', '비용/규정', '확인'];

const sportOptions = Object.entries(sportLabel).map(([value, label]) => ({ value, label }));

const quarterOptions = [2, 4, 6, 8, 10];

const matchStyleOptions = [
  { value: 'friendly', label: '친선', desc: '즐겁게 경기' },
  { value: 'competitive', label: '경쟁', desc: '승부 중심' },
  { value: 'manner_focused', label: '매너 중시', desc: '매너 우선' },
];

const gameFormatOptions = ['11:11', '8:8', '6:6', '5:5'] as const;

interface FormData {
  title: string;
  sportType: string;
  matchDate: string;
  startTime: string;
  endTime: string;
  totalMinutes: string;
  quarterCount: number;
  venueName: string;
  venueAddress: string;
  totalFee: string;
  opponentFee: string;
  requiredLevel: string;
  hasProPlayers: boolean;
  allowMercenary: boolean;
  matchStyle: string;
  hasReferee: boolean;
  notes: string;
  skillGrade: SkillGrade;
  proPlayerCount: number;
  gameFormat: string;
  matchType: MatchType;
  uniformColor: string;
  isFreeInvitation: boolean;
}

const initialForm: FormData = {
  title: '',
  sportType: '',
  matchDate: '',
  startTime: '',
  endTime: '',
  totalMinutes: '',
  quarterCount: 4,
  venueName: '',
  venueAddress: '',
  totalFee: '',
  opponentFee: '',
  requiredLevel: 'middle',
  hasProPlayers: false,
  allowMercenary: false,
  matchStyle: 'friendly',
  hasReferee: false,
  notes: '',
  skillGrade: 'B',
  proPlayerCount: 0,
  gameFormat: '11:11',
  matchType: 'invitation',
  uniformColor: '',
  isFreeInvitation: false,
};

export default function NewTeamMatchPage() {
  const router = useRouter();
  const { toast } = useToast();
  useRequireAuth();
  const { data: myTeams, isLoading: teamsLoading, isError: teamsError, refetch: refetchTeams } = useMyTeams();
  // Only owner/manager can host a team match
  const eligibleTeams = (myTeams ?? []).filter((t) => t.role === 'owner' || t.role === 'manager');
  const [selectedHostTeamId, setSelectedHostTeamId] = useState('');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(initialForm);
  const createMutation = useCreateTeamMatch();

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function canProceed(): boolean {
    switch (step) {
      case 0: return !!form.sportType && !!form.title;
      case 1: return !!form.matchDate && !!form.startTime && !!form.endTime && !!form.venueName;
      case 2: return !!form.skillGrade && !!form.matchStyle;
      case 3: return form.totalFee !== '';
      case 4: return true;
      default: return false;
    }
  }

  function handleBack() {
    if (step > 0) {
      setStep(step - 1);
      return;
    }
    router.back();
  }

  function handleSubmit() {
    const hostTeamId = selectedHostTeamId || (eligibleTeams.length > 0 ? eligibleTeams[0].id : undefined);
    if (!hostTeamId) {
      toast('error', '호스트 팀을 선택해주세요');
      return;
    }

    const payload: CreateTeamMatchInput = {
      hostTeamId,
      sportType: form.sportType,
      title: form.title,
      matchDate: form.matchDate,
      startTime: form.startTime,
      endTime: form.endTime,
      quarterCount: form.quarterCount,
      venueName: form.venueName,
      venueAddress: form.venueAddress,
      totalFee: Number(form.totalFee),
      opponentFee: form.isFreeInvitation ? 0 : (form.opponentFee ? Number(form.opponentFee) : 0),
      totalMinutes: form.totalMinutes ? Number(form.totalMinutes) : 120,
      allowMercenary: form.allowMercenary,
      matchStyle: form.matchStyle,
      hasReferee: form.hasReferee,
      notes: form.notes,
      // task 17: match meta fields
      skillGrade: form.skillGrade,
      gameFormat: form.gameFormat,
      matchType: form.matchType,
      proPlayerCount: form.proPlayerCount,
      uniformColor: form.uniformColor || undefined,
      isFreeInvitation: form.isFreeInvitation,
    };
    createMutation.mutate(payload, {
      onSuccess: () => router.push('/team-matches'),
      onError: () => toast('error', '모집글 등록에 실패했어요. 잠시 후 다시 시도해주세요'),
    });
  }

  if (teamsLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (teamsError) {
    return (
      <div className="pt-[var(--safe-area-top)] @3xl:pt-0 px-5 @3xl:px-0 mt-20">
        <ErrorState message="팀 정보를 불러올 수 없어요" onRetry={() => refetchTeams()} />
      </div>
    );
  }

  if (myTeams !== undefined && myTeams.length === 0) {
    return (
      <div className="pt-[var(--safe-area-top)] @3xl:pt-0 px-5 @3xl:px-0">
        <div className="max-w-[500px] mx-auto mt-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 mx-auto mb-4">
            <Users size={28} className="text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">팀을 먼저 만들어주세요</h2>
          <p className="text-sm text-gray-500 mt-2">팀 매칭 모집글을 작성하려면 소속 팀이 필요해요</p>
          <Link href="/teams/new" className="inline-block mt-6 rounded-xl bg-blue-500 px-8 py-3 text-base font-bold text-white hover:bg-blue-600 transition-colors">
            팀 만들기
          </Link>
        </div>
      </div>
    );
  }

  if (myTeams !== undefined && eligibleTeams.length === 0) {
    return (
      <div className="pt-[var(--safe-area-top)] @3xl:pt-0 px-5 @3xl:px-0">
        <div className="max-w-[500px] mx-auto mt-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 mx-auto mb-4">
            <Users size={28} className="text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">권한이 없어요</h2>
          <p className="text-sm text-gray-500 mt-2">매니저 이상 권한을 가진 팀이 없어요</p>
          <p className="text-xs text-gray-500 mt-1">모집글을 작성하려면 팀의 owner 또는 manager여야 해요</p>
          <Link href="/teams/new" className="inline-block mt-6 rounded-xl bg-blue-500 px-8 py-3 text-base font-bold text-white hover:bg-blue-600 transition-colors">
            새 팀 만들기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      {/* Header */}
      <header className="@3xl:hidden px-5 pt-4 pb-3 flex items-center gap-3">
        <button onClick={handleBack} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-xl text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">모집글 작성</h1>
      </header>

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/team-matches" className="hover:text-gray-600 transition-colors">팀 매칭</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">모집글 작성</span>
      </div>

      {/* Progress */}
      <div className="px-5 @3xl:px-0 @3xl:max-w-[700px] mb-6">
        <div className="flex items-center gap-1 mb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-blue-500' : 'bg-gray-100'}`} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-gray-900 dark:text-white">{STEPS[step]}</p>
          <p className="text-xs text-gray-500">{step + 1} / {STEPS.length}</p>
        </div>
      </div>

      {eligibleTeams.length > 1 && (
        <div className="px-5 @3xl:px-0 @3xl:max-w-[700px] mb-5">
          <label htmlFor="host-team-select" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">호스트 팀 선택</label>
          <select
            id="host-team-select"
            value={selectedHostTeamId}
            onChange={(e) => setSelectedHostTeamId(e.target.value)}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-base text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors min-h-[44px]"
          >
            {eligibleTeams.map((team) => (
              <option key={team.id} value={team.id}>{team.name} ({team.role === 'owner' ? '오너' : '매니저'})</option>
            ))}
          </select>
        </div>
      )}

      <div className="px-5 @3xl:px-0 @3xl:max-w-[700px]">
        {/* Step 0: 종목 */}
        {step === 0 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">종목 선택</label>
              <div className="grid grid-cols-2 gap-2">
                {sportOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update('sportType', opt.value)}
                    className={`rounded-xl px-4 py-4 text-md font-semibold text-center transition-colors ${
                      form.sportType === opt.value
                        ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
                        : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="match-title" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">모집글 제목</label>
              <input
                id="match-title"
                type="text"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="예: 일요일 오전 친선경기 모집합니다"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors"
              />
            </div>
          </div>
        )}

        {/* Step 1: 장소/일시 */}
        {step === 1 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <label htmlFor="match-date" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">경기 날짜</label>
              <input
                id="match-date"
                type="date"
                value={form.matchDate}
                onChange={(e) => update('matchDate', e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 px-4 py-3.5 text-base text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="match-start-time" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">시작 시간</label>
                <input
                  id="match-start-time"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => update('startTime', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 px-4 py-3.5 text-base text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors"
                />
              </div>
              <div>
                <label htmlFor="match-end-time" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">종료 시간</label>
                <input
                  id="match-end-time"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => update('endTime', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 px-4 py-3.5 text-base text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="match-total-minutes" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">총 경기 시간 (분, 선택)</label>
              <input
                id="match-total-minutes"
                type="number"
                value={form.totalMinutes}
                onChange={(e) => update('totalMinutes', e.target.value)}
                placeholder="예: 120"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">쿼터 수</label>
              <div className="flex gap-2">
                {quarterOptions.map((q) => (
                  <button
                    key={q}
                    onClick={() => update('quarterCount', q)}
                    className={`flex-1 rounded-xl py-3 text-base font-semibold transition-colors ${
                      form.quarterCount === q
                        ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
                        : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="venue-name" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">장소명</label>
              <input
                id="venue-name"
                type="text"
                value={form.venueName}
                onChange={(e) => update('venueName', e.target.value)}
                placeholder="예: 난지천 풋살장"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="venue-address" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">장소 주소 (선택)</label>
              <input
                id="venue-address"
                type="text"
                value={form.venueAddress}
                onChange={(e) => update('venueAddress', e.target.value)}
                placeholder="예: 서울시 마포구 상암동 481-6"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors"
              />
            </div>
          </div>
        )}

        {/* Step 2: 경기조건 */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-in">
            {/* 실력등급 S~D */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">실력등급</label>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {SKILL_GRADES.map((g) => (
                  <button
                    key={g.grade}
                    onClick={() => update('skillGrade', g.grade as SkillGrade)}
                    className={`shrink-0 rounded-xl px-4 py-2.5 text-center transition-colors ${
                      form.skillGrade === g.grade
                        ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                        : 'border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <p className={`text-base font-bold ${form.skillGrade === g.grade ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                      {g.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 whitespace-nowrap">{g.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 선출선수(명) */}
            <div>
              <label htmlFor="pro-player-count" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">선출선수 (명)</label>
              <input
                id="pro-player-count"
                type="number"
                min={0}
                max={10}
                value={form.proPlayerCount}
                onChange={(e) => update('proPlayerCount', Math.min(10, Math.max(0, Number(e.target.value))))}
                placeholder="0"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors"
              />
              <p className="text-xs text-gray-500 mt-1">팀 내 축구/풋살 선출 출신 선수 수 (0~10명)</p>
            </div>

            {/* 경기방식 */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">경기방식</label>
              <div className="flex gap-2">
                {gameFormatOptions.map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => update('gameFormat', fmt)}
                    className={`flex-1 rounded-xl py-3 text-base font-semibold transition-colors ${
                      form.gameFormat === fmt
                        ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
                        : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* 매치 유형 */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">매치 유형</label>
              <div className="space-y-2">
                {MATCH_TYPES.map((mt) => (
                  <label
                    key={mt.value}
                    className={`flex items-center gap-3 w-full rounded-xl px-4 py-3.5 cursor-pointer transition-colors ${
                      form.matchType === mt.value
                        ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                        : 'border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="matchType"
                      value={mt.value}
                      checked={form.matchType === mt.value}
                      onChange={() => update('matchType', mt.value as MatchType)}
                      className="h-4 w-4 text-blue-500 border-gray-300 focus:ring-blue-500"
                    />
                    <div>
                      <p className={`text-base font-semibold ${form.matchType === mt.value ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                        {mt.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{mt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 경기 스타일 */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">경기 스타일</label>
              <div className="space-y-2">
                {matchStyleOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update('matchStyle', opt.value)}
                    className={`w-full rounded-xl px-4 py-3.5 text-left transition-colors ${
                      form.matchStyle === opt.value
                        ? 'ring-2 ring-blue-500 border border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                        : 'border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <p className={`text-base font-semibold ${form.matchStyle === opt.value ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 유니폼 색상 */}
            <div>
              <label htmlFor="uniform-color" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">유니폼 색상</label>
              <input
                id="uniform-color"
                type="text"
                value={form.uniformColor}
                onChange={(e) => update('uniformColor', e.target.value)}
                placeholder="예: 빨강 상의 + 검정 하의"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors"
              />
            </div>

            {/* 토글 필드들 */}
            <div className="space-y-3">
              <ToggleField
                label="무료초청 (상대팀 비용 0원)"
                checked={form.isFreeInvitation}
                onChange={(v) => {
                  update('isFreeInvitation', v);
                  if (v) update('opponentFee', '0');
                }}
              />
              <ToggleField
                label="용병 허용"
                checked={form.allowMercenary}
                onChange={(v) => update('allowMercenary', v)}
              />
              <ToggleField
                label="심판 배정"
                checked={form.hasReferee}
                onChange={(v) => update('hasReferee', v)}
              />
            </div>
          </div>
        )}

        {/* Step 3: 비용/규정 */}
        {step === 3 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <label htmlFor="total-fee" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">총 비용 (원)</label>
              <input
                id="total-fee"
                type="number"
                value={form.totalFee}
                onChange={(e) => update('totalFee', e.target.value)}
                placeholder="예: 200000"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors"
              />
              {form.totalFee && (
                <p className="text-xs text-gray-500 mt-1">{formatCurrency(Number(form.totalFee))}</p>
              )}
            </div>

            <div>
              <label htmlFor="opponent-fee" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">상대팀 부담금 (원, 선택)</label>
              <input
                id="opponent-fee"
                type="number"
                value={form.opponentFee}
                onChange={(e) => update('opponentFee', e.target.value)}
                placeholder="비워두면 총 비용의 절반"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors"
              />
              {form.opponentFee && (
                <p className="text-xs text-gray-500 mt-1">{formatCurrency(Number(form.opponentFee))}</p>
              )}
            </div>

            <div>
              <label htmlFor="match-notes" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">추가 안내 (선택)</label>
              <textarea
                id="match-notes"
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="유니폼 색상, 주차 안내, 기타 규정 등"
                rows={4}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors resize-none"
              />
            </div>
          </div>
        )}

        {/* Step 4: 확인 */}
        {step === 4 && (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">모집글 요약</h3>

              <div className="space-y-3">
                <SummaryRow label="제목" value={form.title} />
                <SummaryRow label="종목" value={sportOptions.find((o) => o.value === form.sportType)?.label ?? ''} />
                <SummaryRow label="날짜" value={form.matchDate} />
                <SummaryRow label="시간" value={`${form.startTime} ~ ${form.endTime}`} />
                <SummaryRow label="쿼터" value={`${form.quarterCount}쿼터`} />
                <SummaryRow label="장소" value={form.venueName} />
                {form.venueAddress && <SummaryRow label="주소" value={form.venueAddress} />}
                <SummaryRow label="총 비용" value={formatCurrency(Number(form.totalFee))} />
                {form.isFreeInvitation ? (
                  <SummaryRow label="상대팀 부담" value="무료초청 (0원)" />
                ) : (
                  form.opponentFee && <SummaryRow label="상대팀 부담" value={formatCurrency(Number(form.opponentFee))} />
                )}
                <SummaryRow label="실력등급" value={`${getGradeInfo(form.skillGrade).label} - ${getGradeInfo(form.skillGrade).desc}`} />
                <SummaryRow label="선출선수" value={`${form.proPlayerCount}명`} />
                <SummaryRow label="경기방식" value={form.gameFormat} />
                <SummaryRow label="매치 유형" value={MATCH_TYPES.find((mt) => mt.value === form.matchType)?.label ?? ''} />
                <SummaryRow label="경기 스타일" value={matchStyleOptions.find((o) => o.value === form.matchStyle)?.label ?? ''} />
                {form.uniformColor && <SummaryRow label="유니폼 색상" value={form.uniformColor} />}
                <SummaryRow label="용병" value={form.allowMercenary ? '허용' : '불가'} />
                <SummaryRow label="심판" value={form.hasReferee ? '있음' : '없음'} />
                {form.notes && <SummaryRow label="추가 안내" value={form.notes} />}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="px-5 @3xl:px-0 @3xl:max-w-[700px] mt-6 mb-8">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex min-h-[52px] shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-md font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-600"
          >
            <ArrowLeft size={16} />
            {step === 0 ? '목록으로' : '이전'}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              다음
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
            >
              <Check size={16} />
              {createMutation.isPending ? '등록 중...' : '모집글 등록'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3.5"
    >
      <span className="text-base font-medium text-gray-800 dark:text-gray-200">{label}</span>
      <Toggle
        label={label}
        enabled={checked}
        onToggle={() => onChange(!checked)}
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-base font-medium text-gray-900 dark:text-white text-right">{value}</span>
    </div>
  );
}
