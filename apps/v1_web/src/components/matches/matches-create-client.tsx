'use client';

import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useRouter } from 'next/navigation';
import {
  useV1CancelMatch,
  useV1CreateMatch,
  useV1MasterRegions,
  useV1MasterSports,
  useV1MatchEdit,
  useV1MyRecentVenues,
  useV1UpdateMatch,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import { trackEvent } from '@/lib/analytics';
import { clearExpiringDraft, readExpiringDraft, writeExpiringDraft } from '@/lib/expiring-draft';
import { getCreatorProfilePrompt, profileEditHref } from '@/lib/creator-profile';
import { toDistrictRegionOptions } from '@/lib/v1-regions';
import { lockedReasonLabel } from '@/lib/v1-status-labels';
import type { V1MatchEdit } from '@/types/api';
import { MatchCreatePageView } from './matches-page';
import type { MatchCreateStep, MatchCreateViewModel } from './matches.types';
import {
  buildMatchPayloadResult,
  getCompleteMatchSteps,
  getMatchMissingFields,
  getMatchStepErrors,
  normalizeGenderRule,
  toFieldErrorMap,
} from './matches.validation';
import { getMatchCreateViewModel } from './matches.view-model';

const CREATE_STEP_ORDER: MatchCreateStep[] = ['sport', 'info', 'place-time'];

const storageKey = 'teameet:v1:match-draft';
const selectionKey = 'teameet:v1:match-selection';

type MatchDraft = MatchCreateViewModel['draft'];
type MatchSelection = { sportId: string; regionId: string };

export function MatchCreatePageClient({ step }: { step: Exclude<MatchCreateStep, 'edit'> }) {
  const router = useRouter();
  const { confirm, ConfirmModal } = useConfirm();
  const sports = useV1MasterSports();
  const regions = useV1MasterRegions();
  const createMatch = useV1CreateMatch();
  const uploadImages = useV1UploadImages();
  const recentVenues = useV1MyRecentVenues();
  const [draft, setDraft] = usePersistedDraft();
  // 위저드 step이 각각 별도 라우트라 step 이동 시 이 컴포넌트가 재마운트된다. 종목/지역 선택을
  // 로컬 useState에만 두면 매 step 첫 항목으로 리셋돼(풋살 선택→다음 step에서 축구로 소실)
  // 잘못된 종목/지역으로 매치가 생성된다. draft와 동일하게 localStorage에 영속한다.
  const [selection, setSelection] = useState<MatchSelection>({ sportId: '', regionId: '' });
  const [selectionHydrated, setSelectionHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "다음"/"매치 만들기"를 한 번이라도 눌러본 뒤에만 인라인 에러를 보여준다 — 진입하자마자
  // 빈 칸을 전부 orange로 물들이지 않기 위함(스텝별로 별도 라우트라 매 스텝 마운트 시 초기화됨).
  const [attempted, setAttempted] = useState(false);
  const [pendingFocusField, setPendingFocusField] = useState<string | null>(null);

  const regionOptions = toDistrictRegionOptions(regions.data ?? []);

  // 마스터 데이터 준비 후 1회 hydrate: 저장된 선택이 유효하면 우선, 없으면 첫 항목 기본값.
  useEffect(() => {
    if (selectionHydrated || !sports.data || regionOptions.length === 0) return;
    // 만료됐거나 깨진 값은 readExpiringDraft가 지우고 null을 준다 → 아래 기본값(첫 항목)으로
    // 시작한다. 예전에는 만료가 없어 지난번 종목·지역이 새 작성에 그대로 복원됐다.
    const stored = readExpiringDraft<{ sportId?: string; regionId?: string }>(selectionKey) ?? {};
    const sportId =
      stored.sportId && sports.data.some((item) => item.id === stored.sportId)
        ? stored.sportId
        : sports.data[0]?.id ?? '';
    const regionId =
      stored.regionId && regionOptions.some((item) => item.id === stored.regionId)
        ? stored.regionId
        : regionOptions[0]?.id ?? '';
    setSelection({ sportId, regionId });
    setSelectionHydrated(true);
  }, [sports.data, regionOptions, selectionHydrated]);

  // hydrate 이후 선택 변경을 영속(다음 step 재마운트에서 복원).
  useEffect(() => {
    if (!selectionHydrated) return;
    writeExpiringDraft(selectionKey, selection);
  }, [selection, selectionHydrated]);

  const selectedSportId = selection.sportId;
  const regionId = selection.regionId;
  const updateSelection = (updater: (current: MatchSelection) => MatchSelection) => {
    setSelection((current) => {
      const next = updater(current);
      writeExpiringDraft(selectionKey, next);
      return next;
    });
  };

  // #1·#2 결정의 공유 소스: 이 ctx로 스텝 게이팅과 최종 제출 결측 필드 안내를 둘 다 계산한다.
  const validationCtx = { sportId: selectedSportId, regionId, draft };
  const fieldErrors = attempted ? getMatchStepErrors(validationCtx, step) : {};
  const missingFields = attempted && step === 'confirm' ? getMatchMissingFields(validationCtx) : [];
  const completeSteps = getCompleteMatchSteps(validationCtx, CREATE_STEP_ORDER);

  useEffect(() => {
    if (!pendingFocusField) return;
    const el = document.getElementById(`field-${pendingFocusField}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus({ preventScroll: true });
    }
    setPendingFocusField(null);
  }, [pendingFocusField]);

  const model = buildCreateModel({
    step,
    draft,
    selectedSportId,
    regionId,
    sports: sports.data?.map((sport) => ({ id: sport.id, name: sport.name })) ?? [],
    regions: regionOptions,
    error,
    fieldErrors,
    missingFields: missingFields.length > 0 ? missingFields : undefined,
    completeSteps,
    recentVenues: recentVenues.data?.items,
    submitting: createMatch.isPending,
    onSelectSport: (sportName) => {
      const sport = sports.data?.find((item) => item.name === sportName);
      if (sport) updateSelection((current) => ({ ...current, sportId: sport.id }));
    },
    onFieldChange: (field, value) => setDraft((current) => ({ ...current, [field]: value })),
    onRegionChange: (value) => updateSelection((current) => ({ ...current, regionId: value })),
    onBack: () => router.push(previousCreateHref(step)),
    onNext: () => {
      // #1: "다음"은 절대 disabled 처리하지 않는다 — 대신 클릭 시 이 스텝의 필수 필드만 로컬
      // 검증해 비어 있으면 이동을 막고, 인라인 에러 + 첫 invalid 필드로 focus를 옮긴다.
      const errors = getMatchStepErrors(validationCtx, step);
      const firstInvalidField = Object.keys(errors)[0];
      if (firstInvalidField) {
        setAttempted(true);
        setPendingFocusField(firstInvalidField);
        return;
      }
      router.push(nextCreateHref(step));
    },
    uploadImage: async (file: File) => {
      const result = await uploadImages.mutateAsync([file]);
      const url = result.urls[0];
      if (!url) throw new Error('이미지 URL을 받지 못했어요. 다시 시도해 주세요.');
      return url;
    },
    onSubmit: () => {
      // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
      // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
      // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
      if (createMatch.isPending) return;
      setError(null);
      const payloadResult = buildMatchPayloadResult(draft, selectedSportId, regionId);
      if (payloadResult.missingFields) {
        // #2: 하드코딩된 고정 문구 대신 실제 결측 필드만 지목 — model.form.missingFields로 전달되고
        // ConfirmStep이 각 항목을 해당 스텝 링크와 함께 렌더링한다.
        setAttempted(true);
        return;
      }
      createMatch.mutate(payloadResult.payload, {
        onSuccess: (result) => {
          window.localStorage.setItem('teameet:v1:last-match-id', result.matchId);
          clearExpiringDraft(storageKey);
          clearExpiringDraft(selectionKey);
          trackEvent('match_create_complete', {
            sportType: sports.data?.find((sport) => sport.id === selectedSportId)?.name ?? '',
          });
          router.push(result.detailRoute || `/matches/${result.matchId}`);
        },
        onError: (err) => {
          const prompt = getCreatorProfilePrompt(err, '매치');
          if (prompt) {
            setError(prompt);
            void confirm({
              title: '프로필 정보가 필요해요',
              message: prompt,
              confirmLabel: '프로필 수정',
            }).then((ok) => {
              if (ok) router.push(profileEditHref('/matches/new/confirm'));
            });
            return;
          }
          setError(err instanceof Error ? err.message : '매치를 만들지 못했어요. 다시 시도해 주세요.');
        },
      });
    },
  });

  return (
    <>
      <MatchCreatePageView model={model} />
      {ConfirmModal}
    </>
  );
}

export function MatchEditPageClient({ matchId }: { matchId: string }) {
  const router = useRouter();
  const { confirm, ConfirmModal } = useConfirm();
  const editQuery = useV1MatchEdit(matchId);
  const sports = useV1MasterSports();
  const regions = useV1MasterRegions();
  const updateMatch = useV1UpdateMatch(matchId);
  const cancelMatch = useV1CancelMatch(matchId);
  const uploadImages = useV1UploadImages();
  const [draft, setDraft] = useState<MatchDraft>(() => buildDefaultDraft());
  const [selectedSportId, setSelectedSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  // "변경사항 저장"을 한 번이라도 눌러본 뒤에만 인라인 에러를 보여준다(#1과 동일한 UX 원칙).
  const [editAttempted, setEditAttempted] = useState(false);
  const sportOptions = sports.data?.map((sport) => ({ id: sport.id, name: sport.name }))
    ?? (editQuery.data ? [{ id: editQuery.data.form.sportId, name: '현재 종목' }] : []);
  const regionOptions = toDistrictRegionOptions(regions.data ?? []);
  const editRegionOptions = regionOptions.length > 0
    ? regionOptions
    : editQuery.data?.form.regionId
      ? [{ id: editQuery.data.form.regionId, name: '현재 지역' }]
      : [];

  useEffect(() => {
    if (!editQuery.data) return;
    const hydrated = draftFromMatchEdit(editQuery.data);
    setDraft(hydrated);
    setSelectedSportId(editQuery.data.form.sportId);
    setRegionId(editQuery.data.form.regionId ?? '');
    setVersion(editQuery.data.version);
  }, [editQuery.data]);

  // #2: edit 화면은 스텝 구분이 없는 한 화면이라 getMatchMissingFields 를 그대로
  // 평탄화(toFieldErrorMap)해서 각 CreateField 아래 인라인 에러로 붙인다.
  const editCtx = { sportId: selectedSportId, regionId, draft };
  const editMissingFields = editAttempted ? getMatchMissingFields(editCtx) : [];
  const editFieldErrors = toFieldErrorMap(editMissingFields);

  const model = buildCreateModel({
    step: 'edit',
    matchId,
    draft,
    selectedSportId,
    regionId,
    sports: sportOptions,
    regions: editRegionOptions,
    error: editQuery.isError ? '수정 권한이 없거나 매치를 불러오지 못했어요.' : error,
    lockedReason: editQuery.data?.editable === false ? lockedReasonLabel(editQuery.data.lockedReason ?? '') : null,
    submitting: updateMatch.isPending || cancelMatch.isPending || editQuery.isLoading,
    fieldErrors: editFieldErrors,
    onSelectSport: (sportName) => {
      const sport = sportOptions.find((item) => item.name === sportName);
      if (sport) setSelectedSportId(sport.id);
    },
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
      // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
      // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
      // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
      if (updateMatch.isPending || cancelMatch.isPending) return;
      setError(null);
      const payloadResult = buildMatchPayloadResult(draft, selectedSportId, regionId);
      if (payloadResult.missingFields || !version) {
        // #2: 실제 결측 필드만 지목 — 각 CreateField 아래 인라인 에러로 표시되고,
        // 상단 배너는 몇 개가 비어 있는지만 간단히 안내한다(중복 문구 방지).
        setEditAttempted(true);
        setError(
          payloadResult.missingFields
            ? `${payloadResult.missingFields.length}개 항목을 확인해 주세요.`
            : '수정에 필요한 정보가 빠져 있어요. 다시 확인해 주세요.',
        );
        return;
      }
      updateMatch.mutate(
        { ...payloadResult.payload, version },
        {
          onSuccess: (result) => router.push(result.detailRoute || `/matches/${matchId}`),
          onError: (err) => setError(err instanceof Error ? err.message : '매치를 수정하지 못했어요. 다시 시도해 주세요.'),
        },
      );
    },
    onCancel: async () => {
      if (updateMatch.isPending || cancelMatch.isPending) return;
      // 되돌리는 API가 없는 파괴적 동작 — 신청자 전원이 cancelled_by_host로 넘어가고
      // 알림도 나간다. '변경사항 저장' 바로 아래 붙은 버튼이라 오탭 가능성이 높으므로
      // 확인 없이 즉시 실행하지 않는다.
      const ok = await confirm({
        title: '매치를 취소할까요?',
        message: '취소하면 되돌릴 수 없어요. 신청자 전원의 참가가 취소되고 취소 알림이 발송돼요.',
        confirmLabel: '매치 취소',
        tone: 'danger',
      });
      if (!ok) return;
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

  return (
    <>
      <MatchCreatePageView model={model} />
      {ConfirmModal}
    </>
  );
}

function buildCreateModel({
  step,
  matchId,
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
  fieldErrors,
  missingFields,
  completeSteps,
  recentVenues,
}: {
  step: MatchCreateStep;
  matchId?: string;
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
  /** #1·#2: 스텝별 즉시 검증(create)과 결측 필드 안내(create/edit)가 공유하는 필드 → 문구 맵. */
  fieldErrors?: Partial<Record<string, string>>;
  /** #2: confirm(create)/edit 제출 시도에서 실제로 비어 있는 필드 — ConfirmStep 배너가 렌더. */
  missingFields?: NonNullable<MatchCreateViewModel['form']>['missingFields'];
  /** CreateProgress 체크 배지 — 이 스텝들의 필수 필드는 이미 다 채워졌다는 뜻. */
  completeSteps?: MatchCreateStep[];
  /** #3 1단계: 장소 입력창 포커스 시 칩으로 노출할 최근 사용 장소. */
  recentVenues?: NonNullable<MatchCreateViewModel['form']>['recentVenues'];
}): MatchCreateViewModel {
  const fallback = getMatchCreateViewModel(step);
  const sportNames = sports.map((sport) => sport.name);
  const selectedSport = sports.find((sport) => sport.id === selectedSportId)?.name ?? '';

  return {
    ...fallback,
    matchId,
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
      fieldErrors,
      missingFields,
      completeSteps,
      recentVenues,
    },
  };
}

function usePersistedDraft() {
  const [draft, setDraft] = useState<MatchDraft>(() => buildDefaultDraft());
  const draftRef = useRef(draft);

  useEffect(() => {
    // 하루가 지난 드래프트는 readExpiringDraft가 알아서 버린다 — 예전에는 만료가 없어
    // 며칠 전 작성하다 만 내용이 새 매치 작성 화면에 그대로 되살아났다.
    const stored = readExpiringDraft<Partial<MatchDraft>>(storageKey);
    if (stored === null) return;
    const hydrated = { ...buildDefaultDraft(), ...normalizeStoredDraft(stored) };
    draftRef.current = hydrated;
    setDraft(hydrated);
  }, []);

  const setPersistedDraft = (action: SetStateAction<MatchDraft>) => {
    const next = typeof action === 'function' ? action(draftRef.current) : action;
    // React state updater도 route 이동 뒤로 지연될 수 있으므로 ref에서 즉시 계산·저장한 뒤
    // 화면 상태를 갱신한다. 그래야 마지막 입력 직후 다음 step으로 이동해도 값이 보존된다.
    draftRef.current = next;
    writeExpiringDraft(storageKey, next);
    setDraft(next);
  };

  return [draft, setPersistedDraft] as const;
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
    description: '초보도 편하게 참여할 수 있는 주말 풋살 매치예요.',
    rules: '풋살화 착용, 지각 시 미리 연락',
    venue: '안양천 풋살장',
    address: '서울 양천구 안양천로 939',
    date: toDateInput(new Date(new Date().setDate(new Date().getDate() + 7))),
    startTime: '18:00',
    endTime: '20:00',
    minLevel: '초보',
    maxLevel: '중수',
  };

  const isLegacySample =
    stored.title === oldDefaults.title &&
    stored.description === oldDefaults.description &&
    stored.rules === oldDefaults.rules &&
    stored.venue === oldDefaults.venue &&
    stored.address === oldDefaults.address &&
    stored.date === oldDefaults.date &&
    stored.startTime === oldDefaults.startTime &&
    stored.endTime === oldDefaults.endTime;

  if (!isLegacySample) return stored;

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

export function draftFromMatchEdit(edit: V1MatchEdit): MatchDraft {
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

function levelCodeToDraftLabel(code?: string | null) {
  if (code === 'beginner') return '입문';
  if (code === 'novice') return '초보';
  if (code === 'intermediate') return '중수';
  if (code === 'advanced') return '고수';
  return null;
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

// toISOString()은 UTC 기준이라 toTimeInput()(로컬 기준)과 섞어 쓰면 KST 00:00~08:59 시작
// 매치를 수정 화면에서 열 때 날짜만 하루 앞으로 밀린다(2026-08-27 감사
// M-A-personal-match-state) — 날짜도 로컬 기준으로 뽑아 시간과 같은 기준시를 쓰게 한다.
function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimeInput(date: Date) {
  return date.toTimeString().slice(0, 5);
}
