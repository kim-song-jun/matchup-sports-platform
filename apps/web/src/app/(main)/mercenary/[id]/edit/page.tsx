'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Save, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

const positionOptions = [
  { value: 'gk', label: 'GK' },
  { value: 'df', label: 'DF' },
  { value: 'mf', label: 'MF' },
  { value: 'fw', label: 'FW' },
  { value: 'any', label: '무관' },
];

const levelOptions = [
  { value: 'beginner', label: '입문' },
  { value: 'lower', label: '하' },
  { value: 'middle', label: '중' },
  { value: 'upper', label: '상' },
  { value: 'pro', label: '프로' },
];

// Mock data for pre-fill since mercenary is in-memory
const mockMercenaryData: Record<string, {
  team: string;
  matchDate: string;
  venue: string;
  position: string;
  count: number;
  level: string;
  fee: number;
  notes: string;
}> = {
  'merc-1': {
    team: 'FC 서울라이트',
    matchDate: '2026-03-28',
    venue: '강남 풋살파크',
    position: 'mf',
    count: 1,
    level: 'middle',
    fee: 10000,
    notes: '14:00~16:00 풋살 경기 용병 구합니다. 기본기 있는 분 환영!',
  },
  'merc-2': {
    team: '강남 슬래머즈',
    matchDate: '2026-04-01',
    venue: '잠실 실내체육관',
    position: 'any',
    count: 2,
    level: 'lower',
    fee: 0,
    notes: '농구 3:3 용병 모집합니다. 즐겁게 하실 분!',
  },
};

interface FormData {
  team: string;
  matchDate: string;
  venue: string;
  position: string;
  count: number;
  level: string;
  fee: number;
  notes: string;
}

export default function EditMercenaryPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;

  const mockData = mockMercenaryData[id];
  const initialData: FormData = mockData
    ? { ...mockData }
    : {
        team: '',
        matchDate: '',
        venue: '',
        position: 'any',
        count: 1,
        level: 'middle',
        fee: 0,
        notes: '',
      };

  const [form, setForm] = useState<FormData>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const handleSave = async () => {
    if (!form.team || !form.matchDate || !form.venue) {
      toast('error', '필수 항목을 입력해주세요');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.patch(`/mercenary/${id}`, form);
      toast('success', '용병 모집글이 수정되었습니다');
      router.push('/my/mercenary');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '수정에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await api.delete(`/mercenary/${id}`);
      toast('success', '용병 모집글이 삭제되었습니다');
      router.push('/my/mercenary');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '삭제에 실패했습니다');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (!mockData) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-gray-500">모집글을 찾을 수 없습니다</p>
        <Link href="/mercenary" className="text-blue-500 text-sm mt-2 inline-block">목록으로</Link>
      </div>
    );
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white transition-all';

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-50">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-lg p-2 -ml-2 hover:bg-gray-100 active:scale-[0.98] transition-all min-w-[44px] min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900 truncate flex-1">용병 모집 수정</h1>
      </header>

      {/* Desktop breadcrumb */}
      <div className="hidden lg:flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/mercenary" className="hover:text-gray-600">용병</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">수정</span>
      </div>

      <div className="px-5 lg:px-0 max-w-2xl">
        {/* 팀명 */}
        <section className="mb-5">
          <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
            팀명 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.team}
            onChange={(e) => update('team', e.target.value)}
            placeholder="예: FC 서울라이트"
            className={inputClass}
          />
        </section>

        {/* 경기 날짜 */}
        <section className="mb-5">
          <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
            경기 날짜 <span className="text-red-400">*</span>
          </label>
          <input
            type="date"
            value={form.matchDate}
            onChange={(e) => update('matchDate', e.target.value)}
            className={inputClass}
          />
        </section>

        {/* 장소 */}
        <section className="mb-5">
          <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
            장소 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.venue}
            onChange={(e) => update('venue', e.target.value)}
            placeholder="예: 강남 풋살파크"
            className={inputClass}
          />
        </section>

        {/* 포지션 */}
        <section className="mb-5">
          <label className="text-[13px] font-medium text-gray-700 mb-2 block">포지션</label>
          <div className="flex gap-2">
            {positionOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => update('position', opt.value)}
                className={`flex-1 rounded-xl border-2 py-3 text-[14px] font-semibold text-center transition-all ${
                  form.position === opt.value
                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                    : 'border-gray-100 text-gray-600 hover:border-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* 모집 인원 / 참가비 */}
        <section className="mb-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">모집 인원</label>
              <input
                type="number"
                value={form.count}
                onChange={(e) => update('count', Math.max(1, +e.target.value))}
                min={1}
                max={10}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">참가비 (원)</label>
              <input
                type="number"
                value={form.fee}
                onChange={(e) => update('fee', +e.target.value)}
                min={0}
                step={1000}
                className={inputClass}
              />
              {form.fee > 0 && (
                <p className="text-[12px] text-gray-400 mt-1">
                  {new Intl.NumberFormat('ko-KR').format(form.fee)}원
                </p>
              )}
            </div>
          </div>
        </section>

        {/* 요구 레벨 */}
        <section className="mb-5">
          <label className="text-[13px] font-medium text-gray-700 mb-2 block">요구 레벨</label>
          <div className="flex gap-2">
            {levelOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => update('level', opt.value)}
                className={`flex-1 rounded-xl border-2 py-3 text-[14px] font-semibold text-center transition-all ${
                  form.level === opt.value
                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                    : 'border-gray-100 text-gray-600 hover:border-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* 비고 */}
        <section className="mb-6">
          <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">비고</label>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="추가 안내사항을 입력해주세요"
            rows={4}
            className={`${inputClass} resize-none`}
          />
        </section>

        {/* Action buttons */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-red-200 px-5 py-3.5 text-[14px] font-semibold text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={16} />
            삭제
          </button>
          <button
            onClick={handleSave}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            <Save size={16} />
            {isSubmitting ? '저장 중...' : '수정 완료'}
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 animate-fade-in">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 className="text-[17px] font-bold text-gray-900 text-center">모집글을 삭제하시겠어요?</h3>
            <p className="text-[14px] text-gray-500 text-center mt-2">삭제하면 되돌릴 수 없습니다.</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 rounded-xl bg-gray-100 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
              >
                돌아가기
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 rounded-xl bg-red-500 py-3 text-[14px] font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? '삭제 중...' : '삭제하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
