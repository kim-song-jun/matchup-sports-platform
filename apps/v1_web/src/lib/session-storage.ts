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
  if (value.startsWith('/login')) return null;
  return value;
}

export function getCurrentRedirectPath() {
  if (typeof window === 'undefined') return '/home';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function getLoginPathForRedirect(target: string) {
  const redirect = sanitizeRedirectPath(target);
  return redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login';
}
