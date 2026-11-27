/** Storage scope. Public display snapshots remain public; private source data and free-text copies are sealed. */
export const PRIVACY_FIELDS: Readonly<Record<string, Readonly<Record<string, 'text' | 'json'>>>> = {
  V1User: { email: 'text', phone: 'text' },
  V1AuthIdentity: { email: 'text', providerUserKey: 'text' },
  V1UserProfile: { realName: 'text', birthDate: 'text' },
  V1VerificationToken: { target: 'text' },
  V1PhoneVerificationChallenge: { phone: 'text' },
  V1EmailVerificationChallenge: { email: 'text' },
  V1UserOnboardingProgress: { draftJson: 'json' },
  V1TournamentPlayer: { realName: 'text', birthDateSnapshot: 'text', eligibilityNote: 'text' },
  V1Tournament: { bankAccount: 'text', bankHolder: 'text' },
  V1TournamentRegistration: { depositorName: 'text' },
  V1Inquiry: { guestEmail: 'text', guestPhone: 'text', title: 'text', body: 'text', contact: 'text' },
  V1InquiryReply: { body: 'text' },
  V1AdminActionLog: { reason: 'text' },
};

/** Exact-match indexes are needed even for formerly non-unique fields used by filters. */
export const privacyLookupField = (field: string) => `${field}PrivacyLookup`;
export const PRIVACY_PREFIX = 'tm-pii:v1:';
