'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';

const sports = [
  { type: 'futsal', label: '풋살' },
  { type: 'basketball', label: '농구' },
  { type: 'badminton', label: '배드민턴' },
  { type: 'ice_hockey', label: '아이스하키' },
];

const lessonTypes = [
  { value: 'group_lesson', label: '그룹 레슨', desc: '여러 명이 함께 배우는 레슨' },
  { value: 'practice_match', label: '연습 경기', desc: '실전 감각을 키우는 연습 경기' },
  { value: 'free_practice', label: '자유 연습', desc: '자유롭게 연습하는 시간' },
  { value: 'clinic', label: '클리닉', desc: '전문 코치의 집중 클리닉' },
];

const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

const STEPS = ['종목·유형', '강좌 정보', '일시·상세', '확인'];

interface FormData {
  sportType: string;
  type: string;
  title: string;
  description: string;
  coachName: string;
  coachBio: string;
  venueName: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  maxParticipants: number;
  fee: number;
  levelMin: number;
  levelMax: number;
}

const initialForm: FormData = {
  sportType: '',
  type: '',
  title: '',
  description: '',
  coachName: '',
  coachBio: '',
  venueName: '',
  lessonDate: '',
  startTime: '',
  endTime: '',
  maxParticipants: 10,
  fee: 20000,
  levelMin: 1,
  levelMax: 5,
};

