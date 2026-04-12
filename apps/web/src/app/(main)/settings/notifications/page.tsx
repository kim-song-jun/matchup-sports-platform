'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BellRing,
  ChevronRight,
  CreditCard,
  MessageCircle,
  Moon,
  Smartphone,
  Trophy,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks/use-api';
import { useRequireAuth } from '@/hooks/use-require-auth';
import type { NotificationPreference } from '@/types/api';

type ServerPreferenceKey = keyof Omit<NotificationPreference, 'id'>;
type BrowserPermissionState = NotificationPermission | 'unsupported';

interface ServerCategoryConfig {
  key: ServerPreferenceKey;
  label: string;
  desc: string;
  icon: LucideIcon;
}

const DEVICE_DND_STORAGE_KEY = 'teameet:notification-dnd-enabled';
const DND_START = '22:00';
const DND_END = '08:00';

const SERVER_CATEGORIES: ServerCategoryConfig[] = [
  {
    key: 'matchEnabled',
    label: '매치 알림',
    desc: '새 매치, 참가 확인, 경기 상태 변경을 계정 전체에서 동기화합니다.',
    icon: Trophy,
  },
  {
    key: 'teamEnabled',
    label: '팀 알림',
    desc: '팀 가입, 신청 승인/거절, 운영 공지를 계정 전체에서 동기화합니다.',
    icon: Users,
  },
  {
    key: 'chatEnabled',
    label: '채팅 알림',
    desc: '새 메시지와 단체 채팅방 업데이트를 계정 전체에서 동기화합니다.',
    icon: MessageCircle,
  },
  {
    key: 'paymentEnabled',
    label: '결제 알림',
    desc: '결제 완료, 환불, 주문 상태 변경을 계정 전체에서 동기화합니다.',
    icon: CreditCard,
  },
];

