'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { ArrowLeft, ChevronRight, AlertTriangle, X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

export default function AccountPage() {
  useRequireAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [nickname, setNickname] = useState('축구왕김선수');
  const [email, setEmail] = useState('player@example.com');
  const [phone, setPhone] = useState('010-1234-5678');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      {/* Header */}
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-700">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-xl p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-[0.98] transition-colors min-w-11 min-h-[44px] flex items-center justify-center">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">개인정보 관리</h1>
      </header>
      <div className="hidden @3xl:flex items-center gap-2 mb-6 text-sm text-gray-500">
        <button onClick={() => router.push('/settings')} className="hover:text-gray-600 dark:hover:text-gray-400">설정</button>
        <ChevronRight size={14} />
        <span className="text-gray-900 dark:text-white font-medium">개인정보 관리</span>
      </div>

      <div className="px-5 @3xl:px-0 max-w-2xl py-6 space-y-6">
        {/* 닉네임 */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <label htmlFor="account-nickname" className="block text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">닉네임</label>
          <input
            id="account-nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-md text-gray-900 dark:text-gray-100 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors dark:placeholder:text-gray-500"
            placeholder="닉네임을 입력하세요"
          />
          <p className="text-xs text-gray-500 mt-2">2~12자, 한글/영문/숫자 사용 가능</p>
        </div>

        {/* 이메일 */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <label htmlFor="account-email" className="block text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">이메일</label>
          <input
            id="account-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-md text-gray-900 dark:text-gray-100 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors dark:placeholder:text-gray-500"
            placeholder="이메일을 입력하세요"
          />
        </div>

        {/* 전화번호 */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <label htmlFor="account-phone" className="block text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">전화번호</label>
          <input
            id="account-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-md text-gray-900 dark:text-gray-100 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors dark:placeholder:text-gray-500"
            placeholder="전화번호를 입력하세요"
          />
        </div>

        {/* 비밀번호 */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <p className="block text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">비밀번호</p>
          <div className="flex items-center gap-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 px-4 py-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <p className="text-base font-medium text-blue-700">소셜 로그인 사용 중</p>
              <p className="text-xs text-blue-500 mt-0.5">카카오 계정으로 로그인되어 있어 비밀번호 변경이 불가합니다.</p>
            </div>
          </div>
        </div>

        {/* 연결된 소셜 계정 */}
        <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
          <p className="block text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">연결된 소셜 계정</p>
          <div className="space-y-3">
            <SocialAccount provider="kakao" name="카카오" email="player@kakao.com" connected />
            <SocialAccount provider="naver" name="네이버" connected={false} />
            <SocialAccount provider="apple" name="Apple" connected={false} />
          </div>
        </div>

        {/* 저장 버튼 */}
        <button
          onClick={async () => {
            try {
              await api.patch('/users/me', { nickname, email, phone });
              toast('success', '변경사항이 저장되었어요');
            } catch {
              toast('error', '저장하지 못했어요. 네트워크 연결을 확인해주세요');
            }
          }}
          className="w-full rounded-2xl bg-blue-500 text-white py-3.5 text-md font-bold hover:bg-blue-600 active:bg-blue-700 transition-colors"
        >
          변경사항 저장
        </button>

        {/* 회원 탈퇴 */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full rounded-2xl border-2 border-red-200 text-red-500 py-3.5 text-md font-semibold hover:bg-red-50 active:bg-red-100 transition-colors"
          >
            회원 탈퇴
          </button>
          <p className="text-xs text-gray-500 text-center mt-2">탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.</p>
        </div>
      </div>

      {/* 회원 탈퇴 확인 모달 */}
      {showDeleteModal && (
        <DeleteModal
          deleteConfirmText={deleteConfirmText}
          setDeleteConfirmText={setDeleteConfirmText}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}

function DeleteModal({
  deleteConfirmText,
  setDeleteConfirmText,
  onClose,
}: {
  deleteConfirmText: string;
  setDeleteConfirmText: (v: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled'));
        if (focusable.length === 0) { e.preventDefault(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      prev?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-3xl bg-white dark:bg-gray-800 p-6 shadow-xl animate-fade-in outline-none"
      >
        <button
          aria-label="닫기"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-xl p-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98] transition-colors min-w-11 min-h-[44px] flex items-center justify-center"
        >
          <X size={20} className="text-gray-500" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/30 mb-4">
            <AlertTriangle size={28} className="text-red-500" />
          </div>
          <h3 id="delete-modal-title" className="text-xl font-bold text-gray-900 dark:text-white mb-2">정말 탈퇴하시겠어요?</h3>
              <p className="text-base text-gray-500 dark:text-gray-400 mb-6">
                탈퇴하면 모든 매치 기록, 채팅 내역, 팀 정보가 영구 삭제돼요. 이 작업은 되돌릴 수 없어요.
              </p>

              <div className="w-full mb-4">
                <label htmlFor="account-delete-confirm" className="text-sm text-gray-500 mb-2 text-left block">확인을 위해 &quot;탈퇴합니다&quot;를 입력하세요</label>
                <input
                  id="account-delete-confirm"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-md text-gray-900 dark:text-gray-100 bg-transparent focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors dark:placeholder:text-gray-500"
                  placeholder="탈퇴합니다"
                />
              </div>

          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              className="flex-1 rounded-2xl bg-gray-100 dark:bg-gray-700 py-3 text-md font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              취소
            </button>
            <button
              disabled={deleteConfirmText !== '탈퇴합니다'}
              className="flex-1 rounded-2xl bg-red-500 py-3 text-md font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              탈퇴하기
            </button>
          </div>
        </div>
      </div>
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
    <div className="flex items-center gap-3.5 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3">
      {icons[provider]}
      <div className="flex-1 min-w-0">
        <p className="text-md font-medium text-gray-900 dark:text-gray-100">{name}</p>
        {email && <p className="text-sm text-gray-500 mt-0.5">{email}</p>}
      </div>
      {connected ? (
        <span className="rounded-lg bg-green-50 px-2.5 py-1 text-xs font-medium text-green-600">연결됨</span>
      ) : (
        <button className="rounded-xl bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
          연결하기
        </button>
      )}
    </div>
  );
}
