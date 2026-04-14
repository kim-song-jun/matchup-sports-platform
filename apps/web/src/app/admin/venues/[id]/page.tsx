'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  ChevronRight,
  Loader2,
  Save,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDeleteAdminVenue, useAdminVenue } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';

const sportOptions = [
  { value: 'soccer', label: '축구' },
  { value: 'futsal', label: '풋살' },
  { value: 'basketball', label: '농구' },
  { value: 'badminton', label: '배드민턴' },
  { value: 'ice_hockey', label: '아이스하키' },
  { value: 'figure_skating', label: '피겨' },
  { value: 'short_track', label: '쇼트트랙' },
  { value: 'swimming', label: '수영' },
  { value: 'tennis', label: '테니스' },
  { value: 'baseball', label: '야구' },
  { value: 'volleyball', label: '배구' },
];

const venueTypes = [
  { value: 'soccer_field', label: '축구장' },
  { value: 'futsal_court', label: '풋살장' },
  { value: 'basketball_court', label: '농구장' },
  { value: 'badminton_court', label: '배드민턴장' },
  { value: 'ice_rink', label: '아이스링크' },
  { value: 'gymnasium', label: '체육관' },
  { value: 'swimming_pool', label: '수영장' },
  { value: 'tennis_court', label: '테니스장' },
];

type VenueFormState = {
  name: string;
  type: string;
  sportTypes: string[];
  address: string;
  city: string;
  district: string;
  phone: string;
  description: string;
  facilities: string[];
  pricePerHour: string;
  weekdayOpen: string;
  weekdayClose: string;
  weekendOpen: string;
  weekendClose: string;
};

function createEmptyForm(): VenueFormState {
  return {
    name: '',
    type: '',
    sportTypes: [],
    address: '',
    city: '',
    district: '',
    phone: '',
    description: '',
    facilities: [],
    pricePerHour: '',
    weekdayOpen: '',
    weekdayClose: '',
    weekendOpen: '',
    weekendClose: '',
  };
}

function toFormState(venue: NonNullable<ReturnType<typeof useAdminVenue>['data']>): VenueFormState {
  const hours = venue.operatingHours as Record<string, { open: string; close: string }> | undefined;

  return {
    name: venue.name,
    type: venue.type,
    sportTypes: venue.sportTypes ?? [],
    address: venue.address,
    city: venue.city,
    district: venue.district,
    phone: venue.phone ?? '',
    description: venue.description ?? '',
    facilities: venue.facilities ?? [],
    pricePerHour: venue.pricePerHour != null ? String(venue.pricePerHour) : '',
    weekdayOpen: hours?.weekday?.open ?? '',
    weekdayClose: hours?.weekday?.close ?? '',
    weekendOpen: hours?.weekend?.open ?? '',
    weekendClose: hours?.weekend?.close ?? '',
  };
}

