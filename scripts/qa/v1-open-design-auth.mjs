import { DEFAULT_HOST_EMAIL } from './v1-open-design-parity-lib.mjs';

export function normalizeDevLoginSession(payload, fallbackEmail = DEFAULT_HOST_EMAIL) {
  const data = payload?.data ?? payload;
  const session = data?.session ?? {};
  const user = data?.user ?? session?.user ?? null;
  const userId = session?.userId ?? session?.id ?? user?.userId ?? user?.id ?? null;
  const explicitUserEmail = session?.userEmail ?? session?.email ?? user?.email ?? null;

  if (!userId && !explicitUserEmail) {
    throw new Error('dev-login payload does not contain a v1 session identity');
  }

  return {
    user,
    userEmail: explicitUserEmail ?? fallbackEmail,
    userId,
  };
}

export async function addV1SessionInit(page, session) {
  await page.addInitScript((value) => {
    if (value.userId) localStorage.setItem('teameet.v1.userId', value.userId);
    if (value.userEmail) localStorage.setItem('teameet.v1.userEmail', value.userEmail);
    else localStorage.removeItem('teameet.v1.userEmail');
    if (value.user) localStorage.setItem('authUser', JSON.stringify(value.user));
  }, session);
}

export async function setV1SessionLocalStorage(page, session) {
  await page.evaluate((value) => {
    if (value.userId) localStorage.setItem('teameet.v1.userId', value.userId);
    if (value.userEmail) localStorage.setItem('teameet.v1.userEmail', value.userEmail);
    else localStorage.removeItem('teameet.v1.userEmail');
    if (value.user) localStorage.setItem('authUser', JSON.stringify(value.user));
  }, session);
}

export function v1SessionHeaders(session) {
  return {
    ...(session.userId ? { 'x-v1-user-id': session.userId } : {}),
    ...(session.userEmail ? { 'x-v1-user-email': session.userEmail } : {}),
  };
}
