'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, AlertTriangle, X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

const formatPhoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
};

const validatePhone = (value: string): string | null => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (!/^01[016789]\d{7,8}$/.test(digits)) return '올바른 전화번호를 입력해주세요';
  return null;
};

export default function AccountPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [nickname, setNickname] = useState('축구왕김선수');
  const [email, setEmail] = useState('player@example.com');
  const [phone, setPhone] = useState('010-1234-5678');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <header className="page-hero @3xl:hidden flex items-center gap-3 px-5 py-4">
        <button
          aria-label="뒤로 가기"
          onClick={() => router.push('/settings')}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-gray-200/70 bg-white/70 p-2 transition-colors hover:bg-white dark:border-gray-800 dark:bg-slate-950/60 dark:hover:bg-slate-900"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <div>
          <p className="eyebrow-chip text-[0.68rem]">Profile privacy</p>
          <h1 className="mt-2 text-lg font-bold text-gray-900 dark:text-white">개인정보 관리</h1>
        </div>
      </header>

      <div className="hidden @3xl:flex items-center gap-2 mb-6 text-sm text-gray-500 dark:text-gray-400">
        <button onClick={() => router.push('/settings')} className="hover:text-gray-700 dark:hover:text-gray-200">
          설정
        </button>
        <ChevronRight size={14} />
        <span className="font-medium text-gray-900 dark:text-white">개인정보 관리</span>
      </div>

      <div className="px-5 @3xl:px-0 max-w-2xl py-6 space-y-6">
        <div className="solid-panel rounded-[24px] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">Identity</p>
              <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">계정 정보</h2>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
              MatchUp profile
            </span>
          </div>

          <div className="space-y-5">
            <Field label="닉네임">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="input-surface px-4 py-3 text-md outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="닉네임을 입력하세요"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">2~12자, 한글/영문/숫자 사용 가능</p>
            </Field>

            <Field label="이메일">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-surface px-4 py-3 text-md outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="이메일을 입력하세요"
              />
            </Field>

            <Field label="전화번호">
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  const formatted = formatPhoneNumber(e.target.value);
                  setPhone(formatted);
                  if (phoneError) setPhoneError(null);
                }}
                onBlur={() => setPhoneError(validatePhone(phone))}
                className={`input-surface px-4 py-3 text-md outline-none focus:ring-2 transition-colors ${
                  phoneError
                    ? 'border-red-400 dark:border-red-500 focus:ring-red-500/20 focus:border-red-500'
                    : 'border-gray-200 dark:border-gray-700 focus:ring-blue-500/20 focus:border-blue-500'
                }`}
                placeholder="전화번호를 입력하세요"
              />
              {phoneError && <p className="mt-2 text-xs text-red-500 dark:text-red-400">{phoneError}</p>}
            </Field>
          </div>
        </div>

        <div className="solid-panel rounded-[24px] p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">Access</p>
            <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">비밀번호와 소셜 연결</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-[20px] bg-blue-50/80 px-4 py-3.5 dark:bg-blue-900/20">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-500/10">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <p className="text-base font-semibold text-blue-700 dark:text-blue-200">소셜 로그인 사용 중</p>
                <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-300">카카오 계정으로 로그인되어 있어 비밀번호 변경이 불가합니다.</p>
              </div>
            </div>

            <div className="space-y-3">
              <SocialAccount provider="kakao" name="카카오" email="player@kakao.com" connected />
              <SocialAccount provider="naver" name="네이버" connected={false} />
              <SocialAccount provider="apple" name="Apple" connected={false} />
            </div>
          </div>
        </div>

        <button
          onClick={async () => {
            try {
              await api.patch('/users/me', { nickname, email, phone });
              toast('success', '변경사항이 저장되었어요');
            } catch {
              toast('error', '저장하지 못했어요. 네트워크 연결을 확인해주세요');
            }
          }}
          className="w-full rounded-full bg-blue-500 py-3.5 text-md font-bold text-white transition-colors hover:bg-blue-600 active:bg-blue-700"
        >
          변경사항 저장
        </button>

        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full rounded-full border border-red-200 px-4 py-3.5 text-md font-semibold text-red-500 transition-colors hover:bg-red-50 active:bg-red-100 dark:border-red-900/40 dark:hover:bg-red-950/20"
          >
            회원 탈퇴
          </button>
          <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.</p>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDeleteModal(false)} />
          <div className="relative w-full max-w-sm rounded-[28px] bg-white p-6 shadow-xl animate-fade-in dark:bg-gray-900">
            <button
              aria-label="닫기"
              onClick={() => setShowDeleteModal(false)}
              className="absolute right-4 top-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X size={20} className="text-gray-500" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/30">
                <AlertTriangle size={28} className="text-red-500" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">정말 탈퇴하시겠어요?</h3>
              <p className="mb-6 text-base text-gray-500 dark:text-gray-400">
                탈퇴하면 모든 매치 기록, 채팅 내역, 팀 정보가 영구 삭제돼요. 이 작업은 되돌릴 수 없어요.
              </p>

              <div className="mb-4 w-full">
                <p className="mb-2 text-left text-sm text-gray-500 dark:text-gray-400">확인을 위해 &quot;탈퇴합니다&quot;를 입력하세요</p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="input-surface px-4 py-3 text-md outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  placeholder="탈퇴합니다"
                />
              </div>

              <div className="flex w-full gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 rounded-full bg-gray-100 py-3 text-md font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  취소
                </button>
                <button
                  disabled={deleteConfirmText !== '탈퇴합니다'}
                  className="flex-1 rounded-full bg-red-500 py-3 text-md font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  탈퇴하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-3 block text-sm font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{label}</label>
      {children}
    </div>
  );
}

function SocialAccount({ provider, name, email, connected }: { provider: string; name: string; email?: string; connected: boolean }) {
  const icons: Record<string, React.ReactNode> = {
    kakao: (
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FEE500]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#3C1E1E">
          <path d="M12 3C6.48 3 2 6.58 2 10.94c0 2.8 1.86 5.27 4.66 6.67-.15.56-.96 3.6-.99 3.83 0 0-.02.17.09.23.11.07.24.01.24.01.32-.04 3.7-2.44 4.28-2.86.56.08 1.14.12 1.72.12 5.52 0 10-3.58 10-7.94S17.52 3 12 3z" />
        </svg>
      </div>
    ),
    naver: (
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#03C75A]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white" fontWeight="bold">
          <path d="M16.27 3H7.73A4.73 4.73 0 0 0 3 7.73v8.54A4.73 4.73 0 0 0 7.73 21h8.54A4.73 4.73 0 0 0 21 16.27V7.73A4.73 4.73 0 0 0 16.27 3zM15.5 15.5h-2.4l-3.1-4.5v4.5H7.6V8.5H10l3.1 4.5V8.5h2.4v7z" />
        </svg>
      </div>
    ),
    apple: (
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
      </div>
    ),
  };

  return (
    <div className="flex items-center gap-3.5 rounded-[24px] border border-gray-100 bg-white/70 px-4 py-3 dark:border-gray-800 dark:bg-slate-950/60">
      {icons[provider]}
      <div className="min-w-0 flex-1">
        <p className="text-md font-semibold text-gray-900 dark:text-gray-100">{name}</p>
        {email && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{email}</p>}
      </div>
      {connected ? (
        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-400/10 dark:text-green-200">연결됨</span>
      ) : (
        <button className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">
          연결하기
        </button>
      )}
    </div>
  );
}
