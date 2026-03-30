import Link from 'next/link';
import { Bell, Shield, FileText, Info, ChevronRight, User, Globe } from 'lucide-react';
import { SettingsBackButton, ThemePicker, LogoutButton } from './settings-client';

export default function SettingsPage() {
  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in dark:bg-gray-900">
      <header className="@3xl:hidden flex items-center gap-3 px-5 pt-4 pb-3">
        <SettingsBackButton />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">설정</h1>
      </header>
      <div className="hidden @3xl:block mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">설정</h1>
      </div>

      <div className="px-5 @3xl:px-0 max-w-2xl">
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
          <ThemePicker />
        </SettingsSection>

        {/* 언어 */}
        <SettingsSection title="기타">
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-500">
              <Globe size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-md font-medium text-gray-900 dark:text-white">언어 설정</p>
              <p className="text-sm text-gray-500 mt-0.5">한국어</p>
            </div>
          </div>
        </SettingsSection>

        {/* 정보 */}
        <SettingsSection title="정보">
          <SettingsLink icon={FileText} label="이용약관" href="/settings/terms" />
          <SettingsLink icon={Shield} label="개인정보 처리방침" href="/settings/privacy" />
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-500">
              <Info size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-md font-medium text-gray-900 dark:text-white">앱 정보</p>
              <p className="text-sm text-gray-500 mt-0.5">TeamMeet v1.0.0</p>
            </div>
          </div>
        </SettingsSection>

        {/* 로그아웃 */}
        <LogoutButton />

        <div className="text-center">
          <p className="text-xs text-gray-300">TeamMeet v1.0.0</p>
        </div>
      </div>

    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">{title}</h3>
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden divide-y divide-gray-50 dark:divide-gray-700">
        {children}
      </div>
    </div>
  );
}

function SettingsLink({ icon: Icon, label, desc, href }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; desc?: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-500">
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-md font-medium text-gray-900 dark:text-white">{label}</p>
        {desc && <p className="text-sm text-gray-500 mt-0.5">{desc}</p>}
      </div>
      <ChevronRight size={16} className="text-gray-300 shrink-0" />
    </Link>
  );
}
