'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useV1CancelMatch,
  useV1CreateMatch,
  useV1MasterRegions,
  useV1MasterSports,
  useV1MatchEdit,
  useV1UpdateMatch,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import { labelToLevelCode } from '@/lib/v1-levels';
import { toDistrictRegionOptions } from '@/lib/v1-regions';
import type { V1MatchEdit, V1MatchMutationPayload } from '@/types/api';
import { MatchCreatePageView } from './matches-page';
import type { MatchCreateStep, MatchCreateViewModel } from './matches.types';
import { getMatchCreateViewModel } from './matches.view-model';

const storageKey = 'teameet:v1:match-draft';
const defaultGenderRule = '성별 무관';

type MatchDraft = MatchCreateViewModel['draft'];

export function MatchCreatePageClient({ step }: { step: Exclude<MatchCreateStep, 'edit'> }) {
  const router = useRouter();
  const sports = useV1MasterSports();
  const regions = useV1MasterRegions();
  const createMatch = useV1CreateMatch();
  const uploadImages = useV1UploadImages();
  const [draft, setDraft] = usePersistedDraft();
  const [selectedSportId, setSelectedSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSportId && sports.data?.[0]) setSelectedSportId(sports.data[0].id);
  }, [selectedSportId, sports.data]);

  const regionOptions = toDistrictRegionOptions(regions.data ?? []);

  useEffect(() => {
    if (!regionId && regionOptions[0]) setRegionId(regionOptions[0].id);
  }, [regionId, regionOptions]);

  const model = buildCreateModel({
    step,
    draft,
    selectedSportId,
    regionId,
    sports: sports.data?.map((sport) => ({ id: sport.id, name: sport.name })) ?? [],
    regions: regionOptions,
    error,
    submitting: createMatch.isPending,
    onSelectSport: (sportName) => {
      const sport = sports.data?.find((item) => item.name === sportName);
      if (sport) setSelectedSportId(sport.id);
    },
    onFieldChange: (field, value) => setDraft((current) => ({ ...current, [field]: value })),
    onRegionChange: setRegionId,
    onBack: () => router.push(previousCreateHref(step)),
    onNext: () => router.push(nextCreateHref(step)),
    uploadImage: async (file: File) => {
      const result = await uploadImages.mutateAsync([file]);
      const url = result.urls[0];
      if (!url) throw new Error('이미지 URL을 받지 못했어요. 다시 시도해 주세요.');
      return url;
    },
    onSubmit: () => {
      setError(null);
      const payload = buildPayload(draft, selectedSportId, regionId);
      if (!payload) {
        setError('종목, 지역, 제목, 장소, 날짜를 모두 입력해 주세요.');
        return;
      }
      createMatch.mutate(payload, {
        onSuccess: (result) => {
          window.localStorage.setItem('teameet:v1:last-match-id', result.matchId);
          window.localStorage.removeItem(storageKey);
          router.push(result.detailRoute || `/matches/${result.matchId}`);
        },
        onError: (err) => setError(err instanceof Error ? err.message : '매치를 만들지 못했어요. 다시 시도해 주세요.'),
      });
    },
  });

  return <MatchCreatePageView model={model} />;
}

