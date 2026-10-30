'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { AdminPageHeader, AdminToasts, useAdminToast } from '@/components/admin';
import { EntityPicker, type EntityPickerItem } from '@/components/admin/entity-picker';
import { WizardStepper } from '@/components/admin/wizard-stepper';
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
import { formatEntryFee, formatTournamentDateTimeLong } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import { formatWithComma, onlyDigits } from '@/lib/number-format';
import { LeagueBasicFields, leagueInputClass as inputClass, leagueLabelClass as labelClass } from '../league-basic-fields';
import { LEAGUE_TIE_BREAK_ORDER, formatTieBreakRule } from '@/lib/league-tie-break-labels';
import { toDistrictRegionOptions } from '@/lib/v1-regions';
import { LeaguePlannedFixtureField, LeagueRosterLimitField, LeagueTeamCapacityField, leagueTeamCapacityError, rosterLimitError, type RosterLimitValue } from '../league-settings-fields';
import type { V1CreateLeaguePayload } from '@/types/league-match';

/** 페이지 로컬 팀 선택 상태 — EntityPickerItem에 종목 판정에 필요한 필드만 얹는다. */
type LeagueTeamPick = EntityPickerItem & { sportId: string };

/** 대회 만들기처럼 단계로 나눈다(2026-10-27 사용자 선택). 마지막 확인 단계에서 리그를 만든다. */
const LEAGUE_CREATE_STEPS = [
  { title: '기본 정보', description: '이름·종목·지역·기간' },
  { title: '참가팀·신청', description: '직접 넣을 팀과 신청 조건' },
  { title: '경기 설정', description: '명단 인원·경기 수·시간' },
  { title: '확인', description: '입력한 내용 확인' },
] as const;
const CONFIRM_STEP = LEAGUE_CREATE_STEPS.length - 1;
const MAX_ENTRY_FEE = 100_000_000;

