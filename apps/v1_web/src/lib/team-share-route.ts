export function teamSharePath(teamId: string, currentPathname?: string | null) {
  const path = `/teams/${teamId}`;
  const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, '') ?? '';
  if (configuredBasePath) return `${configuredBasePath}${path}`;

  const pathname =
    currentPathname ??
    (typeof window === 'undefined' ? null : window.location.pathname);

  if (pathname === '/v1' || pathname?.startsWith('/v1/')) return `/v1${path}`;
  return `/v1${path}`;
}
