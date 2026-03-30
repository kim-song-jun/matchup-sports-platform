'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Moon, Sun, Monitor, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useThemeStore } from '@/stores/theme-store';

export function SettingsBackButton() {
  const router = useRouter();

  return (
    <button aria-label="뒤로 가기" onClick={() => router.back()} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-gray-200/70 bg-white/70 p-2 text-gray-700 transition-colors hover:bg-white dark:border-gray-800 dark:bg-slate-950/60 dark:text-gray-300 dark:hover:bg-slate-900">
      <ArrowLeft size={20} />
    </button>
  );
}

export function ThemePicker() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="px-4 py-4">
      <p className="mb-3 text-md font-semibold text-gray-900 dark:text-white">테마 설정</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { value: 'light' as const, icon: Sun, label: '라이트' },
          { value: 'dark' as const, icon: Moon, label: '다크' },
          { value: 'system' as const, icon: Monitor, label: '시스템' },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 transition-colors ${
              theme === opt.value
                ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900'
                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-slate-950/60 dark:text-gray-400 dark:hover:bg-slate-900'
            }`}
          >
            <opt.icon size={20} />
            <span className="text-xs font-medium">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function LogoutButton() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuthStore();
  const resetNotifications = useNotificationStore((state) => state.resetNotifications);

  if (!isAuthenticated) return null;

  return (
    <div className="mb-6">
      <button
        onClick={() => {
          logout();
          resetNotifications();
          router.push('/login');
        }}
        className="flex w-full items-center gap-3.5 rounded-[24px] border border-gray-200/70 bg-white/80 px-4 py-3.5 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-slate-950/70 dark:hover:bg-slate-900"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-800">
          <LogOut size={18} />
        </div>
        <span className="text-md font-semibold text-red-500">로그아웃</span>
      </button>
    </div>
  );
}
