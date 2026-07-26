import type { ApiEnvelope } from '@/types/api';
import type { V1PublicTournamentCampaign } from '@/types/tournament-campaign';

export type PublicTournamentCampaignLoadResult =
  | { readonly kind: 'found'; readonly campaign: V1PublicTournamentCampaign }
  | { readonly kind: 'not_found' };

export class TournamentCampaignLoadError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number) {
    super(`Tournament campaign request failed with status ${statusCode}`);
    this.name = 'TournamentCampaignLoadError';
    this.statusCode = statusCode;
  }
}

export async function loadPublicTournamentCampaign(
  slug: string,
): Promise<PublicTournamentCampaignLoadResult> {
  const response = await fetch(
    `${getInternalApiOrigin()}/api/v1/tournaments/campaigns/${encodeURIComponent(slug)}`,
    { cache: 'no-store', headers: { accept: 'application/json' } },
  );

  if (response.status === 404) return { kind: 'not_found' };
  if (!response.ok) throw new TournamentCampaignLoadError(response.status);

  const envelope: ApiEnvelope<V1PublicTournamentCampaign> = await response.json();
  return { kind: 'found', campaign: envelope.data };
}

function getInternalApiOrigin(): string {
  const configured = process.env.INTERNAL_API_ORIGIN
    ?? process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, '');
  if (configured) return configured.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production' ? 'http://v1_api:8121' : 'http://localhost:8121';
}
