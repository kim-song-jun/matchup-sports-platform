'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Moon, Sun, Monitor, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';

export function SettingsBackButton() {
  const router = useRouter();

  return (
    <button aria-label="뒤로 가기" onClick={() => router.back()} className="rounded-xl p-2 -ml-2 hover:bg-gray-100 active:scale-[0.98] transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center">
      <ArrowLeft size={20} className="text-gray-700" />
    </button>
  );
}

export function ThemePicker() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="px-4 py-4">
      <p className="text-md font-medium text-gray-900 dark:text-white mb-3">테마 설정</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { value: 'light' as const, icon: Sun, label: '라이트' },
          { value: 'dark' as const, icon: Moon, label: '다크' },
          { value: 'system' as const, icon: Monitor, label: '시스템' },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className={`flex flex-col items-center gap-1.5 rounded-xl py-3 transition-colors ${
              theme === opt.value
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-gray-50 dark:bg-gray-700 text-gray-500 hover:bg-gray-100'
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

  if (!isAuthenticated) return null;

  return (
    <div className="mb-6">
      <button onClick={() => { logout(); router.push('/login'); }}
        className="w-full rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-4 py-3.5 flex items-center gap-3.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
          <LogOut size={18} />
        </div>
        <span className="text-md font-medium text-red-500">로그아웃</span>
      </button>
    </div>
  );
}
