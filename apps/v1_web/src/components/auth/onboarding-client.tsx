'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import {
  useV1CompleteOnboarding,
  useV1DeferOnboarding,
  useV1MasterRegions,
  useV1MasterSports,
  useV1Onboarding,
  useV1SaveOnboardingPreferences,
} from '@/hooks/use-v1-api';
import type { V1OnboardingPreferencePayload, V1OnboardingStep } from '@/types/api';
import { AuthFrame } from './auth-page';

type OnboardingRouteStep = 'resume' | Extract<V1OnboardingStep, 'sport' | 'level' | 'region' | 'confirm'>;

type OnboardingDraft = {
  sports: Array<{ sportId: string; levelId: string | null }>;
  regions: Array<{ regionId: string; primary: boolean }>;
};

const draftKey = 'teameet.v1.onboardingDraft';

const stepMeta: Record<OnboardingRouteStep, { stepNo: number; title: string; sub: string }> = {
  resume: {
    stepNo: 0,
    title: '운동 설정을 이어갈까요?',
    sub: '저장된 선택값을 불러와 완료하지 않은 단계부터 다시 시작합니다.',
  },
  sport: {
    stepNo: 1,
    title: '관심 종목을 선택해 주세요',
    sub: '선택한 종목을 기준으로 다음 실력 입력 단계가 구성됩니다.',
  },
  level: {
    stepNo: 2,
    title: '종목별 실력을 입력해 주세요',
    sub: '무리 없는 매칭을 위해 종목마다 현재 실력을 선택합니다.',
  },
  region: {
    stepNo: 3,
    title: '주 활동 지역을 선택해 주세요',
    sub: '위치 권한 없이도 수동 지역 선택으로 계속할 수 있습니다. 지역은 선택 사항입니다.',
  },
  confirm: {
    stepNo: 3,
    title: '준비가 끝났어요',
    sub: '선택한 종목, 실력, 지역을 기준으로 홈 추천과 필터가 시작됩니다.',
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
  const [draft, setDraft] = useState<OnboardingDraft>({ sports: [], regions: [] });
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated || !onboarding.data) return;
    const stored = readDraft();
    const initial = stored ?? {
      sports: onboarding.data.sports.map((sport) => ({ sportId: sport.sportId, levelId: sport.levelId })),
      regions: onboarding.data.regions.map((region) => ({ regionId: region.regionId, primary: region.primary })),
    };
    setDraft(initial);
    setHydrated(true);
  }, [hydrated, onboarding.data]);

  useEffect(() => {
    if (hydrated) writeDraft(draft);
  }, [draft, hydrated]);

  const sports = sportsQuery.data ?? [];
  const regions = (regionsQuery.data ?? []).filter((region) => region.parentId !== null);
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
      { sports: draft.sports, regions: draft.regions, currentStep },
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

  const fixedAction = (
    <OnboardingFixedAction
      complete={complete}
      defer={defer}
      disabled={
        pending ||
        (step === 'sport' && draft.sports.length === 0) ||
        (step === 'level' && (draft.sports.length === 0 || missingLevels))
      }
      pending={pending}
      saveAndGo={saveAndGo}
      step={step}
    />
  );

  const skipAction = step === 'sport' || step === 'level' || step === 'region' ? defer : undefined;
  const meta = stepMeta[step];

  return (
    <AuthFrame
      topTitle={step === 'resume' ? '이어하기' : '운동 설정'}
      backHref={getBackHref(step)}
      fixedAction={fixedAction}
    >
      <div className="tm-auth-body">
        <ProgressHeader stepNo={meta.stepNo} total={3} />
        <h1 className="tm-text-heading tm-auth-heading">{meta.title}</h1>
        <p className="tm-text-body tm-auth-sub">{meta.sub}</p>
        {skipAction ? <button className="tm-btn tm-btn-sm tm-btn-ghost" disabled={pending} onClick={skipAction} type="button">나중에 설정하기</button> : null}
        {onboarding.isLoading || sportsQuery.isLoading || regionsQuery.isLoading ? <Notice title="불러오는 중" body="저장된 온보딩 정보를 확인하고 있습니다." /> : null}
        {error ? <Notice title="저장 실패" body={error} tone="orange" /> : null}
        {step === 'resume' ? <ResumePanel onboardingStep={onboarding.data?.currentStep} draft={draft} /> : null}
        {step === 'sport' ? (
          <div className="tm-auth-sport-grid">
            {sports.map((sport) => (
              <button
                className={`tm-card tm-auth-option-card ${selectedSportIds.has(sport.id) ? 'tm-auth-option-selected' : ''}`}
                key={sport.id}
                onClick={() => setDraft((current) => toggleSport(current, sport.id))}
                type="button"
              >
                <div className="tm-text-body-lg">{sport.name}</div>
                <div className="tm-text-caption">{selectedSportIds.has(sport.id) ? '선택됨' : '선택 가능'}</div>
              </button>
            ))}
          </div>
        ) : null}
        {step === 'level' ? (
          <div className="tm-auth-stack">
            {selectedSports.length === 0 ? <Notice title="종목 선택 필요" body="먼저 관심 종목을 선택해야 실력을 입력할 수 있습니다." tone="orange" /> : null}
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
            <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" onClick={() => router.push('/auth/location-denied')} type="button">현재 위치로 찾기</button>
            <div className="tm-auth-chip-wrap">
              {regions.map((region) => (
                <button
                  className={`tm-chip ${selectedRegionIds.has(region.id) ? 'tm-chip-active' : ''}`}
                  key={region.id}
                  onClick={() => setDraft((current) => toggleRegion(current, region.id))}
                  type="button"
                >
                  {region.name}
                </button>
              ))}
            </div>
            <Notice title="위치 권한 예외" body="권한 거부 시 선택한 종목과 실력은 유지하고 수동 지역 선택으로 복구합니다." tone="orange" />
          </>
        ) : null}
        {step === 'confirm' ? <ConfirmPanel draft={draft} regions={regionsQuery.data ?? []} sports={sports} /> : null}
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
    return (
      <>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" onClick={() => saveAndGo('sport', '/onboarding/sport')} type="button">처음부터 다시 선택</button>
        <div style={{ height: 8 }} />
        <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block" onClick={() => saveAndGo('confirm', '/onboarding/confirm')} type="button">저장된 선택 확인</button>
      </>
    );
  }

  if (step === 'sport') {
    return <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={disabled} onClick={() => saveAndGo('sport', '/onboarding/level')} type="button">{pending ? '저장 중' : '실력 입력하기'}</button>;
  }

  if (step === 'level') {
    return <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={disabled} onClick={() => saveAndGo('level', '/onboarding/region')} type="button">{pending ? '저장 중' : '지역 선택하기'}</button>;
  }

  if (step === 'region') {
    return (
      <>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={pending} onClick={() => saveAndGo('region', '/onboarding/confirm')} type="button">{pending ? '저장 중' : '선택 확인하기'}</button>
        <div style={{ height: 8 }} />
        <button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block" disabled={pending} onClick={defer} type="button">나중에 설정하기</button>
      </>
    );
  }

  return <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={pending} onClick={complete} type="button">{pending ? '완료 중' : '홈으로 시작하기'}</button>;
}