export default function CreateLessonPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function canProceed(): boolean {
    switch (step) {
      case 0: return !!form.sportType && !!form.type;
      case 1: return !!form.title && !!form.coachName;
      case 2: return !!form.venueName && !!form.lessonDate && !!form.startTime && !!form.endTime;
      case 3: return true;
      default: return false;
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await api.post('/lessons', form);
      toast('success', '강좌가 등록되었어요!');
      router.push('/lessons');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '강좌 등록에 실패했어요. 다시 시도해주세요');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-[15px] font-medium text-gray-700">로그인 후 강좌를 등록할 수 있어요</p>
        <button
          onClick={() => router.push('/login')}
          className="mt-4 rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-600 transition-colors"
        >
          로그인
        </button>
      </div>
    );
  }

  const selectedSport = sports.find((s) => s.type === form.sportType);
  const selectedType = lessonTypes.find((t) => t.value === form.type);

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      {/* Header */}
      <header className="px-5 lg:px-0 pt-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => (step > 0 ? setStep(step - 1) : router.back())}
          aria-label="뒤로 가기"
          className="flex items-center justify-center min-h-11 min-w-11 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-[18px] font-bold text-gray-900">강좌 등록</h1>
      </header>

      {/* Progress */}
      <div className="px-5 lg:px-0 mb-6">
        <div className="flex items-center gap-1 mb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={`h-1 flex-1 rounded-full transition-all ${i <= step ? 'bg-blue-500' : 'bg-gray-100'}`} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold text-gray-900">{STEPS[step]}</p>
          <p className="text-[12px] text-gray-400">{step + 1} / {STEPS.length}</p>
        </div>
      </div>

      <div className="px-5 lg:px-0">
        {/* Step 0: Sport type + Lesson type */}
        {step === 0 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-2 block">종목 선택</label>
              <div className="grid grid-cols-2 gap-3">
                {sports.map((s) => {
                  const Icon = SportIconMap[s.type];
                  const selected = form.sportType === s.type;
                  return (
                    <button
                      key={s.type}
                      onClick={() => update('sportType', s.type)}
                      className={`flex items-center gap-3 rounded-2xl border-2 p-4 transition-all ${
                        selected
                          ? 'border-blue-500 bg-blue-50 text-blue-600'
                          : 'border-gray-100 bg-white hover:border-gray-200 text-gray-700'
                      }`}
                    >
                      {Icon && <Icon size={28} />}
                      <span className="text-[15px] font-semibold">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-2 block">강좌 유형</label>
              <div className="space-y-2">
                {lessonTypes.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => update('type', t.value)}
                    className={`w-full rounded-xl border-2 px-4 py-3.5 text-left transition-all ${
                      form.type === t.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <p className={`text-[14px] font-semibold ${form.type === t.value ? 'text-blue-600' : 'text-gray-900'}`}>
                      {t.label}
                    </p>
                    <p className="text-[12px] text-gray-400 mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Title, description, coach */}
        {step === 1 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                강좌 제목 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="예: 초보자를 위한 풋살 기초 레슨"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">강좌 설명</label>
              <textarea
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="강좌에 대한 자세한 설명을 입력해주세요"
                rows={4}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white transition-all resize-none"
              />
            </div>

            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                코치명 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.coachName}
                onChange={(e) => update('coachName', e.target.value)}
                placeholder="예: 김코치"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">코치 소개</label>
              <textarea
                value={form.coachBio}
                onChange={(e) => update('coachBio', e.target.value)}
                placeholder="코치 경력 및 자격증 등을 입력해주세요"
                rows={3}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white transition-all resize-none"
              />
            </div>
          </div>
        )}

        {/* Step 2: Venue, date/time, details */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                장소명 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.venueName}
                onChange={(e) => update('venueName', e.target.value)}
                placeholder="예: 난지천 풋살장"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                날짜 <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={form.lessonDate}
                onChange={(e) => update('lessonDate', e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                  시작 시간 <span className="text-red-400">*</span>
                </label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => update('startTime', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                  종료 시간 <span className="text-red-400">*</span>
                </label>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => update('endTime', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">최대 인원</label>
                <input
                  type="number"
                  value={form.maxParticipants}
                  onChange={(e) => update('maxParticipants', +e.target.value)}
                  min={1}
                  max={50}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">수강료 (원)</label>
                <input
                  type="number"
                  value={form.fee}
                  onChange={(e) => update('fee', +e.target.value)}
                  min={0}
                  step={1000}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white transition-all"
                />
                {form.fee > 0 && (
                  <p className="text-[12px] text-gray-400 mt-1">
                    {new Intl.NumberFormat('ko-KR').format(form.fee)}원
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">최소 레벨</label>
                <select
                  value={form.levelMin}
                  onChange={(e) => update('levelMin', +e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white transition-all"
                >
                  {[1, 2, 3, 4, 5].map((l) => (
                    <option key={l} value={l}>{levelLabel[l]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">최대 레벨</label>
                <select
                  value={form.levelMax}
                  onChange={(e) => update('levelMax', +e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white transition-all"
                >
                  {[1, 2, 3, 4, 5].map((l) => (
                    <option key={l} value={l}>{levelLabel[l]}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <h3 className="text-[16px] font-bold text-gray-900 mb-4">강좌 정보 확인</h3>
              <div className="space-y-3">
                <SummaryRow label="종목" value={selectedSport?.label || ''} />
                <SummaryRow label="유형" value={selectedType?.label || ''} />
                <SummaryRow label="제목" value={form.title} />
                {form.description && <SummaryRow label="설명" value={form.description} />}
                <SummaryRow label="코치" value={form.coachName} />
                {form.coachBio && <SummaryRow label="코치 소개" value={form.coachBio} />}
                <SummaryRow label="장소" value={form.venueName} />
                <SummaryRow label="날짜" value={form.lessonDate} />
                <SummaryRow label="시간" value={`${form.startTime} ~ ${form.endTime}`} />
                <SummaryRow label="인원" value={`최대 ${form.maxParticipants}명`} />
                <SummaryRow
                  label="수강료"
                  value={form.fee === 0 ? '무료' : `${new Intl.NumberFormat('ko-KR').format(form.fee)}원`}
                />
                <SummaryRow label="레벨" value={`${levelLabel[form.levelMin]} ~ ${levelLabel[form.levelMax]}`} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="px-5 lg:px-0 mt-6 mb-8">
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => canProceed() ? setStep(step + 1) : toast('error', '필수 항목을 입력해주세요')}
            disabled={!canProceed()}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            다음
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            <Check size={16} />
            {isSubmitting ? '등록 중...' : '강좌 등록하기'}
          </button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-[13px] text-gray-400 shrink-0">{label}</span>
      <span className="text-[14px] font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}
