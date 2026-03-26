'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Swords, Shield, Rocket } from 'lucide-react';

const slides = [
  {
    icon: Search,
    title: '매치 찾기',
    desc1: '내 종목, 내 레벨에 맞는 경기를 찾아보세요',
    desc2: 'AI가 최적의 매치를 추천해드려요',
  },
  {
    icon: Swords,
    title: '팀 매칭',
    desc1: '우리 팀 상대를 찾고 있나요?',
    desc2: 'S~D 실력등급으로 딱 맞는 상대와 매칭',
  },
  {
    icon: Shield,
    title: '신뢰 시스템',
    desc1: '허위 레벨링, 노쇼 걱정 없이',
    desc2: '3단계 검증 + 6항목 상호 평가',
  },
  {
    icon: Rocket,
    title: '시작하기',
    desc1: '준비 완료!',
    desc2: '종목을 선택하고 첫 매치를 시작하세요',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const [isAnimating, setIsAnimating] = useState(false);

  const finish = useCallback(() => {
    localStorage.setItem('onboarding_completed', 'true');
    router.push('/home');
  }, [router]);

  const goNext = useCallback(() => {
    if (isAnimating) return;
    if (step === slides.length - 1) {
      finish();
      return;
    }
    setDirection('left');
    setIsAnimating(true);
    setTimeout(() => {
      setStep((s) => s + 1);
      setIsAnimating(false);
    }, 250);
  }, [step, isAnimating, finish]);

  const goTo = useCallback(
    (idx: number) => {
      if (isAnimating || idx === step) return;
      setDirection(idx > step ? 'left' : 'right');
      setIsAnimating(true);
      setTimeout(() => {
        setStep(idx);
        setIsAnimating(false);
      }, 250);
    },
    [step, isAnimating],
  );

  const slide = slides[step];
  const Icon = slide.icon;
  const isLast = step === slides.length - 1;

  return (
    <div className="fixed inset-0 z-[60] bg-white dark:bg-gray-900 flex flex-col items-center justify-center">
      <div className="flex flex-col items-center justify-between w-full h-full max-w-sm mx-auto px-6 py-10 select-none">
        {/* Skip */}
        <div className="w-full flex justify-end">
          <button
            onClick={finish}
            className="text-sm text-gray-500 hover:text-gray-600 transition-colors"
          >
            건너뛰기
          </button>
        </div>

        {/* Slide content */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full">
          <div
            key={step}
            className={`flex flex-col items-center gap-6 transition-all duration-250 ease-out ${
              isAnimating
                ? direction === 'left'
                  ? 'opacity-0 -translate-x-8'
                  : 'opacity-0 translate-x-8'
                : 'opacity-100 translate-x-0 animate-fade-in-up'
            }`}
          >
            {/* Icon */}
            <div className="w-28 h-28 rounded-full bg-blue-50 flex items-center justify-center">
              <Icon className="w-14 h-14 text-blue-500" strokeWidth={1.5} />
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-gray-900">{slide.title}</h1>

            {/* Descriptions */}
            <div className="text-center space-y-1">
              <p className="text-base text-gray-600">{slide.desc1}</p>
              <p className="text-sm text-gray-500">{slide.desc2}</p>
            </div>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="w-full space-y-6">
          {/* Dots */}
          <div className="flex justify-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`슬라이드 ${i + 1}`}
                className={`rounded-full transition-all duration-200 ${
                  i === step
                    ? 'w-6 h-2.5 bg-blue-500'
                    : 'w-2.5 h-2.5 bg-gray-200 hover:bg-gray-300'
                }`}
              />
            ))}
          </div>

          {/* CTA button */}
          <button
            onClick={goNext}
            className="w-full py-3.5 rounded-xl bg-blue-500 text-white font-bold text-base hover:bg-blue-600 active:scale-[0.98] transition-all"
          >
            {isLast ? '시작하기' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}
