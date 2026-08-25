'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  AdminDataTable,
  AdminEmpty,
  AdminFilterBar,
  AdminPageHeader,
  AdminStatusPill,
} from '@/components/admin';
import { useV1AdminLeagueMatchList, useV1AdminLeagueSeriesList } from '@/hooks/use-v1-api';
import type { V1AdminLeagueListItem } from '@/types/league-match';
import { LeagueSeriesView } from './league-series-view';

type TabKey = 'leagues' | 'series';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'leagues', label: '정규 리그' },
  { key: 'series', label: '리그 체계' },
];

// useSearchParams 는 Suspense 경계를 요구한다(Next.js App Router).
export default function AdminLeagueHubPage() {
  return (
    <Suspense fallback={null}>
      <LeagueHub />
    </Suspense>
  );
}

/**
 * 리그 허브 — 정규 리그와 리그 체계를 한 입구로 합친다(B안 사용자 확정, 2026-08-25).
 * 정규 리그 탭은 목록 위 체계 칩으로 소속 리그를 그 자리에서 필터하고(백엔드 seriesId
 * 파라미터), 각 행에 소속 체계·티어를 표기한다. 리그 체계 탭 본문은 기존
 * /admin/league-series 목록을 그대로 이식했고 구 URL 은 ?tab=series 리다이렉트로 남는다.
 */
function LeagueHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // URL → 초기 상태. 구 URL 리다이렉트·딥링크가 그대로 해당 탭에 도착한다.
  const [activeTab, setActiveTab] = useState<TabKey>(() =>
    searchParams.get('tab') === 'series' ? 'series' : 'leagues',
  );
  // '' = 전체, 'independent' = 무소속만, 그 외 = 체계 id.
  const [seriesFilter, setSeriesFilter] = useState('');

  const { data, isPending, isError, refetch } = useV1AdminLeagueMatchList(
    seriesFilter || undefined,
  );
  const items = data?.items ?? [];
  // 칩 목록용 — 리그 체계 탭 본문과 쿼리 키가 같아 요청은 한 번만 나간다.
  const { data: seriesData } = useV1AdminLeagueSeriesList();
  const seriesOptions = seriesData?.items ?? [];

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    router.replace(tab === 'series' ? `${pathname}?tab=series` : pathname, { scroll: false });
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="플랫폼"
        title="리그 관리"
        description={
          activeTab === 'series'
            ? '1부·2부·3부로 나뉜 리그를 개설하고 시즌마다 승격·강등을 확정해요.'
            : '공식 리그를 개설하고 대진·순위를 관리해요. 체계를 고르면 소속 리그만 모아 봐요.'
        }
        action={
          <Link
            href={activeTab === 'series' ? '/admin/league-series/new' : '/admin/league-matches/new'}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white"
          >
            <Plus size={16} aria-hidden="true" />
            {activeTab === 'series' ? '리그 체계 만들기' : '리그 만들기'}
          </Link>
        }
      />

      {/* ── Tab segmented control (모니터링 허브와 동일 문법) ─────────── */}
      <div
        role="tablist"
        aria-label="리그 관리 항목"
        className="mb-4 flex w-fit items-center gap-1 rounded-xl bg-[var(--surface-soft)] p-1"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              id={`league-tab-${tab.key}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`league-panel-${tab.key}`}
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
        id={`league-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`league-tab-${activeTab}`}
      >
        {activeTab === 'series' ? (
          <LeagueSeriesView />
        ) : (
          <>
            {/* 체계 칩 필터 — 공용 AdminFilterBar 의 status 칩 재사용 (audit 선례). */}
            <div className="mb-4">
              <AdminFilterBar
                hideSearch
                searchValue=""
                onSearchChange={() => undefined}
                statusOptions={[
                  { value: '', label: '전체' },
                  ...seriesOptions.map((series) => ({ value: series.id, label: series.title })),
                  { value: 'independent', label: '독립 리그' },
                ]}
                activeStatus={seriesFilter}
                onStatusChange={setSeriesFilter}
              />
            </div>
            <LeagueListTable
              items={items}
              isPending={isPending}
              isError={isError}
              onRetry={() => void refetch()}
              filtered={seriesFilter !== ''}
            />
          </>
        )}
      </div>
    </div>
  );
}

function LeagueListTable({
  items,
  isPending,
  isError,
  onRetry,
  filtered,
}: {
  items: V1AdminLeagueListItem[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  filtered: boolean;
}) {
  const router = useRouter();
  return (
    <AdminDataTable<V1AdminLeagueListItem>
      rows={items}
      keyExtractor={(row) => row.leagueId}
      loading={isPending}
      error={isError ? '리그 목록을 불러오지 못했어요.' : undefined}
      onRetry={onRetry}
      empty={
        <AdminEmpty
          title={filtered ? '이 조건의 리그가 없어요' : '아직 리그가 없어요'}
          description={
            filtered
              ? '다른 체계를 고르거나 전체로 돌아가 보세요.'
              : '위 버튼으로 새 리그를 만들어 보세요.'
          }
        />
      }
      // 그룹 G(alpha 실측): 제목 텍스트를 Link로만 두면 실제 클릭 표면이 글자 높이(15px)뿐이라
      // 44px 터치 기준에 못 미친다. 행/카드 전체를 누르는 onRowClick(AdminDataTable 내장 기능,
      // 44px+ 행 높이를 그대로 가짐)으로 옮기고 제목은 일반 텍스트로 되돌린다.
      onRowClick={(row) => router.push(`/admin/league-matches/${encodeURIComponent(row.leagueId)}`)}
      rowClickLabel={(row) => `${row.title} 상세 보기`}
      columns={[
        {
          key: 'title',
          header: '리그',
          render: (row) => <span className="font-semibold text-[var(--text-strong)]">{row.title}</span>,
        },
        {
          key: 'series',
          header: '소속 · 티어',
          render: (row) =>
            row.seriesTitle ? (
              <span className="inline-flex rounded-md bg-[var(--tint-blue)] px-1.5 py-0.5 text-2xs font-semibold text-[var(--blue700)]">
                {row.tierLabel ? `${row.seriesTitle} · ${row.tierLabel}` : row.seriesTitle}
              </span>
            ) : (
              <span className="inline-flex rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-2xs font-semibold text-[var(--text-muted)]">
                독립 리그
              </span>
            ),
        },
        { key: 'state', header: '상태', render: (row) => <AdminStatusPill status={row.state} /> },
        { key: 'teamCount', header: '참가 팀', render: (row) => `${row.teamCount}팀` },
        { key: 'fixtureCount', header: '대진 수', render: (row) => `${row.fixtureCount}경기` },
      ]}
    />
  );
}
