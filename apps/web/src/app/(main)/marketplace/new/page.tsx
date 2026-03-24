'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Camera, Plus, X } from 'lucide-react';
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

const categories = [
  '축구화/풋살화', '농구화', '라켓', '유니폼', '보호장비',
  '하키장비', '스케이트', '기타',
];

const conditions = [
  { value: 'new', label: '새 상품', desc: '사용하지 않은 새 상품' },
  { value: 'like_new', label: '거의 새 것', desc: '사용감 거의 없음' },
  { value: 'good', label: '양호', desc: '사용감 적음' },
  { value: 'fair', label: '사용감 있음', desc: '사용감 있으나 기능 정상' },
  { value: 'poor', label: '하자 있음', desc: '일부 기능 하자' },
];

export default function CreateListingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    sportType: '',
    category: '',
    condition: '',
    price: 0,
    listingType: 'sell' as 'sell' | 'rent',
    rentalPricePerDay: 0,
    rentalDeposit: 0,
  });

  const handleSubmit = async () => {
    if (!form.title) return toast('error', '제목을 입력해주세요');
    if (!form.sportType) return toast('error', '종목을 선택해주세요');
    if (!form.condition) return toast('error', '상품 상태를 선택해주세요');
    if (form.price <= 0) return toast('error', '가격을 입력해주세요');

    setIsSubmitting(true);
    try {
      await api.post('/marketplace/listings', form);
      toast('success', '매물이 등록되었습니다!');
      router.push('/marketplace');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '등록에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-[15px] font-medium text-gray-700">로그인 후 매물을 등록할 수 있어요</p>
        <button onClick={() => router.push('/login')} className="mt-4 rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white">로그인</button>
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-lg -ml-1.5 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">매물 등록</h1>
      </header>

      {/* Desktop breadcrumb */}
      <div className="hidden lg:flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/marketplace" className="hover:text-gray-600 transition-colors">장터</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">매물 등록</span>
      </div>

      <div className="px-5 lg:px-0 max-w-2xl">
        {/* 사진 추가 영역 */}
        <div className="mb-6">
          <label className="block text-[13px] font-semibold text-gray-700 mb-2">
            상품 이미지
          </label>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
            <button className="flex h-[80px] w-[80px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-colors">
              <Camera size={22} />
              <span className="text-[11px] font-medium">0/10</span>
            </button>
            {/* Placeholder thumbnails */}
            {[1, 2].map((i) => (
              <div key={i} className="relative h-[80px] w-[80px] shrink-0 rounded-xl bg-gray-100 flex items-center justify-center opacity-30">
                <Plus size={20} className="text-gray-300" />
              </div>
            ))}
          </div>
          <p className="text-[12px] text-gray-400 mt-1.5">첫 번째 사진이 대표 이미지로 등록됩니다</p>
        </div>

        {/* 제목 */}
        <Field label="제목" required>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="상품 제목을 입력해주세요"
            className="input-field"
          />
        </Field>

        {/* 종목 */}
        <Field label="종목" required>
          <div className="grid grid-cols-2 gap-2">
            {sports.map((s) => {
              const Icon = SportIconMap[s.type];
              const selected = form.sportType === s.type;
              return (
                <button
                  key={s.type}
                  type="button"
                  onClick={() => setForm({ ...form, sportType: s.type })}
                  className={`flex items-center gap-2.5 rounded-xl border-2 p-3 transition-all text-left ${
                    selected ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  {Icon && <Icon size={20} />}
                  <span className="text-[14px] font-medium">{s.label}</span>
                </button>
              );
            })}
          </div>
        </Field>

        {/* 카테고리 */}
        <Field label="카테고리" required>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setForm({ ...form, category: cat })}
                className={`rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all ${
                  form.category === cat
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </Field>

        {/* 상품 상태 */}
        <Field label="상품 상태" required>
          <div className="space-y-2">
            {conditions.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setForm({ ...form, condition: c.value })}
                className={`w-full text-left rounded-xl border-2 p-3.5 transition-all ${
                  form.condition === c.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <p className={`text-[14px] font-semibold ${form.condition === c.value ? 'text-blue-600' : 'text-gray-900'}`}>
                  {c.label}
                </p>
                <p className="text-[12px] text-gray-400 mt-0.5">{c.desc}</p>
              </button>
            ))}
          </div>
        </Field>

        {/* 거래 방식 */}
        <Field label="거래 방식">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, listingType: 'sell' })}
              className={`rounded-xl border-2 py-3 text-[14px] font-semibold transition-all ${
                form.listingType === 'sell'
                  ? 'border-blue-500 bg-blue-50 text-blue-600'
                  : 'border-gray-100 text-gray-500 hover:border-gray-200'
              }`}
            >
              판매
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, listingType: 'rent' })}
              className={`rounded-xl border-2 py-3 text-[14px] font-semibold transition-all ${
                form.listingType === 'rent'
                  ? 'border-blue-500 bg-blue-50 text-blue-600'
                  : 'border-gray-100 text-gray-500 hover:border-gray-200'
              }`}
            >
              대여
            </button>
          </div>
        </Field>

        {/* 가격 */}
        <Field label="가격" required>
          <div className="relative">
            <input
              type="number"
              value={form.price || ''}
              onChange={(e) => setForm({ ...form, price: +e.target.value })}
              placeholder="0"
              min={0}
              step={1000}
              className="input-field pr-10"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-gray-400">원</span>
          </div>
        </Field>

        {/* 대여 추가 정보 */}
        {form.listingType === 'rent' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="일일 대여비">
              <div className="relative">
                <input
                  type="number"
                  value={form.rentalPricePerDay || ''}
                  onChange={(e) => setForm({ ...form, rentalPricePerDay: +e.target.value })}
                  placeholder="0"
                  className="input-field pr-10"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-gray-400">원</span>
              </div>
            </Field>
            <Field label="보증금">
              <div className="relative">
                <input
                  type="number"
                  value={form.rentalDeposit || ''}
                  onChange={(e) => setForm({ ...form, rentalDeposit: +e.target.value })}
                  placeholder="0"
                  className="input-field pr-10"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-gray-400">원</span>
              </div>
            </Field>
          </div>
        )}

        {/* 설명 */}
        <Field label="상세 설명">
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="구매시기, 브랜드/모델명, 사용감 등 자세하게 적어주세요"
            rows={5}
            className="input-field resize-none"
          />
        </Field>

        {/* 등록 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-50 mt-2 mb-8"
        >
          {isSubmitting ? '등록 중...' : '매물 등록하기'}
        </button>
      </div>

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
    <div className="mb-5">
      <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}
