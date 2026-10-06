'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  AdminDataTable,
  AdminEmpty,
  AdminFilterBar,
  AdminPageHeader,
  AdminLeagueStatePill,
} from '@/components/admin';
import { useV1AdminLeagueMatchList, useV1AdminLeagueSeriesList } from '@/hooks/use-v1-api';
import type { V1AdminLeagueListItem } from '@/types/league-match';
import { withFromPath } from '@/lib/session-storage';
import { LeagueSeriesView } from './league-series-view';

type TabKey = 'leagues' | 'series';
type HubFilters = { readonly activeTab: TabKey; readonly seriesFilter: string };

function readHubFilters(params: Pick<URLSearchParams, 'get'>): HubFilters {
  return {
    activeTab: params.get('tab') === 'series' ? 'series' : 'leagues',
    seriesFilter: params.get('seriesId') ?? '',
  };
}

function buildListHref(pathname: string, query: string, filters: HubFilters): string {
  const location = typeof window !== 'undefined' && window.location.pathname === pathname ? window.location : null;
  const params = new URLSearchParams(location?.search ?? query);
  if (filters.activeTab === 'series') params.set('tab', 'series');
  else params.delete('tab');
  if (filters.seriesFilter) params.set('seriesId', filters.seriesFilter);
  else params.delete('seriesId');
  const nextQuery = params.toString();
  return `${pathname}${nextQuery ? `?${nextQuery}` : ''}${location?.hash ?? ''}`;
}

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
  const pathname = usePathname();

  const query = searchParams.toString();
  const [filters, setFilters] = useState<HubFilters>(() => readHubFilters(searchParams));
  const latestFilters = useRef(filters);
  const { activeTab, seriesFilter } = filters;
  // 상세 복귀·Back/Forward는 URL에서 복원하고, 연속 선택은 최신 local draft에 병합한다.
  useEffect(() => {
    // Next가 이전 선택을 늦게 전달해도 실제 주소의 최신 선택과 ref를 덮지 않는다.
    if (window.location.pathname !== pathname || new URLSearchParams(window.location.search).toString() !== query) return;
    const next = readHubFilters(new URLSearchParams(query));
    latestFilters.current = next;
    setFilters(next);
  }, [pathname, query]);
  useEffect(() => {
    // Back이 직전에 무시한 snapshot과 같은 query여도 실제 주소에서 선택을 복원한다.
    const restore = () => {
      if (window.location.pathname !== pathname) return;
      const next = readHubFilters(new URLSearchParams(window.location.search));
      latestFilters.current = next;
      setFilters(next);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [pathname]);
  // '' = 전체, 'independent' = 무소속만, 그 외 = 체계 id. 필터 선택은 탭을 오가도
  // 남아야 하므로 허브가 들고, 목록 쿼리는 정규 리그 패널만 마운트될 때 실행되도록
  // 패널 컴포넌트(LeaguesPanel) 안에 둔다 — 리그 체계 탭에서 리그 목록 API 가
  // 불필요하게 호출되지 않게 한다.
  const listHref = buildListHref(pathname, query, filters);
  function handleFiltersChange(patch: Partial<HubFilters>) {
    const next = { ...latestFilters.current, ...patch };
    latestFilters.current = next;
    setFilters(next);
    window.history.replaceState(null, '', buildListHref(pathname, query, next));
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
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white"
            style={{ color: 'var(--static-white)' }}
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
        className="tm-on-tint tm-content-enter mb-4 flex w-fit items-center gap-1 rounded-xl bg-[var(--surface-soft)] p-1"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              id={`league-tab-${tab.key}`}
              role="tab"
              aria-selected={isActive}
              // 활성 패널만 마운트하므로 비활성 탭이 존재하지 않는 id 를 가리키지 않도록
              // aria-controls 는 활성 탭에만 단다 (#771 Copilot 지적의 허브 공통 반영).
              aria-controls={isActive ? `league-panel-${tab.key}` : undefined}
              type="button"
              onClick={() => handleFiltersChange({ activeTab: tab.key })}
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
        key={activeTab}
        id={`league-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`league-tab-${activeTab}`}
      >
        {activeTab === 'series' ? (
          <LeagueSeriesView />
        ) : (
          <LeaguesPanel seriesFilter={seriesFilter} onSeriesFilterChange={(value) => handleFiltersChange({ seriesFilter: value })} listHref={listHref} />
        )}
      </div>
    </div>
  );
}

/** 정규 리그 탭 본문 — 목록 쿼리를 여기 두어 이 패널이 마운트된 동안에만 호출한다. */
function LeaguesPanel({
  seriesFilter,
  onSeriesFilterChange,
  listHref,
}: {
  seriesFilter: string;
  onSeriesFilterChange: (value: string) => void;
  listHref: string;
}) {
  const { data, isPending, isError, refetch } = useV1AdminLeagueMatchList(
    seriesFilter || undefined,
  );
  const items = data?.items ?? [];
  // 칩 목록용 — 리그 체계 탭 본문과 쿼리 키·캐시를 공유한다(전역 staleTime 30초 안의
  // 탭 전환은 재요청 없이 캐시를 읽고, 그 뒤 리마운트는 백그라운드 갱신이 될 수 있다).
  const { data: seriesData } = useV1AdminLeagueSeriesList();
  const seriesOptions = seriesData?.items ?? [];

  return (
    <>
      {/* 체계 칩 필터 — 공용 AdminFilterBar 의 status 칩 재사용 (audit 선례). */}
      <div className="mb-4">
        <AdminFilterBar
          hideSearch
          searchValue=""
          onSearchChange={() => undefined}
          statusGroupLabel="체계 필터"
          statusOptions={[
            { value: '', label: '전체' },
            ...seriesOptions.map((series) => ({ value: series.id, label: series.title })),
            { value: 'independent', label: '독립 리그' },
          ]}
          activeStatus={seriesFilter}
          onStatusChange={onSeriesFilterChange}
        />
      </div>
      <LeagueListTable
        items={items}
        isPending={isPending}
        isError={isError}
        onRetry={() => void refetch()}
        filtered={seriesFilter !== ''}
        listHref={listHref}
      />
    </>
  );
}

function LeagueListTable({
  items,
  isPending,
  isError,
  onRetry,
  filtered,
  listHref,
}: {
  items: V1AdminLeagueListItem[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  filtered: boolean;
  listHref: string;
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
      onRowClick={(row) => router.push(withFromPath(`/admin/league-matches/${encodeURIComponent(row.leagueId)}`, listHref))}
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
              <span className="inline-flex rounded-md bg-[var(--tint-blue)] px-2 py-0.5 text-2xs font-semibold text-[var(--blue700)]">
                {row.tierLabel ? `${row.seriesTitle} · ${row.tierLabel}` : row.seriesTitle}
              </span>
            ) : (
              <span className="inline-flex rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-2xs font-semibold text-[var(--text-muted)]">
                독립 리그
              </span>
            ),
        },
        { key: 'state', header: '상태', render: (row) => <AdminLeagueStatePill state={row.state} /> },
        { key: 'teamCount', header: '참가 팀', render: (row) => `${row.teamCount}팀` },
        { key: 'fixtureCount', header: '대진 수', render: (row) => `${row.fixtureCount}경기` },
      ]}
    />
  );
}
