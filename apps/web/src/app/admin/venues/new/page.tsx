'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, X, Plus, Loader2, CheckCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

const sportOptions = [
  { value: 'futsal', label: '풋살' },
  { value: 'basketball', label: '농구' },
  { value: 'badminton', label: '배드민턴' },
  { value: 'ice_hockey', label: '아이스하키' },
  { value: 'figure_skating', label: '피겨' },
  { value: 'short_track', label: '쇼트트랙' },
];

const venueTypes = [
  { value: 'indoor', label: '실내' },
  { value: 'outdoor', label: '실외' },
  { value: 'ice_rink', label: '빙상장' },
  { value: 'gym', label: '체육관' },
];

export default function AdminVenueNewPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: '',
    type: '',
    sportTypes: [] as string[],
    address: '',
    city: '',
    district: '',
    phone: '',
    description: '',
    facilities: [] as string[],
    pricePerHour: '',
    weekdayOpen: '09:00',
    weekdayClose: '22:00',
    weekendOpen: '10:00',
    weekendClose: '20:00',
  });

  const [facilityInput, setFacilityInput] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        pricePerHour: Number(form.pricePerHour) || 0,
        operatingHours: {
          weekday: { open: form.weekdayOpen, close: form.weekdayClose },
          weekend: { open: form.weekendOpen, close: form.weekendClose },
        },
      };
      await api.post('/admin/venues', payload);
    },
    onSuccess: () => {
      toast('success', '시설이 등록되었어요');
      router.push('/admin/venues');
    },
    onError: () => {
      toast('error', '실패했어요. 다시 시도해주세요');
    },
  });

  const updateField = (key: string, value: string | number | boolean | string[]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSport = (sport: string) => {
    setForm((prev) => ({
      ...prev,
      sportTypes: prev.sportTypes.includes(sport)
        ? prev.sportTypes.filter((s) => s !== sport)
        : [...prev.sportTypes, sport],
    }));
  };

  const addFacility = () => {
    const trimmed = facilityInput.trim();
    if (trimmed && !form.facilities.includes(trimmed)) {
      setForm((prev) => ({ ...prev, facilities: [...prev.facilities, trimmed] }));
      setFacilityInput('');
    }
  };

  const removeFacility = (f: string) => {
    setForm((prev) => ({ ...prev, facilities: prev.facilities.filter((x) => x !== f) }));
  };

  const handleFacilityKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addFacility();
    }
  };

  const inputClass = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-base text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 focus:bg-white dark:focus:bg-gray-700 transition-colors';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <div className="animate-fade-in max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/admin/venues" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">시설 관리</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">시설 등록</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">시설 등록</h1>

      <div className="space-y-5">
        {/* Name */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <h3 className="text-md font-bold text-gray-900 dark:text-white">기본 정보</h3>

          <div>
            <label htmlFor="admin-venue-new-name" className={labelClass}>시설명</label>
            <input id="admin-venue-new-name" type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="예: 마포 풋살파크" className={inputClass} />
          </div>

          <div>
            <label htmlFor="admin-venue-new-type" className={labelClass}>시설 유형</label>
            <select id="admin-venue-new-type" value={form.type} onChange={(e) => updateField('type', e.target.value)} className={inputClass}>
              <option value="">유형 선택</option>
              {venueTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <p id="sport-types-label" className={labelClass}>가능 종목</p>
            <div role="group" aria-labelledby="sport-types-label" className="flex flex-wrap gap-2">
              {sportOptions.map((s) => {
                const selected = form.sportTypes.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleSport(s.value)}
                    className={`min-h-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      selected
                        ? 'bg-gray-900 dark:bg-gray-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="admin-venue-new-description" className={labelClass}>설명</label>
            <textarea
              id="admin-venue-new-description"
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="시설의 특징, 편의시설 등을 소개해주세요"
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>

        {/* Location */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <h3 className="text-md font-bold text-gray-900 dark:text-white">위치 정보</h3>

          <div>
            <label htmlFor="admin-venue-new-address" className={labelClass}>주소</label>
            <input id="admin-venue-new-address" type="text" value={form.address} onChange={(e) => updateField('address', e.target.value)} placeholder="예: 서울시 마포구 월드컵로 123" className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="admin-venue-new-city" className={labelClass}>시/도</label>
              <input id="admin-venue-new-city" type="text" value={form.city} onChange={(e) => updateField('city', e.target.value)} placeholder="서울" className={inputClass} />
            </div>
            <div>
              <label htmlFor="admin-venue-new-district" className={labelClass}>구/군</label>
              <input id="admin-venue-new-district" type="text" value={form.district} onChange={(e) => updateField('district', e.target.value)} placeholder="강남구" className={inputClass} />
            </div>
          </div>

          <div>
            <label htmlFor="admin-venue-new-phone" className={labelClass}>전화번호</label>
            <input id="admin-venue-new-phone" type="tel" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="02-1234-5678" className={inputClass} />
          </div>
        </div>

        {/* Facilities & Price */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <h3 className="text-md font-bold text-gray-900 dark:text-white">시설 & 요금</h3>

          <div>
            <label htmlFor="admin-venue-new-facility" className={labelClass}>부대시설</label>
            <div className="flex gap-2">
              <input
                id="admin-venue-new-facility"
                type="text"
                value={facilityInput}
                onChange={(e) => setFacilityInput(e.target.value)}
                onKeyDown={handleFacilityKeyDown}
                placeholder="시설을 입력 후 Enter"
                className={`flex-1 ${inputClass}`}
              />
              <button
                type="button"
                onClick={addFacility}
                className="shrink-0 flex items-center justify-center rounded-xl bg-gray-900 dark:bg-gray-600 px-3 text-white hover:bg-gray-800 dark:hover:bg-gray-500 transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
            {form.facilities.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {form.facilities.map((f) => (
                  <span key={f} className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                    {f}
                    <button type="button" onClick={() => removeFacility(f)} className="text-blue-400 hover:text-blue-600">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="admin-venue-new-price" className={labelClass}>시간당 요금 (원)</label>
            <input id="admin-venue-new-price" type="number" value={form.pricePerHour} onChange={(e) => updateField('pricePerHour', e.target.value)} placeholder="50000" className={inputClass} />
          </div>
        </div>

        {/* Operating hours */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <h3 className="text-md font-bold text-gray-900 dark:text-white">운영 시간</h3>

          <div>
            <p className={labelClass}>평일</p>
            <div className="flex items-center gap-2">
              <label htmlFor="admin-venue-new-weekday-open" className="sr-only">평일 오픈 시간</label>
              <input id="admin-venue-new-weekday-open" type="time" value={form.weekdayOpen} onChange={(e) => updateField('weekdayOpen', e.target.value)} className={inputClass} />
              <span className="text-gray-400 shrink-0">~</span>
              <label htmlFor="admin-venue-new-weekday-close" className="sr-only">평일 마감 시간</label>
              <input id="admin-venue-new-weekday-close" type="time" value={form.weekdayClose} onChange={(e) => updateField('weekdayClose', e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <p className={labelClass}>주말</p>
            <div className="flex items-center gap-2">
              <label htmlFor="admin-venue-new-weekend-open" className="sr-only">주말 오픈 시간</label>
              <input id="admin-venue-new-weekend-open" type="time" value={form.weekendOpen} onChange={(e) => updateField('weekendOpen', e.target.value)} className={inputClass} />
              <span className="text-gray-400 shrink-0">~</span>
              <label htmlFor="admin-venue-new-weekend-close" className="sr-only">주말 마감 시간</label>
              <input id="admin-venue-new-weekend-close" type="time" value={form.weekendClose} onChange={(e) => updateField('weekendClose', e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-2">
          <Link
            href="/admin/venues"
            className="rounded-xl border border-gray-200 dark:border-gray-700 px-6 py-3 text-base font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            취소
          </Link>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name}
            className={`flex-1 rounded-xl py-3 text-base font-semibold text-white transition-[colors,transform] ${
              mutation.isPending || !form.name
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 active:scale-[0.98]'
            }`}
          >
            {mutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                등록 중...
              </span>
            ) : (
              '시설 등록'
            )}
          </button>
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-500 text-center">시설 등록에 실패했습니다. 다시 시도해주세요.</p>
        )}
      </div>

      <div className="h-6" />
    </div>
  );
}
