'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useV1CreateTeam, useV1MasterRegions, useV1MasterSports, useV1TeamDetail, useV1UpdateTeam, useV1UploadImages } from '@/hooks/use-v1-api';
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
  const uploadImages = useV1UploadImages();
  const uploadImage = async (file: File) => {
    const result = await uploadImages.mutateAsync([file]);
    const url = result.urls[0];
    if (!url) throw new Error('이미지를 올리지 못했어요. 다시 시도해 주세요.');
    return url;
  };
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
    uploadImage,
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
        setError('팀 이름, 종목, 지역을 모두 입력해 주세요.');
        return;
      }
      createTeam.mutate(payload, {
        onSuccess: (result) => router.push(result.detailRoute || `/teams/${result.teamId}`),
        onError: (err) => setError(err instanceof Error ? err.message : '팀을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'),
      });
    },
  });

  return <TeamFormPageView model={model} />;
}

export function TeamEditPageClient({ teamId }: { teamId: string }) {
  const router = useRouter();
  // #16: my 컨텍스트(/my/teams/[id]) 경유 진입 여부 판별
  // from=my 파라미터가 있으면 취소·저장 후 /my/teams/[id]로 복귀
  const searchParams = useSearchParams();
  const fromMy = searchParams.get('from') === 'my';
  const cancelHref = fromMy ? `/my/teams/${teamId}` : '/teams';
  const successHref = fromMy ? `/my/teams/${teamId}` : undefined; // undefined이면 API 응답 detailRoute 사용
  const query = useV1TeamDetail(teamId);
  const updateTeam = useV1UpdateTeam(teamId);
  const uploadImages = useV1UploadImages();
  const uploadImage = async (file: File) => {
    const result = await uploadImages.mutateAsync([file]);
    const url = result.urls[0];
    if (!url) throw new Error('이미지를 올리지 못했어요. 다시 시도해 주세요.');
    return url;
  };
  const [draft, setDraft] = useState<TeamDraft>(() => getTeamFormViewModel('edit').team);
  const [sportId, setSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [joinPolicy, setJoinPolicy] = useState<'approval_required' | 'closed'>('approval_required');
  const [membersVisibilityEnabled, setMembersVisibilityEnabled] = useState(false);
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) return;
    setDraft({
      ...getTeamFormViewModel('edit').team,
      name: query.data.name,
      logoUrl: query.data.profile.logoUrl ?? null,
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
    });
    setSportId(query.data.sport.sportId);
    setRegionId(query.data.region?.regionId ?? '');
    setJoinPolicy(query.data.profile.joinPolicy === 'closed' ? 'closed' : 'approval_required');
    setMembersVisibilityEnabled(query.data.membersVisibilityEnabled);
    setVersion(query.data.version ?? '');
  }, [query.data]);

  const model = buildModel({
    mode: 'edit',
    uploadImage,
    draft,
    sportId,
    regionId,
    joinPolicy,
    membersVisibilityEnabled,
    sports: query.data ? [{ id: query.data.sport.sportId, name: query.data.sport.name }] : [],
    regions: query.data?.region ? [{ id: query.data.region.regionId, name: query.data.region.name }] : [],
    error: query.isError ? '팀 정보를 불러오지 못했어요.' : error,
    submitting: query.isLoading || updateTeam.isPending,
    setDraft,
    setSportId,
    setRegionId,
    setJoinPolicy,
    setMembersVisibilityEnabled,
    onSubmit: () => {
      setError(null);
      const payload = buildPayload(draft, sportId, regionId, joinPolicy);
      if (!payload || !version) {
        setError('팀 정보를 다시 확인하고 저장해 주세요.');
        return;
      }
      updateTeam.mutate(
        { ...payload, version, membersVisibilityEnabled },
        {
          // #16: from=my이면 저장 후 /my/teams/[id]로 복귀, 아니면 API 응답 경로 사용
          onSuccess: (result) => router.push(successHref ?? result.detailRoute ?? `/teams/${teamId}`),
          onError: (err) => setError(err instanceof Error ? err.message : '팀 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'),
        },
      );
    },
  });

  return <TeamFormPageView model={model} cancelHref={cancelHref} />;
}

function buildModel({
  mode,
  uploadImage,
  draft,
  sportId,
  regionId,
  joinPolicy,
  membersVisibilityEnabled,
  sports,
  regions,
  error,
  submitting,
  setDraft,
  setSportId,
  setRegionId,
  setJoinPolicy,
  setMembersVisibilityEnabled,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  uploadImage?: (file: File) => Promise<string>;
  draft: TeamDraft;
  sportId: string;
  regionId: string;
  joinPolicy: 'approval_required' | 'closed';
  membersVisibilityEnabled?: boolean;
  sports: Array<{ id: string; name: string }>;
  regions: Array<{ id: string; name: string }>;
  error: string | null;
  submitting: boolean;
  setDraft: (updater: (current: TeamDraft) => TeamDraft) => void;
  setSportId: (sportId: string) => void;
  setRegionId: (regionId: string) => void;
  setJoinPolicy: (joinPolicy: 'approval_required' | 'closed') => void;
  setMembersVisibilityEnabled?: (enabled: boolean) => void;
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
      membersVisibilityEnabled,
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
      onMembersVisibilityChange: setMembersVisibilityEnabled,
      uploadImage,
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
    logoUrl: draft.logoUrl || null,
    coverImageUrl: null,
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
