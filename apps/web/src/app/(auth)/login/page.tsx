'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDevLogin } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';

const taglines = ['오늘도 한 판 어때요?', '실력이 쑥쑥 올라가는 중!', '내 수준에 딱 맞는 상대가 기다려요'];

export default function LoginPage() {
  const router = useRouter();
  const devLogin = useDevLogin();
  const [nickname, setNickname] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [taglineIdx, setTaglineIdx] = useState(0);

  // Redirect if already logged in AND auth store confirms it
  const { isAuthenticated: alreadyLoggedIn } = useAuthStore();
  useEffect(() => {
    if (alreadyLoggedIn) router.replace('/home');
  }, [alreadyLoggedIn, router]);

  useEffect(() => {
    const t = setInterval(() => setTaglineIdx(i => (i + 1) % taglines.length), 3000);
    return () => clearInterval(t);
  }, []);

  const handleDevLogin = async (name?: string) => {
    const loginNickname = name || nickname || '테스트유저';
    setIsLoading(true);
    try {
      await devLogin.mutateAsync(loginNickname);
      router.push('/home');
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-white dark:bg-gray-900">
      {/* Top area */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="mb-10 text-center">
          <h1 className="text-[32px] font-extrabold tracking-tight text-gray-900 dark:text-white">TeamMeet</h1>
          <p className="mt-2 text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
            같이 운동할 사람, 찾고 계셨죠?<br />AI가 딱 맞는 메이트를 찾아드려요
          </p>
          <p key={taglineIdx} className="text-[14px] text-gray-500 mt-2 animate-fade-in-up">{taglines[taglineIdx]}</p>
        </div>

        {/* Social login */}
        <div className="w-full max-w-sm space-y-2.5">
          <button aria-label="카카오 계정으로 로그인" className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#FEE500] px-6 py-[14px] text-[15px] font-semibold text-[#191919] opacity-40 cursor-not-allowed">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 3C5.58 3 2 5.82 2 9.28c0 2.23 1.49 4.19 3.72 5.3l-.95 3.5c-.08.29.25.52.5.35l4.14-2.74c.19.01.39.02.59.02 4.42 0 8-2.82 8-6.28S14.42 3 10 3z" fill="#191919"/></svg>
            카카오로 시작하기
          </button>

          <button aria-label="네이버 계정으로 로그인" className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#03C75A] px-6 py-[14px] text-[15px] font-semibold text-white opacity-40 cursor-not-allowed">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M13.5 10.56L6.2 3H3v14h3.5V9.44L13.8 17H17V3h-3.5v7.56z" fill="white"/></svg>
            네이버로 시작하기
          </button>

          <button aria-label="Apple 계정으로 로그인" className="flex w-full items-center justify-center gap-3 rounded-xl bg-gray-900 px-6 py-[14px] text-[15px] font-semibold text-white opacity-40 cursor-not-allowed">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="white"><path d="M14.94 10.42c-.02-2.15 1.76-3.19 1.84-3.24-1-1.47-2.56-1.67-3.12-1.69-1.32-.14-2.59.78-3.26.78-.68 0-1.72-.77-2.83-.75-1.45.02-2.79.85-3.54 2.15-1.51 2.63-.39 6.52 1.09 8.65.72 1.04 1.58 2.21 2.71 2.17 1.09-.04 1.5-.7 2.81-.7 1.31 0 1.69.7 2.83.68 1.17-.02 1.91-1.06 2.62-2.11.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.87-2.3-3.46l-.04-.04zM12.77 4.05c.6-.72.99-1.73.89-2.73-.86.03-1.9.57-2.52 1.29-.55.64-1.03 1.66-.9 2.64.96.07 1.93-.49 2.53-1.2z"/></svg>
            Apple로 시작하기
          </button>
        </div>
      </div>

      {/* Dev login — bottom sheet style */}
      <div className="w-full bg-gray-50 dark:bg-gray-800 rounded-t-3xl px-6 pt-6 pb-8">
        <p className="text-center text-[12px] font-medium text-gray-400 mb-4">개발 모드 · 빠른 로그인</p>
        <div className="flex gap-2 max-w-sm mx-auto">
          <input
            type="text"
            placeholder="닉네임 입력"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDevLogin()}
            className="flex-1 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 px-4 py-3 text-[14px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 dark:focus:border-blue-600 transition-all"
          />
          <button
            onClick={() => handleDevLogin()}
            disabled={isLoading}
            className="shrink-0 rounded-xl bg-blue-500 px-8 py-3.5 text-[15px] font-bold text-white hover:bg-blue-600 active:bg-blue-700 active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
          >
            {isLoading ? '...' : '입장'}
          </button>
        </div>

        {/* Quick select */}
        <div className="mt-3 flex flex-wrap gap-1.5 justify-center max-w-sm mx-auto stagger-children">
          {['축구왕민수', '농구러버지영', '하키마스터준호', '배드민턴소희'].map((name) => (
            <button
              key={name}
              onClick={() => handleDevLogin(name)}
              disabled={isLoading}
              className="rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-[12px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 active:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
