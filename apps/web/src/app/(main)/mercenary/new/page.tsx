'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, ChevronDown } from 'lucide-react';

const positionOptions = [
  { value: 'GK', label: '골키퍼 (GK)' },
  { value: 'DF', label: '수비수 (DF)' },
  { value: 'MF', label: '미드필더 (MF)' },
  { value: 'FW', label: '공격수 (FW)' },
  { value: 'ALL', label: '포지션 무관' },
];

const mockTeams = [
  { id: 'team-1', name: 'FC 한강' },
  { id: 'team-2', name: '성수 유나이티드' },
  { id: 'team-3', name: '강남 FC' },
];

const levelOptions = [
  { value: 1, label: '입문' },
  { value: 2, label: '초급' },
  { value: 3, label: '중급' },
  { value: 4, label: '상급' },
  { value: 5, label: '고수' },
];

const countOptions = [1, 2, 3, 4, 5];

interface FormData {
  teamId: string;
  matchDate: string;
  startTime: string;
  venue: string;
  position: string;
  count: number;
  levelRequired: number;
  fee: string;
  notes: string;
}

const initialForm: FormData = {
  teamId: '',
  matchDate: '',
  startTime: '',
  venue: '',
  position: '',
  count: 1,
  levelRequired: 3,
  fee: '0',
  notes: '',
};

export default function NewMercenaryPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(initialForm);
  const [submitted, setSubmitted] = useState(false);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit =
    !!form.teamId &&
    !!form.matchDate &&
    !!form.startTime &&
    !!form.venue &&
    !!form.position;

  function handleSubmit() {
    if (!canSubmit) return;
    setSubmitted(true);
    setTimeout(() => {
      router.push('/mercenary');
    }, 1500);
  }

  const formatCurrency = (n: string) =>
    n && Number(n) > 0 ? new Intl.NumberFormat('ko-KR').format(Number(n)) + '원' : '무료';

  if (submitted) {
    return (
      <div className="pt-[var(--safe-area-top)] animate-fade-in">
        <div className="flex flex-col items-center justify-center py-32 px-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 mb-4">
            <Check size={28} className="text-green-500" />
          </div>
          <h2 className="text-[18px] font-bold text-gray-900 mb-1">모집글이 등록되었어요</h2>
          <p className="text-[14px] text-gray-500">용병 모집 목록에서 확인할 수 있습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      {/* Header */}
      <header className="px-5 lg:px-0 pt-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-[18px] font-bold text-gray-900">용병 모집하기</h1>
      </header>

      <div className="px-5 lg:px-0">
        <div className="space-y-5">
          {/* 팀 선택 */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">팀 선택</label>
            <div className="relative">
              <select
                value={form.teamId}
                onChange={(e) => update('teamId', e.target.value)}
                className="w-full appearance-none rounded-xl border border-gray-200 px-4 py-3.5 text-[14px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all bg-white"
              >
                <option value="">팀을 선택하세요</option>
                {mockTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 경기 날짜 */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">경기 날짜</label>
            <input
              type="date"
              value={form.matchDate}
              onChange={(e) => update('matchDate', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-[14px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
            />
          </div>

          {/* 시작 시간 */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">시작 시간</label>
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => update('startTime', e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-[14px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
            />
          </div>

          {/* 장소 */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">장소</label>
            <input
              type="text"
              value={form.venue}
              onChange={(e) => update('venue', e.target.value)}
              placeholder="예: 난지천 풋살장 A"
              className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
            />
          </div>

          {/* 포지션 */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-2 block">필요 포지션</label>
            <div className="flex gap-2 flex-wrap">
              {positionOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update('position', opt.value)}
                  className={`rounded-xl border-2 px-4 py-3 text-[13px] font-semibold transition-all ${
                    form.position === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-gray-100 text-gray-600 hover:border-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 모집 인원 */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-2 block">모집 인원</label>
            <div className="flex gap-2">
              {countOptions.map((c) => (
                <button
                  key={c}
                  onClick={() => update('count', c)}
                  className={`flex-1 rounded-xl border-2 py-3 text-[14px] font-semibold transition-all ${
                    form.count === c
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-gray-100 text-gray-600 hover:border-gray-200'
                  }`}
                >
                  {c}명
                </button>
              ))}
            </div>
          </div>

          {/* 레벨 요구 */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-2 block">레벨 요구</label>
            <div className="flex gap-2 flex-wrap">
              {levelOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update('levelRequired', opt.value)}
                  className={`rounded-xl border-2 px-5 py-3 text-[14px] font-semibold transition-all ${
                    form.levelRequired === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-gray-100 text-gray-600 hover:border-gray-200'
                  }`}
                >
                  Lv.{opt.value} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 비용 */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">참가비 (원)</label>
            <input
              type="number"
              value={form.fee}
              onChange={(e) => update('fee', e.target.value)}
              placeholder="0 = 무료"
              className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
            />
            <p className="text-[12px] text-gray-400 mt-1">
              {formatCurrency(form.fee)}
            </p>
          </div>

          {/* 요청사항 */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">요청사항 (선택)</label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="유니폼 색상, 준비물, 기타 안내 등"
              rows={4}
              className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all resize-none"
            />
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="px-5 lg:px-0 mt-6 mb-8">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Check size={16} />
          모집글 등록
        </button>
      </div>
    </div>
  );
}
