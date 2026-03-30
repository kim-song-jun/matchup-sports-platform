'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronRight,
  Trophy,
  MessageCircle,
  CreditCard,
  ShoppingBag,
  Users,
  Megaphone,
  Moon,
  Laptop,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NotificationCategory {
  key: string;
  label: string;
  desc: string;
  enabled: boolean;
  icon: LucideIcon;
}

const STORAGE_KEY = 'matchup_notification_preferences_v2';

const defaultCategories: NotificationCategory[] = [
  { key: 'match', label: '매치 알림', desc: '새 매치, 참가 확인, 팀 구성 알림', enabled: true, icon: Trophy },
  { key: 'chat', label: '채팅 알림', desc: '새 메시지, 단체 채팅방 알림', enabled: true, icon: MessageCircle },
  { key: 'payment', label: '결제 알림', desc: '결제 완료, 환불 처리 알림', enabled: true, icon: CreditCard },
  { key: 'market', label: '장터 알림', desc: '관심 매물 가격 변동, 거래 알림', enabled: false, icon: ShoppingBag },
  { key: 'team', label: '팀 매칭 알림', desc: '팀 매칭 신청, 승인/거절 알림', enabled: true, icon: Users },
  { key: 'marketing', label: '마케팅 알림', desc: '이벤트, 프로모션, 혜택 안내', enabled: false, icon: Megaphone },
];

