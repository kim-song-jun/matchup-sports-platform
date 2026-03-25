'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronRight, X, Plus, Loader2, Trash2, AlertTriangle,
  Building2, Save,
} from 'lucide-react';
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

// Mock venue data keyed by ID
const mockVenues: Record<string, any> = {
  '1': {
    id: '1', name: '서울 풋살파크', type: 'indoor',
    sportTypes: ['futsal', 'basketball'],
    address: '서울시 강남구 테헤란로 123', city: '서울', district: '강남구',
    phone: '02-1234-5678', description: '최신 시설의 실내 풋살장입니다. 냉난방 완비.',
    facilities: ['주차장', '샤워실', '탈의실', '매점', '음수대'],
    pricePerHour: 80000,
    operatingHours: {
      weekday: { open: '09:00', close: '23:00' },
      weekend: { open: '08:00', close: '22:00' },
    },
  },
  '2': {
    id: '2', name: '한강 농구코트', type: 'outdoor',
    sportTypes: ['basketball'],
    address: '서울시 영등포구 여의도동 한강공원', city: '서울', district: '영등포구',
    phone: '02-9876-5432', description: '야외 농구 코트 2면. 야간 조명 설치.',
    facilities: ['주차장', '야간조명', '화장실'],
    pricePerHour: 40000,
    operatingHours: {
      weekday: { open: '06:00', close: '22:00' },
      weekend: { open: '06:00', close: '22:00' },
    },
  },
};

function getVenueData(id: string) {
  return mockVenues[id] || {
    id, name: 'MatchUp 스포츠센터', type: 'gym',
    sportTypes: ['futsal', 'badminton'],
    address: '서울시 마포구 월드컵로 100', city: '서울', district: '마포구',
    phone: '02-5555-1234', description: '다목적 체육관입니다.',
    facilities: ['주차장', '샤워실'],
    pricePerHour: 60000,
    operatingHours: {
      weekday: { open: '09:00', close: '22:00' },
      weekend: { open: '10:00', close: '20:00' },
    },
  };
}

