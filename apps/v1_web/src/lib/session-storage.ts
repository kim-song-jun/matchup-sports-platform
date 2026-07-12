export const V1_USER_ID_KEY = 'teameet.v1.userId';
export const V1_USER_EMAIL_KEY = 'teameet.v1.userEmail';

export type StoredV1Session = {
  userId: string | null;
  userEmail: string | null;
};

export function getStoredV1Session(): StoredV1Session {
  if (typeof window === 'undefined') return { userId: null, userEmail: null };

  return {
    userId: window.localStorage.getItem(V1_USER_ID_KEY),
    userEmail: window.localStorage.getItem(V1_USER_EMAIL_KEY),
  };
}

export function hasStoredV1Session() {
  const session = getStoredV1Session();
  return Boolean(session.userId || session.userEmail);
}

export function saveStoredV1Session(session: { userId: string; userEmail?: string | null }) {
  window.localStorage.setItem(V1_USER_ID_KEY, session.userId);
  if (session.userEmail) {
    window.localStorage.setItem(V1_USER_EMAIL_KEY, session.userEmail);
  } else {
    window.localStorage.removeItem(V1_USER_EMAIL_KEY);
  }
}

export function clearStoredV1Session() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(V1_USER_ID_KEY);
  window.localStorage.removeItem(V1_USER_EMAIL_KEY);
}

export function sanitizeRedirectPath(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('://')) return null;

  const path = stripConfiguredBasePath(value);
  if (path.startsWith('//')) return null;
  if (path.startsWith('/login')) return null;
  return path;
}

export function getConfiguredBasePath() {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH?.trim().replace(/\/+$/, '') ?? '';
  if (!raw || raw === '/') return '';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function stripConfiguredBasePath(path: string) {
  const basePath = getConfiguredBasePath();
  if (!basePath) return path;

  let nextPath = path;
  while (nextPath === basePath || nextPath.startsWith(`${basePath}/`)) {
    nextPath = nextPath.slice(basePath.length) || '/';
  }

  return nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
}

export function getCurrentRedirectPath() {
  if (typeof window === 'undefined') return '/home';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function getLoginPathForRedirect(target: string) {
  const redirect = sanitizeRedirectPath(target);
  return redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login';
}
