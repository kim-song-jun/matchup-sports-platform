'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { ChevronLeftIcon } from '@/components/v1-ui/icons';
import { onboardingStepLabel } from '@/lib/v1-status-labels';
import {
  useV1CompleteOnboarding,
  useV1DeferOnboarding,
  useV1MasterRegions,
  useV1MasterSports,
  useV1Onboarding,
  useV1ResolveLocation,
  useV1SaveOnboardingPreferences,
} from '@/hooks/use-v1-api';
import { toDistrictRegionOptions } from '@/lib/v1-regions';
import type { V1OnboardingPreferencePayload, V1OnboardingStep } from '@/types/api';
import { AuthFrame } from './auth-page';

type OnboardingRouteStep = 'resume' | Extract<V1OnboardingStep, 'sport' | 'level' | 'region' | 'confirm'>;

type OnboardingDraft = {
  sports: Array<{ sportId: string; levelId: string | null }>;
  regions: Array<{ regionId: string; primary: boolean }>;
  currentLocation?: CurrentLocationDraft | null;
};

type CurrentLocationDraft = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  capturedAt: string;
  matchedRegionId?: string | null;
  matchedRegionName?: string | null;
};

type LocationStatus = 'idle' | 'requesting' | 'allowed' | 'denied' | 'unsupported' | 'unmatched';

const draftKey = 'teameet.v1.onboardingDraft';

const stepMeta: Record<OnboardingRouteStep, { stepNo: number; title: string; sub: string }> = {
  resume: {
    stepNo: 0,
    title: '운동 설정을 이어갈까요?',
    sub: '저장된 선택값을 불러와 완료하지 않은 단계부터 다시 시작해요.',
  },
  sport: {
    stepNo: 1,
    title: '관심 종목을 선택해 주세요',
    sub: '선택한 종목을 기준으로 다음 실력 입력 단계가 구성돼요.',
  },
  level: {
    stepNo: 2,
    title: '종목별 실력을 입력해 주세요',
    sub: '무리 없는 매칭을 위해 종목마다 현재 실력을 선택해 주세요.',
  },
  region: {
    stepNo: 3,
    title: '주 활동 지역을 선택해 주세요',
    sub: '위치 권한 없어도 괜찮아요. 아래에서 지역을 직접 고르거나 건너뛸 수 있어요.',
  },
  confirm: {
    stepNo: 4,
    title: '준비가 끝났어요',
    sub: '선택한 종목, 실력, 지역을 기준으로 홈 추천과 필터가 시작돼요.',
  },
};

