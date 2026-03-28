'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NotificationCategory {
  key: string;
  label: string;
  desc: string;
  enabled: boolean;
  icon: LucideIcon;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [pushMaster, setPushMaster] = useState(true);
  const [emailNotif, setEmailNotif] = useState(true);

  /* 방해금지 시간 */
  const [dndEnabled, setDndEnabled] = useState(false);
  const [dndStart] = useState('22:00');
  const [dndEnd] = useState('08:00');

  const [categories, setCategories] = useState<NotificationCategory[]>([
    { key: 'match', label: '매치 알림', desc: '새 매치, 참가 확인, 팀 구성 알림', enabled: true, icon: Trophy },
    { key: 'chat', label: '채팅 알림', desc: '새 메시지, 단체 채팅방 알림', enabled: true, icon: MessageCircle },
    { key: 'payment', label: '결제 알림', desc: '결제 완료, 환불 처리 알림', enabled: true, icon: CreditCard },
    { key: 'market', label: '장터 알림', desc: '관심 매물 가격 변동, 거래 알림', enabled: false, icon: ShoppingBag },
    { key: 'team', label: '팀 매칭 알림', desc: '팀 매칭 신청, 승인/거절 알림', enabled: true, icon: Users },
    { key: 'marketing', label: '마케팅 알림', desc: '이벤트, 프로모션, 혜택 안내', enabled: false, icon: Megaphone },
  ]);

  const toggleCategory = (key: string) => {
    setCategories((prev) =>
      prev.map((cat) => (cat.key === key ? { ...cat, enabled: !cat.enabled } : cat))
    );
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      {/* Header — mobile */}
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-800">
        <button
          onClick={() => router.back()}
          aria-label="뒤로 가기"
          className="rounded-xl p-1.5 -ml-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">알림 설정</h1>
      </header>

      {/* Header — desktop breadcrumb */}
      <div className="hidden lg:flex items-center gap-2 mb-6 text-sm text-gray-500">
        <button onClick={() => router.push('/settings')} className="hover:text-gray-600 dark:hover:text-gray-300">
          설정
        </button>
        <ChevronRight size={14} />
        <span className="text-gray-900 dark:text-gray-50 font-medium">알림 설정</span>
      </div>

      <div className="px-5 lg:px-0 max-w-2xl lg:max-w-[600px] py-6 space-y-5">
        {/* ── 마스터 토글 ── */}
        <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            알림 수신
          </h3>
          <ToggleRow
            label="Push 알림"
            desc="앱 푸시 알림을 받습니다"
            enabled={pushMaster}
            onToggle={() => setPushMaster(!pushMaster)}
          />
          <div className="border-t border-gray-50 dark:border-gray-700 pt-4">
            <ToggleRow
              label="이메일 알림"
              desc="이메일로 주요 알림을 받습니다"
              enabled={emailNotif}
              onToggle={() => setEmailNotif(!emailNotif)}
            />
          </div>
        </section>

        {/* ── 방해금지 시간 ── */}
        <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            방해금지 시간
          </h3>
          <div className={`flex items-center gap-3.5 min-h-[44px] ${!pushMaster ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 shrink-0">
              <Moon size={18} className="text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-md font-medium text-gray-900 dark:text-gray-50">
                  {dndStart} ~ {dndEnd}
                </p>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                이 시간에는 Push 알림이 무음 처리됩니다
              </p>
            </div>
            <Toggle
              enabled={dndEnabled}
              onToggle={() => setDndEnabled(!dndEnabled)}
              disabled={!pushMaster}
              label="방해금지 시간"
            />
          </div>
        </section>

        {/* ── 카테고리별 알림 ── */}
        <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            카테고리별 알림
          </h3>

          {!pushMaster && (
            <div className="rounded-xl bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3">
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                Push 알림이 꺼져 있으면 아래 설정과 관계없이 알림을 받지 않습니다.
              </p>
            </div>
          )}

          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <div
                  key={cat.key}
                  className={`flex items-center gap-3.5 min-h-[44px] py-4 first:pt-0 last:pb-0 ${
                    !pushMaster ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 shrink-0">
                    <Icon size={18} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-md font-medium text-gray-900 dark:text-gray-50">
                      {cat.label}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">{cat.desc}</p>
                  </div>
                  <Toggle
                    enabled={cat.enabled}
                    onToggle={() => toggleCategory(cat.key)}
                    disabled={!pushMaster}
                    label={cat.label}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <p className="text-xs text-gray-500 text-center pb-2">
          알림 설정은 이 기기에만 적용됩니다.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 *  ToggleRow — used for master toggles (no icon)
 * ───────────────────────────────────────────── */
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
        <p className="text-md font-medium text-gray-900 dark:text-gray-50">{label}</p>
        <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
      </div>
      <Toggle enabled={enabled} onToggle={onToggle} disabled={disabled} label={label} />
    </div>
  );
}

/* ─────────────────────────────────────────────
 *  Toggle — pure switch with proper touch target
 * ───────────────────────────────────────────── */
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
      className={`relative shrink-0 h-[30px] w-[52px] rounded-full transition-colors duration-200 ${
        enabled ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'
      } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-[3px] left-[3px] h-[24px] w-[24px] rounded-full bg-white dark:bg-gray-800 shadow-sm transition-transform duration-200 ${
          enabled ? 'translate-x-[22px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