export default function NotificationsPage() {
  const router = useRouter();
  const [pushMaster, setPushMaster] = useState(true);
  const [emailNotif, setEmailNotif] = useState(true);
  const [dndEnabled, setDndEnabled] = useState(false);
  const [categories, setCategories] = useState<NotificationCategory[]>(defaultCategories);
  const [isHydrated, setIsHydrated] = useState(false);

  const dndStart = '22:00';
  const dndEnd = '08:00';

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setIsHydrated(true);
        return;
      }

      const saved = JSON.parse(raw) as {
        pushMaster?: boolean;
        emailNotif?: boolean;
        dndEnabled?: boolean;
        categories?: Array<{ key: string; enabled: boolean }>;
      };

      setPushMaster(saved.pushMaster ?? true);
      setEmailNotif(saved.emailNotif ?? true);
      setDndEnabled(saved.dndEnabled ?? false);
      setCategories(
        defaultCategories.map((category) => ({
          ...category,
          enabled: saved.categories?.find((item) => item.key === category.key)?.enabled ?? category.enabled,
        })),
      );
    } catch {
      setCategories(defaultCategories);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          pushMaster,
          emailNotif,
          dndEnabled,
          categories: categories.map(({ key, enabled }) => ({ key, enabled })),
        }),
      );
    } catch {
      // Ignore persistence failures and keep the UI interactive.
    }
  }, [categories, dndEnabled, emailNotif, isHydrated, pushMaster]);

  const toggleCategory = (key: string) => {
    setCategories((prev) =>
      prev.map((category) =>
        category.key === key ? { ...category, enabled: !category.enabled } : category,
      ),
    );
  };

  const enabledCategoryCount = categories.filter((category) => category.enabled).length;

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <header className="page-hero px-5 py-5 @3xl:px-6 @3xl:py-6">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push('/settings')}
            aria-label="설정으로 돌아가기"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-gray-200/70 bg-white/70 p-2 text-gray-700 transition-colors hover:bg-white dark:border-gray-800 dark:bg-slate-950/60 dark:text-gray-300 dark:hover:bg-slate-900"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <div className="eyebrow-chip">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Notification control
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-gray-900 dark:text-white sm:text-3xl">알림 설정</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
              푸시, 이메일, 조용한 시간대를 기기 기준으로 조절합니다. 이 화면의 변경사항은 현재 브라우저에 자동 저장됩니다.
            </p>
          </div>
        </div>
      </header>

      <div className="hidden @3xl:flex items-center gap-2 mb-6 px-6 text-sm text-gray-500 dark:text-gray-400">
        <button onClick={() => router.push('/settings')} className="hover:text-gray-600 dark:hover:text-gray-300">
          설정
        </button>
        <ChevronRight size={14} />
        <span className="font-medium text-gray-900 dark:text-white">알림 설정</span>
      </div>

      <div className="px-5 @3xl:px-0 max-w-2xl @3xl:max-w-[680px] py-6 space-y-5">
        <section className="solid-panel rounded-[24px] p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryTile label="푸시" value={pushMaster ? 'On' : 'Off'} />
            <SummaryTile label="이메일" value={emailNotif ? 'On' : 'Off'} />
            <SummaryTile label="세부 카테고리" value={`${enabledCategoryCount}개`} />
          </div>
        </section>

        <section className="solid-panel rounded-[24px] p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">Delivery</p>
            <h3 className="mt-2 text-lg font-bold text-gray-900 dark:text-white">알림 수신</h3>
          </div>

          <ToggleRow
            label="Push 알림"
            desc="앱 푸시 알림을 받습니다"
            enabled={pushMaster}
            onToggle={() => setPushMaster((prev) => !prev)}
          />

          <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
            <ToggleRow
              label="이메일 알림"
              desc="이메일로 주요 알림을 받습니다"
              enabled={emailNotif}
              onToggle={() => setEmailNotif((prev) => !prev)}
            />
          </div>
        </section>

        <section className="solid-panel rounded-[24px] p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">Quiet hours</p>
            <h3 className="mt-2 text-lg font-bold text-gray-900 dark:text-white">방해금지 시간</h3>
          </div>

          <div className={`flex items-center gap-3.5 min-h-[44px] ${!pushMaster ? 'opacity-50' : ''}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/30">
              <Moon size={18} className="text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-md font-semibold text-gray-900 dark:text-white">
                {dndStart} ~ {dndEnd}
              </p>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                이 시간에는 푸시 알림을 무음 처리합니다.
              </p>
            </div>
            <Toggle
              enabled={dndEnabled}
              onToggle={() => setDndEnabled((prev) => !prev)}
              disabled={!pushMaster}
              label="방해금지 시간"
            />
          </div>
        </section>

        <section className="solid-panel rounded-[24px] p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">Categories</p>
              <h3 className="mt-2 text-lg font-bold text-gray-900 dark:text-white">카테고리별 알림</h3>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Laptop size={14} />
              This device only
            </div>
          </div>

          {!pushMaster && (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 dark:bg-amber-400/10">
              <p className="text-sm text-amber-700 dark:text-amber-200">
                Push 알림이 꺼져 있으면 아래 설정과 관계없이 알림을 받지 않습니다.
              </p>
            </div>
          )}

          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <div
                  key={category.key}
                  className={`flex items-center gap-3.5 min-h-[44px] py-4 first:pt-0 last:pb-0 ${
                    !pushMaster ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/30">
                    <Icon size={18} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-md font-semibold text-gray-900 dark:text-white">{category.label}</p>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{category.desc}</p>
                  </div>
                  <Toggle
                    enabled={category.enabled}
                    onToggle={() => toggleCategory(category.key)}
                    disabled={!pushMaster}
                    label={category.label}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <p className="pb-2 text-center text-xs text-gray-500 dark:text-gray-400">
          {isHydrated ? '현재 브라우저에 자동 저장됩니다.' : '설정을 불러오는 중입니다.'}
        </p>
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  enabled,
  onToggle,
  disabled,
}: {
  label: string;
  desc: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3.5 min-h-[44px] ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-md font-semibold text-gray-900 dark:text-white">{label}</p>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{desc}</p>
      </div>
      <Toggle enabled={enabled} onToggle={onToggle} disabled={disabled} label={label} />
    </div>
  );
}

function Toggle({
  enabled,
  onToggle,
  disabled,
  label,
}: {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      aria-label={`${label} ${enabled ? '켜짐' : '꺼짐'}`}
      role="switch"
      aria-checked={enabled}
      className={`relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors duration-200 ${
        enabled ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'
      } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute left-[3px] top-[3px] h-[24px] w-[24px] rounded-full bg-white shadow-sm transition-transform duration-200 dark:bg-gray-800 ${
          enabled ? 'translate-x-[22px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
