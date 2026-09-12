import { Prisma, V1TournamentStatus } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALPHA_SEED_FUTSAL_COMPETITION_CONFIG_ID,
  ALPHA_TOURNAMENT_SCENARIOS,
  alphaTeamLogoPreset,
  buildAlphaTournamentCampaignContent,
  createCompetitionData,
  ensureAlphaQaRecordConsent,
  FEATURED_TEAMS,
} from '../../prisma/seed-alpha-tournament-qa';
import {
  LEAGUE_PLAYER_NAMES,
  LEAGUE_TEAM_NAMES,
  SHOWCASE_SQUAD_PERSONAS,
} from '../../prisma/seed-alpha-league-qa';
import { assertShowcaseResultSeedAllowed } from '../../prisma/seed-alpha-showcase-results';
import { parseCampaignContentJson } from './tournament-campaign-content';
import { FUTSAL_COMPETITION_CONFIG_ID } from './competition-config/competition-config-backfill';

describe('alpha tournament QA campaign content', () => {
  it('10개 번들 팀 로고를 재현 가능한 셔플 순서로 배정한다', () => {
    const logos = Array.from({ length: 10 }, (_, index) => alphaTeamLogoPreset(index + 1));

    expect(new Set(logos).size).toBe(10);
    expect(logos).toEqual(logos.map((_, index) => alphaTeamLogoPreset(index + 1)));
    expect(logos.every((logo) => /^\/images\/team-logos\/team-logo-\d{2}\.jpg$/.test(logo))).toBe(true);
  });

  it('완료된 쇼케이스 대회·리그·친선 경기를 OFFICIAL_ONLY로 공개한다', () => {
    const leagueSeed = readFileSync(
      resolve(__dirname, '../../prisma/seed-alpha-league-qa.ts'),
      'utf8',
    );
    const showcaseResultSeed = readFileSync(
      resolve(__dirname, '../../prisma/seed-alpha-showcase-results.ts'),
      'utf8',
    );

    expect(leagueSeed).toContain(
      'mode: spec.result === null ? V1VisibilityMode.LIVE : V1VisibilityMode.OFFICIAL_ONLY',
    );
    expect(showcaseResultSeed).not.toContain("mode: 'LIVE'");
    expect(showcaseResultSeed).toContain('update: { mode: V1VisibilityMode.OFFICIAL_ONLY }');
  });

  it('쇼케이스 리그를 자연스러운 5개 팀·31명 선수로 구성한다', () => {
    const teamNames = [FEATURED_TEAMS[0].name, ...LEAGUE_TEAM_NAMES];
    const playerNames = [
      ...SHOWCASE_SQUAD_PERSONAS.map((persona) => persona.nickname),
      ...LEAGUE_PLAYER_NAMES.flat(),
    ];

    expect(teamNames).toHaveLength(5);
    expect(new Set(teamNames).size).toBe(5);
    expect(SHOWCASE_SQUAD_PERSONAS).toHaveLength(15);
    expect(playerNames).toHaveLength(31);
    expect(new Set(playerNames).size).toBe(31);
    expect([...teamNames, ...playerNames].filter((name) => /\(테스트\)|QA|리그QA|\d+팀\d+/i.test(name))).toEqual([]);
  });

  it('guards production showcase-result seeding and preserves the local QA path', () => {
    expect(() =>
      assertShowcaseResultSeedAllowed({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@v1_postgres:5432/teameet_alpha',
      }),
    ).toThrow();

    expect(() =>
      assertShowcaseResultSeedAllowed({
        NODE_ENV: 'production',
        V1_ALPHA_QA_SEED: 'true',
        V1_ALPHA_QA_ORIGIN: 'https://alpha.teameet.co.kr',
        DATABASE_URL: 'postgresql://u:p@v1_postgres:5432/teameet_alpha',
      }),
    ).not.toThrow();

    expect(() =>
      assertShowcaseResultSeedAllowed({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://u:p@v1_postgres:5432/teameet_alpha',
      }),
    ).not.toThrow();
  });

  it('creates public-record consent for a QA persona without overwriting a later revocation', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    await ensureAlphaQaRecordConsent(
      { v1UserRecordConsent: { upsert } } as never,
      'qa-user-1',
    );

    expect(upsert).toHaveBeenCalledWith({
      where: { userId: 'qa-user-1' },
      update: {},
      create: {
        userId: 'qa-user-1',
        state: 'GRANTED',
        policyHash: 'alpha-qa-fixture-v1',
      },
    });
  });

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

  it('시드의 canonical 풋살 config id 가 레지스트리 상수와 일치한다', () => {
    // 시드는 배포 이미지 안에서 도는 탓에 `../src/...` 를 import 할 수 없어 값을 복제한다.
    // 그 복제본이 어긋나면 시드가 존재하지 않는 config 를 픽스처에 박게 되므로 여기서 고정한다.
    expect(ALPHA_SEED_FUTSAL_COMPETITION_CONFIG_ID).toBe(FUTSAL_COMPETITION_CONFIG_ID);
  });

  it('배포 이미지 안에서 실행되는 prisma 스크립트는 src/ 를 import 하지 않는다', () => {
    // alpha 배포는 `ts-node prisma/seed-alpha-tournament-qa.ts` 를 API 프로덕션 이미지
    // 안에서 실행하는데, 그 이미지에는 `src/` 가 없다(dist/·prisma/·node_modules 만 COPY).
    // 실제로 `../src/...` import 하나 때문에 2026-08-09 배포가 MODULE_NOT_FOUND 로 죽었고,
    // CI 는 src/ 가 존재하는 레포에서 돌아 잡지 못했다. 그래서 소스 텍스트로 고정한다.
    // 리그 QA 시드도 같은 자리에서 같은 방식으로 실행되므로 같은 가드를 받는다 --
    // 시드가 늘어날 때마다 가드가 한 파일에만 남으면 다음 시드가 그대로 사고를 반복한다.
    const seedScripts = ['seed-alpha-tournament-qa.ts', 'seed-alpha-league-qa.ts'];
    const srcImportsByScript = seedScripts.map((script) => {
      const seedSource = readFileSync(resolve(__dirname, '../../prisma/', script), 'utf8');
      const srcImports = seedSource
        .split('\n')
        .filter((line) => /^\s*import[^;]*from\s+['"]\.\.\/src\//.test(line));
      return [script, srcImports] as const;
    });
    expect(srcImportsByScript).toEqual(seedScripts.map((script) => [script, []]));
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
    expect(content.faqSectionTitle).toBe('테스트 안내');
  });
});
