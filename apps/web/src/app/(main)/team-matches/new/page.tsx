'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useCreateTeamMatch } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { SKILL_GRADES, MATCH_TYPES, getGradeInfo } from '@/lib/skill-grades';
import type { SkillGrade, MatchType } from '@/lib/skill-grades';

const STEPS = ['종목', '구장/일시', '경기조건', '비용/규정', '확인'];

const sportOptions = [
  { value: 'soccer', label: '축구' },
  { value: 'futsal', label: '풋살' },
];

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
  const { isAuthenticated } = useAuthStore();
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

  function handleSubmit() {
    const payload = {
      ...form,
      totalFee: Number(form.totalFee),
      opponentFee: form.isFreeInvitation ? 0 : (form.opponentFee ? Number(form.opponentFee) : 0),
      totalMinutes: form.totalMinutes ? Number(form.totalMinutes) : 120,
    } as Record<string, unknown>;
    createMutation.mutate(payload as never, {
      onSuccess: () => router.push('/team-matches'),
      onError: () => toast('error', '모집글 등록에 실패했어요. 잠시 후 다시 시도해주세요'),
    });
  }

  const formatCurrency = (n: string) =>
    n ? new Intl.NumberFormat('ko-KR').format(Number(n)) + '원' : '';

  if (!isAuthenticated) {
    return (
      <div className="pt-[var(--safe-area-top)] lg:pt-0 px-5 lg:px-0">
        <div className="max-w-[500px] mx-auto mt-20 text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">팀 매칭 모집글을 작성해보세요</h2>
          <p className="text-sm text-gray-500 mt-2">로그인하면 모집글을 작성하고 상대팀을 찾을 수 있어요</p>
          <Link href="/login" className="inline-block mt-6 rounded-xl bg-blue-500 px-8 py-3 text-base font-bold text-white hover:bg-blue-600 transition-colors">
            로그인하고 시작하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      {/* Header */}
      <header className="lg:hidden px-5 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => (step > 0 ? setStep(step - 1) : router.back())} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-xl text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">모집글 작성</h1>
      </header>

      <div className="hidden lg:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/team-matches" className="hover:text-gray-600 transition-colors">팀 매칭</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">모집글 작성</span>
      </div>

      {/* Progress */}
      <div className="px-5 lg:px-0 lg:max-w-[700px] mb-6">
        <div className="flex items-center gap-1 mb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={`h-1 flex-1 rounded-full transition-all ${i <= step ? 'bg-blue-500' : 'bg-gray-100'}`} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-gray-900 dark:text-white">{STEPS[step]}</p>
          <p className="text-xs text-gray-500">{step + 1} / {STEPS.length}</p>
        </div>
      </div>

      <div className="px-5 lg:px-0 lg:max-w-[700px]">
        {/* Step 0: 종목 */}
        {step === 0 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">종목 선택</label>
              <div className="grid grid-cols-2 gap-2">
                {sportOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update('sportType', opt.value)}
                    className={`rounded-xl border-2 px-4 py-4 text-md font-semibold text-center transition-all ${
                      form.sportType === opt.value
                        ? 'border-gray-900 bg-gray-900 text-white dark:bg-white dark:text-gray-900 dark:border-white'
                        : 'border-gray-100 dark:border-gray-700 text-gray-600 hover:border-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">모집글 제목</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="예: 일요일 오전 친선경기 모집합니다"
                className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
              />
            </div>
          </div>
        )}

        {/* Step 1: 구장/일시 */}
        {step === 1 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">경기 날짜</label>
              <input
                type="date"
                value={form.matchDate}
                onChange={(e) => update('matchDate', e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">시작 시간</label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => update('startTime', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">종료 시간</label>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => update('endTime', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">총 경기 시간 (분, 선택)</label>
              <input
                type="number"
                value={form.totalMinutes}
                onChange={(e) => update('totalMinutes', e.target.value)}
                placeholder="예: 120"
                className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">쿼터 수</label>
              <div className="flex gap-2">
                {quarterOptions.map((q) => (
                  <button
                    key={q}
                    onClick={() => update('quarterCount', q)}
                    className={`flex-1 rounded-xl border-2 py-3 text-base font-semibold transition-all ${
                      form.quarterCount === q
                        ? 'border-gray-900 bg-gray-900 text-white dark:bg-white dark:text-gray-900 dark:border-white'
                        : 'border-gray-100 dark:border-gray-700 text-gray-600 hover:border-gray-200'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">구장명</label>
              <input
                type="text"
                value={form.venueName}
                onChange={(e) => update('venueName', e.target.value)}
                placeholder="예: 난지천 풋살장"
                className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">구장 주소 (선택)</label>
              <input
                type="text"
                value={form.venueAddress}
                onChange={(e) => update('venueAddress', e.target.value)}
                placeholder="예: 서울시 마포구 상암동 481-6"
                className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
              />
            </div>
          </div>
        )}

        {/* Step 2: 경기조건 */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-in">
            {/* 실력등급 S~D */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">실력등급</label>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {SKILL_GRADES.map((g) => (
                  <button
                    key={g.grade}
                    onClick={() => update('skillGrade', g.grade as SkillGrade)}
                    className={`shrink-0 rounded-xl border-2 px-4 py-2.5 text-center transition-all ${
                      form.skillGrade === g.grade
                        ? 'border-gray-900 bg-gray-900 dark:border-white dark:bg-white'
                        : 'border-gray-100 dark:border-gray-700 hover:border-gray-200'
                    }`}
                  >
                    <p className={`text-base font-bold ${form.skillGrade === g.grade ? 'text-white dark:text-gray-900' : 'text-gray-900'}`}>
                      {g.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 whitespace-nowrap">{g.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 선출선수(명) */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">선출선수 (명)</label>
              <input
                type="number"
                min={0}
                max={10}
                value={form.proPlayerCount}
                onChange={(e) => update('proPlayerCount', Math.min(10, Math.max(0, Number(e.target.value))))}
                placeholder="0"
                className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
              />
              <p className="text-xs text-gray-500 mt-1">팀 내 축구/풋살 선출 출신 선수 수 (0~10명)</p>
            </div>

            {/* 경기방식 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">경기방식</label>
              <div className="flex gap-2">
                {gameFormatOptions.map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => update('gameFormat', fmt)}
                    className={`flex-1 rounded-xl border-2 py-3 text-base font-semibold transition-all ${
                      form.gameFormat === fmt
                        ? 'border-gray-900 bg-gray-900 text-white dark:bg-white dark:text-gray-900 dark:border-white'
                        : 'border-gray-100 dark:border-gray-700 text-gray-600 hover:border-gray-200'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* 매치 유형 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">매치 유형</label>
              <div className="space-y-2">
                {MATCH_TYPES.map((mt) => (
                  <label
                    key={mt.value}
                    className={`flex items-center gap-3 w-full rounded-xl border-2 px-4 py-3.5 cursor-pointer transition-all ${
                      form.matchType === mt.value
                        ? 'border-gray-900 bg-gray-900 dark:border-white dark:bg-white'
                        : 'border-gray-100 dark:border-gray-700 hover:border-gray-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="matchType"
                      value={mt.value}
                      checked={form.matchType === mt.value}
                      onChange={() => update('matchType', mt.value as MatchType)}
                      className="h-4 w-4 text-gray-900 dark:text-white border-gray-300 focus:ring-gray-500"
                    />
                    <div>
                      <p className={`text-base font-semibold ${form.matchType === mt.value ? 'text-white dark:text-gray-900' : 'text-gray-900'}`}>
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
              <label className="text-sm font-medium text-gray-700 mb-2 block">경기 스타일</label>
              <div className="space-y-2">
                {matchStyleOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update('matchStyle', opt.value)}
                    className={`w-full rounded-xl border-2 px-4 py-3.5 text-left transition-all ${
                      form.matchStyle === opt.value
                        ? 'border-gray-900 bg-gray-900 dark:border-white dark:bg-white'
                        : 'border-gray-100 dark:border-gray-700 hover:border-gray-200'
                    }`}
                  >
                    <p className={`text-base font-semibold ${form.matchStyle === opt.value ? 'text-white dark:text-gray-900' : 'text-gray-900'}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 유니폼 색상 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">유니폼 색상</label>
              <input
                type="text"
                value={form.uniformColor}
                onChange={(e) => update('uniformColor', e.target.value)}
                placeholder="예: 빨강 상의 + 검정 하의"
                className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
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
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">총 비용 (원)</label>
              <input
                type="number"
                value={form.totalFee}
                onChange={(e) => update('totalFee', e.target.value)}
                placeholder="예: 200000"
                className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
              />
              {form.totalFee && (
                <p className="text-xs text-gray-500 mt-1">{formatCurrency(form.totalFee)}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">상대팀 부담금 (원, 선택)</label>
              <input
                type="number"
                value={form.opponentFee}
                onChange={(e) => update('opponentFee', e.target.value)}
                placeholder="비워두면 총 비용의 절반"
                className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
              />
              {form.opponentFee && (
                <p className="text-xs text-gray-500 mt-1">{formatCurrency(form.opponentFee)}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">추가 안내 (선택)</label>
              <textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="유니폼 색상, 주차 안내, 기타 규정 등"
                rows={4}
                className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all resize-none"
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
                <SummaryRow label="구장" value={form.venueName} />
                {form.venueAddress && <SummaryRow label="주소" value={form.venueAddress} />}
                <SummaryRow label="총 비용" value={formatCurrency(form.totalFee)} />
                {form.isFreeInvitation ? (
                  <SummaryRow label="상대팀 부담" value="무료초청 (0원)" />
                ) : (
                  form.opponentFee && <SummaryRow label="상대팀 부담" value={formatCurrency(form.opponentFee)} />
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
      <div className="px-5 lg:px-0 lg:max-w-[700px] mt-6 mb-8">
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            다음
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            <Check size={16} />
            {createMutation.isPending ? '등록 중...' : '모집글 등록'}
          </button>
        )}
      </div>
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3.5 cursor-pointer">
      <span className="text-base font-medium text-gray-800 dark:text-gray-200">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-gray-200'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white dark:bg-gray-800 shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
        />
      </button>
    </label>
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
