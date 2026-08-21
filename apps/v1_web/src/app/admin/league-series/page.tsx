'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { AdminPageHeader, AdminDataTable, AdminEmpty, AdminStatusPill } from '@/components/admin';
import { useV1AdminLeagueSeriesList } from '@/hooks/use-v1-api';
import type { V1LeagueSeriesListItem } from '@/types/league-series';

export default function AdminLeagueSeriesListPage() {
  const { data, isPending, isError, refetch } = useV1AdminLeagueSeriesList();
  const items = data?.items ?? [];

  return (
    <div>
      <AdminPageHeader
        eyebrow="플랫폼"
        title="리그 체계 관리"
        description="1부·2부·3부로 나뉜 리그를 개설하고 시즌마다 승격·강등을 확정해요."
        action={
          <Link
            href="/admin/league-series/new"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white"
          >
            <Plus size={16} aria-hidden="true" />
            리그 체계 만들기
          </Link>
        }
      />
      <AdminDataTable<V1LeagueSeriesListItem>
        rows={items}
        keyExtractor={(row) => row.id}
        loading={isPending}
        error={isError ? '리그 체계 목록을 불러오지 못했어요.' : undefined}
        onRetry={() => refetch()}
        empty={
          <AdminEmpty
            title="아직 리그 체계가 없어요"
            description="1부·2부처럼 실력별로 나눈 리그를 만들면 시즌마다 승격·강등을 붙일 수 있어요."
          />
        }
        columns={[
          {
            key: 'title',
            header: '리그 체계',
            render: (row) => (
              <Link href={`/admin/league-series/${row.id}`} className="font-semibold text-[var(--blue700)]">
                {row.title}
              </Link>
            ),
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
                    className="rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-2xs font-semibold text-[var(--text-strong)]"
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
