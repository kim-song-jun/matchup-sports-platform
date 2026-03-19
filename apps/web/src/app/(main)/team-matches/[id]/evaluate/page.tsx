'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Star, Send } from 'lucide-react';
import { useSubmitTeamMatchEvaluation } from '@/hooks/use-api';

const evaluationItems = [
  { key: 'levelAccuracy', label: '수준 일치', desc: '모집글 레벨과 실제 실력이 일치했나요?' },
  { key: 'infoAccuracy', label: '정보 일치', desc: '경기 정보(구장, 시간, 인원 등)가 정확했나요?' },
  { key: 'mannerRating', label: '매너', desc: '상대팀의 매너는 어땠나요?' },
  { key: 'punctuality', label: '시간 약속', desc: '약속된 시간을 잘 지켰나요?' },
  { key: 'paymentClarity', label: '비용 정산', desc: '비용 정산이 명확했나요?' },
  { key: 'cooperation', label: '경기 협조', desc: '경기 진행에 협조적이었나요?' },
];

type Ratings = Record<string, number>;

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange(star)}
          className="p-0.5 transition-transform active:scale-110"
        >
          <Star
            size={28}
            className={star <= value ? 'text-amber-400' : 'text-gray-200'}
            fill={star <= value ? 'currentColor' : 'none'}
          />
        </button>
      ))}
    </div>
  );
}

export default function TeamMatchEvaluatePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const submitMutation = useSubmitTeamMatchEvaluation();

  const [ratings, setRatings] = useState<Ratings>(
    Object.fromEntries(evaluationItems.map((item) => [item.key, 0])),
  );
  const [comment, setComment] = useState('');

  const allRated = evaluationItems.every((item) => ratings[item.key] > 0);
  const averageRating =
    evaluationItems.reduce((sum, item) => sum + ratings[item.key], 0) / evaluationItems.length;

  function handleSubmit() {
    submitMutation.mutate(
      { id, data: { ...ratings, comment } },
      { onSuccess: () => router.push(`/team-matches/${id}`) },
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
        <h1 className="text-[18px] font-bold text-gray-900">경기 평가</h1>
      </header>

      <div className="px-5 lg:px-0">
        {/* 안내 */}
        <div className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3.5 mb-6">
          <p className="text-[14px] font-medium text-blue-700">상대팀에 대한 솔직한 평가를 남겨주세요</p>
          <p className="text-[12px] text-blue-500 mt-0.5">평가는 매너 점수에 반영됩니다</p>
        </div>

        {/* 평가 항목 */}
        <div className="space-y-4">
          {evaluationItems.map((item) => (
            <div key={item.key} className="rounded-2xl bg-white border border-gray-100 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[15px] font-semibold text-gray-900">{item.label}</p>
                  <p className="text-[12px] text-gray-400 mt-0.5">{item.desc}</p>
                </div>
                <div className="text-[14px] font-bold text-amber-500">
                  {ratings[item.key] > 0 ? ratings[item.key].toFixed(0) : '-'}
                </div>
              </div>
              <div className="mt-3">
                <StarRating
                  value={ratings[item.key]}
                  onChange={(v) => setRatings((prev) => ({ ...prev, [item.key]: v }))}
                />
              </div>
            </div>
          ))}
        </div>

        {/* 평균 점수 */}
        {allRated && (
          <div className="mt-4 rounded-2xl bg-gray-900 p-5 text-center">
            <p className="text-[13px] text-gray-400">종합 평점</p>
            <div className="flex items-center justify-center gap-2 mt-1">
              <Star size={24} className="text-amber-400" fill="currentColor" />
              <span className="text-[28px] font-bold text-white">{averageRating.toFixed(1)}</span>
            </div>
          </div>
        )}

        {/* 코멘트 */}
        <div className="mt-4">
          <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">한줄 코멘트 (선택)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="상대팀에 대한 한마디를 남겨주세요"
            rows={3}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all resize-none"
          />
        </div>

        {/* 제출 */}
        <div className="mt-6 mb-8">
          <button
            onClick={handleSubmit}
            disabled={!allRated || submitMutation.isPending}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
            {submitMutation.isPending ? '제출 중...' : '평가 제출하기'}
          </button>
          {!allRated && (
            <p className="text-center text-[12px] text-gray-400 mt-2">모든 항목을 평가해주세요</p>
          )}
        </div>
      </div>
    </div>
  );
}
