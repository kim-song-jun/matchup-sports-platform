export function isTermsReconsentRequestAllowed(requestUrl: string) {
  const pathname = requestUrl.split('?')[0]?.replace(/\/+$/, '') ?? '';
  return (
    pathname.endsWith('/auth/me') ||
    pathname.endsWith('/auth/logout') ||
    pathname.endsWith('/terms/current') ||
    pathname.endsWith('/terms/consents')
  );
}
