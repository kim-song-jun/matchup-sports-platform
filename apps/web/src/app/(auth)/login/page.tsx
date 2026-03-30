'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { useDevLogin, useEmailLogin, useEmailRegister } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/toast';

export default function LoginPage() {
  const router = useRouter();
  const devLogin = useDevLogin();
  const emailLogin = useEmailLogin();
  const emailRegister = useEmailRegister();
  const { toast } = useToast();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [devNickname, setDevNickname] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) router.replace('/home');
  }, [isAuthenticated, router]);

  const handleEmailSubmit = async () => {
    if (!email || !password) return toast('error', '이메일과 비밀번호를 입력해주세요');
    if (mode === 'register' && !nickname) return toast('error', '닉네임을 입력해주세요');
    if (password.length < 6) return toast('error', '비밀번호는 6자 이상이어야 해요');

    setIsLoading(true);
    try {
      if (mode === 'register') {
        await emailRegister.mutateAsync({ email, password, nickname });
        toast('success', '가입 완료! 환영합니다');
      } else {
        await emailLogin.mutateAsync({ email, password });
      }
      router.push('/home');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast('error', msg || (mode === 'register' ? '가입에 실패했어요' : '로그인에 실패했어요'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevLogin = async (name?: string) => {
    setIsLoading(true);
    try {
      await devLogin.mutateAsync(name || devNickname || '테스트유저');
      router.push('/home');
    } catch {
      // handled by mutation
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(15,23,42,0.18),_transparent_26%),linear-gradient(180deg,#0b1220_0%,#0f172a_46%,#111827_100%)] text-white">
      <div className="mx-auto grid min-h-dvh max-w-[1200px] gap-8 px-5 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 p-6 shadow-[0_24px_100px_rgba(2,6,23,0.45)] backdrop-blur-2xl sm:p-8 lg:p-10">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_38%,rgba(56,189,248,0.08))]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/12 px-4 py-2 text-sm font-medium text-sky-100">
              <Sparkles size={14} />
              MatchUp v2
            </div>

            <h1 className="mt-6 max-w-xl text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
              같은 종목을 더 전문적으로
              <span className="block text-sky-300">매칭하는 방법</span>
            </h1>

            <p className="mt-4 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              실력, 매너, 일정, 거리 정보를 한 화면에서 정리하고 경기 전후 흐름까지 자연스럽게 이어지는 스포츠 매칭 경험을 제공합니다.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                '선수 프로필과 매칭 기록을 한눈에 확인',
                '신뢰 기반의 매칭과 평가 흐름',
                '모바일과 데스크톱 모두에 최적화된 운영 화면',
                '깔끔한 정보 계층과 선택적 glass chrome',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-slate-200 backdrop-blur-md">
                  <CheckCircle2 size={16} className="shrink-0 text-sky-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-300">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2">
                <ShieldCheck size={15} className="text-sky-300" />
                신뢰 중심 디자인
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2">
                <ArrowRight size={15} className="text-sky-300" />
                기능은 유지, 표면은 재정렬
              </div>
            </div>
          </div>
        </section>

        <section className="relative">
          <div className="mx-auto max-w-[520px] rounded-[2rem] border border-white/10 bg-white/10 p-4 shadow-[0_24px_100px_rgba(2,6,23,0.48)] backdrop-blur-2xl sm:p-5">
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-200/80">MatchUp Access</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">
                    {mode === 'login' ? '로그인' : '계정 만들기'}
                  </h2>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-slate-300">
                  안전한 접속
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 rounded-full border border-white/10 bg-white/5 p-1">
                {(['login', 'register'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMode(tab)}
                    className={`rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                      mode === tab
                        ? 'bg-sky-300 text-slate-950 shadow-lg shadow-sky-500/20'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {tab === 'login' ? '로그인' : '회원가입'}
                  </button>
                ))}
              </div>

              <div className="mt-6 space-y-3">
                <input
                  type="email"
                  placeholder="이메일"
                  aria-label="이메일 주소"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 text-base text-white outline-none placeholder:text-slate-400 focus:border-sky-300/60 focus:bg-white/15"
                />
                <input
                  type="password"
                  placeholder="비밀번호 (6자 이상)"
                  aria-label="비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && mode === 'login' && handleEmailSubmit()}
                  className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 text-base text-white outline-none placeholder:text-slate-400 focus:border-sky-300/60 focus:bg-white/15"
                />
                {mode === 'register' && (
                  <input
                    type="text"
                    placeholder="닉네임"
                    aria-label="닉네임"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 text-base text-white outline-none placeholder:text-slate-400 focus:border-sky-300/60 focus:bg-white/15"
                  />
                )}

                <button
                  type="button"
                  onClick={handleEmailSubmit}
                  disabled={isLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-300 px-5 py-3.5 text-base font-bold text-slate-950 shadow-lg shadow-sky-500/20 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? (mode === 'login' ? '로그인 중...' : '가입 중...') : mode === 'login' ? '로그인' : '가입하기'}
                  <ArrowRight size={17} />
                </button>
              </div>

              <div className="mt-6">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-xs text-slate-400">또는</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FEE500] px-6 py-3 text-base font-semibold text-[#191919] opacity-55 cursor-not-allowed"
                  >
                    카카오로 시작하기 (준비중)
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#03C75A] px-6 py-3 text-base font-semibold text-white opacity-55 cursor-not-allowed"
                  >
                    네이버로 시작하기 (준비중)
                  </button>
                </div>
              </div>
            </div>

            {process.env.NODE_ENV !== 'production' && (
              <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
                <p className="text-center text-xs uppercase tracking-[0.24em] text-sky-200/70">Dev Access</p>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="닉네임"
                    aria-label="테스트 닉네임"
                    value={devNickname}
                    onChange={(e) => setDevNickname(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleDevLogin()}
                    className="flex-1 rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => handleDevLogin()}
                    disabled={isLoading}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-slate-100 disabled:opacity-50"
                  >
                    입장
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {['축구왕민수', '농구러버지영', '하키마스터준호'].map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handleDevLogin(name)}
                      disabled={isLoading}
                      className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/15 disabled:opacity-50"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
