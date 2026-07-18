export type PendingSocialSignupStatus =
  | 'social_terms_required'
  | 'social_profile_required';

export function getPendingSocialSignupRoute(status: string | null | undefined) {
  if (status === 'social_terms_required') return '/terms?mode=social';
  if (status === 'social_profile_required') return '/signup/social';
  return null;
}

export function isPendingSocialSignupRouteAllowed(
  status: string | null | undefined,
  pathname: string,
  mode: string | null,
) {
  if (status === 'social_terms_required') {
    return pathname === '/terms' && mode === 'social';
  }

  if (status === 'social_profile_required') {
    return pathname === '/signup/social';
  }

  return true;
}
