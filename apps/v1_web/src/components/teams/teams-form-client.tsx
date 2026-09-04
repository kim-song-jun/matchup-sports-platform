'use client';

import { ErrorState } from '@/components/v1-ui/primitives';

import { useEffect, useRef, useState } from 'react';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useRouter, useSearchParams } from 'next/navigation';
import { useV1CreateTeam, useV1MasterRegions, useV1MasterSports, useV1TeamDetail, useV1UpdateTeam, useV1UploadImages } from '@/hooks/use-v1-api';
import { trackEvent } from '@/lib/analytics';
import { V1ApiError } from '@/lib/api-client';
import { getCreatorProfilePrompt, profileEditHref } from '@/lib/creator-profile';
import { getRandomTeamLogoPreset } from '@/lib/team-logo-presets';
import { labelToLevelCode } from '@/lib/v1-levels';
import { toTeamRegionOptions } from '@/lib/v1-regions';
import type { V1TeamMutationPayload } from '@/types/api';
import { TeamDetailPageSkeleton, TeamFormPageView } from './teams-page';
import type { TeamFormViewModel } from './teams.types';
import { getTeamFormViewModel } from './teams.view-model';

type TeamDraft = TeamFormViewModel['team'];

/**
 * 팀 수정 폼의 초기 draft — 실제 팀 데이터가 도착하기 전까지 잠깐이라도 렌더될 경우를 대비한
 * 중립값이다. 예전에는 `getTeamFormViewModel('edit').team`(목업 "성수 러너스 FC")을 그대로
 * 썼는데, `team.name`이 이 값을 바로 텍스트 입력의 value로 쓰기 때문에 실제 팀 정보가 오기
 * 전 짧은 순간 편집 가능한 입력창에 남의 팀 이름이 채워져 있었다. 지금은 `!query.data`인
 * 동안 폼 자체를 스켈레톤으로 가리므로 이 값이 실제로 렌더될 일은 없지만, 방어적으로도
 * 목업이 아닌 빈 값을 쓴다.
 */
const EMPTY_TEAM_DRAFT: TeamDraft = {
  name: '',
  logoUrl: null,
  coverImageUrl: null,
  sport: '',
  region: '',
  description: '',
  sports: [],
  city: '',
  county: '',
  level: '',
  genderRule: '성별 무관',
  activityDays: [],
  activityFrequency: '',
  activityTimeSlots: [],
  activityTypes: [],
  activityMemo: '',
  capacity: 0,
};