export function MatchEditPageClient({ matchId }: { matchId: string }) {
  const router = useRouter();
  const editQuery = useV1MatchEdit(matchId);
  const updateMatch = useV1UpdateMatch(matchId);
  const cancelMatch = useV1CancelMatch(matchId);
  const uploadImages = useV1UploadImages();
  const [draft, setDraft] = useState<MatchDraft>(() => buildDefaultDraft());
  const [selectedSportId, setSelectedSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editQuery.data) return;
    const hydrated = draftFromEdit(editQuery.data);
    setDraft(hydrated);
    setSelectedSportId(editQuery.data.form.sportId);
    setRegionId(editQuery.data.form.regionId ?? '');
    setVersion(editQuery.data.version);
  }, [editQuery.data]);

  const model = buildCreateModel({
    step: 'edit',
    draft,
    selectedSportId,
    regionId,
    sports: editQuery.data ? [{ id: editQuery.data.form.sportId, name: '현재 종목' }] : [],
    regions: editQuery.data?.form.regionId ? [{ id: editQuery.data.form.regionId, name: '현재 지역' }] : [],
    error: editQuery.isError ? '수정 권한이 없거나 매치를 불러오지 못했어요.' : error,
    lockedReason: editQuery.data?.editable === false ? editQuery.data.lockedReason ?? '지금은 수정할 수 없어요.' : null,
    submitting: updateMatch.isPending || cancelMatch.isPending || editQuery.isLoading,
    onSelectSport: () => undefined,
    onFieldChange: (field, value) => setDraft((current) => ({ ...current, [field]: value })),
    onRegionChange: setRegionId,
    onBack: () => router.push(`/matches/${matchId}`),
    onNext: () => undefined,
    uploadImage: async (file: File) => {
      const result = await uploadImages.mutateAsync([file]);
      const url = result.urls[0];
      if (!url) throw new Error('이미지 URL을 받지 못했어요. 다시 시도해 주세요.');
      return url;
    },
    onSubmit: () => {
      setError(null);
      const payload = buildPayload(draft, selectedSportId, regionId);
      if (!payload || !version) {
        setError('수정에 필요한 정보가 빠져 있어요. 다시 확인해 주세요.');
        return;
      }
      updateMatch.mutate(
        { ...payload, version },
        {
          onSuccess: (result) => router.push(result.detailRoute || `/matches/${matchId}`),
          onError: (err) => setError(err instanceof Error ? err.message : '매치를 수정하지 못했어요. 다시 시도해 주세요.'),
        },
      );
    },
    onCancel: () => {
      setError(null);
      cancelMatch.mutate(
        { reason: 'host_cancelled_from_v1_web' },
        {
          onSuccess: () => router.push(`/matches/${matchId}`),
          onError: (err) => setError(err instanceof Error ? err.message : '매치를 취소하지 못했어요. 다시 시도해 주세요.'),
        },
      );
    },
    submitLabel: '변경사항 저장',
  });

  return <MatchCreatePageView model={model} />;
}

function buildCreateModel({
  step,
  draft,
  selectedSportId,
  regionId,
  sports,
  regions,
  error,
  lockedReason,
  submitting,
  onSelectSport,
  onFieldChange,
  onRegionChange,
  onBack,
  onNext,
  onSubmit,
  onCancel,
  uploadImage,
  submitLabel,
}: {
  step: MatchCreateStep;
  draft: MatchDraft;
  selectedSportId: string;
  regionId: string;
  sports: Array<{ id: string; name: string }>;
  regions: Array<{ id: string; name: string }>;
  error?: string | null;
  lockedReason?: string | null;
  submitting?: boolean;
  onSelectSport: (sportName: string) => void;
  onFieldChange: (field: keyof MatchDraft, value: string | number) => void;
  onRegionChange: (regionId: string) => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onCancel?: () => void;
  uploadImage?: (file: File) => Promise<string>;
  submitLabel?: string;
}): MatchCreateViewModel {
  const fallback = getMatchCreateViewModel(step);
  const sportNames = sports.length ? sports.map((sport) => sport.name) : fallback.sports;
  const selectedSport = sports.find((sport) => sport.id === selectedSportId)?.name ?? fallback.selectedSport;

  return {
    ...fallback,
    selectedSport,
    sports: sportNames,
    draft,
    form: {
      selectedSportId,
      regionId,
      regions,
      onSelectSport,
      onFieldChange,
      onRegionChange,
      onBack,
      onNext,
      onSubmit,
      onCancel,
      uploadImage,
      submitLabel,
      submitting,
      error,
      lockedReason,
    },
  };
}

function usePersistedDraft() {
  const [draft, setDraft] = useState<MatchDraft>(() => buildDefaultDraft());

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;
    try {
      setDraft({ ...buildDefaultDraft(), ...normalizeStoredDraft(JSON.parse(stored) as Partial<MatchDraft>) });
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft]);

  return [draft, setDraft] as const;
}

function buildDefaultDraft(): MatchDraft {
  return {
    ...getMatchCreateViewModel('info').draft,
    date: '',
    startTime: '',
    endTime: '',
    deadlineDate: '',
    deadlineTime: '',
  };
}

