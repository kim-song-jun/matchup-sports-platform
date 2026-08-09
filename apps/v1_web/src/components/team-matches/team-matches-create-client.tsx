'use client';

import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useRouter } from 'next/navigation';
import {
  useV1CancelTeamMatch,
  useV1CreateTeamMatch,
  useV1MasterRegions,
  useV1MasterSports,
  useV1MyTeams,
  useV1TeamMatchEdit,
  useV1UpdateTeamMatch,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import { trackEvent } from '@/lib/analytics';
import { extractErrorMessage } from '@/lib/error-message';
import { getCreatorProfilePrompt, profileEditHref } from '@/lib/creator-profile';
import { toDistrictRegionOptions } from '@/lib/v1-regions';
import { lockedReasonLabel } from '@/lib/v1-status-labels';
import type { V1MyTeam, V1TeamMatchEdit } from '@/types/api';
import { TeamMatchCreatePageView } from './team-matches-page';
import type { TeamMatchCreateStep, TeamMatchCreateViewModel } from './team-matches.types';
import {
  buildTeamMatchPayloadResult,
  getCompleteTeamMatchSteps,
  getTeamMatchMissingFields,
  getTeamMatchStepErrors,
  normalizeGenderRule,
  toFieldErrorMap,
} from './team-matches.validation';
import { getTeamMatchCreateViewModel } from './team-matches.view-model';

const CREATE_STEP_ORDER: TeamMatchCreateStep[] = ['team', 'sport', 'info', 'condition', 'place-time'];

const storageKey = 'teameet:v1:team-match-draft:v3';
const selectionKey = 'teameet:v1:team-match-selection';

type TeamMatchDraft = TeamMatchCreateViewModel['draft'];
type TeamMatchSelection = { teamId: string; sportId: string; regionId: string };

export function TeamMatchCreatePageClient({ step }: { step: Exclude<TeamMatchCreateStep, 'edit'> }) {
  const router = useRouter();
  const { confirm, ConfirmModal } = useConfirm();
  const teams = useV1MyTeams();
  const sports = useV1MasterSports();
  const regions = useV1MasterRegions();
  const createTeamMatch = useV1CreateTeamMatch();
  const uploadImages = useV1UploadImages();
  const [draft, setDraft] = usePersistedDraft();
  // 위저드 step이 각각 별도 라우트라 step 이동 시 재마운트된다. 팀/종목/지역 선택을 로컬
  // useState에만 두면 매 step 첫 항목으로 리셋돼(팀 B·풋살 선택→첫 creatable팀·축구로 소실)
  // 잘못된 팀/종목/지역으로 팀매치가 생성된다. draft와 동일하게 localStorage에 영속한다.
  const [selection, setSelection] = useState<TeamMatchSelection>({
    teamId: '',
    sportId: '',
    regionId: '',
  });
  const [selectionHydrated, setSelectionHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "다음"/"팀매치 만들기"를 한 번이라도 눌러본 뒤에만 인라인 에러를 보여준다 — 진입하자마자
  // 빈 칸을 전부 orange로 물들이지 않기 위함(스텝별로 별도 라우트라 매 스텝 마운트 시 초기화됨).
  const [attempted, setAttempted] = useState(false);
  const [pendingFocusField, setPendingFocusField] = useState<string | null>(null);
  const myTeams = normalizeMyTeams(teams.data);
  const allMyTeams = myTeams ?? [];
  const creatableTeams = allMyTeams.filter((team) => team.canCreateTeamMatch);
  const regionOptions = toDistrictRegionOptions(regions.data ?? []);

  // 마스터 데이터 준비 후 1회 hydrate: 저장된 선택이 유효하면 우선, 없으면 첫 항목 기본값.
  useEffect(() => {
    if (selectionHydrated || teams.isLoading || !sports.data || regionOptions.length === 0) return;
    let stored: { teamId?: string; sportId?: string; regionId?: string } = {};
    try {
      const raw = window.localStorage.getItem(selectionKey);
      if (raw) stored = JSON.parse(raw) as { teamId?: string; sportId?: string; regionId?: string };
    } catch {
      window.localStorage.removeItem(selectionKey);
    }
    const teamId =
      stored.teamId && creatableTeams.some((team) => team.teamId === stored.teamId)
        ? stored.teamId
        : creatableTeams[0]?.teamId ?? '';
    const selectedTeam = creatableTeams.find((team) => team.teamId === teamId);
    const sportId = selectedTeam?.sport.sportId ?? '';
    const regionId =
      stored.regionId && regionOptions.some((item) => item.id === stored.regionId)
        ? stored.regionId
        : regionOptions[0]?.id ?? '';
    setSelection({ teamId, sportId, regionId });
    setSelectionHydrated(true);
  }, [teams.isLoading, creatableTeams, sports.data, regionOptions, selectionHydrated]);

  // 선택한 팀이 더 이상 생성 가능 팀이 아니면 첫 creatable 팀으로 교정(원래 가드 보존).
  useEffect(() => {
    if (!selectionHydrated) return;
    const selectedTeam = creatableTeams.find((team) => team.teamId === selection.teamId);
    if (!selectedTeam && selection.teamId) {
      const fallbackTeam = creatableTeams[0];
      setSelection((current) => ({
        ...current,
        teamId: fallbackTeam?.teamId ?? '',
        sportId: fallbackTeam?.sport.sportId ?? '',
      }));
    } else if (selectedTeam && selection.sportId !== selectedTeam.sport.sportId) {
      setSelection((current) => ({ ...current, sportId: selectedTeam.sport.sportId }));
    }
  }, [selectionHydrated, creatableTeams, selection.teamId, selection.sportId]);

  // hydrate 이후 선택 변경을 영속(다음 step 재마운트에서 복원).
  useEffect(() => {
    if (!selectionHydrated) return;
    window.localStorage.setItem(selectionKey, JSON.stringify(selection));
  }, [selection, selectionHydrated]);

  const selectedTeamId = selection.teamId;
  const selectedSportId = selection.sportId;
  const regionId = selection.regionId;
  const updateSelection = (updater: (current: TeamMatchSelection) => TeamMatchSelection) => {
    setSelection((current) => {
      const next = updater(current);
      window.localStorage.setItem(selectionKey, JSON.stringify(next));
      return next;
    });
  };

  // #1·#2 결정의 공유 소스: 이 ctx로 스텝 게이팅과 최종 제출 결측 필드 안내를 둘 다 계산한다.
  const validationCtx = { hostTeamId: selectedTeamId, sportId: selectedSportId, regionId, draft };
  const fieldErrors = attempted ? getTeamMatchStepErrors(validationCtx, step) : {};
  const missingFields = attempted && step === 'confirm' ? getTeamMatchMissingFields(validationCtx) : [];
  const completeSteps = getCompleteTeamMatchSteps(validationCtx, CREATE_STEP_ORDER);

  useEffect(() => {
    if (!pendingFocusField) return;
    const el = document.getElementById(`field-${pendingFocusField}`);
    el?.focus();
    setPendingFocusField(null);
  }, [pendingFocusField]);

  const model = buildCreateModel({
    step,
    draft,
    selectedTeamId,
    selectedSportId,
    regionId,
    isLoadingTeams: teams.isLoading,
    teams: allMyTeams.map((team) => ({
      id: team.teamId,
      name: team.name,
      sport: team.sport.name,
      members: team.memberCount,
      role: team.role === 'owner' ? '팀장' : team.role === 'manager' ? '관리자' : '멤버',
      disabled: !team.canCreateTeamMatch,
    })),
    sports: sports.data
      ?.filter((sport) => sport.id === creatableTeams.find((team) => team.teamId === selectedTeamId)?.sport.sportId)
      .map((sport) => ({ id: sport.id, name: sport.name })) ?? [],
    regions: regionOptions,
    error,
    fieldErrors,
    missingFields: missingFields.length > 0 ? missingFields : undefined,
    completeSteps,
    submitting: createTeamMatch.isPending,
    uploadImage: async (file) => {
      const result = await uploadImages.mutateAsync([file]);
      const url = result.urls[0];
      if (!url) throw new Error('이미지를 업로드하지 못했어요.');
      return url;
    },
    onSelectTeam: (teamName) => {
      const team = myTeams?.find((item) => item.name === teamName);
      if (team?.canCreateTeamMatch) {
        updateSelection((current) => ({
          ...current,
          teamId: team.teamId,
          sportId: team.sport.sportId,
        }));
      }
    },
    onSelectSport: (sportName) => {
      const sport = sports.data?.find((item) => item.name === sportName);
      if (sport) updateSelection((current) => ({ ...current, sportId: sport.id }));
    },
    onFieldChange: (field, value) => setDraft((current) => ({ ...current, [field]: value })),
    onRegionChange: (value) => updateSelection((current) => ({ ...current, regionId: value })),
    onBack: () => router.push(previousHref(step)),
    onNext: () => {
      // #1: "다음"은 절대 disabled 처리하지 않는다 — 대신 클릭 시 이 스텝의 필수 필드만 로컬
      // 검증해 비어 있으면 이동을 막고, 인라인 에러 + 첫 invalid 필드로 focus를 옮긴다.
      const errors = getTeamMatchStepErrors(validationCtx, step);
      const firstInvalidField = Object.keys(errors)[0];
      if (firstInvalidField) {
        setAttempted(true);
        setPendingFocusField(firstInvalidField);
        return;
      }
      router.push(nextHref(step));
    },
    onSubmit: () => {
      // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
      // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
      // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
      if (createTeamMatch.isPending) return;
      setError(null);
      const payloadResult = buildTeamMatchPayloadResult(draft, selectedTeamId, selectedSportId, regionId);
      if (payloadResult.missingFields) {
        // #2: 하드코딩된 고정 문구 대신 실제 결측 필드만 지목 — model.form.missingFields로 전달되고
        // ConfirmStep이 각 항목을 해당 스텝 링크와 함께 렌더링한다.
        setAttempted(true);
        return;
      }
      createTeamMatch.mutate(payloadResult.payload, {
        onSuccess: (result) => {
          window.localStorage.removeItem(storageKey);
          window.localStorage.removeItem(selectionKey);
          trackEvent('team_match_create_complete', {});
          router.push(result.detailRoute || `/team-matches/${result.teamMatchId}`);
        },
        onError: (err) => {
          const prompt = getCreatorProfilePrompt(err, '팀 매치');
          if (prompt) {
            setError(prompt);
            void confirm({
              title: '프로필 정보가 필요해요',
              message: prompt,
              confirmLabel: '프로필 수정',
            }).then((ok) => {
              if (ok) router.push(profileEditHref('/team-matches/new/confirm'));
            });
            return;
          }
          setError(extractErrorMessage(err, '팀매치를 만들 수 없어요. 다시 시도해 주세요.'));
        },
      });
    },
  });

  return (
    <>
      <TeamMatchCreatePageView model={model} />
      {ConfirmModal}
    </>
  );
}

export function TeamMatchEditPageClient({ teamMatchId }: { teamMatchId: string }) {
  const router = useRouter();
  const editQuery = useV1TeamMatchEdit(teamMatchId);
  const teams = useV1MyTeams();
  const sports = useV1MasterSports();
  const regions = useV1MasterRegions();
  const updateTeamMatch = useV1UpdateTeamMatch(teamMatchId);
  const cancelTeamMatch = useV1CancelTeamMatch(teamMatchId);
  const uploadImages = useV1UploadImages();
  const [draft, setDraft] = useState<TeamMatchDraft>(() => buildDefaultDraft());
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedSportId, setSelectedSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  // "변경사항 저장"을 한 번이라도 눌러본 뒤에만 인라인 에러를 보여준다(#1과 동일한 UX 원칙).
  const [editAttempted, setEditAttempted] = useState(false);
  const myTeams = normalizeMyTeams(teams.data) ?? [];
  const currentTeam = myTeams.find((team) => team.teamId === editQuery.data?.form.hostTeamId);
  const teamOptions = editQuery.data
    ? [{
        id: editQuery.data.form.hostTeamId,
        name: currentTeam?.name ?? '현재 팀',
        sport: currentTeam?.sport.name ?? '현재 종목',
        members: currentTeam?.memberCount ?? 0,
        role: currentTeam?.role === 'owner' ? '팀장' : '관리자',
      }]
    : [];
  const sportOptions = sports.data
    ?.filter((sport) => sport.id === editQuery.data?.form.sportId)
    .map((sport) => ({ id: sport.id, name: sport.name }))
    ?? (editQuery.data ? [{ id: editQuery.data.form.sportId, name: '현재 종목' }] : []);
  const regionOptions = toDistrictRegionOptions(regions.data ?? []);
  const editRegionOptions = regionOptions.length > 0
    ? regionOptions
    : editQuery.data
      ? [{ id: editQuery.data.form.regionId, name: '현재 지역' }]
      : [];

  useEffect(() => {
    if (!editQuery.data) return;
    setDraft(draftFromTeamMatchEdit(editQuery.data));
    setSelectedTeamId(editQuery.data.form.hostTeamId);
    setSelectedSportId(editQuery.data.form.sportId);
    setRegionId(editQuery.data.form.regionId);
    setVersion(editQuery.data.version);
  }, [editQuery.data]);

  // #2: edit 화면은 스텝 구분이 없는 한 화면이라 getTeamMatchMissingFields 를 그대로
  // 평탄화(toFieldErrorMap)해서 각 CreateField 아래 인라인 에러로 붙인다.
  const editCtx = { hostTeamId: selectedTeamId, sportId: selectedSportId, regionId, draft };
  const editMissingFields = editAttempted ? getTeamMatchMissingFields(editCtx) : [];
  const editFieldErrors = toFieldErrorMap(editMissingFields);

  const model = buildCreateModel({
    step: 'edit',
    draft,
    selectedTeamId,
    selectedSportId,
    regionId,
    teams: teamOptions,
    sports: sportOptions,
    regions: editRegionOptions,
    error: editQuery.isError ? '수정 권한이 없거나 팀매치를 불러오지 못했어요.' : error,
    lockedReason: editQuery.data?.editable === false
      ? lockedReasonLabel(editQuery.data.lockedReason ?? '')
      : null,
    submitting: editQuery.isLoading || updateTeamMatch.isPending || cancelTeamMatch.isPending,
    fieldErrors: editFieldErrors,
    uploadImage: async (file) => {
      const result = await uploadImages.mutateAsync([file]);
      const url = result.urls[0];
      if (!url) throw new Error('이미지를 업로드하지 못했어요.');
      return url;
    },
    onSelectTeam: () => undefined,
    onSelectSport: () => undefined,
    onFieldChange: (field, value) => setDraft((current) => ({ ...current, [field]: value })),
    onRegionChange: setRegionId,
    onBack: () => router.push(`/team-matches/${teamMatchId}`),
    onNext: () => undefined,
    onSubmit: () => {
      // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
      // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
      // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
      if (updateTeamMatch.isPending || cancelTeamMatch.isPending) return;
      setError(null);
      const payloadResult = buildTeamMatchPayloadResult(draft, selectedTeamId, selectedSportId, regionId);
      if (payloadResult.missingFields || !version) {
        // #2: 실제 결측 필드만 지목 — 각 CreateField 아래 인라인 에러로 표시되고,
        // 상단 배너는 몇 개가 비어 있는지만 간단히 안내한다(중복 문구 방지).
        setEditAttempted(true);
        setError(
          payloadResult.missingFields
            ? `${payloadResult.missingFields.length}개 항목을 확인해 주세요.`
            : '수정에 필요한 팀매치 정보를 확인해 주세요.',
        );
        return;
      }
      updateTeamMatch.mutate(
        { ...payloadResult.payload, version },
        {
          onSuccess: (result) => router.push(result.detailRoute || `/team-matches/${teamMatchId}`),
          onError: (err) => setError(extractErrorMessage(err, '팀매치를 수정할 수 없어요. 다시 시도해 주세요.')),
        },
      );
    },
    onCancel: () => {
      if (updateTeamMatch.isPending || cancelTeamMatch.isPending) return;
      cancelTeamMatch.mutate(
        { reason: 'host_cancelled_from_v1_web' },
        {
          onSuccess: () => router.push(`/team-matches/${teamMatchId}`),
          onError: (err) => setError(extractErrorMessage(err, '팀매치를 취소할 수 없어요. 다시 시도해 주세요.')),
        },
      );
    },
    submitLabel: '변경사항 저장',
    backHref: `/team-matches/${teamMatchId}`,
  });

  return <TeamMatchCreatePageView model={model} />;
}

function buildCreateModel({
  step,
  draft,
  selectedTeamId,
  selectedSportId,
  regionId,
  isLoadingTeams,
  teams,
  sports,
  regions,
  error,
  lockedReason,
  submitting,
  uploadImage,
  onSelectTeam,
  onSelectSport,
  onFieldChange,
  onRegionChange,
  onBack,
  onNext,
  onSubmit,
  onCancel,
  submitLabel,
  backHref,
  fieldErrors,
  missingFields,
  completeSteps,
}: {
  step: TeamMatchCreateStep;
  draft: TeamMatchDraft;
  selectedTeamId: string;
  selectedSportId: string;
  regionId: string;
  isLoadingTeams?: boolean;
  teams: Array<{ id: string; name: string; sport: string; members: number; role: string; disabled?: boolean }>;
  sports: Array<{ id: string; name: string }>;
  regions: Array<{ id: string; name: string; shortName?: string; parentName?: string }>;
  error?: string | null;
  lockedReason?: string | null;
  submitting?: boolean;
  uploadImage?: (file: File) => Promise<string>;
  onSelectTeam: (teamName: string) => void;
  onSelectSport: (sportName: string) => void;
  onFieldChange: (field: keyof TeamMatchDraft, value: string | number) => void;
  onRegionChange: (regionId: string) => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  backHref?: string;
  /** #1·#2: 스텝별 즉시 검증(create)과 결측 필드 안내(create/edit)가 공유하는 필드 → 문구 맵. */
  fieldErrors?: Partial<Record<string, string>>;
  /** #2: confirm(create)/edit 제출 시도에서 실제로 비어 있는 필드 — ConfirmStep 배너가 렌더. */
  missingFields?: NonNullable<TeamMatchCreateViewModel['form']>['missingFields'];
  /** CreateProgress 체크 배지 — 이 스텝들의 필수 필드는 이미 다 채워졌다는 뜻. */
  completeSteps?: TeamMatchCreateStep[];
}): TeamMatchCreateViewModel {
  const fallback = getTeamMatchCreateViewModel(step);
  const selectedTeam = teams.find((team) => team.id === selectedTeamId);
  const selectedSport = sports.find((sport) => sport.id === selectedSportId);

  return {
    ...fallback,
    backHref,
    selectedTeam: selectedTeam?.name ?? '',
    selectedSport: selectedSport?.name ?? '',
    isLoadingTeams,
    teams: teams.map((team) => ({ name: team.name, sport: team.sport, members: team.members, role: team.role, selected: team.id === selectedTeamId, disabled: team.disabled })),
    sports: sports.map((sport) => sport.name),
    draft,
    form: {
      selectedTeamId,
      selectedSportId,
      regionId,
      regions,
      onSelectTeam,
      onSelectSport,
      onFieldChange,
      onRegionChange,
      onBack,
      onNext,
      onSubmit,
      onCancel,
      submitLabel,
      submitting,
      uploadImage,
      error,
      lockedReason,
      fieldErrors,
      missingFields,
      completeSteps,
    },
  };
}

function usePersistedDraft() {
  const [draft, setDraft] = useState<TeamMatchDraft>(() => buildDefaultDraft());
  const draftRef = useRef(draft);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;
    try {
      const hydrated = normalizeDraftDate({ ...buildDefaultDraft(), ...JSON.parse(stored) });
      draftRef.current = hydrated;
      setDraft(hydrated);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  const setPersistedDraft = (action: SetStateAction<TeamMatchDraft>) => {
    const next = typeof action === 'function' ? action(draftRef.current) : action;
    // React state updater도 route 이동 뒤로 지연될 수 있으므로 ref에서 즉시 계산·저장한 뒤
    // 화면 상태를 갱신한다. 그래야 마지막 입력 직후 다음 step으로 이동해도 값이 보존된다.
    draftRef.current = next;
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    setDraft(next);
  };

  return [draft, setPersistedDraft] as const;
}

function buildDefaultDraft(): TeamMatchDraft {
  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(18, 0, 0, 0);

  return {
    ...getTeamMatchCreateViewModel('team').draft,
    date: start.toISOString().slice(0, 10),
    startTime: '',
    endTime: '',
  };
}

function normalizeDraftDate(draft: TeamMatchDraft): TeamMatchDraft {
  const startsAt = new Date(`${draft.date}T${draft.startTime || '18:00'}:00`);
  if (!Number.isNaN(startsAt.getTime()) && startsAt > new Date()) return draft;

  const fallback = buildDefaultDraft();
  return {
    ...draft,
    date: fallback.date,
    startTime: fallback.startTime,
    endTime: fallback.endTime,
  };
}

export function draftFromTeamMatchEdit(edit: V1TeamMatchEdit): TeamMatchDraft {
  const start = new Date(edit.form.startsAt);
  const end = edit.form.endsAt ? new Date(edit.form.endsAt) : null;
  const deadline = edit.form.deadlineAt ? new Date(edit.form.deadlineAt) : null;
  const parsed = parseNotes(edit.form.rulesText, edit.form.costNote);

  return {
    ...buildDefaultDraft(),
    title: edit.form.title,
    description: edit.form.description ?? '',
    grade: levelCodeToDraftGrade(edit.form.minLevelCode) ?? parsed.grade,
    format: parsed.format,
    style: parsed.style,
    uniform: parsed.uniform,
    gender: normalizeGenderRule(edit.form.genderRule),
    imageUrl: edit.form.imageUrl ?? '',
    cost: parsed.cost,
    opponentCost: parsed.opponentCost,
    venue: edit.form.manualPlaceName,
    address: edit.form.addressText ?? '',
    date: start.toISOString().slice(0, 10),
    startTime: start.toTimeString().slice(0, 5),
    endTime: end ? end.toTimeString().slice(0, 5) : start.toTimeString().slice(0, 5),
    deadlineDate: deadline ? deadline.toISOString().slice(0, 10) : '',
    deadlineTime: deadline ? deadline.toTimeString().slice(0, 5) : '',
  };
}

function levelCodeToDraftGrade(code?: string | null) {
  if (code === 'advanced') return 'A';
  if (code === 'intermediate') return 'B';
  if (code === 'novice') return 'C';
  if (code === 'beginner') return 'D';
  return null;
}

function parseNotes(rulesText?: string | null, costNote?: string | null) {
  const rules = rulesText?.split(' · ') ?? [];
  const amounts = costNote?.match(/\d[\d,]*/g)?.map((value) => Number(value.replace(/,/g, ''))) ?? [];
  const fallback = buildDefaultDraft();

  return {
    grade: rules[0] ?? fallback.grade,
    format: rules[1] ?? fallback.format,
    style: rules[2] ?? fallback.style,
    uniform: rules[3] ?? fallback.uniform,
    cost: amounts[0] ?? fallback.cost,
    opponentCost: amounts[1] ?? fallback.opponentCost,
  };
}

function previousHref(step: TeamMatchCreateStep) {
  if (step === 'team') return '/team-matches';
  if (step === 'sport') return '/team-matches/new/team';
  if (step === 'info') return '/team-matches/new/sport';
  if (step === 'condition') return '/team-matches/new/info';
  if (step === 'place-time') return '/team-matches/new/condition';
  return '/team-matches/new/place-time';
}

function nextHref(step: TeamMatchCreateStep) {
  if (step === 'team') return '/team-matches/new/sport';
  if (step === 'sport') return '/team-matches/new/info';
  if (step === 'info') return '/team-matches/new/condition';
  if (step === 'condition') return '/team-matches/new/place-time';
  return '/team-matches/new/confirm';
}

function normalizeMyTeams(data: ReturnType<typeof useV1MyTeams>['data']): V1MyTeam[] | undefined {
  if (!data) return undefined;
  return 'items' in data ? data.items : data;
}
