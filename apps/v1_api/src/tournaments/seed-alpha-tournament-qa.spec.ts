import { Prisma, V1TournamentStatus } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALPHA_SEED_FUTSAL_COMPETITION_CONFIG_ID,
  ALPHA_TOURNAMENT_SCENARIOS,
  alphaTeamLogoPreset,
  buildAlphaTournamentCampaignContent,
  computeOfficialTopScorer,
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

  describe('computeOfficialTopScorer', () => {
    // 공개 GET /tournaments/:id/player-records(PublicTournamentRecordsService.getPlayerRecords)
    // 와 같은 소스·동의 게이팅·정렬을 시드가 복제한 결과를 검증한다 — DB 없이, 실제 쿼리가
    // 넘기는 where 절을 그대로 해석하는 페이크 tx 로 "이 함수가 깨지면 잡히는" 계약을 건다.
    type GameRow = { currentOfficialRevisionId: string; visibilityPolicy: { mode: string } | null };
    type ParticipantRow = {
      resultRevisionId: string;
      participantId: string;
      sideId: string;
      goals: number;
      resultRevision: { officialAt: Date | null };
    };
    type LinkRow = { participantId: string; linkId: string; userId: string };
    type ConsentRow = { userId: string; state: string };
    type SnapshotRow = { linkId: string; consentVersion: number; state: string };

    function buildTx(fixture: {
      games: readonly GameRow[];
      participants: readonly ParticipantRow[];
      links: readonly LinkRow[];
      consents: readonly ConsentRow[];
      snapshots: readonly SnapshotRow[];
      users: Record<string, { profile: { nickname: string; displayName: string | null; deletedAt: Date | null } | null }>;
      sides: Record<string, { teamId: string | null }>;
      teams: Record<string, { name: string }>;
    }) {
      return {
        v1Game: { findMany: jest.fn().mockResolvedValue(fixture.games) },
        v1GameResultParticipant: {
          findMany: jest.fn(({ where }: { where: { resultRevisionId: { in: readonly string[] } } }) =>
            Promise.resolve(
              fixture.participants.filter((row) => where.resultRevisionId.in.includes(row.resultRevisionId)),
            ),
          ),
        },
        v1ParticipantIdentityLinkCurrent: {
          findMany: jest.fn(({ where }: { where: { participantId: { in: readonly string[] } } }) =>
            Promise.resolve(fixture.links.filter((link) => where.participantId.in.includes(link.participantId))),
          ),
        },
        v1UserRecordConsent: {
          findMany: jest.fn(({ where }: { where: { userId: { in: readonly string[] } } }) =>
            Promise.resolve(fixture.consents.filter((consent) => where.userId.in.includes(consent.userId))),
          ),
        },
        v1ParticipantConsentSnapshot: {
          // orderBy 를 실제로 적용해서(무시하지 않고) "최신 스냅샷이 이긴다" 로직이
          // 구현의 orderBy: { consentVersion: 'desc' } 에 실제로 의존하는지 검증한다
          // (Copilot 리뷰) — orderBy 가 없으면 fixture 순서(일부러 오름차순으로 구성)를
          // 그대로 보존해, 구현이 정렬을 빠뜨리면 "최신"이 아니라 "가장 먼저 만든" 스냅샷을
          // 집도록 만들어 그 회귀를 테스트가 실제로 잡게 한다.
          findMany: jest.fn(
            ({
              where,
              orderBy,
            }: {
              where: { linkId: { in: readonly string[] } };
              orderBy?: { consentVersion?: 'asc' | 'desc' };
            }) => {
              const matched = fixture.snapshots.filter((snapshot) => where.linkId.in.includes(snapshot.linkId));
              if (orderBy?.consentVersion === 'desc') {
                matched.sort((a, b) => b.consentVersion - a.consentVersion);
              } else if (orderBy?.consentVersion === 'asc') {
                matched.sort((a, b) => a.consentVersion - b.consentVersion);
              }
              return Promise.resolve(matched);
            },
          ),
        },
        v1User: {
          findUnique: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(fixture.users[where.id] ?? null)),
        },
        v1GameSide: {
          findUnique: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(fixture.sides[where.id] ?? null)),
        },
        v1Team: {
          findUnique: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(fixture.teams[where.id] ?? null)),
        },
      } as never;
    }

    const officialAt = new Date('2026-09-01T00:00:00.000Z');

    it('공식 리비전 goals 집계 1위를 득점왕으로 고른다 (숨김 처리된 경기의 골은 제외)', async () => {
      const tx = buildTx({
        games: [
          { currentOfficialRevisionId: 'rev-visible', visibilityPolicy: { mode: 'OFFICIAL_ONLY' } },
          // HIDDEN 게임의 99골은 절대 top scorer 계산에 반영되면 안 된다.
          { currentOfficialRevisionId: 'rev-hidden', visibilityPolicy: { mode: 'HIDDEN' } },
        ],
        participants: [
          { resultRevisionId: 'rev-visible', participantId: 'p-kim', sideId: 's-home', goals: 12, resultRevision: { officialAt } },
          { resultRevisionId: 'rev-visible', participantId: 'p-park', sideId: 's-away', goals: 7, resultRevision: { officialAt } },
          { resultRevisionId: 'rev-hidden', participantId: 'p-fake', sideId: 's-hidden', goals: 99, resultRevision: { officialAt } },
        ],
        links: [
          { participantId: 'p-kim', linkId: 'l-kim', userId: 'u-kim' },
          { participantId: 'p-park', linkId: 'l-park', userId: 'u-park' },
          { participantId: 'p-fake', linkId: 'l-fake', userId: 'u-fake' },
        ],
        consents: [
          { userId: 'u-kim', state: 'GRANTED' },
          { userId: 'u-park', state: 'GRANTED' },
          { userId: 'u-fake', state: 'GRANTED' },
        ],
        snapshots: [],
        users: { 'u-kim': { profile: { nickname: '김민준', displayName: null, deletedAt: null } } },
        sides: { 's-home': { teamId: 't-seoul' } },
        teams: { 't-seoul': { name: '서울 나이트 FC' } },
      });

      const result = await computeOfficialTopScorer(tx, 'tournament-1');

      expect(result).toEqual({ userId: 'u-kim', recipientName: '김민준', teamName: '서울 나이트 FC', goals: 12 });
      const participantCall = (tx as { v1GameResultParticipant: { findMany: jest.Mock } }).v1GameResultParticipant.findMany.mock
        .calls[0][0];
      expect(participantCall.where.resultRevisionId.in).toEqual(['rev-visible']);
    });

    it('사용자 단위 동의 행이 아예 없는(GRANTED 아닌) 최다 득점자는 제외하고 그다음 순위를 고른다', async () => {
      const tx = buildTx({
        games: [{ currentOfficialRevisionId: 'rev-1', visibilityPolicy: { mode: 'OFFICIAL_ONLY' } }],
        participants: [
          { resultRevisionId: 'rev-1', participantId: 'p-kim', sideId: 's-home', goals: 12, resultRevision: { officialAt } },
          { resultRevisionId: 'rev-1', participantId: 'p-park', sideId: 's-away', goals: 7, resultRevision: { officialAt } },
        ],
        links: [
          { participantId: 'p-kim', linkId: 'l-kim', userId: 'u-kim' },
          { participantId: 'p-park', linkId: 'l-park', userId: 'u-park' },
        ],
        consents: [
          // u-kim은 동의 행이 아예 없다 = 아직 동의한 적 없음(GRANTED 아님) -> 제외.
          { userId: 'u-park', state: 'GRANTED' },
        ],
        snapshots: [],
        users: { 'u-park': { profile: { nickname: '박도윤', displayName: null, deletedAt: null } } },
        sides: { 's-away': { teamId: 't-yongsan' } },
        teams: { 't-yongsan': { name: '용산 시티' } },
      });

      const result = await computeOfficialTopScorer(tx, 'tournament-1');

      expect(result).toEqual({ userId: 'u-park', recipientName: '박도윤', teamName: '용산 시티', goals: 7 });
    });

    it('participant 단위 최신 스냅샷이 REVOKED면 사용자 단위 GRANTED 여도 제외한다(orderBy: consentVersion desc 계약)', async () => {
      const tx = buildTx({
        games: [{ currentOfficialRevisionId: 'rev-1', visibilityPolicy: { mode: 'OFFICIAL_ONLY' } }],
        participants: [
          { resultRevisionId: 'rev-1', participantId: 'p-kim', sideId: 's-home', goals: 12, resultRevision: { officialAt } },
          { resultRevisionId: 'rev-1', participantId: 'p-park', sideId: 's-away', goals: 7, resultRevision: { officialAt } },
        ],
        links: [
          { participantId: 'p-kim', linkId: 'l-kim', userId: 'u-kim' },
          { participantId: 'p-park', linkId: 'l-park', userId: 'u-park' },
        ],
        consents: [
          { userId: 'u-kim', state: 'GRANTED' },
          { userId: 'u-park', state: 'GRANTED' },
        ],
        // 일부러 오름차순(과거 -> 최신)으로 fixture 를 구성한다. 구현이
        // orderBy: { consentVersion: 'desc' } 를 요청해야만 "최신(v2=REVOKED)이
        // 이긴다"가 성립한다 — 정렬을 빠뜨리면 mock 이 이 순서를 그대로 돌려주므로
        // "첫 번째로 본 스냅샷(v1=GRANTED)이 이긴다"로 뒤집혀 아래 기대값이 깨진다.
        snapshots: [
          { linkId: 'l-kim', consentVersion: 1, state: 'GRANTED' },
          { linkId: 'l-kim', consentVersion: 2, state: 'REVOKED' },
        ],
        users: { 'u-park': { profile: { nickname: '박도윤', displayName: null, deletedAt: null } } },
        sides: { 's-away': { teamId: 't-yongsan' } },
        teams: { 't-yongsan': { name: '용산 시티' } },
      });

      const result = await computeOfficialTopScorer(tx, 'tournament-1');

      expect(result).toEqual({ userId: 'u-park', recipientName: '박도윤', teamName: '용산 시티', goals: 7 });
      const snapshotCall = (tx as { v1ParticipantConsentSnapshot: { findMany: jest.Mock } }).v1ParticipantConsentSnapshot
        .findMany.mock.calls[0][0];
      expect(snapshotCall.orderBy).toEqual({ consentVersion: 'desc' });
    });

    it('공식 득점 기록이 0건이면 득점왕을 만들지 않는다(null)', async () => {
      const tx = buildTx({
        games: [{ currentOfficialRevisionId: 'rev-1', visibilityPolicy: { mode: 'OFFICIAL_ONLY' } }],
        participants: [
          { resultRevisionId: 'rev-1', participantId: 'p-kim', sideId: 's-home', goals: 0, resultRevision: { officialAt } },
        ],
        links: [],
        consents: [],
        snapshots: [],
        users: {},
        sides: {},
        teams: {},
      });

      const result = await computeOfficialTopScorer(tx, 'tournament-1');

      expect(result).toBeNull();
    });
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