function normalizeStoredDraft(stored: Partial<MatchDraft>): Partial<MatchDraft> {
  const oldDefaults = {
    title: '주말 풋살 초보 환영 매치',
    description: '초보도 편하게 참여할 수 있는 주말 풋살 매치입니다.',
    rules: '풋살화 착용, 지각 시 미리 연락',
    venue: '안양천 풋살장',
    address: '서울 양천구 안양천로 939',
    date: toDateInput(new Date(new Date().setDate(new Date().getDate() + 7))),
    startTime: '18:00',
    endTime: '20:00',
    minLevel: '초보',
    maxLevel: '중수',
  };

  return {
    ...stored,
    title: stored.title === oldDefaults.title ? '' : stored.title,
    description: stored.description === oldDefaults.description ? '' : stored.description,
    rules: stored.rules === oldDefaults.rules ? '' : stored.rules,
    venue: stored.venue === oldDefaults.venue ? '' : stored.venue,
    address: stored.address === oldDefaults.address ? '' : stored.address,
    date: stored.date === oldDefaults.date ? '' : stored.date,
    startTime: stored.startTime === oldDefaults.startTime ? '' : stored.startTime,
    endTime: stored.endTime === oldDefaults.endTime ? '' : stored.endTime,
    minLevel: stored.minLevel === oldDefaults.minLevel ? undefined : stored.minLevel,
    maxLevel: stored.maxLevel === oldDefaults.maxLevel ? undefined : stored.maxLevel,
  };
}

function draftFromEdit(edit: V1MatchEdit): MatchDraft {
  const start = new Date(edit.form.startsAt);
  const end = edit.form.endsAt ? new Date(edit.form.endsAt) : null;
  const deadline = edit.form.deadlineAt ? new Date(edit.form.deadlineAt) : null;

  return {
    ...buildDefaultDraft(),
    title: edit.form.title,
    description: edit.form.description ?? '',
    image: edit.form.imageUrl ?? buildDefaultDraft().image,
    capacity: edit.form.capacity,
    rules: edit.form.rulesText ?? '',
    gender: normalizeGenderRule(edit.form.genderRule),
    minLevel: levelCodeToDraftLabel(edit.form.minLevelCode) ?? buildDefaultDraft().minLevel,
    maxLevel: levelCodeToDraftLabel(edit.form.maxLevelCode) ?? buildDefaultDraft().maxLevel,
    venue: edit.form.manualPlaceName,
    address: edit.form.addressText ?? '',
    date: toDateInput(start),
    startTime: toTimeInput(start),
    endTime: end ? toTimeInput(end) : toTimeInput(start),
    deadlineDate: deadline ? toDateInput(deadline) : '',
    deadlineTime: deadline ? toTimeInput(deadline) : '',
  };
}

function buildPayload(draft: MatchDraft, sportId: string, regionId: string): V1MatchMutationPayload | null {
  if (!sportId || !regionId || !draft.title.trim() || !draft.venue.trim() || !draft.date || !draft.startTime) return null;

  const startsAt = new Date(`${draft.date}T${draft.startTime}:00`);
  const endsAt = draft.endTime ? new Date(`${draft.date}T${draft.endTime}:00`) : null;
  const deadlineAt = draft.deadlineDate && draft.deadlineTime ? new Date(`${draft.deadlineDate}T${draft.deadlineTime}:00`) : null;
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) return null;
  if (deadlineAt && (Number.isNaN(deadlineAt.getTime()) || deadlineAt >= startsAt)) return null;

  return {
    sportId,
    regionId,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    imageUrl: draft.image || null,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt && endsAt > startsAt ? endsAt.toISOString() : null,
    deadlineAt: deadlineAt ? deadlineAt.toISOString() : null,
    capacity: Math.max(Number(draft.capacity) || 2, 2),
    manualPlaceName: draft.venue.trim(),
    addressText: draft.address.trim() || null,
    rulesText: draft.rules.trim() || null,
    minLevelCode: labelToLevelCode(draft.minLevel),
    maxLevelCode: labelToLevelCode(draft.maxLevel),
    genderRule: normalizeGenderRule(draft.gender),
  };
}

function levelCodeToDraftLabel(code?: string | null) {
  if (code === 'beginner') return '입문';
  if (code === 'novice') return '초보';
  if (code === 'intermediate') return '중수';
  if (code === 'advanced') return '고수';
  return null;
}

function normalizeGenderRule(value?: string | null) {
  if (value === '남' || value === '여') return value;
  return defaultGenderRule;
}

function previousCreateHref(step: MatchCreateStep) {
  if (step === 'sport') return '/matches';
  if (step === 'info') return '/matches/new/sport';
  if (step === 'place-time') return '/matches/new';
  return '/matches/new/place-time';
}

function nextCreateHref(step: MatchCreateStep) {
  if (step === 'sport') return '/matches/new';
  if (step === 'info') return '/matches/new/place-time';
  return '/matches/new/confirm';
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toTimeInput(date: Date) {
  return date.toTimeString().slice(0, 5);
}
