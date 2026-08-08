'use client';

import { useState } from 'react';
import { AdminPageHeader, AdminDataTable, AdminStatusPill, AdminToasts, useAdminToast } from '@/components/admin';
import { useV1AdminTeamMatchSeries, useV1GenerateSeriesFixtures, useV1UpdateSeriesFixture } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1SeriesFixture } from '@/types/team-match-series';

const inputClass =
  'h-[44px] rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

export default function TeamMatchSeriesFixturesClient({ seriesId }: { seriesId: string }) {
  const { data: series, isPending } = useV1AdminTeamMatchSeries(seriesId);
  const generateFixtures = useV1GenerateSeriesFixtures(seriesId);
  const updateFixture = useV1UpdateSeriesFixture(seriesId);
  const { toasts, showToast } = useAdminToast();
  const [weeksCount, setWeeksCount] = useState(7);

  if (isPending || series === undefined) return null;

  const onGenerate = async () => {
    try {
      const result = await generateFixtures.mutateAsync({ weeksCount });
      showToast(`대진 ${result.createdCount}경기를 만들었어요.`, 'success');
    } catch (error) {
      showToast(extractErrorMessage(error, '대진을 만들지 못했어요.'), 'error');
    }
  };

  const onFieldBlur = (fixture: V1SeriesFixture, patch: { startsAt?: string; placeName?: string }) => {
    updateFixture.mutate(
      { teamMatchId: fixture.teamMatchId, body: patch },
      { onError: (error) => showToast(extractErrorMessage(error, '경기 정보를 저장하지 못했어요.'), 'error') },
    );
  };

  return (
    <div>
      <AdminPageHeader title={series.title} description={`${series.teamIds.length}팀 참가 · 대진 ${series.fixtures.length}경기`} />

      {series.fixtures.length === 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="weeks-count" className="mb-1 block text-sm font-medium text-gray-900">주차 수</label>
            <input
              id="weeks-count"
              type="number"
              min={1}
              max={52}
              value={weeksCount}
              onChange={(e) => setWeeksCount(Number(e.target.value))}
              className={`${inputClass} w-24`}
            />
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={generateFixtures.isPending}
            className="min-h-[44px] rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            라운드로빈 대진 생성
          </button>
        </div>
      ) : (
        <AdminDataTable<V1SeriesFixture>
          rows={series.fixtures}
          keyExtractor={(row) => row.teamMatchId}
          columns={[
            { key: 'title', header: '경기', render: (row) => row.title },
            {
              key: 'startAt',
              header: '일시',
              render: (row) => (
                <input
                  type="datetime-local"
                  aria-label={`${row.title} 일시`}
                  defaultValue={row.startAt.slice(0, 16)}
                  onBlur={(e) => {
                    if (!e.target.value) return;
                    onFieldBlur(row, { startsAt: new Date(e.target.value).toISOString() });
                  }}
                  className={inputClass}
                />
              ),
            },
            {
              key: 'placeName',
              header: '구장',
              render: (row) => (
                <input
                  aria-label={`${row.title} 구장`}
                  defaultValue={row.placeName}
                  onBlur={(e) => onFieldBlur(row, { placeName: e.target.value })}
                  className={inputClass}
                />
              ),
            },
            { key: 'status', header: '상태', render: (row) => <AdminStatusPill status={row.status} /> },
          ]}
        />
      )}

      <AdminToasts toasts={toasts} />
    </div>
  );
}
