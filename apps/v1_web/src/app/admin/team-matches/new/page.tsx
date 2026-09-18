'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader, AdminToasts, useAdminToast } from '@/components/admin';
import { EntityPicker, type EntityPickerItem } from '@/components/admin/entity-picker';
import {
  useV1AdminMe,
  useV1AdminTeams,
  useV1CreateAdminAssignedTeamMatch,
  useV1MasterRegions,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { randomUuid } from '@/lib/uuid';
import { toDistrictRegionOptions } from '@/lib/v1-regions';

const inputClass =
  'h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

type TeamPick = EntityPickerItem & { sportId: string; sportName: string };

function toTeamItems(
  rows: Array<{ teamId: string; name: string; sportId: string; sportName: string; status: string }>,
  excludedId?: string,
  requiredSportId?: string,
): TeamPick[] {
  return rows
    .filter((team) => team.teamId !== excludedId)
    .map((team) => {
      const crossSport = Boolean(requiredSportId && team.sportId !== requiredSportId);
      return {
        id: team.teamId,
        label: team.name,
        description: team.sportName,
        sportId: team.sportId,
        sportName: team.sportName,
        disabled: crossSport,
        disabledReason: crossSport ? `${team.sportName} 팀은 홈팀과 종목이 달라 선택할 수 없어요` : undefined,
      };
    });
}

export default function AdminTeamMatchNewPage() {
  const router = useRouter();
  const { toasts, showToast } = useAdminToast();
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;
  const [homeTeam, setHomeTeam] = useState<TeamPick | null>(null);
  const [awayTeam, setAwayTeam] = useState<TeamPick | null>(null);
  const [homeSearch, setHomeSearch] = useState('');
  const [awaySearch, setAwaySearch] = useState('');
  const [regionId, setRegionId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [addressText, setAddressText] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const homeTeams = useV1AdminTeams({ status: 'active', q: homeSearch.trim() || undefined, limit: 20 });
  const awayTeams = useV1AdminTeams({ status: 'active', q: awaySearch.trim() || undefined, limit: 20 });
  const { data: regions } = useV1MasterRegions();
  const regionOptions = toDistrictRegionOptions(regions ?? []);
  const createMatch = useV1CreateAdminAssignedTeamMatch();

  const homeItems = toTeamItems(homeTeams.data?.items ?? [], awayTeam?.id, awayTeam?.sportId);
  const awayItems = toTeamItems(awayTeams.data?.items ?? [], homeTeam?.id, homeTeam?.sportId);
  const canSubmit =
    canWrite &&
    homeTeam !== null &&
    awayTeam !== null &&
    homeTeam.sportId === awayTeam.sportId &&
    regionId !== '' &&
    title.trim() !== '' &&
    placeName.trim() !== '' &&
    startsAt !== '';

  const selectHome = (item: EntityPickerItem | null) => {
    const next = item as TeamPick | null;
    setHomeTeam(next);
    if (next && awayTeam && next.sportId !== awayTeam.sportId) setAwayTeam(null);
  };

  const selectAway = (item: EntityPickerItem | null) => {
    const next = item as TeamPick | null;
    setAwayTeam(next);
    if (next && homeTeam && next.sportId !== homeTeam.sportId) setHomeTeam(null);
  };

  const submit = async () => {
    if (!canSubmit || !homeTeam || !awayTeam) return;
    try {
      await createMatch.mutateAsync({
        clientCommandId: randomUuid(),
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        regionId,
        title: title.trim(),
        description: description.trim() || null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        manualPlaceName: placeName.trim(),
        addressText: addressText.trim() || null,
      });
      router.push('/admin/team-matches?status=matched');
    } catch (error) {
      showToast(extractErrorMessage(error, '팀매치를 만들지 못했어요.'), 'error');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <AdminPageHeader
        eyebrow="플랫폼 관리"
        title="팀매치 직접 배정"
        description="두 팀을 지정하면 모집과 승인 단계 없이 확정된 팀매치와 양 팀 일정을 만들어요."
      />

      {!canWrite && adminMe ? (
        <div role="alert" className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-muted)]">
          지원 관리자에게는 팀매치 생성 권한이 없어요.
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 md:p-5">
            <h2 className="mb-4 text-base font-bold text-[var(--text-strong)]">참가 팀</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="admin-team-match-home" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">홈팀</label>
                <EntityPicker
                  id="admin-team-match-home"
                  value={homeTeam}
                  onChange={selectHome}
                  items={homeItems}
                  onSearch={setHomeSearch}
                  showResultsWithoutQuery
                  loading={homeTeams.isFetching}
                  placeholder="홈팀 이름 검색"
                  emptyText="선택할 팀이 없어요"
                />
              </div>
              <div>
                <label htmlFor="admin-team-match-away" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">상대팀</label>
                <EntityPicker
                  id="admin-team-match-away"
                  value={awayTeam}
                  onChange={selectAway}
                  items={awayItems}
                  onSearch={setAwaySearch}
                  showResultsWithoutQuery
                  loading={awayTeams.isFetching}
                  placeholder="상대팀 이름 검색"
                  emptyText="선택할 팀이 없어요"
                />
              </div>
            </div>
            {homeTeam && awayTeam && (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                {homeTeam.label} vs {awayTeam.label} · {homeTeam.sportName}
              </p>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 md:p-5">
            <h2 className="text-base font-bold text-[var(--text-strong)]">경기 정보</h2>
            <div>
              <label htmlFor="admin-team-match-title" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">매치 제목</label>
              <input id="admin-team-match-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="예: 강남 주말 친선전" className={inputClass} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="admin-team-match-region" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">지역</label>
                <select id="admin-team-match-region" value={regionId} onChange={(event) => setRegionId(event.target.value)} className={inputClass}>
                  <option value="">시·군·구 선택</option>
                  {regionOptions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="admin-team-match-place" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">경기 장소</label>
                <input id="admin-team-match-place" value={placeName} onChange={(event) => setPlaceName(event.target.value)} maxLength={120} placeholder="장소명" className={inputClass} />
              </div>
            </div>
            <div>
              <label htmlFor="admin-team-match-address" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">상세 주소 (선택)</label>
              <input id="admin-team-match-address" value={addressText} onChange={(event) => setAddressText(event.target.value)} maxLength={200} placeholder="도로명 주소 또는 코트 안내" className={inputClass} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="admin-team-match-start" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">시작</label>
                <input id="admin-team-match-start" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="admin-team-match-end" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">종료 (선택)</label>
                <input id="admin-team-match-end" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} min={startsAt || undefined} className={inputClass} />
              </div>
            </div>
            <div>
              <label htmlFor="admin-team-match-description" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">안내 (선택)</label>
              <textarea id="admin-team-match-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} className={`${inputClass} h-auto min-h-[112px] py-3`} />
            </div>
          </section>

          <div className="rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-muted)]">
            생성 즉시 매칭 완료 상태가 되며 두 팀의 일정과 경기 기록 화면에 함께 반영돼요.
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit || createMatch.isPending}
            className="min-h-[48px] w-full rounded-xl bg-blue-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            {createMatch.isPending ? '팀매치 만드는 중…' : '두 팀 매치 확정하기'}
          </button>
        </div>
      )}

      <AdminToasts toasts={toasts} />
    </div>
  );
}
