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
  // #5: 서버는 sportId 없이도 이름 검색을 지원한다 — 종목을 고르기 전에도 팀 검색을
  // 항상 켜 둔다. 종목으로 좁히는 건 서버 필터가 아니라 아래 disabled 표시로 한다.
  const teamsQuery = useV1Teams({ limit: 50 }, { enabled: true });
  const lockedSportName = sportId ? (sports ?? []).find((sport) => sport.id === sportId)?.name : undefined;
  const teamItems: EntityPickerItem[] = (teamsQuery.data?.items ?? [])
    .filter((team) => !selectedTeams.some((selected) => selected.id === team.id))
    .map((team) => {
      const teamSportId = team.sport?.sportId;
      const mismatched = sportId !== '' && teamSportId !== undefined && teamSportId !== sportId;
      return {
        id: team.id,
        label: team.name,
        description: `${team.sportName} · ${team.regionName}`,
        disabled: mismatched,
        disabledReason: mismatched && lockedSportName ? `${lockedSportName} 리그라 ${team.sportName} 팀은 선택할 수 없어요` : undefined,
      };
    });
  const createSeries = useV1CreateTeamMatchSeries();

  const canSubmit =
    title.trim().length > 0 && sportId !== '' && regionId !== '' && startsOn !== '' && endsOn !== '' && selectedTeams.length >= 2;

  const addTeam = (item: EntityPickerItem | null) => {
    if (item === null || item.disabled) return;
    setSelectedTeams((prev) => (prev.some((t) => t.id === item.id) ? prev : [...prev, item]));
    setPickerValue(null);
    // #5: 첫 팀을 고르는 순간 그 팀의 종목으로 상단 종목 select를 자동 채우고 잠근다.
    if (sportId === '') {
      const pickedTeam = teamsQuery.data?.items.find((team) => team.id === item.id);
      const inferredSportId = pickedTeam?.sport?.sportId;
      if (inferredSportId) setSportId(inferredSportId);
    }
  };

  const submit = async () => {
    try {
      const result = await createSeries.mutateAsync({
        title,
        sportId,
        regionId,
        // `type="date"` 값(YYYY-MM-DD)에 시각을 붙이지 않고 new Date()에 바로
        // 넘기면 UTC 자정으로 파싱돼 KST 기준 날짜가 하루 앞으로 밀린다.
        // 시각을 명시해 로컬 타임존으로 파싱한다.
        startsOn: new Date(`${startsOn}T00:00:00`).toISOString(),
        endsOn: new Date(`${endsOn}T23:59:59.999`).toISOString(),
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
              disabled={selectedTeams.length > 0}
              className={inputClass}
            >
              <option value="">종목 선택</option>
              {(sports ?? []).map((sport) => (
                <option key={sport.id} value={sport.id}>{sport.name}</option>
              ))}
            </select>
            {selectedTeams.length > 0 ? (
              <p className="mt-1 text-xs text-gray-500">자동 설정됨 · 변경하려면 선택한 팀을 모두 지우세요</p>
            ) : null}
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
            placeholder="팀 이름으로 검색"
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