export function OnboardingClient({ step }: { step: OnboardingRouteStep }) {
  const router = useRouter();
  const onboarding = useV1Onboarding();
  const sportsQuery = useV1MasterSports();
  const regionsQuery = useV1MasterRegions();
  const savePreferences = useV1SaveOnboardingPreferences();
  const completeOnboarding = useV1CompleteOnboarding();
  const deferOnboarding = useV1DeferOnboarding();
  const resolveLocation = useV1ResolveLocation();
  const [draft, setDraft] = useState<OnboardingDraft>({ sports: [], regions: [] });
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');

  useEffect(() => {
    if (hydrated || !onboarding.data) return;
    const stored = readDraft();
    const initial = stored ?? {
      sports: onboarding.data.sports.map((sport) => ({ sportId: sport.sportId, levelId: sport.levelId })),
      regions: onboarding.data.regions.map((region) => ({ regionId: region.regionId, primary: region.primary })),
      currentLocation: null,
    };
    setDraft(initial);
    setHydrated(true);
  }, [hydrated, onboarding.data]);

  useEffect(() => {
    if (hydrated) writeDraft(draft);
  }, [draft, hydrated]);

  // 마스터 데이터 3쿼리 중 하나라도 실패하면 빈 draft 저장 위험이 있으므로 에러 상태 분리.
  const masterError = onboarding.isError || sportsQuery.isError || regionsQuery.isError;
  const retryMasterData = () => {
    if (onboarding.isError) void onboarding.refetch();
    if (sportsQuery.isError) void sportsQuery.refetch();
    if (regionsQuery.isError) void regionsQuery.refetch();
  };

  const sports = sportsQuery.data ?? [];
  const regions = toDistrictRegionOptions(regionsQuery.data ?? []);
  const selectedSportIds = new Set(draft.sports.map((sport) => sport.sportId));
  const selectedRegionIds = new Set(draft.regions.map((region) => region.regionId));
  const missingLevels = draft.sports.some((sport) => !sport.levelId);
  const selectedSports = useMemo(
    () => draft.sports.map((item) => ({ ...item, sport: sports.find((sport) => sport.id === item.sportId) })).filter((item) => item.sport),
    [draft.sports, sports],
  );
  const pending = savePreferences.isPending || completeOnboarding.isPending || deferOnboarding.isPending;

  const saveAndGo = (currentStep: V1OnboardingPreferencePayload['currentStep'], href: string) => {
    setError(null);
    savePreferences.mutate(
      {
        sports: draft.sports,
        regions: draft.regions,
        currentStep,
        currentLocation: draft.currentLocation
          ? {
              latitude: draft.currentLocation.latitude,
              longitude: draft.currentLocation.longitude,
              accuracy: draft.currentLocation.accuracy,
              capturedAt: draft.currentLocation.capturedAt,
              matchedRegionId: draft.currentLocation.matchedRegionId ?? null,
            }
          : null,
      },
      {
        onSuccess: () => router.push(href),
        onError: (nextError) => setError(getErrorMessage(nextError)),
      },
    );
  };

  const defer = () => {
    setError(null);
    deferOnboarding.mutate(
      { reason: 'later' },
      {
        onSuccess: (result) => router.replace(result.next?.route ?? '/home'),
        onError: (nextError) => setError(getErrorMessage(nextError)),
      },
    );
  };

  const complete = () => {
    setError(null);
    completeOnboarding.mutate(undefined, {
      onSuccess: (result) => {
        clearDraft();
        router.replace(result.next?.route ?? '/home');
      },
      onError: (nextError) => setError(getErrorMessage(nextError)),
    });
  };

  const requestCurrentLocation = () => {
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('unsupported');
      return;
    }

    setLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          capturedAt: new Date().toISOString(),
        };
        resolveLocation.mutate(
          { latitude: nextLocation.latitude, longitude: nextLocation.longitude },
          {
            onSuccess: (result) => {
              const matchedRegionId = result.region?.id ?? null;
              const matchedRegionName = result.region
                ? result.region.parent?.name
                  ? `${result.region.parent.name} ${result.region.name}`
                  : result.region.name
                : null;

              setDraft((current) => ({
                ...upsertPrimaryRegion(current, matchedRegionId),
                currentLocation: {
                  ...nextLocation,
                  matchedRegionId,
                  matchedRegionName,
                },
              }));
              setLocationStatus(matchedRegionId ? 'allowed' : 'unmatched');
            },
            onError: () => {
              setDraft((current) => ({
                ...current,
                currentLocation: {
                  ...nextLocation,
                  matchedRegionId: null,
                  matchedRegionName: null,
                },
              }));
              setLocationStatus('unmatched');
            },
          },
        );
      },
      () => {
        setLocationStatus('denied');
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 },
    );
  };

  const fixedAction = (
    <OnboardingFixedAction
      complete={complete}
      defer={defer}
      disabled={
        masterError ||
        pending ||
        (step === 'sport' && draft.sports.length === 0) ||
        (step === 'level' && (draft.sports.length === 0 || missingLevels))
      }
      pending={pending}
      saveAndGo={saveAndGo}
      step={step}
    />
  );

  const skipAction = step === 'region' ? defer : undefined;
  const meta = stepMeta[step];

  const backHref = getBackHref(step);
  const topTitle = step === 'resume' ? '이어하기' : '운동 설정';

  return (
    <AuthFrame
      topTitle={topTitle}
      backHref={backHref}
      fixedAction={fixedAction}
      className="tm-onboarding-frame"
    >
      {/* Desktop back-nav: replaces the hidden mobile topbar for wizard navigation.
          .tm-show-desktop is display:none on mobile, display:block at ≥1024 (see _shell.css). */}
      <div className="tm-onboarding-desktop-nav tm-show-desktop">
        {backHref ? (
          <Link className="tm-onboarding-desktop-back" href={backHref} aria-label="뒤로가기">
            <ChevronLeftIcon size={22} strokeWidth={2.2} />
          </Link>
        ) : null}
        <span className="tm-onboarding-desktop-nav-title">{topTitle}</span>
      </div>
      <div className="tm-auth-body">
        {/* 단계 전환 시 스크린리더에 현재 단계를 공지 */}
        <span
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {meta.stepNo > 0 ? `4단계 중 ${meta.stepNo}단계, ${meta.title}` : meta.title}
        </span>
        <ProgressHeader stepNo={meta.stepNo} total={4} />
        <h1 className="tm-text-heading tm-auth-heading">{meta.title}</h1>
        <p className="tm-text-body tm-auth-sub">{meta.sub}</p>
        {skipAction ? <button className="tm-btn tm-btn-sm tm-btn-ghost" disabled={pending} onClick={skipAction} type="button">나중에 설정하기</button> : null}
        {onboarding.isLoading || sportsQuery.isLoading || regionsQuery.isLoading ? <Notice title="불러오는 중" body="저장된 정보를 불러오고 있어요." /> : null}
        {/* 마스터 데이터 실패 시 빈 draft로 저장 방지 — 재시도 유도 후 저장 CTA도 disable됨 */}
        {masterError ? <ErrorState message="운동 설정 정보를 불러오지 못했어요. 다시 시도해 주세요." onRetry={retryMasterData} /> : null}
        {error ? <Notice title="저장하지 못했어요" body={error} tone="orange" /> : null}
        {step === 'resume' ? <ResumePanel onboardingStep={onboarding.data?.currentStep} draft={draft} /> : null}
        {step === 'sport' ? (
          <div className="tm-auth-sport-grid">
            {sports.map((sport) => (
              <button
                className={`tm-card tm-auth-option-card ${selectedSportIds.has(sport.id) ? 'tm-auth-option-selected' : ''}`}
                key={sport.id}
                onClick={() => setDraft((current) => toggleSport(current, sport.id))}
                type="button"
                aria-pressed={selectedSportIds.has(sport.id)}
              >
                <div className="tm-text-body-lg">{sport.name}</div>
                <div className="tm-text-caption">{selectedSportIds.has(sport.id) ? '선택됨' : '탭해서 선택'}</div>
              </button>
            ))}
          </div>
        ) : null}
        {step === 'level' ? (
          <div className="tm-auth-stack">
            {selectedSports.length === 0 ? <Notice title="종목 선택 필요" body="먼저 관심 종목을 선택해야 실력을 입력할 수 있어요." tone="orange" /> : null}
            {selectedSports.map(({ sportId, levelId, sport }) => (
              <Card key={sportId} pad={15}>
                <div className="tm-text-body-lg">{sport?.name}</div>
                <div className="tm-auth-chip-wrap" style={{ marginTop: 10 }}>
                  {(sport?.levels ?? []).map((level) => (
                    <button
                      className={`tm-chip ${levelId === level.id ? 'tm-chip-active' : ''}`}
                      key={level.id}
                      onClick={() => setDraft((current) => setSportLevel(current, sportId, level.id))}
                      type="button"
                      aria-pressed={levelId === level.id}
                    >
                      {level.name}
                    </button>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        ) : null}
        {step === 'region' ? (
          <>
            <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" disabled={locationStatus === 'requesting'} onClick={requestCurrentLocation} type="button">
              {locationStatus === 'requesting' ? '현재 위치 확인 중' : '현재 위치로 찾기'}
            </button>
            <LocationNotice location={draft.currentLocation ?? null} status={locationStatus} />
            <div className="tm-auth-chip-wrap">
              {regions.map((region) => (
                <button
                  className={`tm-chip ${selectedRegionIds.has(region.id) ? 'tm-chip-active' : ''}`}
                  key={region.id}
                  onClick={() => setDraft((current) => toggleRegion(current, region.id))}
                  type="button"
                  aria-pressed={selectedRegionIds.has(region.id)}
                >
                  {region.name}
                </button>
              ))}
        </div>
          </>
        ) : null}
        {step === 'confirm' ? <ConfirmPanel draft={draft} regions={regions} sports={sports} /> : null}
      </div>
    </AuthFrame>
  );
}

function OnboardingFixedAction({
  complete,
  defer,
  disabled,
  pending,
  saveAndGo,
  step,
}: {
  complete: () => void;
  defer: () => void;
  disabled: boolean;
  pending: boolean;
  saveAndGo: (currentStep: V1OnboardingPreferencePayload['currentStep'], href: string) => void;
  step: OnboardingRouteStep;
}) {
  if (step === 'resume') {
    /* #22: 픽셀 스페이서 div → gap으로 교체 */
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" onClick={() => saveAndGo('sport', '/onboarding/sport')} type="button">처음부터 다시 선택</button>
        <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block" onClick={() => saveAndGo('confirm', '/onboarding/confirm')} type="button">저장된 선택 확인</button>
      </div>
    );
  }

  if (step === 'sport') {
    return (
      <>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={disabled} onClick={() => saveAndGo('sport', '/onboarding/level')} type="button">{pending ? '저장 중' : '실력 입력하기'}</button>
        <div className="tm-auth-fixed-skip-row">
          <button className="tm-btn tm-btn-sm tm-btn-ghost" disabled={pending} onClick={defer} type="button">나중에 설정하기</button>
        </div>
      </>
    );
  }

  if (step === 'level') {
    return (
      <>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={disabled} onClick={() => saveAndGo('level', '/onboarding/region')} type="button">{pending ? '저장 중' : '지역 선택하기'}</button>
        <div className="tm-auth-fixed-skip-row">
          <button className="tm-btn tm-btn-sm tm-btn-ghost" disabled={pending} onClick={defer} type="button">나중에 설정하기</button>
        </div>
      </>
    );
  }

  if (step === 'region') {
    /* #22: 픽셀 스페이서 div → gap으로 교체 */
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={pending} onClick={() => saveAndGo('region', '/onboarding/confirm')} type="button">{pending ? '저장 중' : '지역 선택 완료'}</button>
        <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block" disabled={pending} onClick={defer} type="button">나중에 설정하기</button>
      </div>
    );
  }

  return <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={pending} onClick={complete} type="button">{pending ? '저장 중' : '홈으로 시작하기'}</button>;
}

function ResumePanel({ draft, onboardingStep }: { draft: OnboardingDraft; onboardingStep?: V1OnboardingStep }) {
  return (
    <div className="tm-auth-stack">
      {/* #19: 핵심 상태값은 tm-text-body(15px)로 격상, 레이블은 caption 유지 */}
      <Card pad={15}><div className="tm-text-caption">현재 단계</div><div className="tm-text-body" style={{ marginTop: 4, color: 'var(--text-strong)', fontWeight: 600 }}>{onboardingStepLabel(onboardingStep ?? 'sport')}</div></Card>
      <Card pad={15}><div className="tm-text-caption">선택한 종목</div><div className="tm-text-body" style={{ marginTop: 4, color: 'var(--text-strong)', fontWeight: 600 }}>{draft.sports.length}개</div></Card>
      <Card pad={15}><div className="tm-text-caption">선택한 지역</div><div className="tm-text-body" style={{ marginTop: 4, color: 'var(--text-strong)', fontWeight: 600 }}>{draft.regions.length ? `${draft.regions.length}개` : '선택한 지역 없음'}</div></Card>
      <Notice title="잠깐 나가도 괜찮아요" body="설정을 나가도 선택한 내용이 저장돼요. 돌아오면 멈춘 단계부터 이어서 할 수 있어요." />
    </div>
  );
}

function ConfirmPanel({ draft, regions, sports }: { draft: OnboardingDraft; regions: Array<{ id: string; name: string }>; sports: Array<{ id: string; name: string; levels: Array<{ id: string; name: string }> }> }) {
  const sportSummary = draft.sports
    .map((item) => {
      const sport = sports.find((candidate) => candidate.id === item.sportId);
      const level = sport?.levels.find((candidate) => candidate.id === item.levelId);
      return sport ? `${sport.name}${level ? ` ${level.name}` : ''}` : null;
    })
    .filter(Boolean)
    .join(' · ');
  const regionSummary = draft.regions
    .map((item) => regions.find((candidate) => candidate.id === item.regionId)?.name)
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="tm-auth-stack tm-onboarding-confirm-grid">
      {/* #19: 값(sportSummary, regionSummary)을 tm-text-body(15px/600)로 격상, 레이블은 caption 유지 */}
      <Card pad={15}><div className="tm-text-caption">관심 종목과 실력</div><div className="tm-text-body" style={{ marginTop: 4, color: 'var(--text-strong)', fontWeight: 600 }}>{sportSummary || '선택하지 않음'}</div></Card>
      <Card pad={15}><div className="tm-text-caption">활동 지역</div><div className="tm-text-body" style={{ marginTop: 4, color: 'var(--text-strong)', fontWeight: 600 }}>{regionSummary || '선택하지 않음'}</div></Card>
      {draft.currentLocation ? (
        <Card pad={15} className="tm-onboarding-confirm-full">
          <div className="tm-text-caption">현재 위치</div>
          <div className="tm-text-body" style={{ marginTop: 4, color: 'var(--text-strong)', fontWeight: 600 }}>
            {formatLocation(draft.currentLocation)}
          </div>
        </Card>
      ) : null}
      <Notice title="설정 완료" body="홈에 들어간 뒤에도 설정에서 종목, 실력, 지역을 바꿀 수 있어요." tone="green" />
    </div>
  );
}

function LocationNotice({ location, status }: { location: CurrentLocationDraft | null; status: LocationStatus }) {
  if (status === 'requesting') {
    return <Notice title="현재 위치 확인 중" body="위치 권한을 확인하고 있어요." />;
  }

  if (status === 'denied') {
    return <Notice title="위치 권한 거부" body="브라우저에서 위치 권한이 거부됐어요. 지역을 직접 선택해 계속할 수 있어요." tone="orange" />;
  }

  if (status === 'unsupported') {
    return <Notice title="위치 확인 불가" body="이 브라우저에서는 현재 위치 확인을 지원하지 않아요. 지역을 직접 선택해 주세요." tone="orange" />;
  }

  if (status === 'unmatched' && location) {
    return <Notice title="현재 위치 확인 완료" body={`${formatLocation(location)} · 지원 지역과 거리가 멀어 자동 선택하지 않았어요.`} tone="orange" />;
  }

  if (location) {
    return <Notice title="현재 위치 확인 완료" body={`${formatLocation(location)} · ${location.matchedRegionName ?? '가까운 지역'}을 선택했어요.`} tone="green" />;
  }

  return <Notice title="현재 위치 사용하기" body="현재 위치를 허용하면 가까운 활동 지역을 자동으로 선택해요. 거부해도 직접 선택할 수 있어요." />;
}

function Notice({ body, title, tone = 'blue' }: { body: string; title: string; tone?: 'blue' | 'orange' | 'green' }) {
  return <Card pad={14} className={`tm-auth-notice tm-auth-notice-${tone}`}><div className="tm-text-label">{title}</div><div className="tm-text-caption">{body}</div></Card>;
}

function ProgressHeader({ stepNo, total }: { stepNo: number; total: number }) {
  return (
    <div className="tm-auth-progress">
      <span className="tm-text-micro" aria-hidden="true">{stepNo > 0 ? `${stepNo} / ${total}단계` : null}</span>
      <div
        className="tm-auth-progress-bars"
        role="progressbar"
        aria-valuenow={stepNo > 0 ? stepNo : 0}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={stepNo > 0 ? `${total}단계 중 ${stepNo}단계` : '시작 전'}
      >
        {Array.from({ length: total }).map((_, index) => <span key={index} data-active={stepNo > 0 && index < stepNo} />)}
      </div>
    </div>
  );
}

function toggleSport(draft: OnboardingDraft, sportId: string): OnboardingDraft {
  const exists = draft.sports.some((sport) => sport.sportId === sportId);
  return {
    ...draft,
    sports: exists ? draft.sports.filter((sport) => sport.sportId !== sportId) : [...draft.sports, { sportId, levelId: null }],
  };
}

function setSportLevel(draft: OnboardingDraft, sportId: string, levelId: string): OnboardingDraft {
  return {
    ...draft,
    sports: draft.sports.map((sport) => (sport.sportId === sportId ? { ...sport, levelId } : sport)),
  };
}

function toggleRegion(draft: OnboardingDraft, regionId: string): OnboardingDraft {
  const exists = draft.regions.some((region) => region.regionId === regionId);
  const next = exists ? draft.regions.filter((region) => region.regionId !== regionId) : [...draft.regions, { regionId, primary: draft.regions.length === 0 }];
  return {
    ...draft,
    regions: next.map((region, index) => ({ ...region, primary: index === 0 })),
  };
}

function upsertPrimaryRegion(draft: OnboardingDraft, regionId: string | null): OnboardingDraft {
  if (!regionId) return draft;

  const existing = draft.regions.filter((region) => region.regionId !== regionId);
  return {
    ...draft,
    regions: [{ regionId, primary: true }, ...existing.map((region) => ({ ...region, primary: false }))],
  };
}

function formatLocation(location: CurrentLocationDraft) {
  const accuracy = location.accuracy ? ` · 오차 약 ${Math.round(location.accuracy)}m` : '';
  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}${accuracy}`;
}

function getBackHref(step: OnboardingRouteStep) {
  if (step === 'sport') return '/signup/complete';
  if (step === 'level') return '/onboarding/sport';
  if (step === 'region') return '/onboarding/level';
  if (step === 'confirm') return '/onboarding/region';
  return undefined;
}

function readDraft(): OnboardingDraft | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey);
    return raw ? (JSON.parse(raw) as OnboardingDraft) : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: OnboardingDraft) {
  window.sessionStorage.setItem(draftKey, JSON.stringify(draft));
}

function clearDraft() {
  window.sessionStorage.removeItem(draftKey);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청을 처리하지 못했어요.';
}
