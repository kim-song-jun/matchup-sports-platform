'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Trophy, Shield, CheckCircle2, Hash,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { getTeamLogo } from '@/lib/sport-image';

// Mock match data (dev only)
const _mockMatch = {
  id: 'tm-001',
  title: '서울 FC vs 강남 유나이티드',
  sportType: 'futsal',
  homeTeam: { name: '서울 FC', logo: null },
  awayTeam: { name: '강남 유나이티드', logo: null },
  quarterCount: 4,
  hasReferee: true,
  refereeSchedule: [
    { quarter: 1, teamName: '서울 FC' },
    { quarter: 2, teamName: '강남 유나이티드' },
    { quarter: 3, teamName: '서울 FC' },
    { quarter: 4, teamName: '강남 유나이티드' },
  ],
};

const emptyMatch = {
  id: '',
  title: '',
  sportType: 'soccer',
  homeTeam: { name: '-', logo: null },
  awayTeam: { name: '-', logo: null },
  quarterCount: 4,
  hasReferee: false,
  refereeSchedule: [] as { quarter: number; teamName: string }[],
};

const mockMatch = process.env.NODE_ENV === 'development' ? _mockMatch : emptyMatch;

interface QuarterScore {
  home: string;
  away: string;
}

export default function ScoreInputPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;

  const [scores, setScores] = useState<QuarterScore[]>(
    Array.from({ length: mockMatch.quarterCount }, () => ({ home: '', away: '' })),
  );
  const [submitted, setSubmitted] = useState(false);
  const homeTeamLogo = getTeamLogo(mockMatch.homeTeam.name, mockMatch.sportType, mockMatch.homeTeam.logo, `${mockMatch.id}-home`);
  const awayTeamLogo = getTeamLogo(mockMatch.awayTeam.name, mockMatch.sportType, mockMatch.awayTeam.logo, `${mockMatch.id}-away`);

  function updateScore(quarterIdx: number, team: 'home' | 'away', value: string) {
    // Only allow non-negative integers
    const cleaned = value.replace(/[^0-9]/g, '');
    setScores((prev) =>
      prev.map((s, i) => (i === quarterIdx ? { ...s, [team]: cleaned } : s)),
    );
  }

  const homeTotal = scores.reduce((sum, s) => sum + (parseInt(s.home) || 0), 0);
  const awayTotal = scores.reduce((sum, s) => sum + (parseInt(s.away) || 0), 0);

  const allFilled = scores.every((s) => s.home !== '' && s.away !== '');

  async function handleSubmit() {
    if (!allFilled) return;
    try {
      await api.post(`/team-matches/${id}/result`, { scoreHome: homeTotal, scoreAway: awayTotal, quarters: scores });
      setSubmitted(true);
      toast('success', '스코어가 기록되었어요');
    } catch {
      toast('error', '스코어 기록에 실패했어요. 다시 시도해주세요');
    }
  }

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      {/* Header */}
      <header className="px-5 @3xl:px-0 pt-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          aria-label="뒤로 가기"
          className="flex items-center justify-center min-h-11 min-w-11 rounded-lg text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">스코어 입력</h1>
      </header>

      <div className="px-5 @3xl:px-0 @3xl:max-w-2xl @3xl:mx-auto">
        {/* Match header with team names */}
        <div className="rounded-xl bg-gray-900 p-5 mb-4">
          <div className="flex items-center justify-between">
            {/* Home team */}
            <div className="flex-1 text-center">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-white dark:bg-gray-800/10">
                <img
                  src={homeTeamLogo}
                  alt={`${mockMatch.homeTeam.name} logo`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <p className="text-base font-semibold text-white">{mockMatch.homeTeam.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">홈</p>
            </div>

            {/* Score display */}
            <div className="px-4">
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold text-white">{homeTotal}</span>
                <span className="text-xl text-gray-500">:</span>
                <span className="text-4xl font-bold text-white">{awayTotal}</span>
              </div>
              <p className="text-center text-xs text-gray-500 mt-1">
                {homeTotal > awayTotal ? '홈 승' : homeTotal < awayTotal ? '원정 승' : '무승부'}
              </p>
            </div>

            {/* Away team */}
            <div className="flex-1 text-center">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-white dark:bg-gray-800/10">
                <img
                  src={awayTeamLogo}
                  alt={`${mockMatch.awayTeam.name} logo`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <p className="text-base font-semibold text-white">{mockMatch.awayTeam.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">원정</p>
            </div>
          </div>
        </div>

        {/* Quarter-by-quarter scores */}
        <div className="space-y-3 mb-4">
          {scores.map((score, idx) => {
            const ref = mockMatch.refereeSchedule?.[idx];
            const quarterHome = parseInt(score.home) || 0;
            const quarterAway = parseInt(score.away) || 0;

            return (
              <div key={idx} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500">
                      <Hash size={14} />
                    </div>
                    <span className="text-base font-semibold text-gray-900 dark:text-white">
                      {idx + 1}쿼터
                    </span>
                  </div>
                  {score.home !== '' && score.away !== '' && (
                    <span className="text-xs text-gray-500">
                      {quarterHome} : {quarterAway}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Home score */}
                  <div className="flex-1">
                    <label htmlFor={`score-home-${idx}`} className="text-xs text-gray-500 mb-1 block text-center">
                      {mockMatch.homeTeam.name}
                    </label>
                    <input
                      id={`score-home-${idx}`}
                      type="text"
                      inputMode="numeric"
                      value={score.home}
                      onChange={(e) => updateScore(idx, 'home', e.target.value)}
                      placeholder="0"
                      disabled={submitted}
                      className="w-full rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 py-3 text-center text-xl font-bold text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 disabled:opacity-50 transition-colors"
                    />
                  </div>

                  <span className="text-xl font-bold text-gray-300 mt-5">:</span>

                  {/* Away score */}
                  <div className="flex-1">
                    <label htmlFor={`score-away-${idx}`} className="text-xs text-gray-500 mb-1 block text-center">
                      {mockMatch.awayTeam.name}
                    </label>
                    <input
                      id={`score-away-${idx}`}
                      type="text"
                      inputMode="numeric"
                      value={score.away}
                      onChange={(e) => updateScore(idx, 'away', e.target.value)}
                      placeholder="0"
                      disabled={submitted}
                      className="w-full rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 py-3 text-center text-xl font-bold text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 disabled:opacity-50 transition-colors"
                    />
                  </div>
                </div>

                {/* Referee assignment */}
                {ref && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
                    <Shield size={12} className="text-gray-300" />
                    <span>심판: {ref.teamName}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Running total summary */}
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Trophy size={16} className="text-amber-500" />
            쿼터별 누적 점수
          </h3>
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="py-2 px-2 text-left font-semibold text-gray-500">팀</th>
                  {scores.map((_, idx) => (
                    <th key={idx} className="py-2 px-2 text-center font-semibold text-gray-500">
                      Q{idx + 1}
                    </th>
                  ))}
                  <th className="py-2 px-2 text-center font-semibold text-gray-900 dark:text-white">합계</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-50 dark:border-gray-800">
                  <td className="py-2.5 px-2 font-medium text-gray-900 dark:text-white">
                    {mockMatch.homeTeam.name}
                  </td>
                  {scores.map((s, idx) => (
                    <td key={idx} className="py-2.5 px-2 text-center text-gray-700 dark:text-gray-200">
                      {s.home || '-'}
                    </td>
                  ))}
                  <td className="py-2.5 px-2 text-center font-bold text-blue-500">{homeTotal}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-2 font-medium text-gray-900 dark:text-white">
                    {mockMatch.awayTeam.name}
                  </td>
                  {scores.map((s, idx) => (
                    <td key={idx} className="py-2.5 px-2 text-center text-gray-700 dark:text-gray-200">
                      {s.away || '-'}
                    </td>
                  ))}
                  <td className="py-2.5 px-2 text-center font-bold text-blue-500">{awayTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Submit */}
        {!submitted ? (
          <div className="mb-8">
            <button
              onClick={handleSubmit}
              disabled={!allFilled}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Trophy size={18} />
              경기 완료
            </button>
            {!allFilled && (
              <p className="text-center text-xs text-gray-500 mt-2">
                모든 쿼터의 점수를 입력해주세요
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-green-50 border border-green-100 p-5 mb-8 text-center">
            <CheckCircle2 size={32} className="mx-auto text-green-500 mb-2" />
            <p className="text-lg font-bold text-green-700">스코어가 기록되었습니다</p>
            <p className="text-sm text-green-500 mt-1">
              최종 스코어: {mockMatch.homeTeam.name} {homeTotal} : {awayTotal} {mockMatch.awayTeam.name}
            </p>
            <button
              onClick={() => router.push(`/team-matches/${id}`)}
              className="mt-4 rounded-xl bg-blue-500 px-6 py-2.5 text-base font-semibold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
            >
              매치 상세로 돌아가기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
