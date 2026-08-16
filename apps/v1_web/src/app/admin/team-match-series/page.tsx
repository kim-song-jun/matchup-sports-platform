'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { AdminPageHeader, AdminDataTable, AdminEmpty, AdminStatusPill } from '@/components/admin';
import { useV1AdminTeamMatchSeriesList } from '@/hooks/use-v1-api';
import type { V1AdminSeriesListItem } from '@/types/team-match-series';

export default function AdminTeamMatchSeriesListPage() {
  const { data, isPending, isError, refetch } = useV1AdminTeamMatchSeriesList();
  const items = data?.items ?? [];

  return (
    <div>
      <AdminPageHeader
        eyebrow="플랫폼"
        title="리그 관리"
        description="공식 리그를 개설하고 대진·순위를 관리해요."
        action={
          <Link
            href="/admin/team-match-series/new"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white"
          >
            <Plus size={16} aria-hidden="true" />
            리그 만들기
          </Link>
        }
      />
      <AdminDataTable<V1AdminSeriesListItem>
        rows={items}
        keyExtractor={(row) => row.seriesId}
        loading={isPending}
        error={isError ? '리그 목록을 불러오지 못했어요.' : undefined}
        onRetry={() => refetch()}
        empty={<AdminEmpty title="아직 리그가 없어요" description="위 버튼으로 새 리그를 만들어 보세요." />}
        columns={[
          {
            key: 'title',
            header: '리그',
            render: (row) => (
              <Link href={`/admin/team-match-series/${row.seriesId}`} className="font-semibold text-[var(--blue700)]">
                {row.title}
              </Link>
            ),
          },
          { key: 'state', header: '상태', render: (row) => <AdminStatusPill status={row.state} /> },
          { key: 'teamCount', header: '참가 팀', render: (row) => `${row.teamCount}팀` },
          { key: 'fixtureCount', header: '대진 수', render: (row) => `${row.fixtureCount}경기` },
        ]}
      />
    </div>
  );
}
