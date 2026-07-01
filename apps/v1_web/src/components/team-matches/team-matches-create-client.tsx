'use client';

import { useEffect, useState } from 'react';
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
import { extractErrorMessage } from '@/lib/error-message';
import { labelToLevelCode } from '@/lib/v1-levels';
import { toDistrictRegionOptions } from '@/lib/v1-regions';
import { lockedReasonLabel } from '@/lib/v1-status-labels';
import type { V1MyTeam, V1TeamMatchEdit, V1TeamMatchMutationPayload } from '@/types/api';
import { TeamMatchCreatePageView } from './team-matches-page';
import type { TeamMatchCreateStep, TeamMatchCreateViewModel } from './team-matches.types';
import { getTeamMatchCreateViewModel } from './team-matches.view-model';

const storageKey = 'teameet:v1:team-match-draft:v3';
const selectionKey = 'teameet:v1:team-match-selection';
const defaultGenderRule = '성별 무관';

type TeamMatchDraft = TeamMatchCreateViewModel['draft'];

export function TeamMatchCreatePageClient({ step }: { step: Exclude<TeamMatchCreateStep, 'edit'> }) {
  const router = useRouter();
  const teams = useV1MyTeams();
  const sports = useV1MasterSports();
  const regions = useV1MasterRegions();
  const createTeamMatch = useV1CreateTeamMatch();
  const uploadImages = useV1UploadImages();
  const [draft, setDraft] = usePersistedDraft();
  // 위저드 step이 각각 별도 라우트라 step 이동 시 재마운트된다. 팀/종목/지역 선택을 로컬
  // useState에만 두면 매 step 첫 항목으로 리셋돼(팀 B·풋살 선택→첫 creatable팀·축구로 소실)
  // 잘못된 팀/종목/지역으로 팀매치가 생성된다. draft와 동일하게 localStorage에 영속한다.
  const [selection, setSelection] = useState<{ teamId: string; sportId: string; regionId: string }>({
    teamId: '',
    sportId: '',
    regionId: '',
  });
  const [selectionHydrated, setSelectionHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const sportId =
      stored.sportId && sports.data.some((item) => item.id === stored.sportId)
        ? stored.sportId
        : sports.data[0]?.id ?? '';
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
    if (selection.teamId && !creatableTeams.some((team) => team.teamId === selection.teamId)) {
      setSelection((current) => ({ ...current, teamId: creatableTeams[0]?.teamId ?? '' }));
    }
  }, [selectionHydrated, creatableTeams, selection.teamId]);

  // hydrate 이후 선택 변경을 영속(다음 step 재마운트에서 복원).
  useEffect(() => {
    if (!selectionHydrated) return;
    window.localStorage.setItem(selectionKey, JSON.stringify(selection));
  }, [selection, selectionHydrated]);

  const selectedTeamId = selection.teamId;
  const selectedSportId = selection.sportId;
  const regionId = selection.regionId;

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
    sports: sports.data?.map((sport) => ({ id: sport.id, name: sport.name })) ?? [],
    regions: regionOptions,
    error,
    submitting: createTeamMatch.isPending,
    uploadImage: async (file) => {
      const result = await uploadImages.mutateAsync([file]);
      const url = result.urls[0];
      if (!url) throw new Error('이미지를 업로드하지 못했어요.');
      return url;
    },
    onSelectTeam: (teamName) => {
      const team = myTeams?.find((item) => item.name === teamName);
      if (team) setSelection((current) => ({ ...current, teamId: team.teamId }));
    },
    onSelectSport: (sportName) => {
      const sport = sports.data?.find((item) => item.name === sportName);
      if (sport) setSelection((current) => ({ ...current, sportId: sport.id }));
    },
    onFieldChange: (field, value) => setDraft((current) => ({ ...current, [field]: value })),
    onRegionChange: (value) => setSelection((current) => ({ ...current, regionId: value })),
    onBack: () => router.push(previousHref(step)),
    onNext: () => router.push(nextHref(step)),
    onSubmit: () => {
      setError(null);
      const payload = buildPayload(draft, selectedTeamId, selectedSportId, regionId);
      if (!payload) {
        setError('팀, 종목, 지역, 제목, 상세주소, 날짜와 시간을 확인해 주세요.');
        return;
      }
      createTeamMatch.mutate(payload, {
        onSuccess: (result) => {
          window.localStorage.removeItem(storageKey);
          window.localStorage.removeItem(selectionKey);
          router.push(result.detailRoute || `/team-matches/${result.teamMatchId}`);
        },
        onError: (err) => setError(extractErrorMessage(err, '팀매치를 만들 수 없어요. 다시 시도해 주세요.')),
      });
    },
  });

  return <TeamMatchCreatePageView model={model} />;
}

