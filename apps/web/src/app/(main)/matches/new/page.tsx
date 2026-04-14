'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Plus, ChevronRight } from 'lucide-react';
import { useVenues } from '@/hooks/use-api';
import type { Venue } from '@/types/api';
import { useToast } from '@/components/ui/toast';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { sportLabel, levelLabel, sportCardAccent, SportType } from '@/lib/constants';
import { SportIconMap } from '@/components/icons/sport-icons';
import { getSportImageSet } from '@/lib/sport-image';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Card } from '@/components/ui/card';
import { ImageUpload, type ImageUploadState } from '@/components/ui/image-upload';
import { firstUploadUrl, type UploadAsset } from '@/lib/uploads';

const sportTypes = ['soccer', 'futsal', 'basketball', 'badminton', 'ice_hockey', 'swimming', 'tennis', 'baseball', 'volleyball', 'figure_skating', 'short_track'];

export default function CreateMatchPage() {
  useRequireAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageAssets, setImageAssets] = useState<UploadAsset[]>([]);
  const [uploadState, setUploadState] = useState<ImageUploadState>({
    hasPendingUploads: false,
    hasUploadErrors: false,
    pendingCount: 0,
  });

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
  const sampleImages = imageAssets.length === 0
    ? getSportImageSet(form.sportType || 'futsal', `match-create-${form.sportType || 'default'}`, 3)
    : [];

  const steps = ['종목', '정보', '장소·일시', '확인'];

  const guardImageUpload = () => {
    if (uploadState.hasPendingUploads) {
      toast('error', '이미지 업로드가 끝난 뒤 계속할 수 있어요');
      return false;
    }
    if (uploadState.hasUploadErrors) {
      toast('error', '실패한 이미지를 다시 시도하거나 제거해주세요');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!guardImageUpload()) return;

    setIsSubmitting(true);
    try {
      if (!form.venueId) {
        toast('error', '현재는 등록된 시설만 선택할 수 있어요');
        return;
      }

      await api.post('/matches', {
        title: form.title,
        description: form.description,
        sportType: form.sportType,
        venueId: form.venueId,
        matchDate: form.matchDate,
        startTime: form.startTime,
        endTime: form.endTime,
        maxPlayers: form.maxPlayers,
        fee: form.fee,
        levelMin: form.levelMin,
        levelMax: form.levelMax,
        gender: form.gender,
        ...(imageAssets.length > 0 ? { imageUrl: firstUploadUrl(imageAssets) } : {}),
      });
      toast('success', '매치가 만들어졌어요!');
      router.push('/matches?created=true');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '생성에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      {/* Header */}
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3">
        <button onClick={() => step > 0 ? setStep(step - 1) : router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">매치 만들기</h1>
      </header>

      <div className="hidden @3xl:flex items-center gap-2 text-xs text-gray-500 mb-6">
        <Link href="/matches" className="hover:text-gray-600 transition-colors">매치</Link>
        <ChevronRight size={12} />
        <span className="text-gray-700 dark:text-gray-300">새 매치 만들기</span>
      </div>

      {/* Step indicator */}
      <div className="px-5 @3xl:px-0 py-3">
        <div className="flex items-center gap-1">
          {steps.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-blue-500' : 'bg-gray-100 dark:bg-gray-700'}`} />
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">Step {step + 1}. {steps[step]}</p>
      </div>

      <div className="px-5 @3xl:px-0 max-w-lg">
        {/* Step 0: Sport */}
        {step === 0 && (
          <div className="space-y-3 mt-2">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">어떤 종목인가요?</h3>
            <div className="flex flex-wrap gap-2">
              {sportTypes.map((type) => {
                const Icon = SportIconMap[type as SportType];
                const accent = sportCardAccent[type as SportType];
                const isSelected = form.sportType === type;
                // Convert dot color (e.g. 'bg-green-400') to icon text color (e.g. 'text-green-400')
                const iconColor = accent?.dot ? accent.dot.replace('bg-', 'text-') : 'text-gray-400';
                return (
                  <button
                    key={type}
                    onClick={() => { setForm({ ...form, sportType: type }); setStep(1); }}
                    data-testid={`match-sport-${type}`}
                    aria-pressed={isSelected}
                    className={`inline-flex items-center gap-2 rounded-xl min-h-[44px] px-4 py-2.5 text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {Icon && (
                      <Icon
                        size={16}
                        className={isSelected ? 'text-white' : iconColor}
                      />
                    )}
                    {sportLabel[type] || type}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1: Match info */}
        {step === 1 && (
          <div className="space-y-4 mt-2">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">매치 정보</h3>
            <FormField label="매치 제목" required htmlFor="match-title">
              <Input
                id="match-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={100}
                placeholder="예: 주말 풋살 한판!"
              />
            </FormField>
            <FormField label="설명" htmlFor="match-description">
              <Textarea
                id="match-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={1000}
                placeholder="매치에 대한 설명을 적어주세요"
                rows={3}
                className="min-h-[96px] resize-none"
              />
            </FormField>

            {/* Image upload — ImageUpload renders its own label, do not wrap in Field (avoids orphan label) */}
            <div>
              <ImageUpload
                value={imageAssets}
                onChange={setImageAssets}
                onStateChange={setUploadState}
                max={1}
                accept="image/jpeg,image/png,image/webp,image/gif"
                maxSizeMB={10}
                label="이미지 (선택)"
              />
              {sampleImages.length > 0 && (
                <div className="flex gap-2 mt-2 overflow-x-auto scrollbar-hide pb-1">
                  {sampleImages.map((src) => (
                    <div key={src} className="relative shrink-0 w-20 h-20 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-700">
                      <img
                        src={src}
                        alt=""
                        aria-hidden="true"
                        className="h-full w-full object-cover opacity-60"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-950/18">
                        <Plus size={18} className="text-white/90" aria-hidden="true" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {sampleImages.length > 0 && (
                <p className="mt-1.5 text-xs text-gray-500">대표 이미지가 비어 있으면 위 예시처럼 노출됩니다.</p>
              )}
              {uploadState.hasPendingUploads && (
                <p className="mt-1.5 text-xs text-gray-500">이미지 업로드가 끝난 뒤 다음 단계로 진행할 수 있어요.</p>
              )}
              {uploadState.hasUploadErrors && (
                <p className="mt-1.5 text-xs text-red-500">실패한 이미지를 다시 시도하거나 제거해주세요.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="최대 인원" htmlFor="match-maxPlayers">
                <Input
                  id="match-maxPlayers"
                  type="number"
                  inputMode="numeric"
                  value={form.maxPlayers}
                  onChange={(e) => setForm({ ...form, maxPlayers: +e.target.value })}
                  min={2}
                  max={30}
                />
              </FormField>
              <FormField label="참가비 (원)" htmlFor="match-fee">
                <Input
                  id="match-fee"
                  type="number"
                  inputMode="numeric"
                  value={form.fee}
                  onChange={(e) => setForm({ ...form, fee: +e.target.value })}
                  min={0}
                  step={1000}
                />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="최소 레벨" htmlFor="match-levelMin">
                <Select id="match-levelMin" value={form.levelMin} onChange={(e) => setForm({ ...form, levelMin: +e.target.value })}>
                  {[1,2,3,4,5].map(l => <option key={l} value={l}>{levelLabel[l]}</option>)}
                </Select>
              </FormField>
              <FormField label="최대 레벨" htmlFor="match-levelMax">
                <Select id="match-levelMax" value={form.levelMax} onChange={(e) => setForm({ ...form, levelMax: +e.target.value })}>
                  {[1,2,3,4,5].map(l => <option key={l} value={l}>{levelLabel[l]}</option>)}
                </Select>
              </FormField>
            </div>

            {/* Gender */}
            <FormField label="성별 제한">
              <div className="flex gap-2">
                {[{ value: 'any', label: '무관' }, { value: 'male', label: '남성' }, { value: 'female', label: '여성' }].map((g) => (
                  <button key={g.value} onClick={() => setForm({ ...form, gender: g.value })}
                    className={`min-h-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      form.gender === g.value ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-500'
                    }`}>
                    {g.label}
                  </button>
                ))}
              </div>
            </FormField>

            {/* Rules */}
            <FormField label="추가 규칙 (선택)" htmlFor="match-rules">
              <Textarea
                id="match-rules"
                value={form.rules}
                onChange={(e) => setForm({ ...form, rules: e.target.value })}
                maxLength={500}
                placeholder="참가자에게 알릴 규칙이나 공지사항"
                rows={2}
                className="min-h-[88px] resize-none"
              />
            </FormField>

            <Button onClick={() => {
                if (!guardImageUpload()) return;
                if (!form.title) { toast('error', '매치 제목을 입력해주세요'); return; }
                if (form.levelMin > form.levelMax) {
                  setForm(prev => ({ ...prev, levelMin: prev.levelMax, levelMax: prev.levelMin }));
                  toast('info', '최소/최대 레벨이 자동으로 교정되었어요');
                  return;
                }
                setStep(2);
              }}
              data-testid="match-create-next-info"
              disabled={uploadState.hasPendingUploads || uploadState.hasUploadErrors}
              fullWidth
              size="lg"
              className="mt-2">
              다음
            </Button>
          </div>
        )}

        {/* Step 2: Venue + Date */}
        {step === 2 && (
          <div className="space-y-4 mt-2">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">장소와 시간</h3>
            <FormField label="시설 선택" required>
              {Array.isArray(venues) && venues.length > 0 && (
                <div className="space-y-2 mb-3">
                  {venues.map((v: Venue) => (
                    <button key={v.id} onClick={() => setForm({ ...form, venueId: v.id, customVenue: '' })}
                      data-testid={`match-venue-${v.id}`}
                      className={`w-full text-left rounded-xl p-3 transition-colors ${
                        form.venueId === v.id ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}>
                      <p className={`text-sm font-semibold ${form.venueId === v.id ? '' : 'text-gray-900 dark:text-gray-100'}`}>{v.name}</p>
                      <p className={`text-xs mt-0.5 ${form.venueId === v.id ? 'text-white/60 dark:text-gray-900/60' : 'text-gray-500'}`}>{v.address}</p>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-2">
                <label htmlFor="match-customVenue" className="block text-xs text-gray-500 mb-1.5">또는 직접 입력</label>
                <Input
                  id="match-customVenue"
                  value={form.customVenue}
                  onChange={(e) => setForm({ ...form, customVenue: e.target.value, venueId: '' })}
                  maxLength={200}
                  placeholder="예: 한강공원 축구장, 동네 체육관 등"
                />
              </div>
            </FormField>
            <div className="grid grid-cols-1 @3xl:grid-cols-3 gap-3">
              <FormField label="날짜" htmlFor="match-date">
                <Input id="match-date" type="date" value={form.matchDate} onChange={(e) => setForm({ ...form, matchDate: e.target.value })} />
              </FormField>
              <FormField label="시작 시간" htmlFor="match-startTime">
                <Input id="match-startTime" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </FormField>
              <FormField label="종료 시간" htmlFor="match-endTime">
                <Input id="match-endTime" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </FormField>
            </div>
            <Button onClick={() => {
                if (!form.venueId) { toast('error', '현재는 등록된 시설만 선택할 수 있어요'); return; }
                if (!form.matchDate) { toast('error', '날짜를 선택해주세요'); return; }
                if (!form.startTime) { toast('error', '시작 시간을 입력해주세요'); return; }
                const today = new Date().toISOString().split('T')[0];
                if (form.matchDate < today) { toast('error', '과거 날짜는 선택할 수 없어요'); return; }
                setStep(3);
              }}
              data-testid="match-create-next-schedule"
              fullWidth
              size="lg"
              className="mt-2">
              다음
            </Button>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="space-y-4 mt-2">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">확인</h3>
            <Card variant="subtle" className="space-y-2.5">
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
              {imageAssets.length > 0 && <ConfirmRow label="이미지" value={`${imageAssets.length}장`} />}
            </Card>
            <Button onClick={handleSubmit} disabled={isSubmitting || uploadState.hasUploadErrors} aria-busy={isSubmitting}
              data-testid="match-create-submit"
              fullWidth
              size="lg"
              className="gap-1.5">
              {isSubmitting ? '생성 중...' : (<><Check size={16} /> 매치 만들기</>)}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-1">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 text-right ml-4">{value}</span>
    </div>
  );
}
