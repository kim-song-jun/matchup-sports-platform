const SIGNUP_TERMS_ACCEPTED_KEY = 'teameet.v1.signupTermsAccepted';
const SIGNUP_TERMS_DOCUMENT_IDS_KEY = 'teameet.v1.signupTermsDocumentIds';

export function readSignupTermsDocumentIds() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SIGNUP_TERMS_DOCUMENT_IDS_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

export function saveSignupTermsDocumentIds(documentIds: string[]) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(
    SIGNUP_TERMS_DOCUMENT_IDS_KEY,
    JSON.stringify([...new Set(documentIds)]),
  );
}

export function clearSignupTermsDocumentIds() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SIGNUP_TERMS_DOCUMENT_IDS_KEY);
  window.sessionStorage.removeItem(SIGNUP_TERMS_ACCEPTED_KEY);
}

export function readSignupTermsAccepted() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.sessionStorage.getItem(SIGNUP_TERMS_ACCEPTED_KEY) === 'true';
}

export function saveSignupTermsAccepted(accepted: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(SIGNUP_TERMS_ACCEPTED_KEY, accepted ? 'true' : 'false');
}
