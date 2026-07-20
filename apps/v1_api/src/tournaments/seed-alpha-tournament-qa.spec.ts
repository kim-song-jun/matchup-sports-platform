import { Prisma, V1TournamentStatus } from '@prisma/client';
import {
  ALPHA_TOURNAMENT_SCENARIOS,
  buildAlphaTournamentCampaignContent,
  createCompetitionData,
} from '../../prisma/seed-alpha-tournament-qa';
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

  it('creates completed knockout rounds so final rankings and videos are reachable', async () => {
    const rounds: string[] = [];
    const tx = {
      v1TournamentGroup: { create: jest.fn().mockResolvedValue({ id: 'group-a' }) },
      v1TournamentGroupTeam: { create: jest.fn().mockResolvedValue({}) },
      v1TournamentStanding: { create: jest.fn().mockResolvedValue({}) },
      v1TournamentFixture: {
        create: jest.fn().mockImplementation(({ data }: { data: { round: string } }) => {
          rounds.push(data.round);
          return Promise.resolve({ id: `fixture-${rounds.length}`, round: data.round });
        }),
      },
      v1TournamentFixtureResult: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as Parameters<typeof createCompetitionData>[0];
    const registrations = Array.from({ length: 4 }, (_, index) => ({
      id: `registration-${index + 1}`,
    })) as unknown as Parameters<typeof createCompetitionData>[2];
    const completedScenario = ALPHA_TOURNAMENT_SCENARIOS.find(
      (scenario) => scenario.status === V1TournamentStatus.completed,
    );
    if (!completedScenario) throw new Error('Completed alpha tournament scenario is required.');

    const fixtures = await createCompetitionData(
      tx,
      completedScenario,
      registrations,
      new Date('2026-07-04T01:00:00.000Z'),
    );

    expect(rounds).toEqual(expect.arrayContaining(['semi', 'final', 'third_place']));
    expect(fixtures.find((fixture) => fixture.round === 'final')).toBeDefined();
  });

  it('seeds one non-QA "featured" completed scenario with real-looking marketing copy', () => {
    const featuredScenario = ALPHA_TOURNAMENT_SCENARIOS.find((scenario) => scenario.marketing);
    if (!featuredScenario) throw new Error('A featured (non-QA) alpha tournament scenario is required.');

    expect(featuredScenario.status).toBe(V1TournamentStatus.completed);
    expect(featuredScenario.title).not.toMatch(/ALPHA QA|alpha qa/i);
    expect(featuredScenario.marketing?.promoHomeSubtitle).not.toMatch(/ALPHA|QA/i);
    expect(featuredScenario.marketing?.rulesText).not.toMatch(/ALPHA QA/i);
    expect(featuredScenario.marketing?.sponsor.name).not.toMatch(/ALPHA/i);

    const content = buildAlphaTournamentCampaignContent(
      featuredScenario,
      new Date('2026-08-08T09:00:00.000Z'),
      new Date('2026-08-01T09:00:00.000Z'),
    ) as {
      intro: { title: string; body: string };
      faqSectionTitle: string;
      faq: readonly { question: string; answer: string }[];
    };
    expect(content.intro.body).not.toMatch(/alpha qa/i);
    expect(content.faqSectionTitle).not.toMatch(/ALPHA QA/i);
    expect(content.faq.length).toBeGreaterThan(0);
    for (const item of content.faq) {
      expect(item.answer).not.toMatch(/alpha 전용 테스트|프로덕션으로 역동기화/i);
    }

    const persistedContent = JSON.parse(JSON.stringify(content)) as Prisma.JsonValue;
    expect(() => parseCampaignContentJson(persistedContent)).not.toThrow();
  });

  it('keeps existing QA scenarios on the original ALPHA-QA campaign copy (no marketing override)', () => {
    const qaCompletedScenario = ALPHA_TOURNAMENT_SCENARIOS.find(
      (scenario) => scenario.status === V1TournamentStatus.completed && !scenario.marketing,
    );
    if (!qaCompletedScenario) throw new Error('The original QA completed scenario must still exist.');

    const content = buildAlphaTournamentCampaignContent(
      qaCompletedScenario,
      new Date('2026-08-08T09:00:00.000Z'),
      new Date('2026-08-01T09:00:00.000Z'),
    ) as { faqSectionTitle: string };
    expect(content.faqSectionTitle).toBe('ALPHA QA 안내');
  });
});