export default function NotificationsPage() {
  const { isAuthenticated } = useRequireAuth();

  const router = useRouter();
  const { toast } = useToast();
  const preferencesQuery = useNotificationPreferences();
  const updatePreferences = useUpdateNotificationPreferences();
  const [dndEnabled, setDndEnabled] = useState(false);
  const [browserPermission, setBrowserPermission] =
    useState<BrowserPermissionState>('unsupported');
  const [savingKey, setSavingKey] = useState<ServerPreferenceKey | null>(null);

  if (!isAuthenticated) {
    return null;
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const savedDnd = window.localStorage.getItem(DEVICE_DND_STORAGE_KEY);
    setDndEnabled(savedDnd === 'true');
    setBrowserPermission(
      'Notification' in window ? window.Notification.permission : 'unsupported',
    );
  }, []);

  const handleServerToggle = (key: ServerPreferenceKey, nextValue: boolean) => {
    setSavingKey(key);
    updatePreferences.mutate(
      { [key]: nextValue },
      {
        onSuccess: () => {
          toast('success', '알림 설정이 계정에 저장되었어요');
        },
        onError: () => {
          toast('error', '알림 설정을 저장하지 못했어요. 잠시 후 다시 시도해주세요');
        },
        onSettled: () => {
          setSavingKey((current) => (current === key ? null : current));
        },
      },
    );
  };

  const handleDndToggle = () => {
    const nextValue = !dndEnabled;
    setDndEnabled(nextValue);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DEVICE_DND_STORAGE_KEY, String(nextValue));
    }

    toast(
      'success',
      nextValue
        ? '이 기기에서 방해금지 시간을 켰어요'
        : '이 기기에서 방해금지 시간을 껐어요',
    );
  };

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <MobileGlassHeader title="알림 설정" subtitle="서버 동기화 범위와 이 기기 알림을 함께 관리하세요." showBack />

      <div className="hidden @3xl:flex items-center gap-2 mb-6 text-sm text-gray-500">
        <button
          onClick={() => router.push('/settings')}
          className="hover:text-gray-600 dark:hover:text-gray-300"
        >
          설정
        </button>
        <ChevronRight size={14} />
        <span className="text-gray-900 dark:text-gray-50 font-medium">
          알림 설정
        </span>
      </div>

      <div className="px-5 @3xl:px-0 max-w-2xl @3xl:max-w-[600px] mt-4 space-y-4 pb-8">
        <section className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
              <BellRing size={18} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                서버와 동기화되는 범위
              </p>
              <p className="text-sm leading-6 text-blue-800/90 dark:text-blue-100/80">
                아래 4개 카테고리는 TeamMeet 계정에 저장되어 새로고침, 재로그인,
                다른 탭 진입 후에도 같은 상태로 유지됩니다.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4 dark:border-gray-700 dark:bg-gray-800">
          <SectionHeading
            title="계정 전체에 저장되는 알림"
            description="서버에 저장되는 category preference입니다."
          />

          {preferencesQuery.isLoading ? (
            <PreferenceSkeleton count={SERVER_CATEGORIES.length} />
          ) : preferencesQuery.isError || !preferencesQuery.data ? (
            <ErrorState
              message="알림 설정을 불러오지 못했어요"
              onRetry={() => {
                void preferencesQuery.refetch();
              }}
            />
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {SERVER_CATEGORIES.map((category) => (
                <CategoryRow
                  key={category.key}
                  icon={category.icon}
                  label={category.label}
                  desc={category.desc}
                  enabled={preferencesQuery.data[category.key]}
                  onToggle={() =>
                    handleServerToggle(
                      category.key,
                      !preferencesQuery.data![category.key],
                    )
                  }
                  disabled={updatePreferences.isPending}
                  saving={savingKey === category.key}
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4 dark:border-gray-700 dark:bg-gray-800">
          <SectionHeading
            title="이 기기에서만 적용되는 항목"
            description="브라우저 권한과 방해금지 시간은 디바이스별로 따로 관리됩니다."
          />

          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            <StatusRow
              icon={Smartphone}
              label="브라우저 Push 권한"
              desc={browserPermissionDescription(browserPermission)}
              value={browserPermissionLabel(browserPermission)}
            />
            <div className="py-4 first:pt-0 last:pb-0">
              <ToggleRow
                icon={Moon}
                label="방해금지 시간"
                desc={`${DND_START} ~ ${DND_END} 사이에는 이 기기에서만 Push 알림을 무음 처리합니다.`}
                enabled={dndEnabled}
                onToggle={handleDndToggle}
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 p-4 space-y-2 dark:border-gray-700 dark:bg-gray-900/50">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
            현재 지원하지 않는 범위
          </h3>
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
            이메일 알림, 마케팅 수신, 전체 마스터 토글은 아직 서버 저장 계약이
            없습니다. 이번 라운드에서는 계정 동기화가 가능한 category 설정만
            노출합니다.
          </p>
        </section>
        <div className="h-24" />
      </div>
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">
        {title}
      </h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

function PreferenceSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-3.5">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="h-[30px] w-[52px] rounded-full" />
        </div>
      ))}
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  desc,
  value,
}: {
  icon: LucideIcon;
  label: string;
  desc: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3.5 py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 shrink-0">
        <Icon size={18} className="text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-md font-medium text-gray-900 dark:text-gray-50">{label}</p>
        <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
      </div>
      <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-2xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
        {value}
      </span>
    </div>
  );
}

function CategoryRow({
  icon: Icon,
  label,
  desc,
  enabled,
  onToggle,
  disabled,
  saving,
}: {
  icon: LucideIcon;
  label: string;
  desc: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  saving?: boolean;
}) {
  return (
    <div className="flex items-center gap-3.5 py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 shrink-0">
        <Icon size={18} className="text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-md font-medium text-gray-900 dark:text-gray-50">{label}</p>
          {saving ? (
            <span className="text-xs font-medium text-blue-500 dark:text-blue-400">
              저장 중
            </span>
          ) : null}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
      </div>
      <Toggle
        enabled={enabled}
        onToggle={onToggle}
        disabled={disabled}
        label={label}
      />
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  desc,
  enabled,
  onToggle,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  desc: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3.5 min-h-[44px] ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 shrink-0">
        <Icon size={18} className="text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-md font-medium text-gray-900 dark:text-gray-50">{label}</p>
        <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
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
      type="button"
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

function browserPermissionLabel(permission: BrowserPermissionState): string {
  switch (permission) {
    case 'granted':
      return '허용됨';
    case 'denied':
      return '차단됨';
    case 'default':
      return '미정';
    default:
      return '미지원';
  }
}

function browserPermissionDescription(permission: BrowserPermissionState): string {
  switch (permission) {
    case 'granted':
      return '이 브라우저에서 Push 표시 권한이 허용되어 있습니다.';
    case 'denied':
      return '브라우저 설정에서 Push 차단을 해제해야 알림을 받을 수 있습니다.';
    case 'default':
      return '아직 브라우저 권한이 결정되지 않았습니다.';
    default:
      return '현재 브라우저는 Push 권한 상태를 제공하지 않습니다.';
  }
}
