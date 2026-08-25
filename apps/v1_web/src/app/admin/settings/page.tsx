'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AdminPageHeader } from '@/components/admin';
import { IntegrationsView } from './integrations-view';
import { ReviewPolicyView } from './reviews-view';

type TabKey = 'integrations' | 'reviews';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'integrations', label: '연동' },
  { key: 'reviews', label: '후기 정책' },
];

const DESCRIPTIONS: Record<TabKey, string> = {
  integrations:
    '카카오맵 API 키를 등록하면 대회 상세의 현장 안내에 실제 지도와 내비게이션 길찾기가 표시돼요. 등록하지 않아도 기존 네이버 지도 검색 링크는 그대로 동작해요.',
  reviews:
    '경기 결과가 확정된 뒤 참가자가 상대팀·상대 선수 후기를 쓸 수 있는 기간이에요. 대회 경기와 팀 매치 모두에 함께 적용돼요.',
};

// useSearchParams 는 Suspense 경계를 요구한다(Next.js App Router).
export default function AdminSettingsHubPage() {
  return (
    <Suspense fallback={null}>
      <SettingsHub />
    </Suspense>
  );
}

/**
 * 설정 허브 — 연동 설정·후기 정책 두 소형 화면을 한 입구로 합친다(A안 사용자 확정,
 * 2026-08-25). 탭 본문은 기존 폼을 그대로 이식했고 구 URL 2개는 리다이렉트로 남는다.
 * 문법은 모니터링·리그 허브와 동일(탭 + ?tab= 딥링크 + URL 재동기화).
 */
function SettingsHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    searchParams.get('tab') === 'reviews' ? 'reviews' : 'integrations',
  );
  // 뒤로가기/앞으로가기·외부 내비게이션으로 URL 만 바뀐 경우에도 탭을 따라가게 한다 —
  // 클릭은 setActiveTab 이 즉시 처리하므로 이 effect 는 재동기화 전용이다.
  useEffect(() => {
    setActiveTab(searchParams.get('tab') === 'reviews' ? 'reviews' : 'integrations');
  }, [searchParams]);

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    router.replace(tab === 'reviews' ? `${pathname}?tab=reviews` : pathname, { scroll: false });
  }

  return (
    <>
      <AdminPageHeader eyebrow="설정" title="설정" description={DESCRIPTIONS[activeTab]} />

      <div
        role="tablist"
        aria-label="설정 항목"
        className="mb-4 flex w-fit items-center gap-1 rounded-xl bg-[var(--surface-soft)] p-1"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              id={`settings-tab-${tab.key}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`settings-panel-${tab.key}`}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={[
                'min-h-[44px] rounded-lg px-4 text-[length:var(--font-size-label)] font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                isActive
                  ? 'bg-[var(--card-surface)] text-[var(--text-strong)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-body)]',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id={`settings-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeTab}`}
      >
        {activeTab === 'integrations' ? <IntegrationsView /> : <ReviewPolicyView />}
      </div>
    </>
  );
}
