'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AdminPageHeader } from '@/components/admin';
import { AdsView } from './ads-view';
import { NoticesView } from './notices-view';
import { PopupsView } from './popups-view';
import { TermsView } from './terms-view';

type TabKey = 'notices' | 'popups' | 'terms' | 'ads';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'notices', label: '공지사항' },
  { key: 'popups', label: '팝업' },
  { key: 'terms', label: '약관' },
  { key: 'ads', label: '광고' },
];

const DESCRIPTIONS: Record<TabKey, string> = {
  notices: '서비스 공지를 조회하고 운영자가 새 공지를 작성해요.',
  popups: '팝업의 노출 화면, 이동 링크, 게시 기간을 관리해요.',
  terms: '회원가입·대회 신청·하단 메뉴 약관을 버전 단위로 관리해요. 발행본은 수정하지 않고 새 버전으로 이어집니다.',
  ads: '배너·팝업 광고의 소재, 기간, 성과를 관리해요. 지원(support) 운영자는 조회만 할 수 있어요.',
};

function pickTab(value: string | null): TabKey {
  return TABS.find((candidate) => candidate.key === value)?.key ?? 'notices';
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
 * 콘텐츠 허브 — 사용자에게 게시하는 화면(공지사항·팝업·약관·광고)을 한 입구로 합친다
 * (A안 사용자 확정, 2026-08-25). 문의는 인박스 성격(미확인 뱃지·딥링크 필터)이라
 * 독립 유지. 탭 본문은 기존 화면 컴포넌트 그대로 이식, 구 URL 3개는 리다이렉트로
 * 남는다. 활성 탭만 마운트한다(각 본문이 자기 조회·폼 상태를 가진 완결 화면이라
 * 동시 마운트는 첫 진입만 무겁게 한다). 문법은 다른 허브들과 동일.
 */
function ContentHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // 광고는 모든 운영자에게 보인다. 변경은 owner·ops 만 되고 support 는 조회만 한다(버튼 잠금은 광고 화면이 한다, 서버가 최종 판정).
  const urlTab = pickTab(searchParams.get('tab'));
  // 탭을 누르면 URL 이 바뀌기 전에 바로 갈아끼우도록 눌린 탭을 따로 들고 있고, URL 이 가리키는 탭이 바뀌면
  // (뒤로가기·외부 내비게이션) 렌더 중에 그쪽으로 맞춘다. 이펙트로 맞추면 맞추기 전 한 번의 커밋에서 옛 탭 본문이 마운트된다.
  const [activeTab, setActiveTab] = useState<TabKey>(urlTab);
  const [syncedUrlTab, setSyncedUrlTab] = useState<TabKey>(urlTab);
  if (syncedUrlTab !== urlTab) {
    setSyncedUrlTab(urlTab);
    setActiveTab(urlTab);
  }

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
        className="tm-on-tint tm-content-enter mb-4 flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-[var(--surface-soft)] p-1"
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
      >
        {activeTab === 'notices' && <NoticesView />}
        {activeTab === 'popups' && <PopupsView />}
        {activeTab === 'terms' && <TermsView />}
        {activeTab === 'ads' && <AdsView />}
      </div>
    </>
  );
}
