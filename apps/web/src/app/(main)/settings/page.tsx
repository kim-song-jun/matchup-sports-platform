import Link from 'next/link';
import { Bell, Shield, FileText, Info, ChevronRight, User, Globe } from 'lucide-react';
import { SettingsBackButton, ThemePicker, LogoutButton } from './settings-client';

export default function SettingsPage() {
  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <header className="page-hero px-5 py-5 @3xl:px-6 @3xl:py-6">
        <div className="flex items-start gap-4">
          <SettingsBackButton />
          <div className="min-w-0">
            <div className="eyebrow-chip">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Account preferences
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-gray-900 dark:text-white sm:text-3xl">설정</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
              계정, 알림, 화면, 언어, 정책을 한 화면에서 정리합니다. 보이는 방식은 차분하게 유지하고, 조작은 빠르게 가져갑니다.
            </p>
          </div>
        </div>
      </header>

      <div className="px-5 @3xl:px-0 pt-4">
        <div className="grid gap-3 @3xl:grid-cols-3">
          <div className="solid-panel rounded-[24px] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">계정</p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">프로필, 보안, 연결 정보를 관리합니다.</p>
          </div>
          <div className="solid-panel rounded-[24px] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">알림</p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">매치, 채팅, 마케팅 알림을 세밀하게 조정합니다.</p>
          </div>
          <div className="solid-panel rounded-[24px] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">화면</p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">테마와 언어를 기기별로 맞춥니다.</p>
          </div>
        </div>
      </div>

      <div className="px-5 @3xl:px-0 max-w-2xl pt-5">
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
              <p className="text-sm text-gray-500 mt-0.5">MatchUp v2.0.0</p>
            </div>
          </div>
        </SettingsSection>

        {/* 로그아웃 */}
        <LogoutButton />

        <div className="text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">MatchUp v2.0.0</p>
        </div>
      </div>

    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 px-1 text-sm font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{title}</h3>
      <div className="solid-panel overflow-hidden rounded-[24px] divide-y divide-gray-100/80 dark:divide-gray-800">
        {children}
      </div>
    </div>
  );
}

function SettingsLink({ icon: Icon, label, desc, href }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; desc?: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3.5 px-4 py-4 transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/80">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-700">
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-md font-semibold text-gray-900 dark:text-white">{label}</p>
        {desc && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{desc}</p>}
      </div>
      <ChevronRight size={16} className="shrink-0 text-gray-300 dark:text-gray-500" />
    </Link>
  );
}
