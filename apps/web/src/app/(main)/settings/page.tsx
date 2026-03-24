'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Bell, Shield, FileText, Info, ChevronRight, LogOut, User, Moon, Sun, Globe, Monitor } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';

export default function SettingsPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in dark:bg-gray-900">
      <header className="lg:hidden flex items-center gap-3 px-5 pt-4 pb-3">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-lg p-2 -ml-2 hover:bg-gray-100 active:scale-[0.98] transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"><ArrowLeft size={20} className="text-gray-700" /></button>
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-white">설정</h1>
      </header>
      <div className="hidden lg:block px-5 lg:px-0 pt-4 pb-3">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-white">설정</h1>
      </div>

      <div className="px-5 lg:px-0 max-w-2xl">
        {/* 계정 */}
        <SettingsSection title="계정">
          <SettingsLink icon={User} label="프로필 수정" desc="닉네임, 프로필 사진 변경" href="/profile" />
          <SettingsLink icon={Shield} label="개인정보 관리" desc="비밀번호 변경, 계정 보안" href="/settings/account" />
        </SettingsSection>

        {/* 알림 */}
        <SettingsSection title="알림">
          <SettingsLink icon={Bell} label="알림 설정" desc="매치, 채팅, 마케팅 알림" href="/settings/notifications" />
        </SettingsSection>

        {/* 테마 */}
        <SettingsSection title="화면">
          <div className="px-4 py-4">
            <p className="text-[15px] font-medium text-gray-900 mb-3">테마 설정</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'light' as const, icon: Sun, label: '라이트' },
                { value: 'dark' as const, icon: Moon, label: '다크' },
                { value: 'system' as const, icon: Monitor, label: '시스템' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl py-3 transition-all ${
                    theme === opt.value
                      ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500/20'
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <opt.icon size={20} />
                  <span className="text-[12px] font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </SettingsSection>

        {/* 언어 */}
        <SettingsSection title="기타">
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500">
              <Globe size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-gray-900">언어 설정</p>
              <p className="text-[13px] text-gray-400 mt-0.5">한국어</p>
            </div>
          </div>
        </SettingsSection>

        {/* 정보 */}
        <SettingsSection title="정보">
          <SettingsLink icon={FileText} label="이용약관" href="/settings/terms" />
          <SettingsLink icon={Shield} label="개인정보 처리방침" href="/settings/privacy" />
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500">
              <Info size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-gray-900">앱 정보</p>
              <p className="text-[13px] text-gray-400 mt-0.5">MatchUp v1.0.0</p>
            </div>
          </div>
        </SettingsSection>

        {/* 로그아웃 */}
        {isAuthenticated && (
          <div className="mb-6">
            <button onClick={() => { logout(); router.push('/login'); }}
              className="w-full rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-3.5 flex items-center gap-3.5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-500 group-hover:bg-red-100">
                <LogOut size={18} />
              </div>
              <span className="text-[15px] font-medium text-red-500">로그아웃</span>
            </button>
          </div>
        )}

        <div className="text-center">
          <p className="text-[12px] text-gray-300">MatchUp v1.0.0</p>
        </div>
      </div>

      <div className="h-6" />
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-[13px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">{title}</h3>
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden divide-y divide-gray-50 dark:divide-gray-700">
        {children}
      </div>
    </div>
  );
}

function SettingsLink({ icon: Icon, label, desc, href }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; desc?: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-gray-50 transition-colors">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500">
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-gray-900">{label}</p>
        {desc && <p className="text-[13px] text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <ChevronRight size={16} className="text-gray-300 shrink-0" />
    </Link>
  );
}
