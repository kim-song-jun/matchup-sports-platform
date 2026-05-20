export type AuthRoute = 'login' | 'terms' | 'signup';

export type AuthAction = {
  label: string;
  href?: string;
  disabled?: boolean;
  tone?: 'primary' | 'neutral' | 'danger';
};

export type LoginProvider = {
  label: string;
  background: string;
  color: string;
  href?: string;
  disabled?: boolean;
};

export type LoginViewModel = {
  heroTitle: string;
  heroSub: string;
  emailHref: string;
  guestHref: string;
  signupHref: string;
  providers: LoginProvider[];
};

export type EmailLoginViewModel = {
  backHref: string;
  title: string;
  sub: string;
  fields: Array<{ label: string; placeholder: string; type: 'email' | 'password'; helper?: string; state?: 'default' | 'error' | 'success' }>;
  primary: AuthAction;
  forgot: AuthAction;
  signupHref: string;
  notice: { title: string; body: string };
};

export type AuthExceptionKind = 'provider-denied' | 'missing-email' | 'blocked' | 'account-conflict' | 'location-denied';

export type AuthExceptionViewModel = {
  backHref: string;
  badge: string;
  title: string;
  body: string;
  tone: 'orange' | 'red';
  primary: AuthAction;
  secondary?: AuthAction;
};

export type TermsViewModel = {
  backHref: string;
  title: string;
  sub: string;
  agreements: Array<{ title: string; meta: string; required: boolean; checked: boolean }>;
  primary: AuthAction;
};

export type SignupField = {
  label: string;
  placeholder: string;
  type: 'text' | 'email' | 'password';
  helper?: string;
  state?: 'default' | 'error' | 'success';
  action?: AuthAction;
};

export type SignupFormViewModel = {
  backHref: string;
  title: string;
  sub: string;
  fields: SignupField[];
  notice: { title: string; body: string };
  primary: AuthAction;
};

export type SignupCompleteViewModel = {
  title: string;
  sub: string;
  steps: Array<{ title: string; body: string; done: boolean }>;
  primary: AuthAction;
  secondary: AuthAction;
};

export type OnboardingStep = 'resume' | 'sport' | 'level' | 'region' | 'confirm';

export type OnboardingOption = {
  label: string;
  meta?: string;
  selected?: boolean;
  disabled?: boolean;
};

export type OnboardingViewModel = {
  step: OnboardingStep;
  stepNo: number;
  totalSteps: number;
  title: string;
  sub: string;
  backHref?: string;
  skipHref?: string;
  options: OnboardingOption[];
  summary?: Array<{ label: string; value: string }>;
  notice?: { title: string; body: string; tone?: 'blue' | 'orange' | 'green' };
  primary: AuthAction;
  secondary?: AuthAction;
};
