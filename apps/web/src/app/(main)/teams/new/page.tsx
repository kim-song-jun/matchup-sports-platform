'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Globe, Video, Users } from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { SKILL_GRADES } from '@/lib/skill-grades';
import type { SkillGrade } from '@/lib/skill-grades';

const sports = [
  { type: 'futsal', label: '풋살', color: 'bg-blue-50 text-blue-500 border-gray-200' },
  { type: 'basketball', label: '농구', color: 'bg-blue-50 text-blue-500 border-gray-200' },
  { type: 'badminton', label: '배드민턴', color: 'bg-blue-50 text-blue-500 border-gray-200' },
  { type: 'ice_hockey', label: '아이스하키', color: 'bg-blue-50 text-blue-500 border-gray-200' },
];

const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

const cities = ['서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

export default function CreateTeamPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    sportType: '',
    description: '',
    city: '',
    district: '',
    contactInfo: '',
    level: 3,
    skillGrade: 'B' as SkillGrade,
    proPlayerCount: 0,
    uniformColor: '',
    isRecruiting: true,
    snsLinks: { instagram: '', youtube: '', kakaotalk: '' },
    shortsUrl: '',
  });

  const handleSubmit = async () => {
    if (!form.name) return toast('error', '팀명을 입력해주세요');
    if (!form.sportType) return toast('error', '종목을 선택해주세요');
    if (!form.city) return toast('error', '활동 지역을 선택해주세요');

    setIsSubmitting(true);
    try {
      await api.post('/teams', form);
      toast('success', '팀이 등록되었어요!');
      router.push('/teams');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '등록에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="pt-[var(--safe-area-top)] lg:pt-0 px-5 lg:px-0">
        <div className="max-w-[500px] mx-auto mt-20 text-center">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-blue-50 text-blue-500 mb-4">
            <Users size={28} />
          </div>
          <h2 className="text-[22px] font-bold text-gray-900">팀을 만들어보세요</h2>
          <p className="text-[14px] text-gray-500 mt-2">로그인하면 팀을 등록하고 팀원을 모집할 수 있어요</p>
          <Link href="/login" className="inline-block mt-6 rounded-xl bg-blue-500 px-8 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 transition-colors">
            로그인하고 시작하기
          </Link>
        </div>
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
        <h1 className="text-[16px] font-semibold text-gray-900">팀 등록</h1>
      </header>

      {/* Desktop breadcrumb */}
      <div className="hidden lg:flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/teams" className="hover:text-gray-600 transition-colors">팀/클럽</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">팀 등록</span>
      </div>

      <div className="px-5 lg:px-0 max-w-2xl">
        {/* 팀명 */}
        <Field label="팀명" required>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="팀/동호회 이름을 입력해주세요"
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
                    selected ? `${s.color} border-current` : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  {Icon && <Icon size={20} />}
                  <span className="text-[14px] font-semibold">{s.label}</span>
                </button>
              );
            })}
          </div>
        </Field>

        {/* 팀 소개 */}
        <Field label="팀 소개">
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="팀 소개, 활동 시간, 분위기 등을 자유롭게 적어주세요"
            rows={4}
            className="input-field resize-none"
          />
        </Field>

        {/* 활동 지역 */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <Field label="시/도" required>
            <select
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="input-field"
            >
              <option value="">선택</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="구/군">
            <input
              value={form.district}
              onChange={(e) => setForm({ ...form, district: e.target.value })}
              placeholder="예: 강남구"
              className="input-field"
            />
          </Field>
        </div>

        {/* 실력등급 S~D */}
        <Field label="팀 실력등급">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {SKILL_GRADES.map((g) => (
              <button
                key={g.grade}
                type="button"
                onClick={() => setForm({ ...form, skillGrade: g.grade as SkillGrade })}
                className={`shrink-0 rounded-xl border-2 px-3.5 py-2.5 text-center transition-all ${
                  form.skillGrade === g.grade
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <p className={`text-[14px] font-bold ${form.skillGrade === g.grade ? 'text-blue-600' : 'text-gray-900'}`}>
                  {g.label}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5 whitespace-nowrap">{g.desc}</p>
              </button>
            ))}
          </div>
        </Field>

        {/* 선출선수 */}
        <Field label="선출선수 (명)">
          <input
            type="number"
            min={0}
            max={10}
            value={form.proPlayerCount}
            onChange={(e) => setForm({ ...form, proPlayerCount: Math.min(10, Math.max(0, Number(e.target.value))) })}
            placeholder="0"
            className="input-field"
          />
          <p className="text-[12px] text-gray-400 mt-1">팀 내 선출 출신 선수 수 (0~10명)</p>
        </Field>

        {/* 유니폼 색상 */}
        <Field label="유니폼 색상">
          <input
            value={form.uniformColor}
            onChange={(e) => setForm({ ...form, uniformColor: e.target.value })}
            placeholder="예: 빨강 상의 + 검정 하의"
            className="input-field"
          />
        </Field>

        {/* 모집 여부 */}
        <Field label="팀원 모집">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, isRecruiting: true })}
              className={`rounded-xl border-2 py-3 text-[14px] font-semibold transition-all ${
                form.isRecruiting
                  ? 'border-blue-500 bg-blue-50 text-blue-500'
                  : 'border-gray-100 text-gray-500 hover:border-gray-200'
              }`}
            >
              모집중
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, isRecruiting: false })}
              className={`rounded-xl border-2 py-3 text-[14px] font-semibold transition-all ${
                !form.isRecruiting
                  ? 'border-gray-800 bg-gray-50 text-gray-800'
                  : 'border-gray-100 text-gray-500 hover:border-gray-200'
              }`}
            >
              모집 마감
            </button>
          </div>
        </Field>

        {/* 연락처 */}
        <Field label="연락처">
          <input
            value={form.contactInfo}
            onChange={(e) => setForm({ ...form, contactInfo: e.target.value })}
            placeholder="카카오톡 ID 또는 연락 가능한 연락처"
            className="input-field"
          />
        </Field>

        {/* SNS 링크 */}
        <div className="rounded-2xl bg-white border border-gray-100 p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Globe size={16} className="text-gray-400" />
            <h3 className="text-[14px] font-semibold text-gray-900">SNS 링크</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-[12px] text-gray-400 mb-1">Instagram</label>
              <input
                value={form.snsLinks.instagram}
                onChange={(e) => setForm({ ...form, snsLinks: { ...form.snsLinks, instagram: e.target.value } })}
                placeholder="https://instagram.com/..."
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-[12px] text-gray-400 mb-1">YouTube</label>
              <input
                value={form.snsLinks.youtube}
                onChange={(e) => setForm({ ...form, snsLinks: { ...form.snsLinks, youtube: e.target.value } })}
                placeholder="https://youtube.com/..."
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-[12px] text-gray-400 mb-1">카카오톡 오픈채팅</label>
              <input
                value={form.snsLinks.kakaotalk}
                onChange={(e) => setForm({ ...form, snsLinks: { ...form.snsLinks, kakaotalk: e.target.value } })}
                placeholder="https://open.kakao.com/..."
                className="input-field"
              />
            </div>
          </div>
        </div>

        {/* 홍보 영상(Shorts) */}
        <div className="rounded-2xl bg-white border border-gray-100 p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Video size={16} className="text-gray-400" />
            <h3 className="text-[14px] font-semibold text-gray-900">홍보 영상 (Shorts)</h3>
          </div>
          <input
            value={form.shortsUrl}
            onChange={(e) => setForm({ ...form, shortsUrl: e.target.value })}
            placeholder="YouTube Shorts 또는 Instagram Reels URL"
            className="input-field"
          />
          <p className="text-[12px] text-gray-400 mt-1.5">팀 활동을 보여주는 짧은 영상 링크를 등록하세요</p>
        </div>

        {/* 등록 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-50 mb-8"
        >
          {isSubmitting ? '등록 중...' : '팀 등록하기'}
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