export default function AdminVenueEditPage() {
  const params = useParams();
  const router = useRouter();
  const venueId = params.id as string;
  const { toast } = useToast();
  const { data: venue, isLoading, isError, refetch } = useAdminVenue(venueId);
  const deleteVenue = useDeleteAdminVenue();

  const [form, setForm] = useState<VenueFormState>(createEmptyForm);
  const [facilityInput, setFacilityInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (venue) {
      setForm(toFormState(venue));
      setSaved(false);
    }
  }, [venue]);

  const updateField = (key: keyof VenueFormState, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const toggleSport = (sport: string) => {
    setForm((prev) => ({
      ...prev,
      sportTypes: prev.sportTypes.includes(sport)
        ? prev.sportTypes.filter((item) => item !== sport)
        : [...prev.sportTypes, sport],
    }));
    setSaved(false);
  };

  const addFacility = () => {
    const trimmed = facilityInput.trim();
    if (!trimmed || form.facilities.includes(trimmed)) return;
    setForm((prev) => ({ ...prev, facilities: [...prev.facilities, trimmed] }));
    setFacilityInput('');
    setSaved(false);
  };

  const removeFacility = (facility: string) => {
    setForm((prev) => ({
      ...prev,
      facilities: prev.facilities.filter((item) => item !== facility),
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/venues/${venueId}`, {
        name: form.name,
        type: form.type || undefined,
        sportTypes: form.sportTypes,
        address: form.address,
        city: form.city,
        district: form.district,
        phone: form.phone || undefined,
        description: form.description || undefined,
        facilities: form.facilities,
        pricePerHour: form.pricePerHour ? Number(form.pricePerHour) : undefined,
        operatingHours: {
          ...(form.weekdayOpen || form.weekdayClose ? {
            weekday: { open: form.weekdayOpen, close: form.weekdayClose },
          } : {}),
          ...(form.weekendOpen || form.weekendClose ? {
            weekend: { open: form.weekendOpen, close: form.weekendClose },
          } : {}),
        },
      });
      setSaved(true);
      toast('success', '시설 정보가 저장되었어요');
      await refetch();
    } catch (error) {
      const axiosErr = error as { response?: { data?: { message?: string } } };
      toast('error', axiosErr.response?.data?.message || '저장하지 못했어요. 다시 시도해주세요');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteVenue.mutateAsync(venueId);
      toast('success', '시설이 삭제되었어요');
      router.push('/admin/venues');
    } catch (error) {
      const axiosErr = error as { response?: { data?: { message?: string } } };
      toast('error', axiosErr.response?.data?.message || '삭제하지 못했어요. 다시 시도해주세요');
    }
  };

  const inputClass = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-base text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 focus:bg-white dark:focus:bg-gray-700 transition-colors';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse max-w-2xl">
        <div className="h-8 w-48 rounded-lg bg-gray-100 dark:bg-gray-800" />
        <div className="h-64 rounded-2xl bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState message="시설 상세를 불러오지 못했어요" onRetry={() => void refetch()} />;
  }

  if (!venue) {
    return (
      <EmptyState
        icon={Building2}
        title="시설을 찾을 수 없어요"
        description="삭제되었거나 존재하지 않는 시설이에요"
        action={{ label: '목록으로', href: '/admin/venues' }}
      />
    );
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/admin/venues" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">시설 관리</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">시설 수정</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
            <Building2 size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">시설 수정</h1>
            <p className="text-sm text-gray-400">ID: {venueId}</p>
          </div>
        </div>
        <button
          onClick={() => void handleDelete()}
          disabled={deleteVenue.isPending}
          className="flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 transition-colors"
        >
          {deleteVenue.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          삭제
        </button>
      </div>

      <div className="space-y-5">
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <h2 className="text-md font-bold text-gray-900 dark:text-white">기본 정보</h2>

          <div>
            <label htmlFor="venue-name" className={labelClass}>시설명</label>
            <input id="venue-name" type="text" value={form.name} onChange={(event) => updateField('name', event.target.value)} className={inputClass} />
          </div>

          <div>
            <label htmlFor="venue-type" className={labelClass}>시설 유형</label>
            <select id="venue-type" value={form.type} onChange={(event) => updateField('type', event.target.value)} className={inputClass}>
              <option value="">유형 선택</option>
              {venueTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>가능 종목</label>
            <div className="flex flex-wrap gap-2">
              {sportOptions.map((sport) => {
                const selected = form.sportTypes.includes(sport.value);
                return (
                  <button
                    key={sport.value}
                    type="button"
                    onClick={() => toggleSport(sport.value)}
                    className={`min-h-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      selected
                        ? 'bg-gray-900 dark:bg-gray-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {sport.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="venue-address" className={labelClass}>주소</label>
            <input id="venue-address" type="text" value={form.address} onChange={(event) => updateField('address', event.target.value)} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="venue-city" className={labelClass}>도시</label>
              <input id="venue-city" type="text" value={form.city} onChange={(event) => updateField('city', event.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="venue-district" className={labelClass}>구/군</label>
              <input id="venue-district" type="text" value={form.district} onChange={(event) => updateField('district', event.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label htmlFor="venue-phone" className={labelClass}>연락처</label>
            <input id="venue-phone" type="text" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} className={inputClass} />
          </div>

          <div>
            <label htmlFor="venue-description" className={labelClass}>설명</label>
            <textarea id="venue-description" rows={4} value={form.description} onChange={(event) => updateField('description', event.target.value)} className={`${inputClass} resize-none`} />
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <h2 className="text-md font-bold text-gray-900 dark:text-white">부대시설 / 운영정보</h2>

          <div>
            <label htmlFor="facility-input" className={labelClass}>부대시설</label>
            <div className="flex gap-2">
              <input
                id="facility-input"
                type="text"
                value={facilityInput}
                onChange={(event) => setFacilityInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addFacility();
                  }
                }}
                placeholder="예: 샤워실"
                className={inputClass}
              />
              <button type="button" onClick={addFacility} className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white">
                추가
              </button>
            </div>
            {form.facilities.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {form.facilities.map((facility) => (
                  <button
                    key={facility}
                    type="button"
                    onClick={() => removeFacility(facility)}
                    className="rounded-full bg-gray-100 dark:bg-gray-700 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300"
                  >
                    {facility} ×
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <label htmlFor="venue-price" className={labelClass}>시간당 대여료</label>
            <input id="venue-price" type="number" min="0" value={form.pricePerHour} onChange={(event) => updateField('pricePerHour', event.target.value)} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="weekday-open" className={labelClass}>평일 오픈</label>
              <input id="weekday-open" type="time" value={form.weekdayOpen} onChange={(event) => updateField('weekdayOpen', event.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="weekday-close" className={labelClass}>평일 마감</label>
              <input id="weekday-close" type="time" value={form.weekdayClose} onChange={(event) => updateField('weekdayClose', event.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="weekend-open" className={labelClass}>주말 오픈</label>
              <input id="weekend-open" type="time" value={form.weekendOpen} onChange={(event) => updateField('weekendOpen', event.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="weekend-close" className={labelClass}>주말 마감</label>
              <input id="weekend-close" type="time" value={form.weekendClose} onChange={(event) => updateField('weekendClose', event.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {saved ? <span className="text-sm text-green-600 dark:text-green-400">저장됨</span> : null}
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