function ResumePanel({ draft, onboardingStep }: { draft: OnboardingDraft; onboardingStep?: V1OnboardingStep }) {
  return (
    <div className="tm-auth-stack">
      <Card pad={15}><div className="tm-text-body-lg">현재 단계</div><div className="tm-text-caption">{onboardingStep ?? 'sport'}</div></Card>
      <Card pad={15}><div className="tm-text-body-lg">선택한 종목</div><div className="tm-text-caption">{draft.sports.length}개</div></Card>
      <Card pad={15}><div className="tm-text-body-lg">선택한 지역</div><div className="tm-text-caption">{draft.regions.length ? `${draft.regions.length}개` : '선택 전'}</div></Card>
      <Notice title="입력값 보존" body="중단 복귀 시 저장된 선택값을 불러오고, 완료 전 단계만 다시 요청합니다." />
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
    <div className="tm-auth-stack">
      <Card pad={15}><div className="tm-text-label">관심 종목과 실력</div><div className="tm-text-caption" style={{ marginTop: 4 }}>{sportSummary || '선택 필요'}</div></Card>
      <Card pad={15}><div className="tm-text-label">활동 지역</div><div className="tm-text-caption" style={{ marginTop: 4 }}>{regionSummary || '선택 안 함'}</div></Card>
      <Notice title="완료 상태" body="홈 진입 후에도 설정에서 종목, 실력, 지역을 수정할 수 있습니다." tone="green" />
    </div>
  );
}

function Notice({ body, title, tone = 'blue' }: { body: string; title: string; tone?: 'blue' | 'orange' | 'green' }) {
  return <Card pad={14} className={`tm-auth-notice tm-auth-notice-${tone}`}><div className="tm-text-label">{title}</div><div className="tm-text-caption">{body}</div></Card>;
}

function ProgressHeader({ stepNo, total }: { stepNo: number; total: number }) {
  return (
    <div className="tm-auth-progress">
      <span className="tm-text-micro">{stepNo > 0 ? `STEP ${stepNo} / ${total}` : 'RESUME'}</span>
      <div className="tm-auth-progress-bars">{Array.from({ length: total }).map((_, index) => <span key={index} data-active={stepNo > 0 && index < stepNo} />)}</div>
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
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}
