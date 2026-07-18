import { Prisma, V1TournamentStatus } from '@prisma/client';
import { buildAlphaTournamentCampaignContent } from '../../prisma/seed-alpha-tournament-qa';
import { parseCampaignContentJson } from './tournament-campaign-content';

describe('alpha tournament QA campaign content', () => {
  it('satisfies the persisted campaign contract used by the public event hub', () => {
    const content = buildAlphaTournamentCampaignContent(
      {
        id: 'aa100000-0000-4000-8000-000000000002',
        slug: 'alpha-qa-futsal-recruiting',
        title: '[ALPHA QA] 참가 모집 중 풋살 오픈',
        status: V1TournamentStatus.open,
        startsInDays: 21,
        entryFee: 120_000,
        promoPriority: 60,
        hasCampaign: true,
      },
      new Date('2026-08-08T09:00:00.000Z'),
      new Date('2026-08-01T09:00:00.000Z'),
    );

    const persistedContent = JSON.parse(JSON.stringify(content)) as Prisma.JsonValue;
    expect(() => parseCampaignContentJson(persistedContent)).not.toThrow();
  });
});
