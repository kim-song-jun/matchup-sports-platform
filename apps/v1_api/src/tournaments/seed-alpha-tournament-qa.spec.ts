import { Prisma, V1TournamentStatus } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALPHA_SEED_FUTSAL_COMPETITION_CONFIG_ID,
  ALPHA_TOURNAMENT_SCENARIOS,
  buildAlphaTournamentCampaignContent,
  createCompetitionData,
  ensureAlphaQaRecordConsent,
  FEATURED_PERSONAS,
  FEATURED_TEAMS,
} from '../../prisma/seed-alpha-tournament-qa';
import { LEAGUE_PLAYER_NAMES, LEAGUE_TEAM_NAMES } from '../../prisma/seed-alpha-league-qa';
import { parseCampaignContentJson } from './tournament-campaign-content';
import { FUTSAL_COMPETITION_CONFIG_ID } from './competition-config/competition-config-backfill';

describe('alpha tournament QA campaign content', () => {
  it('쇼케이스 리그를 자연스러운 5개 팀·20명 선수로 구성한다', () => {
    const teamNames = [FEATURED_TEAMS[0].name, ...LEAGUE_TEAM_NAMES];
    const playerNames = [
      ...FEATURED_PERSONAS.map((persona) => persona.nickname),
      ...LEAGUE_PLAYER_NAMES.flat(),
    ];

    expect(teamNames).toHaveLength(5);
    expect(new Set(teamNames).size).toBe(5);
    expect(playerNames).toHaveLength(20);
    expect(new Set(playerNames).size).toBe(20);
    expect([...teamNames, ...playerNames].filter((name) => /\(테스트\)|QA|리그QA|\d+팀\d+/i.test(name))).toEqual([]);
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

  it('creates completed knockout rounds so final rankings and videos are reachable', async () => {
    const rounds: string[] = [];
    const fixtureConfigIds: Array<string | undefined> = [];
    // Part 2: createCompetitionData 는 group·fixture·fixtureResult 를 자연키/유니크로 upsert 한다
    // (삭제-재생성 대신 유지). round·config 는 upsert 의 `create` 절에서 읽는다.
    const tx = {
      v1TournamentGroup: { upsert: jest.fn().mockResolvedValue({ id: 'group-a' }) },
      v1TournamentGroupTeam: { create: jest.fn().mockResolvedValue({}) },
      v1TournamentFixture: {
        upsert: jest.fn().mockImplementation(
          ({ create }: { create: { round: string; competitionConfigVersionId?: string } }) => {
          rounds.push(create.round);
          fixtureConfigIds.push(create.competitionConfigVersionId);
          return Promise.resolve({ id: `fixture-${rounds.length}`, round: create.round });
          },
        ),
      },
      v1TournamentFixtureResult: { upsert: jest.fn().mockResolvedValue({}) },
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
      ALPHA_SEED_FUTSAL_COMPETITION_CONFIG_ID,
    );

    expect(rounds).toEqual(expect.arrayContaining(['semi', 'final', 'third_place']));
    // 픽스처마다 config 가 박히지 않으면 fixture-game 백필이 CONFIG_MISSING 으로 격리해
    // 공개 대회 일정이 통째로 비어버린다(2026-08-09 alpha 실측). 그 계약을 여기서 고정한다.
    expect(fixtureConfigIds.length).toBeGreaterThan(0);
    expect(fixtureConfigIds.every((value) => value === ALPHA_SEED_FUTSAL_COMPETITION_CONFIG_ID)).toBe(true);
    expect(fixtures.find((fixture) => fixture.round === 'final')).toBeDefined();
  });

  it('재배포가 라이브 운영이 만든 픽스처 상태·스코어를 덮지 않는다', async () => {
    // 2026-08-11 알파 실측 회귀. 2경기는 게임이 ENDED 이고 OFFICIAL 결과(2:0)까지 있었는데
    // 픽스처 status 만 in_progress 로 되돌아가 있었다. 원인은 이 시드가 upsert 의 `update` 절에
    // status 를 실어 배포마다 덮어썼기 때문이고, 순위 재계산은 `status: 'completed'` 픽스처만
    // 읽으므로(tournament-bracket.service.ts) 2:0 으로 이긴 팀이 순위표에 0승 0-0 으로 나왔다.
    //
    // status 는 officialize 가 결과 확정과 같은 트랜잭션에서 올리는 **운영의 산물**이다.
    // 시드는 초기값만 정하고(create) 이후 상태를 건드리면 안 된다.
    const fixtureUpserts: Array<{ create: Record<string, unknown>; update: Record<string, unknown> }> = [];
    const resultUpserts: Array<{ create: Record<string, unknown>; update: Record<string, unknown> }> = [];
    const tx = {
      v1TournamentGroup: { upsert: jest.fn().mockResolvedValue({ id: 'group-a' }) },
      v1TournamentGroupTeam: { create: jest.fn().mockResolvedValue({}) },
      v1TournamentFixture: {
        upsert: jest.fn().mockImplementation((args: (typeof fixtureUpserts)[number]) => {
          fixtureUpserts.push(args);
          return Promise.resolve({ id: `fixture-${fixtureUpserts.length}`, round: 'group' });
        }),
      },
      v1TournamentFixtureResult: {
        upsert: jest.fn().mockImplementation((args: (typeof resultUpserts)[number]) => {
          resultUpserts.push(args);
          return Promise.resolve({});
        }),
      },
    } as unknown as Parameters<typeof createCompetitionData>[0];
    const registrations = Array.from({ length: 4 }, (_, index) => ({
      id: `registration-${index + 1}`,
    })) as unknown as Parameters<typeof createCompetitionData>[2];
    const inProgressScenario = ALPHA_TOURNAMENT_SCENARIOS.find(
      (scenario) => scenario.status === V1TournamentStatus.in_progress,
    );
    if (!inProgressScenario) throw new Error('An in_progress alpha tournament scenario is required.');

    await createCompetitionData(
      tx,
      inProgressScenario,
      registrations,
      new Date('2026-07-04T01:00:00.000Z'),
      ALPHA_SEED_FUTSAL_COMPETITION_CONFIG_ID,
    );

    expect(fixtureUpserts.length).toBeGreaterThan(0);
    // create 에는 초기 상태가 있어야 한다 — 새 환경에서 시나리오가 재현되지 않으면 시드가 무의미하다.
    expect(fixtureUpserts.every((call) => 'status' in call.create)).toBe(true);
    // update 에는 절대 없어야 한다.
    expect(fixtureUpserts.filter((call) => 'status' in call.update)).toEqual([]);

    expect(resultUpserts.length).toBeGreaterThan(0);
    expect(resultUpserts.every((call) => 'homeScore' in call.create && 'awayScore' in call.create)).toBe(true);
    expect(
      resultUpserts.filter((call) => 'homeScore' in call.update || 'awayScore' in call.update),
    ).toEqual([]);
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