export default function AdminLeagueMatchNewPage() {
  const router = useRouter();
  const { toasts, showToast } = useAdminToast();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [sportId, setSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [selectedTeams, setSelectedTeams] = useState<LeagueTeamPick[]>([]);
  const [pickerValue, setPickerValue] = useState<EntityPickerItem | null>(null);
  const [teamSearch, setTeamSearch] = useState('');
  // 참가 신청 — 비워 둔 칸은 보내지 않는다(마감 없음 · 참가비 미설정).
  const [deadline, setDeadline] = useState('');
  const [entryFee, setEntryFee] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankHolder, setBankHolder] = useState('');
  // Period minutes start from the sport default and are saved after creation only when the operator edits them.
  const [periodMinutes, setPeriodMinutes] = useState<string[]>([]);
  const [periodsDirty, setPeriodsDirty] = useState(false);
  // 팀 명단 인원 — 리그는 팀 전원이 명단(=경기 출전자)에 오르는 것이 기본이라 '제한 없음'으로 시작한다.
  const [rosterLimit, setRosterLimit] = useState<RosterLimitValue>({ unlimited: true, minPlayers: '1', maxPlayers: '20' });
  const [plannedFixtureCount, setPlannedFixtureCount] = useState('');
  const [maxTeams, setMaxTeams] = useState('');
  // Covers create + period lookup/save so the button stays locked until the whole flow settles.
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  // The admin toast lives in this page's state and would vanish on navigation, so a period save
  // failure keeps the operator here; the league already exists, so the button stays locked.
  const [periodSaveFailure, setPeriodSaveFailure] = useState<{ leagueId: string; message: string } | null>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  const { data: sports } = useV1MasterSports();
  const { data: regions } = useV1MasterRegions();
  const regionOptions = toDistrictRegionOptions(regions ?? []);
  // 검색어가 있으면 전체 종목에서 이름으로 찾고(다른 종목도 숨기지 않고 회색으로 이유를 알려준다),
  // 검색어가 없을 때만 기본 후보를 고른 종목으로 좁힌다.
  const trimmedTeamSearch = teamSearch.trim();
  const teamsQuery = useV1Teams(
    trimmedTeamSearch ? { query: trimmedTeamSearch, limit: 20 } : sportId ? { sportId, limit: 20 } : { limit: 20 },
  );
  // 팀을 넣은 뒤에는 종목을 잠근다 — 종목을 바꾸면 이미 넣은 팀이 다른 종목이 된다.
  const isSportLocked = selectedTeams.length > 0 && sportId !== '';
  const selectedSport = sports?.find((s) => s.id === sportId);
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
          ? selectedSport
            ? `이 리그는 ${selectedSport.name} 종목이라 ${team.sportName} 팀은 선택할 수 없어요`
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
  const rosterLimitInvalid = rosterLimitError(rosterLimit);
  const teamCapacityInvalid = leagueTeamCapacityError(maxTeams, selectedTeams.length);
  const plannedFixtureCountInvalid =
    plannedFixtureCount.trim() !== '' && !(/^\d+$/.test(plannedFixtureCount.trim()) && Number(plannedFixtureCount) >= 1 && Number(plannedFixtureCount) <= 500);

  // Same-day leagues are allowed; the server rejects only endsOn < startsOn. YYYY-MM-DD compares lexicographically.
  const endsBeforeStart = startsOn !== '' && endsOn !== '' && endsOn < startsOn;

  const deadlineIso = deadline === '' ? null : kstDatetimeLocalToIso(deadline);
  // 서버와 같은 부등호(`<=`) — 지금과 같은 순간으로 열면 서버가 422 로 막는다.
  const deadlineError = deadline === ''
    ? null
    : deadlineIso === null
      ? '신청 마감 일시를 읽을 수 없어요.'
      : Date.parse(deadlineIso) <= Date.now() ? '신청 마감은 지금 이후여야 해요.' : null;
  const feeValue = entryFee === '' ? null : Number(entryFee);
  const feeError = feeValue !== null && feeValue > MAX_ENTRY_FEE ? '참가비는 0원~1억 원 사이의 정수여야 해요.' : null;
  const paid = feeValue !== null && feeValue > 0;
  const bankError = paid && (!bankName.trim() || !bankAccount.trim() || !bankHolder.trim())
    ? '유료 리그는 은행명, 계좌번호, 예금주를 모두 입력해 주세요.'
    : null;

  /** 그 단계에서 아직 채워지지 않은 것 하나 — 위에서 아래로 채우는 순서대로 하나씩만 짚는다. */
  const stepHint = (target: number): string | null => {
    if (target === 0) {
      if (title.trim().length === 0) return '리그 이름을 입력해 주세요.';
      if (sportId === '') return '종목을 선택해 주세요.';
      if (regionId === '') return '지역을 선택해 주세요.';
      if (startsOn === '' || endsOn === '') return '시작일·종료일을 입력해 주세요.';
      if (endsBeforeStart) return '종료일을 바로잡아 주세요.';
      return null;
    }
    if (target === 1) {
      if (teamCapacityInvalid) return teamCapacityInvalid;
      if (deadlineError) return deadlineError;
      if (feeError) return feeError;
      if (bankError) return bankError;
      return null;
    }
    if (target === 2) {
      if (periodsInvalid) return '경기 시간은 피리어드마다 1~240분 사이의 정수로 입력해 주세요.';
      if (rosterLimitInvalid) return rosterLimitInvalid;
      if (plannedFixtureCountInvalid) return '총 경기 수는 1~500 사이로 입력해 주세요.';
      return null;
    }
    return null;
  };
  /** 앞 단계를 다 채워야 그 단계로 갈 수 있다. */
  const canReach = (target: number) => Array.from({ length: target }, (_, index) => index).every((index) => stepHint(index) === null);
  const currentHint = stepHint(step);

  const goToStep = (target: number) => {
    if (target === step || submitting || periodSaveFailure) return;
    if (target > step && !canReach(target)) return;
    setStep(target);
    // 단계가 바뀌면 제목으로 포커스를 옮겨 스크린리더가 새 단계를 읽게 한다.
    requestAnimationFrame(() => stepHeadingRef.current?.focus());
  };

  const addTeam = (item: EntityPickerItem | null) => {
    if (item === null) return;
    const picked = item as LeagueTeamPick;
    setSelectedTeams((prev) => (prev.some((t) => t.id === picked.id) ? prev : [...prev, picked]));
    setPickerValue(null);
    setTeamSearch('');
  };

  const buildPayload = (): V1CreateLeaguePayload => ({
    title,
    sportId,
    regionId,
    // `type="date"` 값(YYYY-MM-DD)에 시각을 붙이지 않고 new Date()에 바로
    // 넘기면 UTC 자정으로 파싱돼 KST 기준 날짜가 하루 앞으로 밀린다.
    // 시각을 명시해 로컬 타임존으로 파싱한다.
    startsOn: new Date(`${startsOn}T00:00:00`).toISOString(),
    endsOn: new Date(`${endsOn}T23:59:59.999`).toISOString(),
    teamIds: selectedTeams.map((t) => t.id),
    // 제한 없음이면 최소 인원도 1 로 둔다 — 남겨 두면 신청 화면이 '최소 6명'을 계속 재촉한다.
    minPlayers: rosterLimit.unlimited ? 1 : Number(rosterLimit.minPlayers),
    maxPlayers: rosterLimit.unlimited ? null : Number(rosterLimit.maxPlayers),
    maxTeams: maxTeams.trim() === '' ? null : Number(maxTeams),
    ...(plannedFixtureCount.trim() !== '' ? { plannedFixtureCount: Number(plannedFixtureCount) } : {}),
    ...(deadlineIso !== null ? { registrationDeadlineAt: deadlineIso } : {}),
    ...(feeValue !== null ? { entryFee: feeValue } : {}),
    ...(paid ? { bankName: bankName.trim(), bankAccount: bankAccount.trim(), bankHolder: bankHolder.trim() } : {}),
  });

  const submit = async () => {
    if (submitLock.current || periodSaveFailure || !canReach(CONFIRM_STEP)) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      const result = await createLeague.mutateAsync(buildPayload());
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
          setPeriodSaveFailure({
            leagueId: result.leagueId,
            message: extractErrorMessage(periodError, '리그는 만들었지만 경기 시간을 저장하지 못했어요. 리그 경기 규칙에서 피리어드 설정을 다시 저장해 주세요.'),
          });
          return;
        }
      }
      showToast('리그를 만들었어요.', 'success');
      router.push(`/admin/league-matches/${result.leagueId}`);
    } catch (error) {
      showToast(extractErrorMessage(error, '리그를 만들지 못했어요.'), 'error');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const locked = submitting || !!periodSaveFailure;
  const navButtonClass = 'inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--border)] px-5 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)] disabled:opacity-50';
  const primaryButtonClass = 'inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-500 px-6 text-[length:var(--font-size-body-sm)] font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50';

  return (
    <div className="tm-content-enter mx-auto max-w-2xl pb-28">
      <AdminPageHeader eyebrow="플랫폼 · 리그" title="리그 개설" description="팀을 직접 넣거나 참가 신청으로 모아 리그를 만들어요. 만든 뒤 리그 위의 '접수 시작하기'로 신청을 받아요." />

      {/* 그룹 B 감사 결함 4: 이 폼은 항상 단발 리그만 만든다 — 1부·2부처럼 승격·강등이
          있는 리그 체계는 이 폼이 아니라 리그 체계(시즌 시딩) 경로로만 생긴다. */}
      <div className="tm-on-tint mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
        1부·2부처럼 승격·강등이 있는 리그 체계를 만들려면{' '}
        <Link href="/admin/league-series/new" className="font-medium text-[var(--blue700)] underline underline-offset-2">
          리그 체계 만들기
        </Link>
        로 가 주세요. 이 화면은 승격·강등이 없는 단발 리그 하나만 만들어요.
      </div>

      <WizardStepper
        steps={LEAGUE_CREATE_STEPS}
        currentStep={step}
        onSelect={goToStep}
        ariaLabel="리그 생성 단계"
        isLocked={(index) => index > step && !canReach(index)}
      />

      <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)]">
        <div className="border-b border-[var(--border)] px-5 py-5">
          <p className="text-[length:var(--font-size-caption)] font-bold text-[var(--blue700)]">STEP {step + 1} / {LEAGUE_CREATE_STEPS.length}</p>
          <h2 ref={stepHeadingRef} tabIndex={-1} className="mt-1 text-[length:var(--font-size-subhead)] font-bold text-[var(--text-strong)] focus:outline-none">
            {LEAGUE_CREATE_STEPS[step].title}
          </h2>
          <p className="mt-1 text-[length:var(--font-size-body-sm)] text-[var(--text-caption)]">{LEAGUE_CREATE_STEPS[step].description}</p>
        </div>

        <div className="space-y-5 px-5 py-6">
          {step === 0 && (
            <LeagueBasicFields
              value={{ title, sportId, regionId, startsOn, endsOn }}
              onChange={(field, value) => {
                if (field === 'title') setTitle(value);
                if (field === 'sportId') { setSportId(value); setPeriodsDirty(false); }
                if (field === 'regionId') setRegionId(value);
                if (field === 'startsOn') setStartsOn(value);
                if (field === 'endsOn') setEndsOn(value);
              }}
              sports={sports ?? []}
              regions={regionOptions}
              sportLocked={isSportLocked}
              sportHint={isSportLocked ? '팀을 넣어서 잠겼어요 · 바꾸려면 다음 단계에서 넣은 팀을 모두 지우세요' : undefined}
              disabled={locked}
            />
          )}

          {step === 1 && (
            <>
              <div>
                <label htmlFor="league-team-picker" className={labelClass}>참가 팀 직접 추가 (선택)</label>
                <EntityPicker
                  id="league-team-picker"
                  value={pickerValue}
                  onChange={addTeam}
                  items={teamItems}
                  onSearch={setTeamSearch}
                  showResultsWithoutQuery
                  loading={teamsQuery.isFetching}
                  placeholder="팀 이름으로 검색"
                  emptyText="검색 결과가 없어요"
                />
                <p className="mt-1 tm-text-caption text-[var(--text-muted)]">
                  팀을 넣지 않고 참가 신청으로만 모아도 돼요. 대진은 2팀 이상일 때 만들 수 있어요.
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {selectedTeams.map((team) => (
                    <li key={team.id} className="flex min-h-[44px] items-center gap-2 rounded-full bg-[var(--blue50)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--blue700)]">
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

              <LeagueTeamCapacityField value={maxTeams} onChange={setMaxTeams} minimumTeams={selectedTeams.length} disabled={locked} />

              <fieldset className="space-y-4 rounded-xl border border-[var(--border)] p-4">
                <legend className="px-1 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">참가 신청</legend>
                <p className="tm-text-caption text-[var(--text-muted)]">
                  리그를 만든 뒤 리그 위의 &lsquo;접수 시작하기&rsquo;를 누르면 팀장이 신청할 수 있어요.
                </p>
                <div>
                  <label htmlFor="league-registration-deadline" className={labelClass}>신청 마감 (선택, 한국 시간)</label>
                  <input
                    id="league-registration-deadline"
                    type="datetime-local"
                    max="9999-12-31T23:59"
                    value={deadline}
                    onChange={(event) => setDeadline(event.target.value)}
                    aria-invalid={deadlineError ? true : undefined}
                    aria-describedby="league-registration-deadline-help"
                    className={inputClass}
                  />
                  <p id="league-registration-deadline-help" className="mt-1 tm-text-caption text-[var(--text-muted)]">
                    비우면 &lsquo;접수 마감하기&rsquo;를 누를 때까지 받아요.
                  </p>
                </div>
                <div>
                  <label htmlFor="league-entry-fee" className={labelClass}>팀당 참가비 (선택)</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="league-entry-fee"
                      inputMode="numeric"
                      value={formatWithComma(entryFee)}
                      onChange={(event) => setEntryFee(onlyDigits(event.target.value))}
                      aria-invalid={feeError ? true : undefined}
                      aria-describedby="league-entry-fee-help"
                      className={inputClass}
                    />
                    <span className="shrink-0 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">원</span>
                  </div>
                  <p id="league-entry-fee-help" className="mt-1 tm-text-caption text-[var(--text-muted)]">
                    0원이면 무료예요. 비우면 나중에 신청 관리에서 정해요.
                  </p>
                </div>
                {paid && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label htmlFor="league-bank-name" className={labelClass}>은행명</label>
                      <input id="league-bank-name" value={bankName} onChange={(event) => setBankName(event.target.value)} maxLength={60} className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="league-bank-account" className={labelClass}>계좌번호</label>
                      <input id="league-bank-account" value={bankAccount} onChange={(event) => setBankAccount(event.target.value)} maxLength={60} className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="league-bank-holder" className={labelClass}>예금주</label>
                      <input id="league-bank-holder" value={bankHolder} onChange={(event) => setBankHolder(event.target.value)} maxLength={60} className={inputClass} />
                    </div>
                  </div>
                )}
              </fieldset>
            </>
          )}

          {step === 2 && (
            <>
              <LeagueRosterLimitField
                value={rosterLimit}
                onChange={(next) => setRosterLimit((current) => ({ ...current, ...next }))}
                disabled={locked}
              />

              <LeaguePlannedFixtureField
                value={plannedFixtureCount}
                teamCount={selectedTeams.length}
                onChange={setPlannedFixtureCount}
                disabled={locked}
              />

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

              <div className="tm-on-tint rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
                순위 규칙: {formatTieBreakRule(LEAGUE_TIE_BREAK_ORDER)} (고정값 — 리그별 변경 미지원)
              </div>
            </>
          )}

          {step === CONFIRM_STEP && (
            <dl className="divide-y divide-[var(--border)] text-[length:var(--font-size-body-sm)]">
              {[
                ['리그 이름', title.trim()],
                ['종목', selectedSport?.name ?? '-'],
                ['지역', regionOptions.find((region) => region.id === regionId)?.name ?? '-'],
                ['기간', `${startsOn} ~ ${endsOn}`],
                ['직접 넣는 팀', selectedTeams.length === 0 ? '없음 — 참가 신청으로 모아요' : `${selectedTeams.length}팀 · ${selectedTeams.map((team) => team.label).join(', ')}`],
                ['참가팀 정원', maxTeams.trim() === '' ? '제한 없음' : `${maxTeams}팀`],
                ['신청 마감', deadlineIso === null ? '마감 없음 — 접수 마감하기로 닫아요' : formatTournamentDateTimeLong(deadlineIso)],
                ['참가비', feeValue === null ? '나중에 정해요' : formatEntryFee(feeValue)],
                ...(paid ? [['입금 계좌', `${bankName.trim()} ${bankAccount.trim()} (${bankHolder.trim()})`]] : []),
                ['팀 명단 인원', rosterLimit.unlimited ? '제한 없음' : `${rosterLimit.minPlayers}~${rosterLimit.maxPlayers}명`],
                ['총 경기 수', plannedFixtureCount.trim() === '' ? '정하지 않음' : `${plannedFixtureCount}경기`],
                ['경기 시간', periodMinutes.length === 0 ? '종목 기본값' : periodMinutes.map((value, index) => `${periodNames[index]} ${value}분`).join(' · ')],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
                  <dt className="shrink-0 text-[var(--text-muted)] sm:w-28">{label}</dt>
                  <dd className="min-w-0 break-words font-medium text-[var(--text-strong)]">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {periodSaveFailure && (
            <div role="alert" className="rounded-xl bg-[var(--red50)] px-3 py-2 text-[length:var(--font-size-caption)] text-[var(--red700)]">
              {periodSaveFailure.message}
              <Link
                href={`/admin/league-matches/${periodSaveFailure.leagueId}/rules`}
                className="ml-2 inline-flex min-h-[44px] items-center font-semibold underline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                경기 규칙으로 이동
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--card-surface)]/95 px-4 py-3 backdrop-blur lg:pl-[var(--admin-sidebar-width,0px)]">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {currentHint && (
            <p id="league-step-hint" className="text-center text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{currentHint}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {step === 0 ? (
              <Link href="/admin/league-matches" className={navButtonClass}>취소</Link>
            ) : (
              <button type="button" onClick={() => goToStep(step - 1)} disabled={locked} className={navButtonClass}>
                <ArrowLeft size={16} aria-hidden="true" />
                이전
              </button>
            )}
            {step < CONFIRM_STEP ? (
              <button
                key="league-wizard-next"
                type="button"
                onClick={() => goToStep(step + 1)}
                disabled={locked || currentHint !== null}
                aria-describedby={currentHint ? 'league-step-hint' : undefined}
                className={primaryButtonClass}
              >
                다음
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <button
                key="league-wizard-submit"
                type="button"
                onClick={submit}
                disabled={locked || createLeague.isPending || !canReach(CONFIRM_STEP)}
                className={primaryButtonClass}
              >
                <Check size={16} aria-hidden="true" />
                {submitting ? '만드는 중…' : '리그 만들기'}
              </button>
            )}
          </div>
        </div>
      </div>

      <AdminToasts toasts={toasts} />
    </div>
  );
}