export function TeamCreatePageClient() {
  const router = useRouter();
  const { confirm, ConfirmModal } = useConfirm();
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
  const [draft, setDraft] = useState<TeamDraft>(() => {
    const vm = getTeamFormViewModel('create').team;
    return { ...vm, logoUrl: vm.logoUrl || getRandomTeamLogoPreset() };
  });
  const [sportId, setSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [joinPolicy, setJoinPolicy] = useState<'approval_required' | 'closed'>('approval_required');
  const [error, setError] = useState<string | null>(null);
  const submitLockRef = useRef(false);
  const regionOptions = toTeamRegionOptions(regions.data ?? []);
  const selectedSportId = sportId || sports.data?.[0]?.id || '';

  const createTeamWithActivityCompatibility = async (payload: V1TeamMutationPayload, draft: TeamDraft) => {
    try {
      return await createTeam.mutateAsync(payload);
    } catch (err) {
      if (!isUnsupportedActivityFieldsError(err)) throw err;
      return createTeam.mutateAsync(toLegacyActivityPayload(payload, draft));
    }
  };

  useEffect(() => {
    if (!regionId && regionOptions[0]) setRegionId(regionOptions[0].id);
  }, [regionId, regionOptions]);

  const model = buildModel({
    mode: 'create',
    uploadImage,
    draft,
    sportId: selectedSportId,
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
      if (submitLockRef.current || createTeam.isPending) return;
      setError(null);
      const payload = buildPayload(draft, selectedSportId, regionId, joinPolicy);
      if (!payload) {
        setError('팀 이름, 종목, 지역을 모두 입력해 주세요.');
        return;
      }
      submitLockRef.current = true;
      void createTeamWithActivityCompatibility(payload, draft)
        .then((result) => {
          const sportType = sports.data?.find((sport) => sport.id === selectedSportId)?.code ?? selectedSportId;
          trackEvent('team_create_complete', { sportType });
          router.push(result.detailRoute || `/teams/${result.teamId}`);
        })
        .catch((err) => {
          const prompt = getCreatorProfilePrompt(err, '팀');
          if (prompt) {
            setError(prompt);
            void confirm({
              title: '프로필 정보가 필요해요',
              message: prompt,
              confirmLabel: '프로필 수정',
            }).then((ok) => {
              if (ok) router.push(profileEditHref('/teams/new'));
            });
            return;
          }
          setError(err instanceof Error ? err.message : '팀을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
        })
        .finally(() => {
          submitLockRef.current = false;
        });
    },
  });

  return (
    <>
      <TeamFormPageView model={sports.isPending && sports.data === undefined ? { ...model, form: undefined } : model} />
      {ConfirmModal}
    </>
  );
}

export function TeamEditPageClient({ teamId }: { teamId: string }) {
  const router = useRouter();
  // #16: my 컨텍스트 경유 진입 여부 판별
  // from=my 파라미터가 있으면 취소·저장 후 canonical /teams/[id]로 복귀
  const searchParams = useSearchParams();
  const fromMy = searchParams.get('from') === 'my';
  const cancelHref = fromMy && teamId ? `/teams/${teamId}` : '/teams';
  const successHref = fromMy && teamId ? `/teams/${teamId}` : undefined; // undefined이면 API 응답 detailRoute 사용
  const query = useV1TeamDetail(teamId);
  const sports = useV1MasterSports();
  const regions = useV1MasterRegions();
  const updateTeam = useV1UpdateTeam(teamId);
  const uploadImages = useV1UploadImages();
  const uploadImage = async (file: File) => {
    const result = await uploadImages.mutateAsync([file]);
    const url = result.urls[0];
    if (!url) throw new Error('이미지를 올리지 못했어요. 다시 시도해 주세요.');
    return url;
  };
  const [draft, setDraft] = useState<TeamDraft>(() => EMPTY_TEAM_DRAFT);
  const [sportId, setSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [joinPolicy, setJoinPolicy] = useState<'approval_required' | 'closed'>('approval_required');
  const [membersVisibilityEnabled, setMembersVisibilityEnabled] = useState(false);
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submitLockRef = useRef(false);
  const regionOptions = toTeamRegionOptions(regions.data ?? []);
  const updateTeamWithActivityCompatibility = async (
    payload: V1TeamMutationPayload & { version: string; membersVisibilityEnabled?: boolean },
    draft: TeamDraft,
  ) => {
    try {
      return await updateTeam.mutateAsync(payload);
    } catch (err) {
      if (!isUnsupportedActivityFieldsError(err)) throw err;
      return updateTeam.mutateAsync(toLegacyActivityPayload(payload, draft));
    }
  };

  useEffect(() => {
    if (!query.data) return;
    const hydratedRegionName = formatTeamRegionName(query.data.region);
    setDraft({
      ...EMPTY_TEAM_DRAFT,
      name: query.data.name,
      logoUrl: query.data.profile.logoUrl ?? null,
      coverImageUrl: query.data.profile.coverImageUrl ?? null,
      sport: query.data.sport.name,
      region: query.data.region?.name ?? '지역 미정',
      description: query.data.profile.introduction ?? '',
      sports: [query.data.sport.name],
      city: query.data.region?.name ?? '',
      county: '',
      level: query.data.profile.levelLabel ?? query.data.profile.skillLevelText ?? '',
      genderRule: query.data.profile.genderRule ?? '성별 무관',
      activityDays: query.data.profile.activityDays ?? [],
      activityFrequency: query.data.profile.activityFrequency ?? '',
      activityTimeSlots: query.data.profile.activityTimeSlots ?? [],
      activityTypes: query.data.profile.activityTypes ?? [],
      activityMemo: normalizeHydratedActivityMemo(query.data.profile),
      capacity: query.data.profile.memberGoalCount ?? query.data.memberCount,
    });
    setDraft((current) => ({
      ...current,
      region: hydratedRegionName ?? current.region,
      city: getTeamRegionCity(query.data.region),
      county: getTeamRegionCounty(query.data.region),
    }));
    setSportId(query.data.sport.sportId);
    setRegionId(query.data.region?.regionId ?? '');
    setJoinPolicy(query.data.profile.joinPolicy === 'closed' ? 'closed' : 'approval_required');
    setMembersVisibilityEnabled(query.data.membersVisibilityEnabled);
    setVersion(query.data.version ?? '');
  }, [query.data]);

  // 데이터가 오기 전에는 draft(EMPTY_TEAM_DRAFT)를 실제 편집 입력창에 노출하지 않는다 —
  // teams-client.tsx의 TeamDetailPageClient(`if (!query.data) return <TeamDetailPageSkeleton />`)와
  // 동일 패턴. 이 gate가 hooks 아래(모든 useState/useEffect 호출 이후)에 있어야 한다.
  // 오류를 먼저 — 로딩 게이트가 isError 까지 가리면 조회 실패 시 스켈레톤만 영원히 남는다(Copilot 리뷰).
  if (query.isError) {
    return <ErrorState title="팀 정보를 불러오지 못했어요" message="잠시 후 다시 시도해 주세요." onRetry={() => void query.refetch()} retryLabel="다시 불러오기" />;
  }
  if (!query.data) {
    return <TeamDetailPageSkeleton />;
  }

  const model = buildModel({
    mode: 'edit',
    uploadImage,
    draft,
    sportId,
    regionId,
    joinPolicy,
    membersVisibilityEnabled,
    // query.data는 위 skeleton gate를 통과했으므로 여기서는 항상 정의돼 있다.
    sports: sports.data?.map((sport) => ({ id: sport.id, name: sport.name })) ?? [{ id: query.data.sport.sportId, name: query.data.sport.name }],
    regions: regionOptions.length
      ? regionOptions
      : query.data.region
        ? [toTeamRegionFallbackOption(query.data.region)]
        : [],
    error: query.isError ? '팀 정보를 불러오지 못했어요.' : error,
    submitting: query.isLoading || updateTeam.isPending,
    setDraft,
    setSportId,
    setRegionId,
    setJoinPolicy,
    setMembersVisibilityEnabled,
    onSubmit: () => {
      if (submitLockRef.current || updateTeam.isPending) return;
      setError(null);
      const payload = buildPayload(draft, sportId, regionId, joinPolicy);
      if (!payload || !version) {
        setError('팀 정보를 다시 확인하고 저장해 주세요.');
        return;
      }
      submitLockRef.current = true;
      void updateTeamWithActivityCompatibility({ ...payload, version, membersVisibilityEnabled }, draft)
        // #16: from=my이면 저장 후 canonical /teams/[id]로 복귀, 아니면 API 응답 경로 사용
        .then((result) => router.push(successHref ?? result.detailRoute ?? `/teams/${teamId}`))
        .catch((err) => setError(err instanceof Error ? err.message : '팀 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'))
        .finally(() => {
          submitLockRef.current = false;
        });
    },
  });

  return (
    <TeamFormPageView
      model={sports.isPending && sports.data === undefined ? { ...model, form: undefined } : model}
      cancelHref={cancelHref}
    />
  );
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
  regions: Array<{ id: string; name: string; shortName?: string; parentName?: string }>;
  error: string | null;
  submitting: boolean;
  setDraft: (updater: (current: TeamDraft) => TeamDraft) => void;
  setSportId: (sportId: string) => void;
  setRegionId: (regionId: string) => void;
  setJoinPolicy: (joinPolicy: 'approval_required' | 'closed') => void;
  setMembersVisibilityEnabled?: (enabled: boolean) => void;
  onSubmit: () => void;
}): TeamFormViewModel {
  const selectedSport = sports.find((sport) => sport.id === sportId);

  return {
    mode,
    team: selectedSport
      ? { ...draft, sport: selectedSport.name, sports: [selectedSport.name] }
      : { ...draft, sports: [] },
    form: {
      sportId,
      regionId,
      regions,
      sports,
      joinPolicy,
      membersVisibilityEnabled,
      onFieldChange: (field, value) => setDraft((current) => ({ ...current, [field]: value })),
      onSportChange: setSportId,
      onRegionChange: (nextRegionId) => {
        const region = regions.find((item) => item.id === nextRegionId);
        setRegionId(nextRegionId);
        if (region) {
          setDraft((current) => ({
            ...current,
            region: region.name,
            city: getTeamRegionOptionCity(region),
            county: getTeamRegionOptionCounty(region),
          }));
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

function formatTeamRegionName(region?: { name: string; parentName?: string | null } | null) {
  if (!region) return null;
  return region.parentName ? `${region.parentName} ${region.name}` : `${region.name} 전체`;
}

function toTeamRegionFallbackOption(region: { regionId: string; name: string; parentName?: string | null }) {
  if (region.parentName) {
    return {
      id: region.regionId,
      name: `${region.parentName} ${region.name}`,
      shortName: region.name,
      parentName: region.parentName,
    };
  }

  return {
    id: region.regionId,
    name: `${region.name} 전체`,
    shortName: '전체',
    parentName: region.name,
  };
}

function getTeamRegionCity(region?: { name: string; parentName?: string | null } | null) {
  if (!region) return '';
  if (region.parentName) return region.parentName;
  return region.name;
}

function getTeamRegionCounty(region?: { name: string; parentName?: string | null } | null) {
  if (!region) return '';
  if (region.parentName) return region.name;
  const [city, ...countyParts] = region.name.trim().split(/\s+/);
  return countyParts.length ? countyParts.join(' ') : '전체';
}

function getTeamRegionOptionCity(region: { name: string; shortName?: string; parentName?: string }) {
  if (region.parentName) return region.parentName;
  const [city, ...countyParts] = region.name.trim().split(/\s+/);
  return countyParts.length ? city : '';
}

function getTeamRegionOptionCounty(region: { name: string; shortName?: string; parentName?: string }) {
  if (region.parentName) return region.shortName ?? region.name;
  const [city, ...countyParts] = region.name.trim().split(/\s+/);
  return countyParts.length ? countyParts.join(' ') : region.shortName ?? city;
}

function buildPayload(draft: TeamDraft, sportId: string, regionId: string, joinPolicy: 'approval_required' | 'closed'): V1TeamMutationPayload | null {
  if (!sportId || !regionId || !draft.name.trim()) return null;
  const [minLevelText, maxLevelText] = parseDraftLevelRange(draft.level);
  return {
    sportId,
    regionId,
    name: draft.name.trim(),
    logoUrl: draft.logoUrl || null,
    coverImageUrl: draft.coverImageUrl || null,
    introduction: draft.description.trim() || null,
    activityAreaText: draft.activityMemo.trim() || null,
    activityDays: draft.activityDays,
    activityFrequency: draft.activityFrequency || null,
    activityTimeSlots: draft.activityTimeSlots,
    activityTypes: draft.activityTypes,
    activityMemo: draft.activityMemo.trim() || null,
    skillLevelText: draft.level.trim() || null,
    minLevelCode: minLevelText ? labelToLevelCode(minLevelText) : null,
    maxLevelCode: maxLevelText ? labelToLevelCode(maxLevelText) : null,
    genderRule: normalizeGenderRule(draft.genderRule),
    joinPolicy,
    memberGoalCount: Number(draft.capacity) || null,
  };
}

function isUnsupportedActivityFieldsError(err: unknown) {
  if (!(err instanceof V1ApiError) || err.code !== 'VALIDATION_ERROR') return false;
  const details = JSON.stringify(err.details ?? '');
  return ['activityDays', 'activityFrequency', 'activityTimeSlots', 'activityTypes', 'activityMemo'].some((field) => details.includes(field));
}

function toLegacyActivityPayload<T extends V1TeamMutationPayload>(payload: T, draft: TeamDraft): T {
  const {
    activityDays: _activityDays,
    activityFrequency: _activityFrequency,
    activityTimeSlots: _activityTimeSlots,
    activityTypes: _activityTypes,
    activityMemo: _activityMemo,
    ...legacyPayload
  } = payload;

  return {
    ...legacyPayload,
    activityAreaText: formatLegacyActivitySummary(draft),
  } as T;
}

function formatLegacyActivitySummary(draft: TeamDraft) {
  const parts = [
    formatActivityDays(draft.activityDays),
    formatActivityLabels(draft.activityTimeSlots, {
      morning: '오전',
      lunch: '점심',
      afternoon: '오후',
      evening: '저녁',
      late_night: '심야',
    }).join('/'),
    draft.activityFrequency
      ? ({
          weekly_1: '주 1회',
          weekly_2: '주 2회',
          weekly_3: '주 3회',
          weekly_4_plus: '주 4회 이상',
          biweekly_1: '격주 1회',
          irregular: '비정기',
        } as Record<string, string>)[draft.activityFrequency]
      : null,
    formatActivityLabels(draft.activityTypes, {
      regular_meetup: '정기 모임',
      friendly_match: '친선 경기',
      team_match: '팀매치',
      tournament_prep: '대회 준비',
      training: '훈련/레슨',
      free_participation: '자유 참여',
      beginner_friendly: '초보 환영',
      competitive: '실력 중심',
    }).join('/'),
    draft.activityMemo.trim(),
  ].filter(Boolean);

  return parts.join(' · ').slice(0, 500) || null;
}

function normalizeHydratedActivityMemo(profile: {
  activityAreaText?: string | null;
  activityDays?: string[] | null;
  activityFrequency?: string | null;
  activityTimeSlots?: string[] | null;
  activityTypes?: string[] | null;
  activityMemo?: string | null;
}) {
  const memo = profile.activityMemo ?? profile.activityAreaText ?? '';
  const hasStructuredValues = Boolean(
    profile.activityDays?.length ||
    profile.activityFrequency ||
    profile.activityTimeSlots?.length ||
    profile.activityTypes?.length,
  );
  if (hasStructuredValues) return memo;
  return extractMemoFromLegacyActivitySummary(memo);
}

function extractMemoFromLegacyActivitySummary(value: string) {
  const parts = value.split(' · ').map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return value;

  const last = parts[parts.length - 1];
  return isKnownActivitySummaryPart(last) ? '' : last;
}

function isKnownActivitySummaryPart(value: string) {
  const known = new Set([
    '매일',
    '평일',
    '주말',
    '오전',
    '점심',
    '오후',
    '저녁',
    '심야',
    '주 1회',
    '주 2회',
    '주 3회',
    '주 4회 이상',
    '격주 1회',
    '비정기',
    '정기 모임',
    '친선 경기',
    '팀매치',
    '대회 준비',
    '훈련/레슨',
    '자유 참여',
    '초보 환영',
    '실력 중심',
  ]);
  if (known.has(value)) return true;
  return value.split(/[·/]/).map((part) => part.trim()).filter(Boolean).every((part) => known.has(part));
}

function formatActivityDays(days: string[]) {
  const ordered = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter((day) => days.includes(day));
  if (ordered.length === 7) return '매일';
  if (ordered.join(',') === 'mon,tue,wed,thu,fri') return '평일';
  if (ordered.join(',') === 'sat,sun') return '주말';
  return formatActivityLabels(ordered, { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' }).join('·');
}

function formatActivityLabels(values: string[], labels: Record<string, string>) {
  return values.map((value) => labels[value]).filter(Boolean);
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
