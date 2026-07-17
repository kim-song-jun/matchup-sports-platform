export function appRoute(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}
