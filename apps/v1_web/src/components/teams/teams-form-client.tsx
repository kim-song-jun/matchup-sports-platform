'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useV1CreateTeam, useV1MasterRegions, useV1MasterSports, useV1TeamDetail, useV1UpdateTeam } from '@/hooks/use-v1-api';
import { labelToLevelCode } from '@/lib/v1-levels';
import { toDistrictRegionOptions } from '@/lib/v1-regions';
import type { V1TeamMutationPayload } from '@/types/api';
import { TeamFormPageView } from './teams-page';
import type { TeamFormViewModel } from './teams.types';
import { getTeamFormViewModel } from './teams.view-model';

type TeamDraft = TeamFormViewModel['team'];

export function TeamCreatePageClient() {
  const router = useRouter();
  const sports = useV1MasterSports();
  const regions = useV1MasterRegions();
  const createTeam = useV1CreateTeam();
  const [draft, setDraft] = useState<TeamDraft>(() => getTeamFormViewModel('create').team);
  const [sportId, setSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [joinPolicy, setJoinPolicy] = useState<'approval_required' | 'closed'>('approval_required');
  const [error, setError] = useState<string | null>(null);
  const regionOptions = toDistrictRegionOptions(regions.data ?? []);

  useEffect(() => {
    if (!sportId && sports.data?.[0]) setSportId(sports.data[0].id);
  }, [sportId, sports.data]);

  useEffect(() => {
    if (!regionId && regionOptions[0]) setRegionId(regionOptions[0].id);
  }, [regionId, regionOptions]);

  const model = buildModel({
    mode: 'create',
    draft,
    sportId,
    regionId,
    joinPolicy,
    sports: sports.data?.map((sport) => ({ id: sport.id, name: sport.name })) ?? [],
    regions: regionOptions,
    error,
    submitting: createTeam.isPending,
    setDraft,
    setSportId,
    setRegionId,
    setJoinPolicy,
    onSubmit: () => {
      setError(null);
      const payload = buildPayload(draft, sportId, regionId, joinPolicy);
      if (!payload) {
        setError('팀명, 종목, 지역을 확인해주세요.');
        return;
      }
      createTeam.mutate(payload, {
        onSuccess: (result) => router.push(result.detailRoute || `/teams/${result.teamId}`),
        onError: (err) => setError(err instanceof Error ? err.message : '팀을 만들 수 없습니다.'),
      });
    },
  });

  return <TeamFormPageView model={model} />;
}

export function TeamEditPageClient({ teamId }: { teamId: string }) {
  const router = useRouter();
  const query = useV1TeamDetail(teamId);
  const updateTeam = useV1UpdateTeam(teamId);
  const [draft, setDraft] = useState<TeamDraft>(() => getTeamFormViewModel('edit').team);
  const [sportId, setSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [joinPolicy, setJoinPolicy] = useState<'approval_required' | 'closed'>('approval_required');
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) return;
    setDraft({
      ...getTeamFormViewModel('edit').team,
      name: query.data.name,
      sport: query.data.sport.name,
      region: query.data.region?.name ?? '지역 미정',
      description: query.data.profile.introduction ?? '',
      sports: [query.data.sport.name],
      city: query.data.region?.name ?? '',
      county: '',
      level: query.data.profile.levelLabel ?? query.data.profile.skillLevelText ?? '',
      genderRule: query.data.profile.genderRule ?? '성별 무관',
      activity: query.data.profile.activityAreaText ?? '',
      capacity: query.data.profile.memberGoalCount ?? query.data.memberCount,
      logoImage: query.data.profile.logoUrl ?? '',
      coverImage: query.data.profile.coverImageUrl ?? '',
      activityImages: [],
    });
    setSportId(query.data.sport.sportId);
    setRegionId(query.data.region?.regionId ?? '');
    setJoinPolicy(query.data.profile.joinPolicy === 'closed' ? 'closed' : 'approval_required');
    setVersion(query.data.version ?? '');
  }, [query.data]);

  const model = buildModel({
    mode: 'edit',
    draft,
    sportId,
    regionId,
    joinPolicy,
    sports: query.data ? [{ id: query.data.sport.sportId, name: query.data.sport.name }] : [],
    regions: query.data?.region ? [{ id: query.data.region.regionId, name: query.data.region.name }] : [],
    error: query.isError ? '팀 정보를 불러오지 못했습니다.' : error,
    submitting: query.isLoading || updateTeam.isPending,
    setDraft,
    setSportId,
    setRegionId,
    setJoinPolicy,
    onSubmit: () => {
      setError(null);
      const payload = buildPayload(draft, sportId, regionId, joinPolicy);
      if (!payload || !version) {
        setError('수정에 필요한 팀 정보를 확인해주세요.');
        return;
      }
      updateTeam.mutate(
        { ...payload, version },
        {
          onSuccess: (result) => router.push(result.detailRoute || `/teams/${teamId}`),
          onError: (err) => setError(err instanceof Error ? err.message : '팀을 수정할 수 없습니다.'),
        },
      );
    },
  });

  return <TeamFormPageView model={model} />;
}

