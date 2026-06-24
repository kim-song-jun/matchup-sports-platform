export function appRoute(path: string, currentPathname?: string | null) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, '') ?? '';

  if (configuredBasePath) return normalizedPath;
  if (currentPathname === '/v1' || currentPathname?.startsWith('/v1/')) {
    if (normalizedPath === '/v1' || normalizedPath.startsWith('/v1/')) return normalizedPath;
    return `/v1${normalizedPath}`;
  }

  return normalizedPath;
}
