'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';

interface NotificationCategory {
  key: string;
  label: string;
  desc: string;
  enabled: boolean;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [pushMaster, setPushMaster] = useState(true);
  const [emailNotif, setEmailNotif] = useState(true);

  const [categories, setCategories] = useState<NotificationCategory[]>([
    { key: 'match', label: '매치 알림', desc: '새 매치, 참가 확인, 팀 구성 알림', enabled: true },
    { key: 'chat', label: '채팅 알림', desc: '새 메시지, 단체 채팅방 알림', enabled: true },
    { key: 'payment', label: '결제 알림', desc: '결제 완료, 환불 처리 알림', enabled: true },
    { key: 'market', label: '장터 알림', desc: '관심 매물 가격 변동, 거래 알림', enabled: false },
    { key: 'team', label: '팀 매칭 알림', desc: '팀 매칭 신청, 승인/거절 알림', enabled: true },
    { key: 'marketing', label: '마케팅 알림', desc: '이벤트, 프로모션, 혜택 안내', enabled: false },
  ]);

  const toggleCategory = (key: string) => {
    setCategories((prev) =>
      prev.map((cat) => (cat.key === key ? { ...cat, enabled: !cat.enabled } : cat))
    );
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      {/* Header */}
      <header className="lg:hidden flex items-center gap-3 px-5 py-3 border-b border-gray-50">
        <button onClick={() => router.back()} className="rounded-lg p-1.5 -ml-1.5 hover:bg-gray-100">
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">알림 설정</h1>
      </header>
      <div className="hidden lg:flex items-center gap-2 mb-6 text-[13px] text-gray-400">
        <button onClick={() => router.push('/settings')} className="hover:text-gray-600">설정</button>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">알림 설정</span>
      </div>

      <div className="px-5 lg:px-0 max-w-2xl lg:max-w-[600px] py-6 space-y-6">
        {/* 마스터 토글 */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5">
          <h3 className="text-[13px] font-semibold text-gray-400 uppercase tracking-wider mb-4">알림 수신</h3>
          <div className="space-y-4">
            <ToggleRow
              label="Push 알림"
              desc="앱 푸시 알림을 받습니다"
              enabled={pushMaster}
              onToggle={() => setPushMaster(!pushMaster)}
            />
            <div className="border-t border-gray-50 pt-4">
              <ToggleRow
                label="이메일 알림"
                desc="이메일로 주요 알림을 받습니다"
                enabled={emailNotif}
                onToggle={() => setEmailNotif(!emailNotif)}
              />
            </div>
          </div>
        </div>

        {/* 카테고리별 알림 */}
        <div className="rounded-2xl bg-white border border-gray-100 p-5">
          <h3 className="text-[13px] font-semibold text-gray-400 uppercase tracking-wider mb-4">카테고리별 알림</h3>
          {!pushMaster && (
            <div className="rounded-xl bg-yellow-50 px-4 py-3 mb-4">
              <p className="text-[13px] text-yellow-700">Push 알림이 꺼져 있으면 아래 설정과 관계없이 알림을 받지 않습니다.</p>
            </div>
          )}
          <div className="space-y-0 divide-y divide-gray-50">
            {categories.map((cat) => (
              <div key={cat.key} className="py-4 first:pt-0 last:pb-0">
                <ToggleRow
                  label={cat.label}
                  desc={cat.desc}
                  enabled={cat.enabled}
                  onToggle={() => toggleCategory(cat.key)}
                  disabled={!pushMaster}
                />
              </div>
            ))}
          </div>
        </div>

        <p className="text-[12px] text-gray-400 text-center">
          알림 설정은 이 기기에만 적용됩니다.
        </p>
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, enabled, onToggle, disabled }: {
  label: string;
  desc: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3.5 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-gray-900">{label}</p>
        <p className="text-[13px] text-gray-400 mt-0.5">{desc}</p>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        aria-label={`${label} ${enabled ? '켜짐' : '꺼짐'}`}
        role="switch"
        aria-checked={enabled}
        className={`relative shrink-0 h-[30px] w-[52px] min-h-[44px] min-w-[52px] flex items-center rounded-full transition-colors duration-200 ${
          enabled ? 'bg-blue-500' : 'bg-gray-200'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-[3px] left-[3px] h-[24px] w-[24px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? 'translate-x-[22px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
