import type {
  V1AdminTournamentSponsor,
  V1CreateTournamentSponsorPayload,
  V1UpdateTournamentSponsorPayload,
} from '@/types/api';

export type SponsorForm = {
  readonly name: string;
  readonly description: string;
  readonly logoUrl: string;
  readonly websiteUrl: string;
  readonly instagramUrl: string;
  readonly benefitText: string;
  readonly boothText: string;
  readonly eventTitle: string;
  readonly eventDescription: string;
  readonly eventResultText: string;
  readonly sortOrder: string;
  readonly isActive: boolean;
};

export const emptySponsorForm: SponsorForm = {
  name: '',
  description: '',
  logoUrl: '',
  websiteUrl: '',
  instagramUrl: '',
  benefitText: '',
  boothText: '',
  eventTitle: '',
  eventDescription: '',
  eventResultText: '',
  sortOrder: '0',
  isActive: true,
};

export type SponsorPayloadMode = 'create' | 'update';

export function formFromSponsor(sponsor: V1AdminTournamentSponsor): SponsorForm {
  return {
    name: sponsor.name,
    description: sponsor.description ?? '',
    logoUrl: sponsor.logoUrl ?? '',
    websiteUrl: sponsor.websiteUrl ?? '',
    instagramUrl: sponsor.instagramUrl ?? '',
    benefitText: sponsor.benefitText ?? '',
    boothText: sponsor.boothText ?? '',
    eventTitle: sponsor.eventTitle ?? '',
    eventDescription: sponsor.eventDescription ?? '',
    eventResultText: sponsor.eventResultText ?? '',
    sortOrder: String(sponsor.sortOrder),
    isActive: sponsor.isActive,
  };
}

export function sponsorPayloadFromForm(
  form: SponsorForm,
  mode: 'create',
): V1CreateTournamentSponsorPayload;
export function sponsorPayloadFromForm(
  form: SponsorForm,
  mode: 'update',
): V1UpdateTournamentSponsorPayload;
export function sponsorPayloadFromForm(
  form: SponsorForm,
  mode: SponsorPayloadMode,
): V1CreateTournamentSponsorPayload | V1UpdateTournamentSponsorPayload {
  const description = textPayload(form.description, mode);
  const logoUrl = textPayload(form.logoUrl, mode);
  const websiteUrl = textPayload(form.websiteUrl, mode);
  const instagramUrl = textPayload(form.instagramUrl, mode);
  const benefitText = textPayload(form.benefitText, mode);
  const boothText = textPayload(form.boothText, mode);
  const eventTitle = textPayload(form.eventTitle, mode);
  const eventDescription = textPayload(form.eventDescription, mode);
  const eventResultText = textPayload(form.eventResultText, mode);
  const sortOrder = parseSortOrder(form.sortOrder);

  return {
    name: form.name.trim(),
    ...(description !== undefined ? { description } : {}),
    ...(logoUrl !== undefined ? { logoUrl } : {}),
    ...(websiteUrl !== undefined ? { websiteUrl } : {}),
    ...(instagramUrl !== undefined ? { instagramUrl } : {}),
    ...(benefitText !== undefined ? { benefitText } : {}),
    ...(boothText !== undefined ? { boothText } : {}),
    ...(eventTitle !== undefined ? { eventTitle } : {}),
    ...(eventDescription !== undefined ? { eventDescription } : {}),
    ...(eventResultText !== undefined ? { eventResultText } : {}),
    ...(sortOrder !== undefined ? { sortOrder } : {}),
    isActive: form.isActive,
  };
}

function textPayload(value: string, mode: SponsorPayloadMode): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length > 0) return trimmed;
  return mode === 'update' ? '' : undefined;
}

function parseSortOrder(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
