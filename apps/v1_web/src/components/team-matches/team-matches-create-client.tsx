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
} from '@/hooks/use-v1-api';
import { labelToLevelCode } from '@/lib/v1-levels';
import { toDistrictRegionOptions } from '@/lib/v1-regions';
import type { V1MyTeam, V1TeamMatchEdit, V1TeamMatchMutationPayload } from '@/types/api';
import { TeamMatchCreatePageView } from './team-matches-page';
import type { TeamMatchCreateStep, TeamMatchCreateViewModel } from './team-matches.types';
import { getTeamMatchCreateViewModel } from './team-matches.view-model';

const storageKey = 'teameet:v1:team-match-draft';
const defaultGenderRule = '성별 무관';

type TeamMatchDraft = TeamMatchCreateViewModel['draft'];

export function TeamMatchCreatePageClient({ step }: { step: Exclude<TeamMatchCreateStep, 'edit'> }) {
  const router = useRouter();
  const teams = useV1MyTeams();
  const sports = useV1MasterSports();
  const regions = useV1MasterRegions();
  const createTeamMatch = useV1CreateTeamMatch();
  const [draft, setDraft] = usePersistedDraft();
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedSportId, setSelectedSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const myTeams = normalizeMyTeams(teams.data);
  const regionOptions = toDistrictRegionOptions(regions.data ?? []);

  useEffect(() => {
    if (!selectedTeamId && myTeams?.[0]) setSelectedTeamId(myTeams[0].teamId);
  }, [selectedTeamId, myTeams]);

  useEffect(() => {
    if (!selectedSportId && sports.data?.[0]) setSelectedSportId(sports.data[0].id);
  }, [selectedSportId, sports.data]);

  useEffect(() => {
    if (!regionId && regionOptions[0]) setRegionId(regionOptions[0].id);
  }, [regionId, regionOptions]);

  const model = buildCreateModel({
    step,
    draft,
    selectedTeamId,
    selectedSportId,
    regionId,
    teams: myTeams?.map((team) => ({ id: team.teamId, name: team.name, sport: team.sport.name, members: team.memberCount, role: team.canCreateTeamMatch ? '생성 권한' : team.role })) ?? [],
    sports: sports.data?.map((sport) => ({ id: sport.id, name: sport.name })) ?? [],
    regions: regionOptions,
    error,
    submitting: createTeamMatch.isPending,
    onSelectTeam: (teamName) => {
      const team = myTeams?.find((item) => item.name === teamName);
      if (team) setSelectedTeamId(team.teamId);
    },
    onSelectSport: (sportName) => {
      const sport = sports.data?.find((item) => item.name === sportName);
      if (sport) setSelectedSportId(sport.id);
    },
    onFieldChange: (field, value) => setDraft((current) => ({ ...current, [field]: value })),
    onRegionChange: setRegionId,
    onBack: () => router.push(previousHref(step)),
    onNext: () => router.push(nextHref(step)),
    onSubmit: () => {
      setError(null);
      const payload = buildPayload(draft, selectedTeamId, selectedSportId, regionId);
      if (!payload) {
        setError('팀, 종목, 지역, 제목, 장소, 날짜와 시간을 확인해주세요.');
        return;
      }
      createTeamMatch.mutate(payload, {
        onSuccess: (result) => {
          window.localStorage.removeItem(storageKey);
          router.push(result.detailRoute || `/team-matches/${result.teamMatchId}`);
        },
        onError: (err) => setError(err instanceof Error ? err.message : '팀매치를 만들 수 없습니다.'),
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
    error: editQuery.isError ? '수정 권한이 없거나 팀매치를 불러오지 못했습니다.' : error,
    lockedReason: editQuery.data?.editable === false ? editQuery.data.lockedReason ?? '현재 상태에서는 수정할 수 없습니다.' : null,
    submitting: editQuery.isLoading || updateTeamMatch.isPending || cancelTeamMatch.isPending,
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
        setError('수정에 필요한 팀매치 정보를 확인해주세요.');
        return;
      }
      updateTeamMatch.mutate(
        { ...payload, version },
        {
          onSuccess: (result) => router.push(result.detailRoute || `/team-matches/${teamMatchId}`),
          onError: (err) => setError(err instanceof Error ? err.message : '팀매치를 수정할 수 없습니다.'),
        },
      );
    },
    onCancel: () => {
      cancelTeamMatch.mutate(
        { reason: 'host_cancelled_from_v1_web' },
        {
          onSuccess: () => router.push(`/team-matches/${teamMatchId}`),
          onError: (err) => setError(err instanceof Error ? err.message : '팀매치를 취소할 수 없습니다.'),
        },
      );
    },
    submitLabel: '변경사항 저장',
  });

  return <TeamMatchCreatePageView model={model} />;
}

function buildCreateModel({
  step,
  draft,
  selectedTeamId,
  selectedSportId,
  regionId,
  teams,
  sports,
  regions,
  error,
  lockedReason,
  submitting,
  onSelectTeam,
  onSelectSport,
  onFieldChange,
  onRegionChange,
  onBack,
  onNext,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  step: TeamMatchCreateStep;
  draft: TeamMatchDraft;
  selectedTeamId: string;
  selectedSportId: string;
  regionId: string;
  teams: Array<{ id: string; name: string; sport: string; members: number; role: string }>;
  sports: Array<{ id: string; name: string }>;
  regions: Array<{ id: string; name: string }>;
  error?: string | null;
  lockedReason?: string | null;
  submitting?: boolean;
  onSelectTeam: (teamName: string) => void;
  onSelectSport: (sportName: string) => void;
  onFieldChange: (field: keyof TeamMatchDraft, value: string | number) => void;
  onRegionChange: (regionId: string) => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel?: string;
}): TeamMatchCreateViewModel {
  const fallback = getTeamMatchCreateViewModel(step);
  const selectedTeam = teams.find((team) => team.id === selectedTeamId);
  const selectedSport = sports.find((sport) => sport.id === selectedSportId);

  return {
    ...fallback,
    selectedTeam: selectedTeam?.name ?? fallback.selectedTeam,
    selectedSport: selectedSport?.name ?? fallback.selectedSport,
    teams: teams.length
      ? teams.map((team) => ({ name: team.name, sport: team.sport, members: team.members, role: team.role, selected: team.id === selectedTeamId }))
      : fallback.teams,
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
      setDraft({ ...buildDefaultDraft(), ...JSON.parse(stored) });
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
    startTime: '18:00',
    endTime: '20:00',
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
    cost: parsed.cost,
    opponentCost: parsed.opponentCost,
    venue: edit.form.manualPlaceName,
    address: edit.form.addressText ?? '',
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
    imageUrl: '/mock/generated/team-huddle.webp',
    startsAt: startsAt.toISOString(),
    endsAt: endsAt && endsAt > startsAt ? endsAt.toISOString() : null,
    deadlineAt: null,
    manualPlaceName: draft.venue.trim(),
    addressText: draft.address.trim() || null,
    costNote: `총 ${draft.cost.toLocaleString('ko-KR')}원 · 상대팀 ${draft.opponentCost.toLocaleString('ko-KR')}원`,
    rulesText: [draft.grade, draft.format, draft.style, draft.uniform].filter(Boolean).join(' · ') || null,
    minLevelCode: labelToLevelCode(draft.grade),
    maxLevelCode: labelToLevelCode(draft.grade),
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
