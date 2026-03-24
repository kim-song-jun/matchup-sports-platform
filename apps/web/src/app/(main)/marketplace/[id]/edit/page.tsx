'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Trash2, AlertTriangle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

const sports = [
  { type: 'futsal', label: '풋살' },
  { type: 'basketball', label: '농구' },
  { type: 'badminton', label: '배드민턴' },
  { type: 'ice_hockey', label: '아이스하키' },
];

const categories = [
  '축구화/풋살화', '농구화', '라켓', '유니폼', '보호장비', '하키장비', '스케이트', '기타',
];

const conditions = [
  { value: 'new', label: '새 상품' },
  { value: 'like_new', label: '거의 새 것' },
  { value: 'good', label: '양호' },
  { value: 'fair', label: '사용감 있음' },
  { value: 'poor', label: '하자 있음' },
];

const statusOptions = [
  { value: 'on_sale', label: '판매중' },
  { value: 'reserved', label: '예약중' },
  { value: 'sold', label: '판매완료' },
];

const mockListingData: Record<string, {
  title: string; description: string; sportType: string; category: string;
  condition: string; price: number; status: string;
}> = {
  'listing-1': {
    title: '나이키 팬텀 GX 풋살화 265', sportType: 'futsal', category: '축구화/풋살화',
    condition: 'like_new', price: 85000, status: 'on_sale',
    description: '2번 착용한 풋살화입니다. 실내용. 사이즈 265. 발볼 넓은 편이에요. 직거래 강남역 선호.',
  },
  'listing-2': {
    title: 'CCM 아이스하키 스틱 (좌)', sportType: 'ice_hockey', category: '하키장비',
    condition: 'good', price: 120000, status: 'reserved',
    description: 'CCM Jetspeed FT5 Pro. 플렉스 85. 좌타용. 블레이드 P29 커브. 약 6개월 사용.',
  },
};

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const listingId = params.id as string;

  const initialData = mockListingData[listingId] || mockListingData['listing-1'];
  const [form, setForm] = useState(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleSave = async () => {
    if (!form.title) return toast('error', '제목을 입력해주세요');
    if (form.price <= 0) return toast('error', '가격을 입력해주세요');
    setIsSaving(true);
    try {
      await api.patch(`/marketplace/listings/${listingId}`, form);
      toast('success', '매물 정보가 저장되었어요');
      router.push(`/marketplace/${listingId}`);
    } catch {
      toast('error', '수정에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/marketplace/listings/${listingId}`);
      toast('success', '매물이 삭제되었어요');
      router.push('/my/listings');
    } catch {
      toast('error', '삭제하지 못했어요. 다시 시도해주세요');
    }
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-lg -ml-1.5 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">매물 수정</h1>
      </header>
      <div className="hidden lg:flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/marketplace" className="hover:text-gray-600 transition-colors">장터</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">매물 수정</span>
      </div>

      <div className="px-5 lg:px-0 pb-8 max-w-lg lg:max-w-[700px]">
        {/* Title */}
        <div className="mb-5">
          <label className="block text-[14px] font-semibold text-gray-700 mb-2">제목</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Description */}
        <div className="mb-5">
          <label className="block text-[14px] font-semibold text-gray-700 mb-2">설명</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors resize-none"
          />
        </div>

        {/* Sport Type */}
        <div className="mb-5">
          <label className="block text-[14px] font-semibold text-gray-700 mb-2">종목</label>
          <div className="flex gap-2 flex-wrap">
            {sports.map((s) => (
              <button
                key={s.type}
                onClick={() => setForm({ ...form, sportType: s.type })}
                className={`rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all ${
                  form.sportType === s.type ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        <div className="mb-5">
          <label className="block text-[14px] font-semibold text-gray-700 mb-2">카테고리</label>
          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setForm({ ...form, category: cat })}
                className={`rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all ${
                  form.category === cat ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Condition */}
        <div className="mb-5">
          <label className="block text-[14px] font-semibold text-gray-700 mb-2">상품 상태</label>
          <div className="flex gap-2 flex-wrap">
            {conditions.map((c) => (
              <button
                key={c.value}
                onClick={() => setForm({ ...form, condition: c.value })}
                className={`rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all ${
                  form.condition === c.value ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Price */}
        <div className="mb-5">
          <label className="block text-[14px] font-semibold text-gray-700 mb-2">가격 (원)</label>
          <input
            type="number"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: parseInt(e.target.value) || 0 })}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Status */}
        <div className="mb-8">
          <label className="block text-[14px] font-semibold text-gray-700 mb-2">판매 상태</label>
          <div className="flex gap-2">
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setForm({ ...form, status: opt.value })}
                className={`rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all ${
                  form.status === opt.value ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-red-50 px-5 py-3.5 text-[15px] font-semibold text-red-500 hover:bg-red-100 transition-colors"
          >
            <Trash2 size={16} />
            삭제
          </button>
          <button
            onClick={() => router.back()}
            className="flex-1 rounded-xl bg-gray-100 py-3.5 text-[15px] font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 className="text-[17px] font-bold text-gray-900 text-center">매물을 삭제하시겠어요?</h3>
            <p className="text-[14px] text-gray-500 text-center mt-2">삭제된 매물은 복구할 수 없습니다.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 rounded-xl bg-gray-100 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-200 transition-colors">돌아가기</button>
              <button onClick={handleDelete} className="flex-1 rounded-xl bg-red-500 py-3 text-[14px] font-semibold text-white hover:bg-red-600 transition-colors">삭제하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
