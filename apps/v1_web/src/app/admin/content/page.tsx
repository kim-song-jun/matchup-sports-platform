'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AdminPageHeader, AdminTableSkeleton } from '@/components/admin';
import { useV1AdminMe } from '@/hooks/use-v1-api';
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

/** 광고는 서버가 owner 만 받는다(ops·support 는 읽기도 403). 탭은 화면 정리일 뿐 경계가 아니다. */
const OWNER_ONLY_TABS: readonly TabKey[] = ['ads'];

const DESCRIPTIONS: Record<TabKey, string> = {
  notices: '서비스 공지를 조회하고 운영자가 새 공지를 작성해요.',
  popups: '팝업의 노출 화면, 이동 링크, 게시 기간을 관리해요.',
  terms: '회원가입·대회 신청·하단 메뉴 약관을 버전 단위로 관리해요. 발행본은 수정하지 않고 새 버전으로 이어집니다.',
  ads: '배너·팝업 광고의 소재, 기간, 성과를 관리해요. owner에게만 보여요.',
};

/** `ownerOnlyAllowed` 가 false 면 owner 전용 탭 요청은 공지사항으로 돌린다. */
function pickTab(value: string | null, ownerOnlyAllowed: boolean): TabKey {
  const tab = TABS.find((candidate) => candidate.key === value);
  if (!tab) return 'notices';
  return OWNER_ONLY_TABS.includes(tab.key) && !ownerOnlyAllowed ? 'notices' : tab.key;
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
 * 콘텐츠 허브 — 사용자에게 게시하는 화면(공지사항·팝업·약관, owner 에게는 광고까지)을 한 입구로 합친다
 * (A안 사용자 확정, 2026-08-25). 문의는 인박스 성격(미확인 뱃지·딥링크 필터)이라
 * 독립 유지. 탭 본문은 기존 화면 컴포넌트 그대로 이식, 구 URL 3개는 리다이렉트로
 * 남는다. 활성 탭만 마운트한다(각 본문이 자기 조회·폼 상태를 가진 완결 화면이라
 * 동시 마운트는 첫 진입만 무겁게 한다). 문법은 다른 허브들과 동일.
 */
function ContentHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // 역할을 아직 모르는 동안에는 owner 전용 탭을 보이지 않고, 요청된 탭이 그것이면 본문도 비워 둔다.
  const { data: adminMe, isPending: rolePending } = useV1AdminMe();
  const isOwner = adminMe?.adminRole === 'owner';
  const requestedTab = searchParams.get('tab');
  const waitingForRole = rolePending && OWNER_ONLY_TABS.some((key) => key === requestedTab);
  const visibleTabs = TABS.filter((tab) => isOwner || !OWNER_ONLY_TABS.includes(tab.key));

  // 탭을 누르면 URL 이 바뀌기 전에 바로 갈아끼우도록 눌린 탭을 따로 들고 있고, URL 이 가리키는 탭(역할 반영 포함)이
  // 바뀌면 렌더 중에 그쪽으로 맞춘다 — 뒤로가기·외부 내비게이션, 그리고 역할이 늦게 도착한 owner 의 ?tab=ads 까지.
  // 이펙트로 맞추면 맞추기 전 한 번의 커밋에서 옛 탭 본문(공지 조회)이 마운트된다.
  const urlTab = pickTab(requestedTab, isOwner);
  const [activeTab, setActiveTab] = useState<TabKey>(urlTab);
  const [syncedUrlTab, setSyncedUrlTab] = useState<TabKey>(urlTab);
  if (syncedUrlTab !== urlTab) {
    setSyncedUrlTab(urlTab);
    setActiveTab(urlTab);
  }

  // owner 가 아닌데 ?tab=ads 로 들어왔으면 주소도 공지사항으로 맞춘다(새로고침해도 같은 자리).
  const deniedOwnerTab = !rolePending && !isOwner && OWNER_ONLY_TABS.some((key) => key === requestedTab);
  useEffect(() => {
    if (!deniedOwnerTab) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete('tab');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [deniedOwnerTab, searchParams, router, pathname]);

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
        {visibleTabs.map((tab) => {
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
        {waitingForRole && <AdminTableSkeleton rows={4} />}
        {!waitingForRole && activeTab === 'notices' && <NoticesView />}
        {!waitingForRole && activeTab === 'popups' && <PopupsView />}
        {!waitingForRole && activeTab === 'terms' && <TermsView />}
        {!waitingForRole && activeTab === 'ads' && <AdsView />}
      </div>
    </>
  );
}
