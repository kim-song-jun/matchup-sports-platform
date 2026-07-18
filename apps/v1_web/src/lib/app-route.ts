export function appRoute(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

export function browserAppRoute(path: string) {
  return appRoute(path);
}
