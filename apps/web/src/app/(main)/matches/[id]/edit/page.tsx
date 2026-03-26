'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, ChevronRight, Image as ImageIcon, X } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/ui/toast';
import { useMatch, useVenues } from '@/hooks/use-api';
import { sportLabel, levelLabel } from '@/lib/constants';
import { api } from '@/lib/api';
import type { Venue } from '@/types/api';

const sportTypes = ['soccer', 'futsal', 'basketball', 'badminton', 'ice_hockey', 'swimming', 'tennis', 'baseball', 'volleyball', 'figure_skating', 'short_track'];

export default function EditMatchPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const matchId = params.id as string;
  const { data: apiMatch } = useMatch(matchId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const [form, setForm] = useState({
    sportType: '',
    title: '',
    description: '',
    venueId: '',
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
  const [isSaving, setIsSaving] = useState(false);

  const { data: venuesData } = useVenues(form.sportType ? { sportType: form.sportType } : undefined);
  const venues = (venuesData || []) as Venue[];

  useEffect(() => {
    if (apiMatch) {
      setForm({
        sportType: apiMatch.sportType || '',
        title: apiMatch.title || '',
        description: apiMatch.description || '',
        venueId: apiMatch.venue?.id || '',
        matchDate: apiMatch.matchDate || '',
        startTime: apiMatch.startTime || '',
        endTime: apiMatch.endTime || '',
        maxPlayers: apiMatch.maxPlayers || 10,
        fee: apiMatch.fee ?? 15000,
        levelMin: apiMatch.levelMin || 1,
        levelMax: apiMatch.levelMax || 5,
        gender: apiMatch.gender || 'any',
        rules: '',
      });
    }
  }, [apiMatch]);

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (imageFiles.length + files.length > 5) {
      toast('error', '이미지는 최대 5장까지 가능해요');
      return;
    }
    const newFiles = [...imageFiles, ...files].slice(0, 5);
    setImageFiles(newFiles);
    setImagePreviews(newFiles.map(f => URL.createObjectURL(f)));
  };

  const removeImage = (idx: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== idx));
    setImagePreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!form.title) return toast('error', '제목을 입력해주세요');
    setIsSaving(true);
    try {
      await api.patch(`/matches/${matchId}`, form);
      toast('success', '매치 정보가 저장되었어요');
      router.push(`/matches/${matchId}`);
    } catch {
      toast('error', '수정에 실패했어요');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0">
      <header className="lg:hidden flex items-center gap-3 px-5 py-3">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft size={18} className="text-gray-600 dark:text-gray-300" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900 dark:text-white">매치 수정</h1>
      </header>
      <div className="hidden lg:flex items-center gap-2 text-[12px] text-gray-500 mb-6">
        <Link href="/matches" className="hover:text-gray-600 transition-colors">매치 찾기</Link>
        <ChevronRight size={12} />
        <Link href={`/matches/${matchId}`} className="hover:text-gray-600 transition-colors">매치 상세</Link>
        <ChevronRight size={12} />
        <span className="text-gray-700 dark:text-gray-300">수정</span>
      </div>

      <div className="px-5 lg:px-0 pb-8 max-w-lg">
        {/* Sport Type */}
        <FormSection label="종목">
          <div className="flex flex-wrap gap-2">
            {sportTypes.map((type) => (
              <button key={type} onClick={() => setForm({ ...form, sportType: type })}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
                  form.sportType === type ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-500'
                }`}>
                {sportLabel[type] || type}
              </button>
            ))}
          </div>
        </FormSection>

        {/* Title */}
        <FormSection label="제목" id="edit-title">
          <input id="edit-title" type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3.5 py-2.5 text-[14px] text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none transition-colors" />
        </FormSection>

        {/* Description */}
        <FormSection label="설명" id="edit-description">
          <textarea id="edit-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3.5 py-2.5 text-[14px] text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none transition-colors resize-none" />
        </FormSection>

        {/* Images */}
        <FormSection label="이미지 (선택)">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {imagePreviews.map((src, i) => (
              <div key={i} className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700">
                <img src={src} alt="" className="w-full h-full object-cover" />
                <button onClick={() => removeImage(i)} aria-label="이미지 삭제" className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-gray-900/60 text-white">
                  <X size={10} />
                </button>
              </div>
            ))}
            {imageFiles.length < 5 && (
              <button onClick={() => fileInputRef.current?.click()} className="shrink-0 flex flex-col items-center justify-center w-20 h-20 rounded-xl border border-dashed border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <ImageIcon size={16} />
                <span className="text-[10px] mt-1">{imageFiles.length}/5</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageAdd} className="hidden" />
          </div>
        </FormSection>

        {/* Venue */}
        <FormSection label="시설">
          {venues.length > 0 ? (
            <div className="space-y-2">
              {venues.map((v) => (
                <button key={v.id} onClick={() => setForm({ ...form, venueId: v.id })}
                  className={`w-full text-left rounded-xl p-3 transition-all ${
                    form.venueId === v.id ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}>
                  <p className={`text-[13px] font-semibold ${form.venueId === v.id ? '' : 'text-gray-900 dark:text-gray-100'}`}>{v.name}</p>
                  <p className={`text-[11px] mt-0.5 ${form.venueId === v.id ? 'opacity-60' : 'text-gray-500'}`}>{v.address}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-gray-500 py-2">종목을 선택하면 시설 목록이 나타나요</p>
          )}
        </FormSection>

        {/* Date & Time */}
        <FormSection label="일시" id="edit-matchDate">
          <div className="grid grid-cols-3 gap-3">
            <input id="edit-matchDate" type="date" value={form.matchDate} onChange={(e) => setForm({ ...form, matchDate: e.target.value })}
              className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-[13px] text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none transition-colors" />
            <input id="edit-startTime" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-[13px] text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none transition-colors" />
            <input id="edit-endTime" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-[13px] text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none transition-colors" />
          </div>
        </FormSection>

        {/* Max Players & Fee */}
        <FormSection label="인원 · 참가비" id="edit-maxPlayers">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-maxPlayers" className="block text-[11px] text-gray-500 mb-1">최대 인원</label>
              <input id="edit-maxPlayers" type="number" value={form.maxPlayers} onChange={(e) => setForm({ ...form, maxPlayers: parseInt(e.target.value) || 0 })}
                className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-[14px] text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none transition-colors" />
            </div>
            <div>
              <label htmlFor="edit-fee" className="block text-[11px] text-gray-500 mb-1">참가비 (원)</label>
              <input id="edit-fee" type="number" value={form.fee} onChange={(e) => setForm({ ...form, fee: parseInt(e.target.value) || 0 })}
                className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-[14px] text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none transition-colors" />
            </div>
          </div>
        </FormSection>

        {/* Level Range */}
        <FormSection label="레벨 범위" id="edit-levelMin">
          <div className="grid grid-cols-2 gap-3">
            <select id="edit-levelMin" value={form.levelMin} onChange={(e) => setForm({ ...form, levelMin: parseInt(e.target.value) })}
              className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-[13px] text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none transition-colors">
              {[1,2,3,4,5].map(l => <option key={l} value={l}>{levelLabel[l]}</option>)}
            </select>
            <select id="edit-levelMax" value={form.levelMax} onChange={(e) => setForm({ ...form, levelMax: parseInt(e.target.value) })}
              className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-[13px] text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none transition-colors">
              {[1,2,3,4,5].map(l => <option key={l} value={l}>{levelLabel[l]}</option>)}
            </select>
          </div>
        </FormSection>

        {/* Gender */}
        <FormSection label="성별 제한">
          <div className="flex gap-2">
            {[{ value: 'any', label: '무관' }, { value: 'male', label: '남성' }, { value: 'female', label: '여성' }].map((g) => (
              <button key={g.value} onClick={() => setForm({ ...form, gender: g.value })}
                className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                  form.gender === g.value ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-500'
                }`}>
                {g.label}
              </button>
            ))}
          </div>
        </FormSection>

        {/* Rules */}
        <FormSection label="추가 규칙 (선택)" id="edit-rules">
          <textarea id="edit-rules" value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })}
            placeholder="참가자에게 알릴 규칙이나 공지사항" rows={2}
            className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3.5 py-2.5 text-[14px] text-gray-900 dark:text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none transition-colors resize-none" />
        </FormSection>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button onClick={() => router.back()}
            className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-800 py-3 text-[14px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            돌아가기
          </button>
          <button onClick={handleSave} disabled={isSaving}
            className="flex-1 rounded-xl bg-blue-500 py-3 text-[14px] font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors">
            {isSaving ? '수정 중...' : '수정 완료'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormSection({ label, id, children }: { label: string; id?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label htmlFor={id} className="block text-[12px] font-semibold text-gray-500 dark:text-gray-400 mb-2">{label}</label>
      {children}
    </div>
  );
}
