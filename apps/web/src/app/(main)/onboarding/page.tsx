'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { sportLabel } from '@/lib/constants';

const sportOptions = [
  { key: 'soccer', emoji: '\u26BD', label: '축구' },
  { key: 'futsal', emoji: '\u{1F3C3}', label: '풋살' },
  { key: 'basketball', emoji: '\u{1F3C0}', label: '농구' },
  { key: 'badminton', emoji: '\u{1F3F8}', label: '배드민턴' },
  { key: 'tennis', emoji: '\u{1F3BE}', label: '테니스' },
  { key: 'ice_hockey', emoji: '\u{1F3D2}', label: '아이스하키' },
  { key: 'swimming', emoji: '\u{1F3CA}', label: '수영' },
  { key: 'baseball', emoji: '\u26BE', label: '야구' },
  { key: 'volleyball', emoji: '\u{1F3D0}', label: '배구' },
] as const;

const features = [
  {
    title: 'AI가 딱 맞는 상대를 찾아줘요',
    desc: 'ELO 레이팅 기반으로 실력이 비슷한 상대와 자동 매칭',
    accent: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    dot: 'bg-blue-500',
  },
  {
    title: '노쇼 걱정 없는 신뢰 시스템',
    desc: '3단계 검증 + 매너 점수로 안전한 경기 환경',
    accent: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
  {
    title: '팀 매칭부터 강좌, 장터까지',
    desc: '경기 매칭, 팀 관리, 레슨, 중고거래를 한 곳에서',
    accent: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<'sport' | 'features'>('sport');
  const [selectedSports, setSelectedSports] = useState<string[]>([]);

  const finish = useCallback(() => {
    localStorage.setItem('onboarding_completed', 'true');
    if (selectedSports.length > 0) {
      localStorage.setItem('preferred_sports', JSON.stringify(selectedSports));
    }
    router.push('/home');
  }, [router, selectedSports]);

  const toggleSport = (key: string) => {
    setSelectedSports(prev =>
      prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
    );
  };

  return (
    <div className="fixed inset-0 z-[60] bg-white dark:bg-gray-900 flex flex-col">
      <div className="flex flex-col w-full h-full max-w-md mx-auto px-6 py-8 select-none">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            <div className={`h-1 rounded-full transition-all duration-300 ${step === 'sport' ? 'w-8 bg-gray-900 dark:bg-white' : 'w-4 bg-gray-200 dark:bg-gray-700'}`} />
            <div className={`h-1 rounded-full transition-all duration-300 ${step === 'features' ? 'w-8 bg-gray-900 dark:bg-white' : 'w-4 bg-gray-200 dark:bg-gray-700'}`} />
          </div>
          <button
            onClick={finish}
            className="text-sm text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors min-h-[44px] flex items-center"
          >
            건너뛰기
          </button>
        </div>

        {/* Step 1: 종목 선택 */}
        {step === 'sport' && (
          <div className="flex-1 flex flex-col pt-10">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              무슨 운동을
              <br />
              좋아하세요?
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              관심 종목을 선택하면 맞춤 매치를 추천해드려요
            </p>

            <div className="grid grid-cols-3 gap-3 mt-8">
              {sportOptions.map((sport) => {
                const isSelected = selectedSports.includes(sport.key);
                return (
                  <button
                    key={sport.key}
                    onClick={() => toggleSport(sport.key)}
                    className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all duration-200 active:scale-[0.96] ${
                      isSelected
                        ? 'border-gray-900 dark:border-white bg-gray-50 dark:bg-gray-800'
                        : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-200 dark:hover:border-gray-700'
                    }`}
                  >
                    <span className="text-2xl">{sport.emoji}</span>
                    <span className={`text-sm font-medium ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                      {sport.label}
                    </span>
                    {isSelected && (
                      <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gray-900 dark:bg-white flex items-center justify-center">
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white dark:text-gray-900" /></svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-auto pt-6 space-y-3">
              <button
                onClick={() => setStep('features')}
                className="w-full py-3.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-base hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-[0.98] transition-all"
              >
                {selectedSports.length > 0
                  ? `${selectedSports.map(s => sportLabel[s] || s).join(', ')} 선택 완료`
                  : '다음'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: 핵심 기능 소개 */}
        {step === 'features' && (
          <div className="flex-1 flex flex-col pt-10">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              TeamMeet은
              <br />
              이런 걸 해줘요
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              {selectedSports.length > 0
                ? `${selectedSports.map(s => sportLabel[s] || s).join(', ')} 매치를 바로 찾아볼 수 있어요`
                : '운동 파트너를 찾는 가장 빠른 방법'}
            </p>

            <div className="space-y-3 mt-8">
              {features.map((f, idx) => (
                <div
                  key={f.title}
                  className={`rounded-2xl border p-5 ${f.accent}`}
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-2 w-2 rounded-full ${f.dot} mt-2 shrink-0`} />
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">{f.title}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{f.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-6 space-y-3">
              <button
                onClick={finish}
                className="w-full py-3.5 rounded-xl bg-blue-500 text-white font-bold text-base hover:bg-blue-600 active:scale-[0.98] transition-all"
              >
                시작하기
              </button>
              <button
                onClick={() => setStep('sport')}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
              >
                종목 다시 선택
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
