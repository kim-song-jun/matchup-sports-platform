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

const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

const mockTeamData: Record<string, {
  name: string; sportType: string; description: string; region: string;
  maxMembers: number; level: number; ageMin: number; ageMax: number; activityDays: string;
}> = {
  'team-1': {
    name: 'FC 서울라이트', sportType: 'futsal',
    description: '서울 강남 지역 풋살 팀입니다. 주말마다 활동합니다. 성실하고 매너 좋은 분 환영!',
    region: '서울 강남구', maxMembers: 15, level: 3,
    ageMin: 20, ageMax: 40, activityDays: '토, 일',
  },
  'team-2': {
    name: '강남 슬래머즈', sportType: 'basketball',
    description: '농구 좋아하는 직장인 모임. 평일 저녁 위주로 활동합니다.',
    region: '서울 강남구', maxMembers: 12, level: 2,
    ageMin: 25, ageMax: 45, activityDays: '수, 금',
  },
};

export default function EditTeamPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const teamId = params.id as string;

  const initialData = mockTeamData[teamId] || mockTeamData['team-1'];
  const [form, setForm] = useState(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleSave = async () => {
    if (!form.name) return toast('error', '팀 이름을 입력해주세요');
    setIsSaving(true);
    try {
      await api.patch(`/teams/${teamId}`, form);
      toast('success', '팀 정보가 저장되었어요');
      router.push(`/teams/${teamId}`);
    } catch {
      toast('error', '수정에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/teams/${teamId}`);
      toast('success', '팀이 삭제되었어요');
      router.push('/my/teams');
    } catch {
      toast('error', '삭제하지 못했어요. 다시 시도해주세요');
    }
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">팀 수정</h1>
      </header>
      <div className="hidden lg:flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href={`/teams/${teamId}`} className="hover:text-gray-600 transition-colors">팀 상세</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">팀 수정</span>
      </div>

      <div className="px-5 lg:px-0 pb-8 max-w-lg lg:max-w-[700px]">
        {/* Team Name */}
        <div className="mb-5">
          <label className="block text-[14px] font-semibold text-gray-700 mb-2">팀 이름</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
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
                  form.sportType === s.type ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="mb-5">
          <label className="block text-[14px] font-semibold text-gray-700 mb-2">팀 소개</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors resize-none"
          />
        </div>

        {/* Region */}
        <div className="mb-5">
          <label className="block text-[14px] font-semibold text-gray-700 mb-2">활동 지역</label>
          <input
            type="text"
            value={form.region}
            onChange={(e) => setForm({ ...form, region: e.target.value })}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Activity Days */}
        <div className="mb-5">
          <label className="block text-[14px] font-semibold text-gray-700 mb-2">활동 요일</label>
          <input
            type="text"
            value={form.activityDays}
            onChange={(e) => setForm({ ...form, activityDays: e.target.value })}
            placeholder="예: 토, 일"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Max Members & Level */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-gray-700 mb-2">최대 인원</label>
            <input
              type="number"
              value={form.maxMembers}
              onChange={(e) => setForm({ ...form, maxMembers: parseInt(e.target.value) || 0 })}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-gray-700 mb-2">팀 레벨</label>
            <select
              value={form.level}
              onChange={(e) => setForm({ ...form, level: parseInt(e.target.value) })}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
            >
              {[1, 2, 3, 4, 5].map((l) => (
                <option key={l} value={l}>Lv.{l} {levelLabel[l]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Age Range */}
        <div className="mb-8 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-gray-700 mb-2">최소 나이</label>
            <input
              type="number"
              value={form.ageMin}
              onChange={(e) => setForm({ ...form, ageMin: parseInt(e.target.value) || 0 })}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-gray-700 mb-2">최대 나이</label>
            <input
              type="number"
              value={form.ageMax}
              onChange={(e) => setForm({ ...form, ageMax: parseInt(e.target.value) || 0 })}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
            />
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
            className="flex-1 rounded-xl bg-blue-500 py-3.5 text-[15px] font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
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
            <h3 className="text-[16px] font-bold text-gray-900 text-center">팀을 삭제하시겠어요?</h3>
            <p className="text-[14px] text-gray-500 text-center mt-2">팀 삭제 시 모든 데이터가 영구 삭제돼요. 이 작업은 되돌릴 수 없어요.</p>
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
