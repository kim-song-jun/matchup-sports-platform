import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError, v1Get, v1Patch, v1Post } from '@/lib/api-client';
import type {
  V1AdminTournamentCampaignPreview,
  V1PublicTournamentCampaign,
  V1TournamentCampaign,
} from '@/types/tournament-campaign';
import { createV1TournamentCampaignMswHandlers } from './tournament-campaign-handlers';

let server: ReturnType<typeof setupServer>;

describe('tournament campaign production API consumer contract', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
    server = setupServer(...createV1TournamentCampaignMswHandlers('draft'));
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.close();
    vi.unstubAllEnvs();
  });

  it('keeps preview and public reads on one lifecycle state', async () => {
    const adminPath = '/admin/tournaments/tournament-1/campaign';
    const publicPath = '/tournaments/campaigns/teameet-futsal-cup';
    const draft = await v1Get<V1TournamentCampaign>(adminPath);
    const updatedContent = {
      ...draft.content,
      hero: { ...draft.content.hero, title: '수정된 캠페인 제목' },
    };

    await expect(v1Get<V1PublicTournamentCampaign>(publicPath)).rejects.toMatchObject({
      statusCode: 404,
      code: 'TOURNAMENT_CAMPAIGN_NOT_FOUND',
    } satisfies Partial<V1ApiError>);
    await v1Patch<V1TournamentCampaign>(adminPath, { content: updatedContent });
    const draftPreview = await v1Get<V1AdminTournamentCampaignPreview>(`${adminPath}/preview`);
    expect(draftPreview.content.hero.title).toBe('수정된 캠페인 제목');

    await v1Post(`${adminPath}/status`, { status: 'published', reason: '검수 완료' });
    const published = await v1Get<V1PublicTournamentCampaign>(publicPath);
    expect(published).toMatchObject({
      status: 'published',
      content: { hero: { title: '수정된 캠페인 제목' } },
    });

    await v1Post(`${adminPath}/status`, { status: 'archived', reason: '운영 종료' });
    await expect(v1Get<V1PublicTournamentCampaign>(publicPath)).rejects.toBeInstanceOf(V1ApiError);
    await expect(v1Get<V1TournamentCampaign>(adminPath)).resolves.toMatchObject({
      status: 'archived',
      slug: 'teameet-futsal-cup',
    });
  });

  it('starts every test with a fresh campaign row', async () => {
    await expect(
      v1Get<V1TournamentCampaign>('/admin/tournaments/tournament-1/campaign'),
    ).resolves.toMatchObject({
      status: 'draft',
      slug: 'teameet-futsal-cup',
      publishedAt: null,
    });
  });
});
