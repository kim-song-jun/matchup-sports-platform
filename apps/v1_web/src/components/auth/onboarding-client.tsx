'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { ChevronLeftIcon } from '@/components/v1-ui/icons';
import { SportGlyph } from '@/components/v1-ui/sport-glyph';
import { trackEvent } from '@/lib/analytics';
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
import type { V1OnboardingPreferencePayload, V1OnboardingStep, V1Region } from '@/types/api';
import { AuthFrame } from './auth-page';

type OnboardingRouteStep = 'resume' | Extract<V1OnboardingStep, 'sport' | 'level' | 'region' | 'confirm'>;

type OnboardingDraft = {
  sports: Array<{ sportId: string; levelId: string | null }>;
  regions: Array<{ regionId: string; primary: boolean }>;
  detectedRegion?: DetectedRegionDraft | null;
};

type DetectedRegionDraft = {
  regionId: string;
  regionName: string;
};

type LocationStatus = 'idle' | 'requesting' | 'allowed' | 'denied' | 'unsupported' | 'unmatched';

type OnboardingRegionOption = {
  id: string;
  name: string;
  shortName: string;
  parentName: string;
  parentId: string;
  all: boolean;
};

type OnboardingRegionGroup = {
  id: string;
  name: string;
  options: OnboardingRegionOption[];
};

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
  const [selectedRegionGroupId, setSelectedRegionGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated || !onboarding.data) return;
    const stored = readDraft();
    const initial = stored ?? {
      sports: onboarding.data.sports.map((sport) => ({ sportId: sport.sportId, levelId: sport.levelId })),
      regions: onboarding.data.regions.map((region) => ({ regionId: region.regionId, primary: region.primary })),
      detectedRegion: null,
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
  const regionGroups = useMemo(() => toOnboardingRegionGroups(regionsQuery.data ?? []), [regionsQuery.data]);
  const selectedRegionGroup =
    regionGroups.find((group) => group.id === selectedRegionGroupId) ??
    regionGroups.find((group) => draft.regions.some((region) => group.options.some((option) => option.id === region.regionId))) ??
    regionGroups[0] ??
    null;
  const regionOptions = regionGroups.flatMap((group) => group.options);
  const selectedSportIds = new Set(draft.sports.map((sport) => sport.sportId));
  const selectedRegionIds = new Set(draft.regions.map((region) => region.regionId));
  const missingLevels = draft.sports.some((sport) => !sport.levelId);
  // confirm 게이트: 종목 없이 완료하면 홈 추천·필터가 동작하지 않으므로 CTA 비활성 처리.
  // 지역은 '나중에 설정하기'로 건너뛸 수 있어 빈 상태가 유효하지만, 종목은 매칭의 핵심이라 필수.
  const emptySports = draft.sports.length === 0;
  const selectedSports = useMemo(
    () => draft.sports.map((item) => ({ ...item, sport: sports.find((sport) => sport.id === item.sportId) })).filter((item) => item.sport),
    [draft.sports, sports],
  );
  const pending = savePreferences.isPending || completeOnboarding.isPending || deferOnboarding.isPending;

  const saveAndGo = (currentStep: V1OnboardingPreferencePayload['currentStep'], href: string) => {
    // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
    // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
    // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
    if (pending) return;
    setError(null);
    const payloadDraft = sanitizeDraft(draft);

    if (currentStep !== 'sport' && payloadDraft.sports.length === 0) {
      setDraft(payloadDraft);
      setError('관심 종목을 먼저 선택해 주세요.');
      return;
    }

    if (currentStep === 'region' && payloadDraft.sports.some((sport) => !sport.levelId)) {
      setDraft(payloadDraft);
      setError('종목별 실력을 선택해 주세요.');
      return;
    }

    savePreferences.mutate(
      {
        sports: payloadDraft.sports.map((sport) => ({
          sportId: sport.sportId,
          ...(sport.levelId ? { levelId: sport.levelId } : {}),
        })),
        regions: payloadDraft.regions,
        currentStep,
      },
      {
        onSuccess: () => {
          // 'sport' 단계에서만 선택한 종목 코드를 함께 남긴다 — 다른 단계는 종목과 무관.
          const sportType = currentStep === 'sport'
            ? payloadDraft.sports
                .map((sport) => sports.find((candidate) => candidate.id === sport.sportId)?.code)
                .filter((code): code is string => Boolean(code))
                .join(',')
            : '';
          trackEvent('onboarding_step_complete', sportType ? { step: currentStep, sportType } : { step: currentStep });
          router.push(href);
        },
        onError: (nextError) => setError(getErrorMessage(nextError)),
      },
    );
  };

  const defer = () => {
    if (pending) return;
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
    if (pending) return;
    setError(null);
    completeOnboarding.mutate(undefined, {
      onSuccess: (result) => {
        trackEvent('onboarding_complete', {});
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
        resolveLocation.mutate(
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            locationConsentAccepted: true,
          },
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
                detectedRegion: matchedRegionId && matchedRegionName
                  ? { regionId: matchedRegionId, regionName: matchedRegionName }
                  : null,
              }));
              setSelectedRegionGroupId(findRegionGroupId(regionGroups, matchedRegionId));
              setLocationStatus(matchedRegionId ? 'allowed' : 'unmatched');
            },
            onError: () => {
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
        (step === 'sport' && emptySports) ||
        (step === 'level' && (emptySports || missingLevels)) ||
        (step === 'confirm' && emptySports)
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
                {/* SportGlyph: 선택 시 blue500, 미선택 시 text-muted — tm-signup-sport-icon 토큰 재사용 */}
                <SportGlyph code={sport.code} size={28} className="tm-signup-sport-icon" />
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
            <p className="tm-text-caption" style={{ margin: '8px 0 0' }}>
              버튼을 누르면 현재 좌표를 지역 확인 목적으로 팀밋 서버와 카카오에 1회 전송해요.
              좌표 자체는 저장하지 않아요.
            </p>
            <LocationNotice detectedRegion={draft.detectedRegion ?? null} status={locationStatus} />
            <div className="tm-auth-stack">
              <Card pad={15}>
                <div className="tm-text-label">시/도</div>
                <div className="tm-auth-chip-wrap" style={{ marginTop: 10 }}>
                  {regionGroups.map((group) => (
                    <button
                      className={`tm-chip ${selectedRegionGroup?.id === group.id ? 'tm-chip-active' : ''}`}
                      key={group.id}
                      onClick={() => setSelectedRegionGroupId(group.id)}
                      type="button"
                      aria-pressed={selectedRegionGroup?.id === group.id}
                    >
                      {group.name}
                    </button>
                  ))}
                </div>
              </Card>
              <Card pad={15}>
                <div className="tm-text-label">{selectedRegionGroup ? `${selectedRegionGroup.name} 상세 지역` : '상세 지역'}</div>
                <div className="tm-auth-chip-wrap" style={{ marginTop: 10 }}>
                  {(selectedRegionGroup?.options ?? []).map((region) => (
                    <button
                      className={`tm-chip ${selectedRegionIds.has(region.id) ? 'tm-chip-active' : ''}`}
                      key={region.id}
                      onClick={() => setDraft((current) => toggleRegion(current, region))}
                      type="button"
                      aria-pressed={selectedRegionIds.has(region.id)}
                    >
                      {region.shortName}
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          </>
        ) : null}
        {step === 'confirm' ? <ConfirmPanel draft={draft} emptySports={emptySports} regions={regionOptions} sports={sports} /> : null}
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
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={disabled} onClick={() => saveAndGo('region', '/onboarding/region')} type="button">{pending ? '저장 중' : '지역 선택하기'}</button>
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
      <Card pad={16}><div className="tm-text-caption">현재 단계</div><div className="tm-text-body" style={{ marginTop: 4, color: 'var(--text-strong)', fontWeight: 600 }}>{onboardingStepLabel(onboardingStep ?? 'sport')}</div></Card>
      {/* P1 tabular-nums: 숫자 카운트에 폰트 수치 흔들림 방지 */}
      <Card pad={16}><div className="tm-text-caption">선택한 종목</div><div className="tm-text-body" style={{ marginTop: 4, color: 'var(--text-strong)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{draft.sports.length}개</div></Card>
      <Card pad={16}><div className="tm-text-caption">선택한 지역</div><div className="tm-text-body" style={{ marginTop: 4, color: 'var(--text-strong)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{draft.regions.length ? `${draft.regions.length}개` : '선택한 지역 없음'}</div></Card>
      <Notice title="잠깐 나가도 괜찮아요" body="설정을 나가도 선택한 내용이 저장돼요. 돌아오면 멈춘 단계부터 이어서 할 수 있어요." />
    </div>
  );
}

function ConfirmPanel({ draft, emptySports, regions, sports }: { draft: OnboardingDraft; emptySports: boolean; regions: OnboardingRegionOption[]; sports: Array<{ id: string; name: string; levels: Array<{ id: string; name: string }> }> }) {
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
      {/* 종목 미설정 경고: 홈 추천·필터가 동작하지 않음을 명시하고 뒤로가기를 안내 */}
      {emptySports ? (
        <Notice
          title="종목을 선택하지 않았어요"
          body="종목을 선택하지 않으면 홈 추천과 매칭 필터가 동작하지 않아요. 뒤로 돌아가 종목을 선택해 주세요."
          tone="orange"
        />
      ) : null}
      {/* #19: 값(sportSummary, regionSummary)을 tm-text-body(15px/600)로 격상, 레이블은 caption 유지 */}
      {/* P1 tabular-nums: 숫자가 포함될 수 있는 요약 텍스트 */}
      <Card pad={16}><div className="tm-text-caption">관심 종목과 실력</div><div className="tm-text-body" style={{ marginTop: 4, color: 'var(--text-strong)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{sportSummary || '미설정'}</div></Card>
      <Card pad={16}><div className="tm-text-caption">활동 지역</div><div className="tm-text-body" style={{ marginTop: 4, color: 'var(--text-strong)', fontWeight: 600 }}>{regionSummary || '미설정'}</div></Card>
      {draft.detectedRegion ? (
        <Card pad={16} className="tm-onboarding-confirm-full">
          <div className="tm-text-caption">현재 위치로 찾은 지역</div>
          <div className="tm-text-body" style={{ marginTop: 4, color: 'var(--text-strong)', fontWeight: 600 }}>
            {draft.detectedRegion.regionName}
          </div>
        </Card>
      ) : null}
      {/* 종목이 설정된 경우에만 완료 안내 노출 */}
      {!emptySports ? <Notice title="설정 완료" body="홈에 들어간 뒤에도 설정에서 종목, 실력, 지역을 바꿀 수 있어요." tone="green" /> : null}
    </div>
  );
}

function LocationNotice({ detectedRegion, status }: { detectedRegion: DetectedRegionDraft | null; status: LocationStatus }) {
  if (status === 'requesting') {
    return <Notice title="현재 위치 확인 중" body="브라우저의 위치 권한을 확인하고 있어요." />;
  }

  if (status === 'denied') {
    return <Notice title="위치 권한이 꺼져 있어요" body="브라우저 설정에서 다시 허용하거나 지역을 직접 선택해 계속할 수 있어요." tone="orange" />;
  }

  if (status === 'unsupported') {
    return <Notice title="위치 확인 불가" body="이 브라우저에서는 현재 위치 확인을 지원하지 않아요. 지역을 직접 선택해 주세요." tone="orange" />;
  }

  if (status === 'unmatched') {
    return <Notice title="가까운 지역을 찾지 못했어요" body="현재 위치의 좌표는 저장하지 않았어요. 아래에서 활동 지역을 직접 선택해 주세요." tone="orange" />;
  }

  if (detectedRegion) {
    return <Notice title="현재 위치 확인 완료" body={`${detectedRegion.regionName}을 활동 지역으로 선택했어요. 허용 상태는 브라우저에 유지되지만 좌표는 저장하지 않아요.`} tone="green" />;
  }

  return <Notice title="현재 위치로 지역 찾기" body="한 번 허용하면 브라우저가 권한을 기억해요. 좌표는 가까운 지역을 찾을 때만 1회 사용하고 저장하지 않아요." />;
}

function Notice({ body, title, tone = 'blue' }: { body: string; title: string; tone?: 'blue' | 'orange' | 'green' }) {
  return <Card pad={16} className={`tm-auth-notice tm-auth-notice-${tone}`}><div className="tm-text-label">{title}</div><div className="tm-text-caption">{body}</div></Card>;
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

function toggleRegion(draft: OnboardingDraft, option: OnboardingRegionOption): OnboardingDraft {
  const exists = draft.regions.some((region) => region.regionId === option.id);
  return {
    ...draft,
    regions: exists ? [] : [{ regionId: option.id, primary: true }],
  };
}

function upsertPrimaryRegion(draft: OnboardingDraft, regionId: string | null): OnboardingDraft {
  if (!regionId) return draft;

  return {
    ...draft,
    regions: [{ regionId, primary: true }],
  };
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
    return raw ? sanitizeDraft(JSON.parse(raw) as Partial<OnboardingDraft>) : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: OnboardingDraft) {
  window.sessionStorage.setItem(draftKey, JSON.stringify(sanitizeDraft(draft)));
}

function clearDraft() {
  window.sessionStorage.removeItem(draftKey);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청을 처리하지 못했어요.';
}

function sanitizeDraft(raw: Partial<OnboardingDraft> | null | undefined): OnboardingDraft {
  const sports = Array.isArray(raw?.sports)
    ? raw.sports
        .filter((sport) => isUuid(sport?.sportId))
        .map((sport) => ({
          sportId: sport.sportId,
          levelId: isUuid(sport.levelId) ? sport.levelId : null,
        }))
    : [];

  const regions = Array.isArray(raw?.regions)
    ? raw.regions
        .filter((region) => isUuid(region?.regionId))
        .slice(0, 1)
        .map((region) => ({
          regionId: region.regionId,
          primary: true,
        }))
    : [];

  const detectedRegion = raw?.detectedRegion;
  const sanitizedDetectedRegion = detectedRegion
    && isUuid(detectedRegion.regionId)
    && typeof detectedRegion.regionName === 'string'
    && detectedRegion.regionName.trim()
    ? { regionId: detectedRegion.regionId, regionName: detectedRegion.regionName.trim() }
    : null;

  return { sports, regions, detectedRegion: sanitizedDetectedRegion };
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toOnboardingRegionGroups(regions: V1Region[]): OnboardingRegionGroup[] {
  return regions
    .filter((region) => region.level === 1 || !region.parentId)
    .map((parent) => {
      const parentOption: OnboardingRegionOption = {
        id: parent.id,
        name: `${parent.name} 전체`,
        shortName: '전체',
        parentName: parent.name,
        parentId: parent.id,
        all: true,
      };
      const childOptions: OnboardingRegionOption[] = (parent.children ?? [])
        .filter((child) => child.level === 2)
        .map((child) => ({
          id: child.id,
          name: `${parent.name} ${child.name}`,
          shortName: child.name,
          parentName: parent.name,
          parentId: parent.id,
          all: false,
        }));

      return {
        id: parent.id,
        name: parent.name,
        options: [parentOption, ...childOptions],
      };
    });
}

function findRegionGroupId(groups: OnboardingRegionGroup[], regionId: string | null | undefined) {
  if (!regionId) return null;
  return groups.find((group) => group.options.some((option) => option.id === regionId))?.id ?? null;
}
