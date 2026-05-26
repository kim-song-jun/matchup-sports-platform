const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, '') ?? '';

export function publicAssetPath(path: string) {
  if (!path || !BASE_PATH) return path;
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return path.startsWith('/') ? `${BASE_PATH}${path}` : `${BASE_PATH}/${path}`;
}

export function cssUrl(path: string) {
  return `url("${publicAssetPath(path).replace(/"/g, '\\"')}")`;
}
