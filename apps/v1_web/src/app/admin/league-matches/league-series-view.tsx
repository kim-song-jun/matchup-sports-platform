'use client';

import { useRouter } from 'next/navigation';
import { AdminDataTable, AdminEmpty, AdminFilterBar, AdminStatusPill } from '@/components/admin';
import { useV1AdminLeagueSeriesList } from '@/hooks/use-v1-api';
import type { V1LeagueSeriesListItem } from '@/types/league-series';

/**
 * 체계 이름·종목·지역·티어 이름에서 검색어를 찾는다(대소문자 무시). 띄어쓰기로 나눈 낱말이 모두
 * 한 체계 안에서 발견돼야 한다 — "풋살 송파"처럼 종목과 지역을 함께 적어도 찾아진다.
 * 목록 API 는 체계 전체를 한 번에 내려 주고 검색 파라미터가 없어서 화면에서 거른다.
 */
function matchesSeriesSearch(row: V1LeagueSeriesListItem, keyword: string): boolean {
  const haystack = [row.title, row.sport?.name, row.region?.name, ...row.tierLabels]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return keyword
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * 리그 체계 목록 본문. /admin/league-series 전용 페이지였다가 리그 허브
 * (/admin/league-matches?tab=series)의 탭 본문으로 이식됐다(B안, 2026-08-25) —
 * 페이지 헤더·만들기 버튼은 허브가 소유하므로 여기엔 검색창과 표만 있다.
 * 검색어는 정규 리그 탭과 같이 허브가 들고(주소의 ?q=) 탭을 오가도 남는다.
 * 체계 상세(/admin/league-series/[seriesId])와 생성(/new) 라우트는 그대로 산다.
 */
export function LeagueSeriesView({
  search,
  onSearchChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const router = useRouter();
  const { data, isPending, isError, refetch } = useV1AdminLeagueSeriesList();
  const keyword = search.trim();
  const allItems = data?.items ?? [];
  const items = keyword ? allItems.filter((row) => matchesSeriesSearch(row, keyword)) : allItems;

  return (
    <div>
      {/* 정규 리그 탭과 같은 검색창(공용 AdminFilterBar). 체계에는 거를 상태 칩이 없어 검색만 둔다. */}
      <div className="mb-4">
        <AdminFilterBar
          searchLabel="리그 체계 검색"
          searchPlaceholder="체계 이름·종목·지역·티어 검색"
          searchValue={search}
          onSearchChange={onSearchChange}
        />
      </div>
      <AdminDataTable<V1LeagueSeriesListItem>
        rows={items}
        keyExtractor={(row) => row.id}
        loading={isPending}
        error={isError ? '리그 체계 목록을 불러오지 못했어요.' : undefined}
        onRetry={() => refetch()}
        empty={
          keyword ? (
            <AdminEmpty title="이 조건의 리그 체계가 없어요" description="검색어를 바꿔 보세요." />
          ) : (
            <AdminEmpty
              title="아직 리그 체계가 없어요"
              description="1부·2부처럼 실력별로 나눈 리그를 만들면 시즌마다 승격·강등을 붙일 수 있어요."
            />
          )
        }
        // 정규 리그 탭 표와 같이 기본 캡(max-w-[900px])을 풀고 표를 카드 폭에 맞춘다 —
        // 캡이 남으면 탭을 오갈 때 카드 폭이 달라지고 1440 에서 오른쪽이 비어 보였다.
        tableMaxWidth="max-w-none"
        fitContainer
        // 그룹 G(alpha 실측): 제목 텍스트를 Link로만 두면 실제 클릭 표면이 글자 높이(15px)뿐이라
        // 44px 터치 기준에 못 미친다. 행/카드 전체를 누르는 onRowClick(AdminDataTable 내장 기능,
        // 44px+ 행 높이를 그대로 가짐)으로 옮기고 제목은 일반 텍스트로 되돌린다 — /admin/matches,
        // /admin/team-matches 목록과 동일한 해법으로, AdminDataTable 자체는 건드리지 않는다.
        onRowClick={(row) => router.push(`/admin/league-series/${encodeURIComponent(row.id)}`)}
        rowClickLabel={(row) => `${row.title} 상세 보기`}
        columns={[
          {
            key: 'title',
            header: '리그 체계',
            render: (row) => <span className="font-semibold text-[var(--text-strong)]">{row.title}</span>,
          },
          { key: 'state', header: '상태', render: (row) => <AdminStatusPill status={row.state} /> },
          {
            key: 'tierCount',
            header: '티어',
            render: (row) => (
              <span className="inline-flex flex-wrap gap-1">
                {row.tierLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-2xs font-semibold text-[var(--text-strong)]"
                  >
                    {label}
                  </span>
                ))}
              </span>
            ),
          },
          { key: 'sport', header: '종목', render: (row) => row.sport?.name ?? '-' },
          { key: 'region', header: '지역', render: (row) => row.region?.name ?? '-' },
          { key: 'leagueCount', header: '리그 수', render: (row) => `${row.leagueCount}개` },
        ]}
      />
    </div>
  );
}