export function TeamMatchEditPageClient({ teamMatchId }: { teamMatchId: string }) {
  const router = useRouter();
  const editQuery = useV1TeamMatchEdit(teamMatchId);
  const updateTeamMatch = useV1UpdateTeamMatch(teamMatchId);
  const cancelTeamMatch = useV1CancelTeamMatch(teamMatchId);
  const uploadImages = useV1UploadImages();
  const [draft, setDraft] = useState<TeamMatchDraft>(() => buildDefaultDraft());
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedSportId, setSelectedSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editQuery.data) return;
    setDraft(draftFromEdit(editQuery.data));
    setSelectedTeamId(editQuery.data.form.hostTeamId);
    setSelectedSportId(editQuery.data.form.sportId);
    setRegionId(editQuery.data.form.regionId);
    setVersion(editQuery.data.version);
  }, [editQuery.data]);

  const model = buildCreateModel({
    step: 'edit',
    draft,
    selectedTeamId,
    selectedSportId,
    regionId,
    teams: editQuery.data ? [{ id: editQuery.data.form.hostTeamId, name: '현재 팀', sport: '팀매치', members: 0, role: '관리 권한' }] : [],
    sports: editQuery.data ? [{ id: editQuery.data.form.sportId, name: '현재 종목' }] : [],
    regions: editQuery.data ? [{ id: editQuery.data.form.regionId, name: '현재 지역' }] : [],
    error: editQuery.isError ? '수정 권한이 없거나 팀매치를 불러오지 못했어요.' : error,
    lockedReason: editQuery.data?.editable === false
      ? lockedReasonLabel(editQuery.data.lockedReason ?? '')
      : null,
    submitting: editQuery.isLoading || updateTeamMatch.isPending || cancelTeamMatch.isPending,
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
      setError(null);
      const payload = buildPayload(draft, selectedTeamId, selectedSportId, regionId);
      if (!payload || !version) {
        setError('수정에 필요한 팀매치 정보를 확인해 주세요.');
        return;
      }
      updateTeamMatch.mutate(
        { ...payload, version },
        {
          onSuccess: (result) => router.push(result.detailRoute || `/team-matches/${teamMatchId}`),
          onError: (err) => setError(extractErrorMessage(err, '팀매치를 수정할 수 없어요. 다시 시도해 주세요.')),
        },
      );
    },
    onCancel: () => {
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
}): TeamMatchCreateViewModel {
  const fallback = getTeamMatchCreateViewModel(step);
  const selectedTeam = teams.find((team) => team.id === selectedTeamId);
  const selectedSport = sports.find((sport) => sport.id === selectedSportId);

  return {
    ...fallback,
    backHref,
    selectedTeam: selectedTeam?.name ?? fallback.selectedTeam,
    selectedSport: selectedSport?.name ?? fallback.selectedSport,
    isLoadingTeams,
    teams: teams.map((team) => ({ name: team.name, sport: team.sport, members: team.members, role: team.role, selected: team.id === selectedTeamId, disabled: team.disabled })),
    sports: sports.length ? sports.map((sport) => sport.name) : fallback.sports,
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
    },
  };
}

function usePersistedDraft() {
  const [draft, setDraft] = useState<TeamMatchDraft>(() => buildDefaultDraft());

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;
    try {
      setDraft(normalizeDraftDate({ ...buildDefaultDraft(), ...JSON.parse(stored) }));
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft]);

  return [draft, setDraft] as const;
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

function draftFromEdit(edit: V1TeamMatchEdit): TeamMatchDraft {
  const start = new Date(edit.form.startsAt);
  const end = edit.form.endsAt ? new Date(edit.form.endsAt) : null;
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
    venue: edit.form.addressText ?? edit.form.manualPlaceName,
    address: '',
    date: start.toISOString().slice(0, 10),
    startTime: start.toTimeString().slice(0, 5),
    endTime: end ? end.toTimeString().slice(0, 5) : start.toTimeString().slice(0, 5),
  };
}

function levelCodeToDraftGrade(code?: string | null) {
  if (code === 'advanced') return 'A';
  if (code === 'intermediate') return 'B';
  if (code === 'novice') return 'C';
  if (code === 'beginner') return 'D';
  return null;
}

function buildPayload(draft: TeamMatchDraft, hostTeamId: string, sportId: string, regionId: string): V1TeamMatchMutationPayload | null {
  if (!hostTeamId || !sportId || !regionId || !draft.title.trim() || !draft.venue.trim() || !draft.date || !draft.startTime) return null;
  const startsAt = new Date(`${draft.date}T${draft.startTime}:00`);
  const endsAt = draft.endTime ? new Date(`${draft.date}T${draft.endTime}:00`) : null;
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) return null;

  return {
    hostTeamId,
    sportId,
    regionId,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt && endsAt > startsAt ? endsAt.toISOString() : null,
    deadlineAt: null,
    imageUrl: draft.imageUrl.trim() || null,
    manualPlaceName: draft.venue.trim(),
    addressText: draft.venue.trim() || null,
    costNote: draft.cost || draft.opponentCost ? `총 ${draft.cost.toLocaleString('ko-KR')}원 · 상대팀 ${draft.opponentCost.toLocaleString('ko-KR')}원` : null,
    rulesText: [draft.grade, draft.format, draft.style, draft.uniform].filter(Boolean).join(' · ') || null,
    minLevelCode: draft.grade.trim() ? labelToLevelCode(draft.grade) : null,
    maxLevelCode: draft.grade.trim() ? labelToLevelCode(draft.grade) : null,
    genderRule: normalizeGenderRule(draft.gender),
  };
}

function normalizeGenderRule(value?: string | null) {
  if (value === '남' || value === '여') return value;
  return defaultGenderRule;
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