export default function AdminVenueEditPage() {
  const params = useParams();
  const router = useRouter();
  const venueId = params.id as string;
  const venueData = getVenueData(venueId);

  const [form, setForm] = useState({
    name: venueData.name,
    type: venueData.type,
    sportTypes: venueData.sportTypes as string[],
    address: venueData.address,
    city: venueData.city,
    district: venueData.district,
    phone: venueData.phone,
    description: venueData.description,
    facilities: venueData.facilities as string[],
    pricePerHour: String(venueData.pricePerHour),
    weekdayOpen: venueData.operatingHours.weekday.open,
    weekdayClose: venueData.operatingHours.weekday.close,
    weekendOpen: venueData.operatingHours.weekend.open,
    weekendClose: venueData.operatingHours.weekend.close,
  });

  const { toast } = useToast();
  const [facilityInput, setFacilityInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const updateField = (key: string, value: string | number | boolean | string[]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const toggleSport = (sport: string) => {
    setForm((prev) => ({
      ...prev,
      sportTypes: prev.sportTypes.includes(sport)
        ? prev.sportTypes.filter((s) => s !== sport)
        : [...prev.sportTypes, sport],
    }));
    setSaved(false);
  };

  const addFacility = () => {
    const trimmed = facilityInput.trim();
    if (trimmed && !form.facilities.includes(trimmed)) {
      setForm((prev) => ({ ...prev, facilities: [...prev.facilities, trimmed] }));
      setFacilityInput('');
      setSaved(false);
    }
  };

  const removeFacility = (f: string) => {
    setForm((prev) => ({ ...prev, facilities: prev.facilities.filter((x) => x !== f) }));
    setSaved(false);
  };

  const handleFacilityKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addFacility();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/venues/${venueId}`, {
        name: form.name,
        type: form.type,
        sportTypes: form.sportTypes,
        address: form.address,
        city: form.city,
        district: form.district,
        phone: form.phone,
        description: form.description,
        facilities: form.facilities,
        pricePerHour: Number(form.pricePerHour),
        operatingHours: {
          weekday: { open: form.weekdayOpen, close: form.weekdayClose },
          weekend: { open: form.weekendOpen, close: form.weekendClose },
        },
      });
      setSaved(true);
      toast('success', '시설 정보가 저장되었어요');
    } catch {
      toast('error', '저장하지 못했어요. 네트워크 연결을 확인해주세요');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/admin/venues/${venueId}`);
      toast('success', '시설이 삭제되었어요');
      setShowDeleteModal(false);
      router.push('/admin/venues');
    } catch {
      toast('error', '삭제하지 못했어요. 다시 시도해주세요');
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 focus:bg-white transition-all';
  const labelClass = 'block text-[13px] font-semibold text-gray-700 mb-1.5';

  return (
    <div className="animate-fade-in max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/admin/venues" className="hover:text-gray-600 transition-colors">시설 관리</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">시설 수정</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
            <Building2 size={20} />
          </div>
          <div>
            <h1 className="text-[24px] font-bold text-gray-900">시설 수정</h1>
            <p className="text-[13px] text-gray-400">ID: {venueId}</p>
          </div>
        </div>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-600 hover:bg-red-100 transition-colors"
        >
          <Trash2 size={14} />
          삭제
        </button>
      </div>

      <div className="space-y-5">
        {/* Basic info */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4">
          <h3 className="text-[15px] font-bold text-gray-900">기본 정보</h3>

          <div>
            <label className={labelClass}>시설명</label>
            <input type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="예: 마포 풋살파크" className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>시설 유형</label>
            <select value={form.type} onChange={(e) => updateField('type', e.target.value)} className={inputClass}>
              <option value="">유형 선택</option>
              {venueTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>가능 종목</label>
            <div className="flex flex-wrap gap-2">
              {sportOptions.map((s) => {
                const selected = form.sportTypes.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleSport(s.value)}
                    className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
                      selected
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={labelClass}>설명</label>
            <textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="시설의 특징, 편의시설 등을 소개해주세요"
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>

        {/* Location */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4">
          <h3 className="text-[15px] font-bold text-gray-900">위치 정보</h3>

          <div>
            <label className={labelClass}>주소</label>
            <input type="text" value={form.address} onChange={(e) => updateField('address', e.target.value)} placeholder="예: 서울시 마포구 월드컵로 123" className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>시/도</label>
              <input type="text" value={form.city} onChange={(e) => updateField('city', e.target.value)} placeholder="서울" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>구/군</label>
              <input type="text" value={form.district} onChange={(e) => updateField('district', e.target.value)} placeholder="강남구" className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>전화번호</label>
            <input type="tel" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="02-1234-5678" className={inputClass} />
          </div>
        </div>

        {/* Facilities & Price */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4">
          <h3 className="text-[15px] font-bold text-gray-900">시설 & 요금</h3>

          <div>
            <label className={labelClass}>부대시설</label>
            <div className="flex gap-2">
              <input
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
                className="shrink-0 flex items-center justify-center rounded-xl bg-gray-900 px-3 text-white hover:bg-gray-800 transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
            {form.facilities.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {form.facilities.map((f) => (
                  <span key={f} className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-[12px] font-medium text-blue-600">
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
            <label className={labelClass}>시간당 요금 (원)</label>
            <input type="number" value={form.pricePerHour} onChange={(e) => updateField('pricePerHour', e.target.value)} placeholder="50000" className={inputClass} />
          </div>
        </div>

        {/* Operating hours */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4">
          <h3 className="text-[15px] font-bold text-gray-900">운영 시간</h3>

          <div>
            <label className={labelClass}>평일</label>
            <div className="flex items-center gap-2">
              <input type="time" value={form.weekdayOpen} onChange={(e) => updateField('weekdayOpen', e.target.value)} className={inputClass} />
              <span className="text-gray-400 shrink-0">~</span>
              <input type="time" value={form.weekdayClose} onChange={(e) => updateField('weekdayClose', e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>주말</label>
            <div className="flex items-center gap-2">
              <input type="time" value={form.weekendOpen} onChange={(e) => updateField('weekendOpen', e.target.value)} className={inputClass} />
              <span className="text-gray-400 shrink-0">~</span>
              <input type="time" value={form.weekendClose} onChange={(e) => updateField('weekendClose', e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Link
            href="/admin/venues"
            className="rounded-xl border border-gray-200 px-6 py-3 text-[14px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            취소
          </Link>
          <button
            onClick={handleSave}
            disabled={saving || !form.name}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold text-white transition-all ${
              saving || !form.name
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 active:scale-[0.98]'
            }`}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                저장 중...
              </>
            ) : saved ? (
              <>
                <Save size={16} />
                저장 완료
              </>
            ) : (
              <>
                <Save size={16} />
                변경사항 저장
              </>
            )}
          </button>
        </div>

        {saved && (
          <p className="text-[13px] text-green-500 text-center">시설 정보가 성공적으로 저장되었습니다.</p>
        )}
      </div>

      <div className="h-6" />

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 mx-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-gray-900">시설 삭제</h3>
                <p className="text-[13px] text-gray-400">이 작업은 되돌릴 수 없습니다</p>
              </div>
            </div>
            <p className="text-[14px] text-gray-600 mb-6">
              <span className="font-semibold text-gray-900">{form.name}</span> 시설을 삭제할까요?
              관련된 예약과 리뷰 데이터도 함께 삭제됩니다.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[14px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                돌아가기
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-[14px] font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    삭제 중...
                  </>
                ) : (
                  '삭제'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
