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
  useAdminToast,
  AdminToasts,
} from '@/components/admin';
import { ADMIN_VISIBILITY_OPTIONS, AdminVisibilityFilter } from '@/components/admin/admin-visibility-filter';
import { AdminVisibilityBadge, LeagueRowVisibilityAction } from '@/components/admin/competition-visibility-row-action';
import { pickAllowedParam } from '../pick-allowed-param';
import { useV1AdminLeagueMatchList } from '@/hooks/use-v1-api';
import type { V1AdminLeagueListItem, V1AdminLeagueStatusFilter } from '@/types/league-match';
import { leagueLifecycleLabel } from '@/lib/v1-status-labels';
import { withFromPath } from '@/lib/session-storage';
import { LeagueSeriesView } from './league-series-view';

type TabKey = 'leagues' | 'series';
type HubFilters = { readonly activeTab: TabKey; readonly status: string; readonly q: string; readonly visibility: string };

// 칩 이름은 표의 상태 알약(leagueLifecycleLabel)과 같은 말이다. 리그에는 취소가 없어(보류로 대신한다)
// 취소로 남은 행은 '종료'에 묶여 보인다 — API 의 status=completed 가 그 집합이다.
const STATUS_KEYS: readonly V1AdminLeagueStatusFilter[] = ['draft', 'open', 'closed', 'in_progress', 'completed', 'on_hold'];
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '전체' },
  ...STATUS_KEYS.map((key) => ({ value: key, label: leagueLifecycleLabel(key) })),
];
const SEARCH_MAX_LENGTH = 100;

function readHubFilters(params: Pick<URLSearchParams, 'get'>): HubFilters {
  return {
    activeTab: params.get('tab') === 'series' ? 'series' : 'leagues',
    status: pickAllowedParam(params.get('status'), STATUS_OPTIONS),
    q: (params.get('q') ?? '').slice(0, SEARCH_MAX_LENGTH),
    visibility: pickAllowedParam(params.get('visibility'), ADMIN_VISIBILITY_OPTIONS),
  };
}

function buildListHref(pathname: string, query: string, filters: HubFilters): string {
  const location = typeof window !== 'undefined' && window.location.pathname === pathname ? window.location : null;
  const params = new URLSearchParams(location?.search ?? query);
  if (filters.activeTab === 'series') params.set('tab', 'series');
  else params.delete('tab');
  // 예전 체계 칩 링크(?seriesId=)는 더는 화면 필터가 아니므로 주소에서 걷어 낸다.
  params.delete('seriesId');
  if (filters.status) params.set('status', filters.status);
  else params.delete('status');
  if (filters.q) params.set('q', filters.q);
  else params.delete('q');
  if (filters.visibility) params.set('visibility', filters.visibility);
  else params.delete('visibility');
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
 * 정규 리그 탭은 대회 목록처럼 검색창과 상태 칩(초안·접수 중·마감·진행 중·종료·보류)으로
 * 거르고, 각 행에 소속 체계·티어를 표기한다. 체계별로 모아 보는 일은 리그 체계 탭이 맡으므로
 * 체계 칩은 두지 않는다(2026-11-19 사용자 요청). 리그 체계 탭 본문은 기존
 * /admin/league-series 목록을 그대로 이식했고 구 URL 은 ?tab=series 리다이렉트로 남는다.
 */
function LeagueHub() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const query = searchParams.toString();
  const [filters, setFilters] = useState<HubFilters>(() => readHubFilters(searchParams));
  const latestFilters = useRef(filters);
  const { activeTab, status, q, visibility } = filters;
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
  // 검색어·상태·공개 여부 선택은 탭을 오가도 남아야 하므로 허브가 들고, 목록 쿼리는 정규 리그 패널만 마운트될 때 실행되도록
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
            : '공식 리그를 개설하고 대진·순위를 관리해요.'
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
          <LeaguesPanel
            search={q}
            onSearchChange={(value) => handleFiltersChange({ q: value.slice(0, SEARCH_MAX_LENGTH) })}
            status={status}
            onStatusChange={(value) => handleFiltersChange({ status: value })}
            visibility={visibility}
            onVisibilityChange={(value) => handleFiltersChange({ visibility: value })}
            listHref={listHref}
          />
        )}
      </div>
    </div>
  );
}

/** 정규 리그 탭 본문 — 목록 쿼리를 여기 두어 이 패널이 마운트된 동안에만 호출한다. */
function LeaguesPanel({
  search,
  onSearchChange,
  status,
  onStatusChange,
  visibility,
  onVisibilityChange,
  listHref,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  visibility: string;
  onVisibilityChange: (value: string) => void;
  listHref: string;
}) {
  // 입력은 바로 주소에 남기고(상세에 다녀와도 유지), API 검색만 0.3초 늦춘다.
  const [debouncedSearch, setDebouncedSearch] = useState(search.trim());
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isPending, isError, refetch } = useV1AdminLeagueMatchList({
    ...(visibility === 'public' || visibility === 'hidden' ? { visibility } : {}),
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(status ? { status: status as V1AdminLeagueStatusFilter } : {}),
  });
  const items = data?.items ?? [];
  const statusOptions = STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value
      ? data?.summary?.byStatus?.[option.value as V1AdminLeagueStatusFilter]
      : data?.summary?.total,
  }));

  return (
    <>
      {/* 대회 목록과 같은 검색창 + 상태 칩 (공용 AdminFilterBar). */}
      <div className="mb-4">
        <AdminFilterBar
          searchLabel="리그·체계 이름 검색"
          searchPlaceholder="리그·체계 이름 검색"
          searchValue={search}
          onSearchChange={onSearchChange}
          statusOptions={statusOptions}
          activeStatus={status}
          onStatusChange={onStatusChange}
          rightSlot={<AdminVisibilityFilter value={visibility} onChange={onVisibilityChange} />}
        />
      </div>
      <LeagueListTable
        items={items}
        isPending={isPending}
        isError={isError}
        onRetry={() => void refetch()}
        filtered={status !== '' || visibility !== '' || debouncedSearch !== ''}
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
  const { toasts, showToast } = useAdminToast();
  return (
    <>
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
              ? '검색어를 바꾸거나 다른 상태·공개 여부를 골라 보세요.'
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
        { key: 'state', header: '상태', render: (row) => <AdminLeagueStatePill state={row.state} status={row.lifecycleStatus} /> },
        { key: 'visibility', header: '공개', render: (row) => <AdminVisibilityBadge isPublic={row.isPublic} /> },
        { key: 'teamCount', header: '참가 팀', render: (row) => `${row.teamCount}팀` },
        { key: 'fixtureCount', header: '대진 수', render: (row) => `${row.fixtureCount}경기` },
      ]}
      renderActions={(row) => (
        <LeagueRowVisibilityAction
          leagueId={row.leagueId}
          title={row.title}
          isPublic={row.isPublic}
          onToast={showToast}
        />
      )}
    />
    <AdminToasts toasts={toasts} />
    </>
  );
}
