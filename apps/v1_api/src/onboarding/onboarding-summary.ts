import {
  V1OnboardingStatus,
  V1Region,
  V1Sport,
  V1SportLevel,
  V1UserRegion,
  V1UserSportPreference,
} from '@prisma/client';

export type V1OnboardingStep =
  | 'terms'
  | 'signup'
  | 'sport'
  | 'level'
  | 'region'
  | 'confirm'
  | 'done';

export type V1OnboardingMissing =
  | 'terms'
  | 'profile'
  | 'sports'
  | 'levels'
  | 'regions';

type SportPreference = V1UserSportPreference & {
  sport: Pick<V1Sport, 'id' | 'name'>;
  sportLevel: Pick<V1SportLevel, 'id' | 'name'> | null;
};

type UserRegion = V1UserRegion & {
  region: Pick<V1Region, 'id' | 'name'>;
};

export function buildOnboardingSummary(input: {
  onboardingStatus: V1OnboardingStatus;
  currentStep: string | null;
  sportPreferences: SportPreference[];
  regions: UserRegion[];
  hasRequiredTerms: boolean;
  hasProfile: boolean;
}) {
  const missing = getMissing(input);
  const statusStep = stepFromStatus(input.onboardingStatus);
  const currentStep =
    input.onboardingStatus === 'completed'
      ? 'done'
      : input.onboardingStatus === 'social_terms_required' || input.onboardingStatus === 'social_profile_required'
        ? statusStep
      : normalizeStep(input.currentStep) ?? statusStep;

  return {
    status: input.onboardingStatus,
    currentStep,
    canResume: input.onboardingStatus !== 'completed',
    missing,
  };
}

export function getOnboardingDetail(input: {
  onboardingStatus: V1OnboardingStatus;
  currentStep: string | null;
  sportPreferences: SportPreference[];
  regions: UserRegion[];
  hasRequiredTerms: boolean;
  hasProfile: boolean;
}) {
  const summary = buildOnboardingSummary(input);

  return {
    ...summary,
    sports: input.sportPreferences.map((preference) => ({
      sportId: preference.sport.id,
      sportName: preference.sport.name,
      levelId: preference.sportLevel?.id ?? null,
      levelName: preference.sportLevel?.name ?? null,
    })),
    regions: input.regions.map((userRegion) => ({
      regionId: userRegion.region.id,
      name: userRegion.region.name,
      primary: userRegion.isPrimary,
    })),
    regionOptional: true,
  };
}

export function getMissing(input: {
  sportPreferences: SportPreference[];
  regions: UserRegion[];
  hasRequiredTerms: boolean;
  hasProfile: boolean;
}): V1OnboardingMissing[] {
  const missing: V1OnboardingMissing[] = [];

  if (!input.hasRequiredTerms) {
    missing.push('terms');
  }
  if (!input.hasProfile) {
    missing.push('profile');
  }
  if (input.sportPreferences.length === 0) {
    missing.push('sports');
  }
  if (
    input.sportPreferences.length > 0 &&
    input.sportPreferences.some((preference) => !preference.sportLevel)
  ) {
    missing.push('levels');
  }

  return missing;
}

export function hasAcceptedRequiredTerms(onboardingStatus: V1OnboardingStatus, termsConsentCount: number) {
  if (termsConsentCount > 0) return true;
  return onboardingStatus !== 'not_started' && onboardingStatus !== 'social_terms_required';
}

export function derivePreferenceStatus(input: {
  sportsCount: number;
  missingLevels: boolean;
  currentStep: V1OnboardingStep;
}): V1OnboardingStatus {
  if (input.sportsCount === 0) {
    return 'signup_done';
  }

  if (input.missingLevels) {
    return 'sport_done';
  }

  if (input.currentStep === 'region' || input.currentStep === 'confirm') {
    return 'region_done';
  }

  return 'level_done';
}

function stepFromStatus(status: V1OnboardingStatus): V1OnboardingStep {
  switch (status) {
    case 'not_started':
    case 'terms_done':
    case 'social_terms_required':
      return 'terms';
    case 'social_profile_required':
      return 'signup';
    case 'signup_done':
      return 'sport';
    case 'sport_done':
      return 'level';
    case 'level_done':
      return 'region';
    case 'region_done':
      return 'confirm';
    case 'completed':
      return 'done';
    case 'deferred':
      return 'confirm';
  }
}

function normalizeStep(step: string | null): V1OnboardingStep | null {
  if (
    step === 'terms' ||
    step === 'signup' ||
    step === 'sport' ||
    step === 'level' ||
    step === 'region' ||
    step === 'confirm' ||
    step === 'done'
  ) {
    return step;
  }

  return null;
}
