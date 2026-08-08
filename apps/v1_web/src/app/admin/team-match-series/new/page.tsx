'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader, AdminToasts, useAdminToast } from '@/components/admin';
import { EntityPicker, type EntityPickerItem } from '@/components/admin/entity-picker';
import {
  useV1CreateTeamMatchSeries,
  useV1MasterRegions,
  useV1MasterSports,
  useV1Teams,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';

const inputClass =
  'h-[44px] w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

export default function AdminTeamMatchSeriesNewPage() {
  const router = useRouter();
  const { toasts, showToast } = useAdminToast();
  const [title, setTitle] = useState('');
  const [sportId, setSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [selectedTeams, setSelectedTeams] = useState<EntityPickerItem[]>([]);
  const [pickerValue, setPickerValue] = useState<EntityPickerItem | null>(null);

  const { data: sports } = useV1MasterSports();
  const { data: regions } = useV1MasterRegions();
  const teamsQuery = useV1Teams({ sportId, limit: 50 }, { enabled: Boolean(sportId) });
  const teamItems: EntityPickerItem[] = (teamsQuery.data?.items ?? [])
    .filter((team) => !selectedTeams.some((selected) => selected.id === team.id))
    .map((team) => ({ id: team.id, label: team.name, description: team.regionName }));
  const createSeries = useV1CreateTeamMatchSeries();

  const canSubmit =
    title.trim().length > 0 && sportId !== '' && regionId !== '' && startsOn !== '' && endsOn !== '' && selectedTeams.length >= 2;

  const addTeam = (item: EntityPickerItem | null) => {
    if (item === null) return;
    setSelectedTeams((prev) => (prev.some((t) => t.id === item.id) ? prev : [...prev, item]));
    setPickerValue(null);
  };

  const submit = async () => {
    try {
      const result = await createSeries.mutateAsync({
        title,
        sportId,
        regionId,
        startsOn: new Date(startsOn).toISOString(),
        endsOn: new Date(endsOn).toISOString(),
        teamIds: selectedTeams.map((t) => t.id),
      });
      showToast('리그를 만들었어요.', 'success');
      router.push(`/admin/team-match-series/${result.seriesId}`);
    } catch (error) {
      showToast(extractErrorMessage(error, '리그를 만들지 못했어요.'), 'error');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <AdminPageHeader title="리그 개설" description="팀을 등록하고 라운드로빈 대진을 자동으로 만들어요." />

      <div className="space-y-5">
        <div>
          <label htmlFor="series-title" className="mb-1 block text-sm font-medium text-gray-900">리그 이름</label>
          <input id="series-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="series-sport" className="mb-1 block text-sm font-medium text-gray-900">종목</label>
            <select
              id="series-sport"
              value={sportId}
              onChange={(e) => { setSportId(e.target.value); setSelectedTeams([]); }}
              className={inputClass}
            >
              <option value="">종목 선택</option>
              {(sports ?? []).map((sport) => (
                <option key={sport.id} value={sport.id}>{sport.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="series-region" className="mb-1 block text-sm font-medium text-gray-900">지역</label>
            <select id="series-region" value={regionId} onChange={(e) => setRegionId(e.target.value)} className={inputClass}>
              <option value="">지역 선택</option>
              {(regions ?? []).map((region) => (
                <option key={region.id} value={region.id}>{region.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="series-starts-on" className="mb-1 block text-sm font-medium text-gray-900">시작일</label>
            <input id="series-starts-on" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="series-ends-on" className="mb-1 block text-sm font-medium text-gray-900">종료일</label>
            <input id="series-ends-on" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label htmlFor="series-team-picker" className="mb-1 block text-sm font-medium text-gray-900">참가 팀 추가 (최소 2팀)</label>
          <EntityPicker
            id="series-team-picker"
            value={pickerValue}
            onChange={addTeam}
            items={teamItems}
            loading={teamsQuery.isFetching}
            placeholder={sportId === '' ? '종목을 먼저 선택해 주세요' : '팀 이름으로 검색'}
            disabled={sportId === ''}
            emptyText="검색 결과가 없어요"
          />
          <ul className="mt-2 flex flex-wrap gap-2">
            {selectedTeams.map((team) => (
              <li key={team.id} className="flex min-h-[44px] items-center gap-2 rounded-full bg-blue-50 px-3 text-sm text-blue-700">
                {team.label}
                <button
                  type="button"
                  aria-label={`${team.label} 제거`}
                  onClick={() => setSelectedTeams((prev) => prev.filter((t) => t.id !== team.id))}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          순위 규칙: 승점 → 골득실 → 다득점 → 승자승 (고정값 — 리그별 변경 미지원)
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || createSeries.isPending}
          className="min-h-[44px] w-full rounded-xl bg-blue-500 text-sm font-semibold text-white disabled:opacity-50"
        >
          리그 만들기
        </button>
      </div>

      <AdminToasts toasts={toasts} />
    </div>
  );
}
