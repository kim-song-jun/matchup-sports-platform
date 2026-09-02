'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AdminPageHeader } from '@/components/admin';
import { NoticesView } from './notices-view';
import { PopupsView } from './popups-view';
import { TermsView } from './terms-view';

type TabKey = 'notices' | 'popups' | 'terms';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'notices', label: '공지사항' },
  { key: 'popups', label: '팝업' },
  { key: 'terms', label: '약관' },
];

const DESCRIPTIONS: Record<TabKey, string> = {
  notices: '서비스 공지를 조회하고 운영자가 새 공지를 작성해요.',
  popups: '팝업의 노출 화면, 이동 링크, 게시 기간을 관리해요.',
  terms: '회원가입·대회 신청·하단 메뉴 약관을 버전 단위로 관리해요. 발행본은 수정하지 않고 새 버전으로 이어집니다.',
};

function pickTab(value: string | null): TabKey {
  return TABS.some((tab) => tab.key === value) ? (value as TabKey) : 'notices';
}

// useSearchParams 는 Suspense 경계를 요구한다(Next.js App Router).
export default function AdminContentHubPage() {
  return (
    <Suspense fallback={null}>
      <ContentHub />
    </Suspense>
  );
}

/**
 * 콘텐츠 허브 — 사용자에게 게시하는 3화면(공지사항·팝업·약관)을 한 입구로 합친다
 * (A안 사용자 확정, 2026-08-25). 문의는 인박스 성격(미확인 뱃지·딥링크 필터)이라
 * 독립 유지. 탭 본문은 기존 화면 컴포넌트 그대로 이식, 구 URL 3개는 리다이렉트로
 * 남는다. 활성 탭만 마운트한다(각 본문이 자기 조회·폼 상태를 가진 완결 화면이라
 * 동시 마운트는 첫 진입만 무겁게 한다). 문법은 다른 허브들과 동일.
 */
function ContentHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [activeTab, setActiveTab] = useState<TabKey>(() => pickTab(searchParams.get('tab')));
  // 뒤로가기/앞으로가기·외부 내비게이션으로 URL 만 바뀐 경우에도 탭을 따라가게 한다.
  useEffect(() => {
    setActiveTab(pickTab(searchParams.get('tab')));
  }, [searchParams]);

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    // 다른 허브와 달리 targetPath(팝업 프리필) 같은 동반 파라미터를 보존해야 한다 —
    // tab 만 갈아끼우고 나머지는 그대로 둔다.
    const next = new URLSearchParams(searchParams.toString());
    if (tab === 'notices') next.delete('tab');
    else next.set('tab', tab);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <>
      <AdminPageHeader eyebrow="콘텐츠" title="콘텐츠 관리" description={DESCRIPTIONS[activeTab]} />

      <div
        role="tablist"
        aria-label="콘텐츠 항목"
        className="tm-content-enter mb-4 flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-[var(--surface-soft)] p-1"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              id={`content-tab-${tab.key}`}
              role="tab"
              aria-selected={isActive}
              // 활성 패널만 마운트하므로 비활성 탭이 존재하지 않는 id 를 가리키지 않도록
              // aria-controls 는 활성 탭에만 단다.
              aria-controls={isActive ? `content-panel-${tab.key}` : undefined}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={[
                'min-h-[44px] whitespace-nowrap rounded-lg px-4 text-[length:var(--font-size-label)] font-medium transition-colors',
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
        key={activeTab}
        id={`content-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`content-tab-${activeTab}`}
        className="tm-tabpanel-enter"
      >
        {activeTab === 'notices' && <NoticesView />}
        {activeTab === 'popups' && <PopupsView />}
        {activeTab === 'terms' && <TermsView />}
      </div>
    </>
  );
}
