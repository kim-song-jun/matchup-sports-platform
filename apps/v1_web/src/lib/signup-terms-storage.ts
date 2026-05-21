const SIGNUP_TERMS_ACCEPTED_KEY = 'teameet.v1.signupTermsAccepted';

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