function buildModel({
  mode,
  draft,
  sportId,
  regionId,
  joinPolicy,
  sports,
  regions,
  error,
  submitting,
  setDraft,
  setSportId,
  setRegionId,
  setJoinPolicy,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  draft: TeamDraft;
  sportId: string;
  regionId: string;
  joinPolicy: 'approval_required' | 'closed';
  sports: Array<{ id: string; name: string }>;
  regions: Array<{ id: string; name: string }>;
  error: string | null;
  submitting: boolean;
  setDraft: (updater: (current: TeamDraft) => TeamDraft) => void;
  setSportId: (sportId: string) => void;
  setRegionId: (regionId: string) => void;
  setJoinPolicy: (joinPolicy: 'approval_required' | 'closed') => void;
  onSubmit: () => void;
}): TeamFormViewModel {
  return {
    mode,
    team: draft,
    form: {
      sportId,
      regionId,
      regions,
      sports,
      joinPolicy,
      onFieldChange: (field, value) => setDraft((current) => ({ ...current, [field]: value })),
      onSportChange: (nextSportId) => {
        const sport = sports.find((item) => item.id === nextSportId);
        setSportId(nextSportId);
        if (sport) setDraft((current) => ({ ...current, sport: sport.name, sports: [sport.name] }));
      },
      onRegionChange: (nextRegionId) => {
        const region = regions.find((item) => item.id === nextRegionId);
        setRegionId(nextRegionId);
        if (region) {
          const [city, ...countyParts] = region.name.split(' ');
          setDraft((current) => ({ ...current, region: region.name, city, county: countyParts.join(' ') }));
        }
      },
      onJoinPolicyChange: setJoinPolicy,
      onSubmit,
      submitting,
      error,
    },
  };
}

function buildPayload(draft: TeamDraft, sportId: string, regionId: string, joinPolicy: 'approval_required' | 'closed'): V1TeamMutationPayload | null {
  if (!sportId || !regionId || !draft.name.trim()) return null;
  const [minLevelText, maxLevelText] = parseDraftLevelRange(draft.level);
  return {
    sportId,
    regionId,
    name: draft.name.trim(),
    logoUrl: draft.logoImage || '/mock/generated/team-huddle.webp',
    coverImageUrl: draft.coverImage || '/mock/generated/futsal-rooftop.webp',
    photos: draft.activityImages.length ? draft.activityImages : ['/mock/generated/team-huddle.webp'],
    introduction: draft.description.trim() || null,
    activityAreaText: draft.activity.trim() || null,
    skillLevelText: draft.level.trim() || null,
    minLevelCode: minLevelText ? labelToLevelCode(minLevelText) : null,
    maxLevelCode: maxLevelText ? labelToLevelCode(maxLevelText) : null,
    genderRule: normalizeGenderRule(draft.genderRule),
    joinPolicy,
    memberGoalCount: Number(draft.capacity) || null,
  };
}

function parseDraftLevelRange(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '전체 레벨') return ['입문', '고수'] as const;
  const [minLevel, maxLevel] = trimmed.split(/[-~]/).map((item) => item.trim()).filter(Boolean);
  return [minLevel ?? trimmed, maxLevel ?? minLevel ?? trimmed] as const;
}

function normalizeGenderRule(value?: string | null) {
  if (value === '남' || value === '여') return value;
  return '성별 무관';
}
