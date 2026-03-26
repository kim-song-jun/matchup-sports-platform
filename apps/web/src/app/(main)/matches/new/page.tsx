'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Plus, Image as ImageIcon, X } from 'lucide-react';
import { useVenues } from '@/hooks/use-api';
import type { Venue } from '@/types/api';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { sportLabel, levelLabel } from '@/lib/constants';
import { api } from '@/lib/api';

const sportTypes = ['soccer', 'futsal', 'basketball', 'badminton', 'ice_hockey', 'swimming', 'tennis', 'baseball', 'volleyball', 'figure_skating', 'short_track'];

export default function CreateMatchPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const [form, setForm] = useState({
    sportType: '',
    title: '',
    description: '',
    venueId: '',
    customVenue: '',
    matchDate: '',
    startTime: '',
    endTime: '',
    maxPlayers: 10,
    fee: 15000,
    levelMin: 1,
    levelMax: 5,
    gender: 'any',
    rules: '',
  });

  const { data: venuesData } = useVenues(form.sportType ? { sportType: form.sportType } : undefined);
  const venues: Venue[] = Array.isArray(venuesData) ? venuesData : (venuesData?.items ?? []);

  const steps = ['종목', '정보', '장소·일시', '확인'];

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (imageFiles.length + files.length > 5) {
      toast('error', '이미지는 최대 5장까지 가능해요');
      return;
    }
    const newFiles = [...imageFiles, ...files].slice(0, 5);
    setImageFiles(newFiles);
    const previews = newFiles.map(f => URL.createObjectURL(f));
    setImagePreviews(previews);
  };

  const removeImage = (idx: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== idx));
    setImagePreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await api.post('/matches', form);
      toast('success', '매치가 만들어졌어요!');
      router.push('/matches');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '생성에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="pt-[var(--safe-area-top)] lg:pt-0 px-5 lg:px-0">
        <div className="max-w-[500px] mx-auto mt-20 text-center">
          <h2 className="text-[22px] font-bold text-gray-900 dark:text-white">매치를 만들어보세요</h2>
          <p className="text-[13px] text-gray-500 mt-2">로그인하면 매치를 만들고 참가자를 모집할 수 있어요</p>
          <Link href="/login" className="inline-block mt-6 rounded-xl bg-blue-500 px-8 py-3 text-[14px] font-bold text-white hover:bg-blue-600 transition-colors">
            로그인하고 시작하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0">
      {/* Header */}
      <header className="lg:hidden flex items-center gap-3 px-5 py-3">
        <button onClick={() => step > 0 ? setStep(step - 1) : router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-50 transition-colors">
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900 dark:text-white">매치 만들기</h1>
      </header>

      <div className="hidden lg:block mb-6">
        <h2 className="text-[22px] font-bold text-gray-900 dark:text-white">매치 만들기</h2>
      </div>

      {/* Step indicator */}
      <div className="px-5 lg:px-0 py-3">
        <div className="flex items-center gap-1">
          {steps.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-blue-500' : 'bg-gray-100 dark:bg-gray-700'}`} />
          ))}
        </div>
        <p className="text-[12px] text-gray-500 mt-2">Step {step + 1}. {steps[step]}</p>
      </div>

      <div className="px-5 lg:px-0 max-w-lg">
        {/* Step 0: Sport */}
        {step === 0 && (
          <div className="space-y-3 mt-2">
            <h3 className="text-[16px] font-bold text-gray-900 dark:text-white mb-2">어떤 종목인가요?</h3>
            <div className="flex flex-wrap gap-2">
              {sportTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => { setForm({ ...form, sportType: type }); setStep(1); }}
                  className={`rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all ${
                    form.sportType === type
                      ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                      : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {sportLabel[type] || type}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Match info */}
        {step === 1 && (
          <div className="space-y-4 mt-2">
            <h3 className="text-[16px] font-bold text-gray-900 dark:text-white mb-2">매치 정보</h3>
            <Field label="매치 제목" required id="match-title">
              <input id="match-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={100} placeholder="예: 주말 풋살 한판!" className="form-input" />
            </Field>
            <Field label="설명" id="match-description">
              <textarea id="match-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={1000} placeholder="매치에 대한 설명을 적어주세요" rows={3} className="form-input resize-none" />
            </Field>

            {/* Image upload */}
            <Field label="이미지 (선택)">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {imagePreviews.map((src, i) => (
                  <div key={i} className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-gray-100">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeImage(i)} aria-label="이미지 삭제" className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-gray-900/60 text-white">
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {imageFiles.length < 5 && (
                  <button onClick={() => fileInputRef.current?.click()} className="shrink-0 flex flex-col items-center justify-center w-20 h-20 rounded-xl border border-dashed border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <ImageIcon size={16} />
                    <span className="text-[10px] mt-1">{imageFiles.length}/5</span>
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageAdd} className="hidden" />
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="최대 인원" id="match-maxPlayers">
                <input id="match-maxPlayers" type="number" value={form.maxPlayers} onChange={(e) => setForm({ ...form, maxPlayers: +e.target.value })}
                  min={2} max={30} className="form-input" />
              </Field>
              <Field label="참가비 (원)" id="match-fee">
                <input id="match-fee" type="number" value={form.fee} onChange={(e) => setForm({ ...form, fee: +e.target.value })}
                  min={0} step={1000} className="form-input" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="최소 레벨" id="match-levelMin">
                <select id="match-levelMin" value={form.levelMin} onChange={(e) => setForm({ ...form, levelMin: +e.target.value })} className="form-input">
                  {[1,2,3,4,5].map(l => <option key={l} value={l}>{levelLabel[l]}</option>)}
                </select>
              </Field>
              <Field label="최대 레벨" id="match-levelMax">
                <select id="match-levelMax" value={form.levelMax} onChange={(e) => setForm({ ...form, levelMax: +e.target.value })} className="form-input">
                  {[1,2,3,4,5].map(l => <option key={l} value={l}>{levelLabel[l]}</option>)}
                </select>
              </Field>
            </div>

            {/* Gender */}
            <Field label="성별 제한">
              <div className="flex gap-2">
                {[{ value: 'any', label: '무관' }, { value: 'male', label: '남성' }, { value: 'female', label: '여성' }].map((g) => (
                  <button key={g.value} onClick={() => setForm({ ...form, gender: g.value })}
                    className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
                      form.gender === g.value ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-500'
                    }`}>
                    {g.label}
                  </button>
                ))}
              </div>
            </Field>

            {/* Rules */}
            <Field label="추가 규칙 (선택)" id="match-rules">
              <textarea id="match-rules" value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })}
                maxLength={500} placeholder="참가자에게 알릴 규칙이나 공지사항" rows={2} className="form-input resize-none" />
            </Field>

            <button onClick={() => {
                if (!form.title) { toast('error', '매치 제목을 입력해주세요'); return; }
                if (!form.startTime) { toast('error', '시작 시간을 입력해주세요'); return; }
                if (form.levelMin > form.levelMax) {
                  setForm(prev => ({ ...prev, levelMin: prev.levelMax, levelMax: prev.levelMin }));
                  toast('info', '최소/최대 레벨이 자동으로 교정되었어요');
                  return;
                }
                setStep(2);
              }}
              className="w-full rounded-xl bg-blue-500 py-3 text-[14px] font-bold text-white hover:bg-blue-600 transition-colors mt-2">
              다음
            </button>
          </div>
        )}

        {/* Step 2: Venue + Date */}
        {step === 2 && (
          <div className="space-y-4 mt-2">
            <h3 className="text-[16px] font-bold text-gray-900 dark:text-white mb-2">장소와 시간</h3>
            <Field label="시설 선택" required>
              {Array.isArray(venues) && venues.length > 0 && (
                <div className="space-y-2 mb-3">
                  {venues.map((v: Venue) => (
                    <button key={v.id} onClick={() => setForm({ ...form, venueId: v.id, customVenue: '' })}
                      className={`w-full text-left rounded-xl p-3 transition-all ${
                        form.venueId === v.id ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}>
                      <p className={`text-[13px] font-semibold ${form.venueId === v.id ? '' : 'text-gray-900 dark:text-gray-100'}`}>{v.name}</p>
                      <p className={`text-[11px] mt-0.5 ${form.venueId === v.id ? 'text-white/60 dark:text-gray-900/60' : 'text-gray-500'}`}>{v.address}</p>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-2">
                <p className="text-[11px] text-gray-500 mb-1.5">또는 직접 입력</p>
                <input
                  value={form.customVenue}
                  onChange={(e) => setForm({ ...form, customVenue: e.target.value, venueId: '' })}
                  maxLength={200}
                  placeholder="예: 한강공원 축구장, 동네 체육관 등"
                  className="form-input"
                />
              </div>
            </Field>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Field label="날짜" id="match-date">
                <input id="match-date" type="date" value={form.matchDate} onChange={(e) => setForm({ ...form, matchDate: e.target.value })} className="form-input" />
              </Field>
              <Field label="시작 시간" id="match-startTime">
                <input id="match-startTime" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="form-input" />
              </Field>
              <Field label="종료 시간" id="match-endTime">
                <input id="match-endTime" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="form-input" />
              </Field>
            </div>
            <button onClick={() => {
                if (!form.venueId && !form.customVenue) { toast('error', '시설을 선택하거나 직접 입력해주세요'); return; }
                if (!form.matchDate) { toast('error', '날짜를 선택해주세요'); return; }
                const today = new Date().toISOString().split('T')[0];
                if (form.matchDate < today) { toast('error', '과거 날짜는 선택할 수 없어요'); return; }
                setStep(3);
              }}
              className="w-full rounded-xl bg-blue-500 py-3 text-[14px] font-bold text-white hover:bg-blue-600 transition-colors mt-2">
              다음
            </button>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="space-y-4 mt-2">
            <h3 className="text-[16px] font-bold text-gray-900 dark:text-white mb-2">확인</h3>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 space-y-2.5">
              <ConfirmRow label="종목" value={sportLabel[form.sportType] || form.sportType} />
              {(form.venueId || form.customVenue) && (
                <ConfirmRow label="장소" value={form.venueId ? (venues.find((v: Venue) => v.id === form.venueId)?.name || form.venueId) : form.customVenue} />
              )}
              <ConfirmRow label="제목" value={form.title} />
              <ConfirmRow label="날짜" value={form.matchDate} />
              <ConfirmRow label="시간" value={`${form.startTime} ~ ${form.endTime}`} />
              <ConfirmRow label="인원" value={`최대 ${form.maxPlayers}명`} />
              <ConfirmRow label="참가비" value={`${new Intl.NumberFormat('ko-KR').format(form.fee)}원`} />
              <ConfirmRow label="레벨" value={`${levelLabel[form.levelMin]} ~ ${levelLabel[form.levelMax]}`} />
              <ConfirmRow label="성별" value={form.gender === 'any' ? '무관' : form.gender === 'male' ? '남성' : '여성'} />
              {form.rules && <ConfirmRow label="규칙" value={form.rules} />}
              {imageFiles.length > 0 && <ConfirmRow label="이미지" value={`${imageFiles.length}장`} />}
            </div>
            <button onClick={handleSubmit} disabled={isSubmitting}
              className="w-full rounded-xl bg-blue-500 py-3 text-[14px] font-bold text-white hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
              {isSubmitting ? '생성 중...' : (<><Check size={16} /> 매치 만들기</>)}
            </button>
          </div>
        )}
      </div>


      <style jsx>{`
        .form-input {
          width: 100%;
          border-radius: 12px;
          border: 1px solid #E5E8EB;
          background: #F9FAFB;
          padding: 10px 12px;
          font-size: 14px;
          color: #191F28;
          outline: none;
          transition: all 0.2s;
        }
        .form-input:focus {
          border-color: #3182F6;
          background: white;
          box-shadow: 0 0 0 3px rgba(49,130,246,0.1);
        }
      `}</style>
    </div>
  );
}

function Field({ label, required, id, children }: { label: string; required?: boolean; id?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-semibold text-gray-500 dark:text-gray-500 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-1">
      <span className="text-[12px] text-gray-500 shrink-0">{label}</span>
      <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 text-right ml-4">{value}</span>
    </div>
  );
}
