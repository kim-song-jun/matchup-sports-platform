'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/ui/toast';
import { useMatch } from '@/hooks/use-api';
import { api } from '@/lib/api';

const sports = [
  { type: 'futsal', label: '풋살' },
  { type: 'basketball', label: '농구' },
  { type: 'badminton', label: '배드민턴' },
  { type: 'ice_hockey', label: '아이스하키' },
];

const mockMatchData: Record<string, {
  sportType: string; title: string; description: string; venue: string;
  matchDate: string; startTime: string; endTime: string; maxPlayers: number;
  fee: number; levelMin: number; levelMax: number; gender: string;
}> = {
  'match-1': {
    sportType: 'futsal', title: '강남 풋살파크 주말 매치',
    description: '주말 오후 풋살 한판하실 분! 레벨 무관 누구나 환영합니다.',
    venue: '강남 풋살파크 A구장', matchDate: '2026-03-28',
    startTime: '14:00', endTime: '16:00', maxPlayers: 10,
    fee: 15000, levelMin: 1, levelMax: 5, gender: 'any',
  },
  'match-2': {
    sportType: 'basketball', title: '잠실 농구 픽업게임',
    description: '5:5 픽업게임입니다. 초중급 환영!',
    venue: '잠실 실내체육관', matchDate: '2026-03-30',
    startTime: '19:00', endTime: '21:00', maxPlayers: 10,
    fee: 10000, levelMin: 1, levelMax: 4, gender: 'any',
  },
};

const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

export default function EditMatchPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const matchId = params.id as string;
  const { data: apiMatch } = useMatch(matchId);

  // API 데이터가 있으면 사용, 없으면 목업 데이터로 폴백
  const fallbackData = mockMatchData[matchId] || mockMatchData['match-1'];
  const initialData = apiMatch
    ? {
        sportType: apiMatch.sportType || fallbackData.sportType,
        title: apiMatch.title || fallbackData.title,
        description: apiMatch.description || fallbackData.description,
        venue: apiMatch.venue?.name || fallbackData.venue,
        matchDate: apiMatch.matchDate || fallbackData.matchDate,
        startTime: apiMatch.startTime || fallbackData.startTime,
        endTime: apiMatch.endTime || fallbackData.endTime,
        maxPlayers: apiMatch.maxPlayers || fallbackData.maxPlayers,
        fee: apiMatch.fee ?? fallbackData.fee,
        levelMin: apiMatch.levelMin || fallbackData.levelMin,
        levelMax: apiMatch.levelMax || fallbackData.levelMax,
        gender: apiMatch.gender || fallbackData.gender,
      }
    : fallbackData;

  const [form, setForm] = useState(initialData);
  const [isSaving, setIsSaving] = useState(false);

  // API 데이터가 로드되면 폼 업데이트
  useEffect(() => {
    if (apiMatch) {
      setForm({
        sportType: apiMatch.sportType || fallbackData.sportType,
        title: apiMatch.title || fallbackData.title,
        description: apiMatch.description || fallbackData.description,
        venue: apiMatch.venue?.name || fallbackData.venue,
        matchDate: apiMatch.matchDate || fallbackData.matchDate,
        startTime: apiMatch.startTime || fallbackData.startTime,
        endTime: apiMatch.endTime || fallbackData.endTime,
        maxPlayers: apiMatch.maxPlayers || fallbackData.maxPlayers,
        fee: apiMatch.fee ?? fallbackData.fee,
        levelMin: apiMatch.levelMin || fallbackData.levelMin,
        levelMax: apiMatch.levelMax || fallbackData.levelMax,
        gender: apiMatch.gender || fallbackData.gender,
      });
    }
  }, [apiMatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!form.title) return toast('error', '제목을 입력해주세요');
    setIsSaving(true);
    try {
      await api.patch(`/matches/${matchId}`, form);
      toast('success', '매치 정보가 저장되었어요');
      router.push(`/matches/${matchId}`);
    } catch {
      toast('error', '수정에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-lg -ml-1.5 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">매치 수정</h1>
      </header>
      <div className="hidden lg:flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/matches" className="hover:text-gray-600 transition-colors">매치 찾기</Link>
        <ChevronRight size={14} />
        <Link href={`/matches/${matchId}`} className="hover:text-gray-600 transition-colors">매치 상세</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">매치 수정</span>
      </div>

      <div className="px-5 lg:px-0 pb-8 max-w-lg lg:max-w-[700px]">
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
            rows={3}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors resize-none"
          />
        </div>

        {/* Venue */}
        <div className="mb-5">
          <label className="block text-[14px] font-semibold text-gray-700 mb-2">장소</label>
          <input
            type="text"
            value={form.venue}
            onChange={(e) => setForm({ ...form, venue: e.target.value })}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Date & Time */}
        <div className="mb-5 grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-gray-700 mb-2">날짜</label>
            <input
              type="date"
              value={form.matchDate}
              onChange={(e) => setForm({ ...form, matchDate: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-gray-700 mb-2">시작</label>
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-gray-700 mb-2">종료</label>
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Max Players & Fee */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-gray-700 mb-2">최대 인원</label>
            <input
              type="number"
              value={form.maxPlayers}
              onChange={(e) => setForm({ ...form, maxPlayers: parseInt(e.target.value) || 0 })}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-gray-700 mb-2">참가비</label>
            <input
              type="number"
              value={form.fee}
              onChange={(e) => setForm({ ...form, fee: parseInt(e.target.value) || 0 })}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Level Range */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-gray-700 mb-2">최소 레벨</label>
            <select
              value={form.levelMin}
              onChange={(e) => setForm({ ...form, levelMin: parseInt(e.target.value) })}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
            >
              {[1, 2, 3, 4, 5].map((l) => (
                <option key={l} value={l}>Lv.{l} {levelLabel[l]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-gray-700 mb-2">최대 레벨</label>
            <select
              value={form.levelMax}
              onChange={(e) => setForm({ ...form, levelMax: parseInt(e.target.value) })}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 focus:border-blue-500 focus:outline-none transition-colors"
            >
              {[1, 2, 3, 4, 5].map((l) => (
                <option key={l} value={l}>Lv.{l} {levelLabel[l]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Gender */}
        <div className="mb-8">
          <label className="block text-[14px] font-semibold text-gray-700 mb-2">성별</label>
          <div className="flex gap-2">
            {[{ value: 'any', label: '무관' }, { value: 'male', label: '남성' }, { value: 'female', label: '여성' }].map((g) => (
              <button
                key={g.value}
                onClick={() => setForm({ ...form, gender: g.value })}
                className={`rounded-xl px-5 py-2.5 text-[13px] font-semibold transition-all ${
                  form.gender === g.value ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
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
    </div>
  );
}
