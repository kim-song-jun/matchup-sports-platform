import { getConfiguredBasePath, stripConfiguredBasePath } from './session-storage';

export function appRoute(path: string, currentPathname?: string | null) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const configuredBasePath = getConfiguredBasePath();

  if (configuredBasePath) return stripConfiguredBasePath(normalizedPath);
  if (currentPathname === '/v1' || currentPathname?.startsWith('/v1/')) {
    if (normalizedPath === '/v1' || normalizedPath.startsWith('/v1/')) return normalizedPath;
    return `/v1${normalizedPath}`;
  }

  return normalizedPath;
}
