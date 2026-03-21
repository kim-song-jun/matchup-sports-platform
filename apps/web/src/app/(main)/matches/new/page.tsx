'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, Check } from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useVenues } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';

const sports = [
  { type: 'futsal', label: '풋살', color: 'bg-blue-50 text-blue-500 border-gray-200' },
  { type: 'basketball', label: '농구', color: 'bg-blue-50 text-blue-500 border-gray-200' },
  { type: 'badminton', label: '배드민턴', color: 'bg-blue-50 text-blue-500 border-gray-200' },
  { type: 'ice_hockey', label: '아이스하키', color: 'bg-blue-50 text-blue-500 border-gray-200' },
];

const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

export default function CreateMatchPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    sportType: '',
    title: '',
    description: '',
    venueId: '',
    matchDate: '',
    startTime: '',
    endTime: '',
    maxPlayers: 10,
    fee: 15000,
    levelMin: 1,
    levelMax: 5,
    gender: 'any',
  });

  const { data: venuesData } = useVenues(form.sportType ? { sportType: form.sportType } : undefined);
  const venues = venuesData || [];

  const steps = ['종목', '정보', '장소·일시', '확인'];

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await api.post('/matches', form);
      toast('success', '매치가 생성되었습니다!');
      router.push('/matches');
    } catch (err: any) {
      toast('error', err?.response?.data?.message || '생성에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-[15px] font-medium text-gray-700">로그인 후 매치를 만들 수 있어요</p>
        <button onClick={() => router.push('/login')} className="mt-4 rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white">로그인</button>
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      {/* Header */}
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button onClick={() => step > 0 ? setStep(step - 1) : router.back()} className="rounded-lg p-1.5 -ml-1.5">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">매치 만들기</h1>
      </header>

      <div className="hidden lg:block mb-6">
        <h2 className="text-[24px] font-bold text-gray-900">매치 만들기</h2>
      </div>

      {/* Step indicator */}
      <div className="px-5 lg:px-0 py-4">
        <div className="flex items-center gap-1">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-blue-500' : 'bg-gray-200'}`} />
            </div>
          ))}
        </div>
        <p className="text-[13px] text-gray-400 mt-2">Step {step + 1}. {steps[step]}</p>
      </div>

      <div className="px-5 lg:px-0">
        {/* Step 0: Sport */}
        {step === 0 && (
          <div className="animate-slide-up space-y-3">
            <h3 className="text-[18px] font-bold text-gray-900 mb-4">어떤 종목인가요?</h3>
            <div className="grid grid-cols-2 gap-3">
              {sports.map((s) => {
                const Icon = SportIconMap[s.type];
                const selected = form.sportType === s.type;
                return (
                  <button
                    key={s.type}
                    onClick={() => { setForm({ ...form, sportType: s.type }); setStep(1); }}
                    className={`flex items-center gap-3 rounded-2xl border-2 p-4 transition-all ${
                      selected ? `${s.color} border-current` : 'border-gray-100 bg-white hover:border-gray-200'
                    }`}
                  >
                    {Icon && <Icon size={28} />}
                    <span className="text-[15px] font-semibold">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1: Match info */}
        {step === 1 && (
          <div className="animate-slide-up space-y-4">
            <h3 className="text-[18px] font-bold text-gray-900 mb-4">매치 정보를 입력해주세요</h3>
            <Field label="매치 제목" required>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="예: 주말 풋살 한판!" className="input-field" />
            </Field>
            <Field label="설명">
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="매치에 대한 설명을 적어주세요" rows={3} className="input-field resize-none" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="최대 인원">
                <input type="number" value={form.maxPlayers} onChange={(e) => setForm({ ...form, maxPlayers: +e.target.value })}
                  min={2} max={30} className="input-field" />
              </Field>
              <Field label="참가비 (원)">
                <input type="number" value={form.fee} onChange={(e) => setForm({ ...form, fee: +e.target.value })}
                  min={0} step={1000} className="input-field" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="최소 레벨">
                <select value={form.levelMin} onChange={(e) => setForm({ ...form, levelMin: +e.target.value })} className="input-field">
                  {[1,2,3,4,5].map(l => <option key={l} value={l}>{levelLabel[l]}</option>)}
                </select>
              </Field>
              <Field label="최대 레벨">
                <select value={form.levelMax} onChange={(e) => setForm({ ...form, levelMax: +e.target.value })} className="input-field">
                  {[1,2,3,4,5].map(l => <option key={l} value={l}>{levelLabel[l]}</option>)}
                </select>
              </Field>
            </div>
            <button onClick={() => form.title ? setStep(2) : toast('error', '매치 제목을 입력해주세요')}
              className="w-full rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 transition-colors mt-4">
              다음
            </button>
          </div>
        )}

        {/* Step 2: Venue + Date */}
        {step === 2 && (
          <div className="animate-slide-up space-y-4">
            <h3 className="text-[18px] font-bold text-gray-900 mb-4">장소와 시간을 선택해주세요</h3>
            <Field label="시설 선택" required>
              {Array.isArray(venues) && venues.length > 0 ? (
                <div className="space-y-2">
                  {venues.map((v: any) => (
                    <button key={v.id} onClick={() => setForm({ ...form, venueId: v.id })}
                      className={`w-full text-left rounded-xl border-2 p-3 transition-all ${
                        form.venueId === v.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'
                      }`}>
                      <p className="text-[14px] font-semibold text-gray-900">{v.name}</p>
                      <p className="text-[12px] text-gray-400">{v.address}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-gray-400 py-4">시설 데이터를 불러오는 중...</p>
              )}
            </Field>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Field label="날짜">
                <input type="date" value={form.matchDate} onChange={(e) => setForm({ ...form, matchDate: e.target.value })} className="input-field" />
              </Field>
              <Field label="시작 시간">
                <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="input-field" />
              </Field>
              <Field label="종료 시간">
                <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="input-field" />
              </Field>
            </div>
            <button onClick={() => (form.venueId && form.matchDate) ? setStep(3) : toast('error', '시설과 날짜를 선택해주세요')}
              className="w-full rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 transition-colors mt-4">
              다음
            </button>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="animate-slide-up space-y-4">
            <h3 className="text-[18px] font-bold text-gray-900 mb-4">매치 정보를 확인해주세요</h3>
            <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-3">
              <ConfirmRow label="종목" value={sports.find(s => s.type === form.sportType)?.label || ''} />
              <ConfirmRow label="제목" value={form.title} />
              <ConfirmRow label="날짜" value={form.matchDate} />
              <ConfirmRow label="시간" value={`${form.startTime} ~ ${form.endTime}`} />
              <ConfirmRow label="인원" value={`최대 ${form.maxPlayers}명`} />
              <ConfirmRow label="참가비" value={`${new Intl.NumberFormat('ko-KR').format(form.fee)}원`} />
              <ConfirmRow label="레벨" value={`${levelLabel[form.levelMin]} ~ ${levelLabel[form.levelMax]}`} />
            </div>
            <button onClick={handleSubmit} disabled={isSubmitting}
              className="w-full rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {isSubmitting ? '생성 중...' : (<><Check size={18} /> 매치 생성하기</>)}
            </button>
          </div>
        )}
      </div>

      <div className="h-8" />

      <style jsx>{`
        .input-field {
          width: 100%;
          border-radius: 12px;
          border: 1px solid #E5E8EB;
          background: #F9FAFB;
          padding: 12px 14px;
          font-size: 14px;
          color: #191F28;
          outline: none;
          transition: all 0.2s;
        }
        .input-field:focus {
          border-color: #3182F6;
          background: white;
          box-shadow: 0 0 0 3px rgba(49,130,246,0.1);
        }
      `}</style>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
      <span className="text-[13px] text-gray-400">{label}</span>
      <span className="text-[14px] font-medium text-gray-900">{value}</span>
    </div>
  );
}
