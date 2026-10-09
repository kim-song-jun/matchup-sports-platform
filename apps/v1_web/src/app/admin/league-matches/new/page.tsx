'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader, AdminToasts, useAdminToast } from '@/components/admin';
import { EntityPicker, type EntityPickerItem } from '@/components/admin/entity-picker';
import { periodLabels, switchPeriodCount } from '@/app/admin/tournaments/new/tournament-create-model';
import { v1Get } from '@/lib/api-client';
import {
  useSaveTournamentPeriodSettings,
  type TournamentPeriodSettingsResponse,
} from '@/hooks/use-tournament-period-settings';
import {
  useV1CreateLeagueMatch,
  useV1LineupSizeOptions,
  useV1MasterRegions,
  useV1MasterSports,
  useV1Teams,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { DATE_INPUT_MAX } from '@/lib/kst-calendar';
import { LEAGUE_TIE_BREAK_ORDER, formatTieBreakRule } from '@/lib/league-tie-break-labels';
import { toDistrictRegionOptions } from '@/lib/v1-regions';

const inputClass =
  'h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

/** 페이지 로컬 팀 선택 상태 — EntityPickerItem에 종목 판정에 필요한 필드만 얹는다. */
type LeagueTeamPick = EntityPickerItem & { sportId: string };

export default function AdminLeagueMatchNewPage() {
  const router = useRouter();
  const { toasts, showToast } = useAdminToast();
  const [title, setTitle] = useState('');
  const [sportId, setSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [selectedTeams, setSelectedTeams] = useState<LeagueTeamPick[]>([]);
  const [pickerValue, setPickerValue] = useState<EntityPickerItem | null>(null);
  const [teamSearch, setTeamSearch] = useState('');
  // Period minutes start from the sport default and are saved after creation only when the operator edits them.
  const [periodMinutes, setPeriodMinutes] = useState<string[]>([]);
  const [periodsDirty, setPeriodsDirty] = useState(false);
  // Covers create + period lookup/save so the button stays locked until the whole flow settles.
  const [submitting, setSubmitting] = useState(false);

  const { data: sports } = useV1MasterSports();
  const { data: regions } = useV1MasterRegions();
  const regionOptions = toDistrictRegionOptions(regions ?? []);
  // 첫 팀을 고르기 전까지는(= 아직 종목이 잠기기 전까지는) 검색을 종목으로 막지
  // 않는다 — 검색어가 있으면 전체 종목에서 이름으로 찾고(다른 종목도 안 숨김,
  // 회색으로 보여주고 이유를 알려준다), 검색어가 없을 때만 기본 후보를 sportId로 좁힌다.
  const trimmedTeamSearch = teamSearch.trim();
  const teamsQuery = useV1Teams(
    trimmedTeamSearch ? { query: trimmedTeamSearch, limit: 20 } : sportId ? { sportId, limit: 20 } : { limit: 20 },
  );
  // team.sport 가 응답에 없는 극단 상황(V1Team.sport 는 optional 타입)에서 sportId 가 끝내
  // ''로 남으면, selectedTeams.length 만으로 잠그면 종목 select 가 빈 값인 채 비활성화되어
  // 화면이 막힌다 — sportId 가 실제로 정해진 경우에만 잠근다.
  const isSportLocked = selectedTeams.length > 0 && sportId !== '';
  const lockedSportName = sports?.find((s) => s.id === sportId)?.name;
  const teamItems: EntityPickerItem[] = (teamsQuery.data?.items ?? [])
    .filter((team) => !selectedTeams.some((selected) => selected.id === team.id))
    .map((team) => {
      const teamSportId = team.sport?.sportId ?? '';
      const crossSport = sportId !== '' && teamSportId !== sportId;
      return {
        id: team.id,
        label: team.name,
        description: `${team.sportName} · ${team.regionName}`,
        disabled: crossSport,
        disabledReason: crossSport
          ? lockedSportName
            ? `이 리그는 ${lockedSportName} 종목이라 ${team.sportName} 팀은 선택할 수 없어요`
            : `다른 종목(${team.sportName}) 팀이라 선택할 수 없어요`
          : undefined,
        sportId: teamSportId,
      } satisfies LeagueTeamPick;
    });
  const createLeague = useV1CreateLeagueMatch();
  const savePeriods = useSaveTournamentPeriodSettings();
  const { data: lineupSizeOptions } = useV1LineupSizeOptions(sportId || null);
  const defaultPeriodsKey = lineupSizeOptions?.supported
    ? (lineupSizeOptions.defaultPeriods?.map((period) => period.durationMinutes).join(',') ?? '')
    : '';
  useEffect(() => {
    if (periodsDirty) return;
    setPeriodMinutes(defaultPeriodsKey === '' ? [] : defaultPeriodsKey.split(','));
  }, [defaultPeriodsKey, periodsDirty]);
  const periodNames = periodLabels(periodMinutes.length);
  const periodsInvalid = periodMinutes.some((value) => !/^\d+$/.test(value.trim()) || Number(value) < 1 || Number(value) > 240);

  const canSubmit =
    title.trim().length > 0 && sportId !== '' && regionId !== '' && startsOn !== '' && endsOn !== '' && selectedTeams.length >= 2 && !periodsInvalid;

  // 그룹 B 감사 결함 4: canSubmit이 false일 때 "왜"를 알려준다 — 지금까지는 버튼이 그냥
  // 비활성으로만 보여서 뭐가 덜 채워졌는지 화면에서 알 방법이 없었다. 위에서 아래로 채우는
  // 순서(이름 -> 종목/지역 -> 기간 -> 팀)대로 하나씩만 짚는다 — 한꺼번에 다 나열하면
  // 오히려 뭐부터 고쳐야 할지 헷갈린다.
  const missingFieldHint = (() => {
    if (title.trim().length === 0) return '리그 이름을 입력해 주세요.';
    if (sportId === '') return '종목을 선택해 주세요.';
    if (regionId === '') return '지역을 선택해 주세요.';
    if (startsOn === '' || endsOn === '') return '시작일·종료일을 입력해 주세요.';
    if (selectedTeams.length < 2) return `참가 팀을 2팀 이상 추가해 주세요. (현재 ${selectedTeams.length}팀)`;
    if (periodsInvalid) return '경기 시간은 피리어드마다 1~240분 사이의 정수로 입력해 주세요.';
    return null;
  })();

  const addTeam = (item: EntityPickerItem | null) => {
    if (item === null) return;
    const picked = item as LeagueTeamPick;
    setSelectedTeams((prev) => (prev.some((t) => t.id === picked.id) ? prev : [...prev, picked]));
    // 종목을 아직 안 골랐으면 첫 팀의 종목으로 자동 채운다 — 이후 addTeam은 이미 sportId가
    // 있으니(잠긴 상태) 여기 안 걸린다.
    if (sportId === '' && picked.sportId) setSportId(picked.sportId);
    setPickerValue(null);
    setTeamSearch('');
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await createLeague.mutateAsync({
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
      if (periodsDirty) {
        // The create API takes no periods; the league row only gets a config version afterwards, so read its version first.
        try {
          const current = await v1Get<TournamentPeriodSettingsResponse>(`/admin/tournaments/${result.leagueId}/periods`);
          if (!current.expectedVersion) {
            // displayableMessage=false makes extractErrorMessage fall back to the Korean toast text.
            throw Object.assign(new Error('missing period settings version'), { displayableMessage: false });
          }
          await savePeriods.mutateAsync({
            tournamentId: result.leagueId,
            expectedVersion: current.expectedVersion,
            periods: periodMinutes.map((value) => ({ durationMinutes: Number(value) })),
          });
        } catch (periodError) {
          showToast(
            extractErrorMessage(periodError, '리그는 만들었지만 경기 시간을 저장하지 못했어요. 리그 상세에서 피리어드 설정을 다시 저장해 주세요.'),
            'error',
          );
          router.push(`/admin/league-matches/${result.leagueId}`);
          return;
        }
      }
      showToast('리그를 만들었어요.', 'success');
      router.push(`/admin/league-matches/${result.leagueId}`);
    } catch (error) {
      showToast(extractErrorMessage(error, '리그를 만들지 못했어요.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tm-content-enter mx-auto max-w-2xl">
      <AdminPageHeader eyebrow="플랫폼 · 리그" title="리그 개설" description="팀을 등록하고 라운드로빈 대진을 자동으로 만들어요." />

      {/* 그룹 B 감사 결함 4: 이 폼은 항상 단발 리그만 만든다 — 1부·2부처럼 승격·강등이
          있는 리그 체계는 이 폼이 아니라 리그 체계(시즌 시딩) 경로로만 생긴다. 두 화면이
          서로를 언급하지 않아 "1부 리그를 만들자"며 여기 온 운영자는 방법이 없었다. */}
      <div className="tm-on-tint mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm text-[var(--text-muted)]">
        1부·2부처럼 승격·강등이 있는 리그 체계를 만들려면{' '}
        <Link href="/admin/league-series/new" className="font-medium text-[var(--blue700)] underline underline-offset-2">
          리그 체계 만들기
        </Link>
        로 가 주세요. 이 화면은 승격·강등이 없는 단발 리그 하나만 만들어요.
      </div>

      <div className="space-y-5">
        <div>
          <label htmlFor="series-title" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">리그 이름</label>
          <input id="series-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="series-sport" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">종목</label>
            <select
              id="series-sport"
              value={sportId}
              onChange={(e) => { setSportId(e.target.value); setPeriodsDirty(false); }}
              disabled={isSportLocked}
              className={inputClass}
            >
              <option value="">종목 선택</option>
              {(sports ?? []).map((sport) => (
                <option key={sport.id} value={sport.id}>{sport.name}</option>
              ))}
            </select>
            {isSportLocked && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">자동 설정됨 · 변경하려면 선택한 팀을 모두 지우세요</p>
            )}
          </div>
          <div>
            <label htmlFor="series-region" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">지역</label>
            <select id="series-region" value={regionId} onChange={(e) => setRegionId(e.target.value)} className={inputClass}>
              <option value="">지역 선택</option>
              {regionOptions.map((region) => (
                <option key={region.id} value={region.id}>{region.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="series-starts-on" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">시작일</label>
            <input id="series-starts-on" type="date" max={DATE_INPUT_MAX} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="series-ends-on" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">종료일</label>
            <input id="series-ends-on" type="date" max={DATE_INPUT_MAX} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label htmlFor="series-team-picker" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">참가 팀 추가 (최소 2팀)</label>
          <EntityPicker
            id="series-team-picker"
            value={pickerValue}
            onChange={addTeam}
            items={teamItems}
            onSearch={setTeamSearch}
            showResultsWithoutQuery
            loading={teamsQuery.isFetching}
            placeholder="팀 이름으로 검색"
            emptyText="검색 결과가 없어요"
          />
          <ul className="mt-2 flex flex-wrap gap-2">
            {selectedTeams.map((team) => (
              <li key={team.id} className="flex min-h-[44px] items-center gap-2 rounded-full bg-[var(--blue50)] px-3 text-sm text-[var(--blue700)]">
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

        {periodMinutes.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-1 block tm-text-body-sm font-medium text-[var(--text-strong)]">경기 시간</legend>
            <div className="flex gap-2">
              {([2, 1] as const).map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={periodMinutes.length === count}
                  onClick={() => {
                    if (periodMinutes.length === count) return;
                    setPeriodMinutes(switchPeriodCount(periodMinutes, count));
                    setPeriodsDirty(true);
                  }}
                  className="min-h-[44px] rounded-xl border border-[var(--border-strong)] px-4 tm-text-body-sm font-medium text-[var(--text-strong)] aria-pressed:border-blue-500 aria-pressed:bg-[var(--blue50)] aria-pressed:text-[var(--blue700)]"
                >
                  {count === 2 ? '전·후반' : '단판'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {periodMinutes.map((value, index) => (
                <div key={periodNames[index]}>
                  <label htmlFor={`league-period-${index}`} className="mb-1 block tm-text-caption text-[var(--text-muted)]">{periodNames[index]} (분)</label>
                  <input
                    id={`league-period-${index}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={240}
                    value={value}
                    onChange={(e) => {
                      setPeriodMinutes(periodMinutes.map((v, i) => (i === index ? e.target.value : v)));
                      setPeriodsDirty(true);
                    }}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
            <p className="tm-text-caption text-[var(--text-muted)]">종목 기본값을 채워 두었어요. 대진을 만들 때 이 시간이 기본으로 쓰여요.</p>
          </fieldset>
        )}

        <div className="tm-on-tint rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm text-[var(--text-muted)]">
          순위 규칙: {formatTieBreakRule(LEAGUE_TIE_BREAK_ORDER)} (고정값 — 리그별 변경 미지원)
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || createLeague.isPending || submitting}
          aria-describedby={missingFieldHint ? 'league-submit-hint' : undefined}
          className="min-h-[44px] w-full rounded-xl bg-blue-500 text-sm font-semibold text-white disabled:opacity-50"
        >
          리그 만들기
        </button>
        {/* 그룹 B 감사 결함 4: 버튼이 비활성일 때 아무 안내도 없던 것을 고친다. */}
        {missingFieldHint && (
          <p id="league-submit-hint" className="text-center text-xs text-[var(--text-muted)]">
            {missingFieldHint}
          </p>
        )}
      </div>

      <AdminToasts toasts={toasts} />
    </div>
  );
}
