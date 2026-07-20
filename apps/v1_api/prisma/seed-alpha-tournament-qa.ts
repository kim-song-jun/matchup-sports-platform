import {
  Prisma,
  PrismaClient,
  V1TournamentFixtureStatus,
  V1TournamentRegistrationStatus,
  V1TournamentStatus,
} from '@prisma/client';

const ALPHA_QA_ORIGIN = 'https://alpha.teameet.co.kr';
const ALPHA_QA_DATABASE_HOST = 'v1_postgres';
const ALPHA_QA_DATABASE_NAME = 'teameet_alpha';
const COVER_IMAGE_URL = '/mock/generated/futsal-rooftop.webp';
const TEAM_IMAGE_URL = '/mock/generated/team-huddle.webp';
const HIGHLIGHT_VIDEO_URL = '/mock/generated/tournament-highlight.webm';

type TournamentMarketingCopy = {
  readonly promoHomeSubtitle: string;
  readonly announcementTitle: string;
  readonly announcementBody: string;
  readonly rulesText: string;
  readonly refundPolicyText: string;
  readonly bankName: string;
  readonly bankAccount: string;
  readonly bankHolder: string;
  readonly campaignIntroTitle: string;
  readonly campaignIntroBody: string;
  readonly campaignHighlightsSectionTitle: string;
  readonly campaignHighlightBody: string;
  readonly campaignFaqSectionTitle: string;
  readonly campaignFaq: readonly { readonly question: string; readonly answer: string }[];
  readonly sponsor: {
    readonly name: string;
    readonly description: string;
    readonly benefitText: string;
    readonly eventTitle: string;
    readonly eventDescription: string;
    readonly eventResultText: string;
  };
};

type TournamentScenario = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: V1TournamentStatus;
  readonly startsInDays: number;
  readonly entryFee: number;
  readonly promoPriority: number;
  readonly hasCampaign: boolean;
  // Present only for the one non-QA "featured" scenario: swaps every ALPHA-QA-labeled
  // string (subtitle/rules/FAQ/sponsor/etc.) for real-looking copy, and signals
  // createScenario/main to seed it against the separate FEATURED_* roster instead of
  // the shared alpha-QA teams, so it's safe to screenshot for marketing use.
  readonly marketing?: TournamentMarketingCopy;
};

export const ALPHA_TOURNAMENT_SCENARIOS: readonly TournamentScenario[] = [
  {
    id: 'aa100000-0000-4000-8000-000000000001',
    slug: 'alpha-qa-futsal-draft',
    title: '(테스트) 기획 중인 루키 풋살컵',
    status: V1TournamentStatus.draft,
    startsInDays: 35,
    entryFee: 0,
    promoPriority: 0,
    hasCampaign: false,
  },
  {
    id: 'aa100000-0000-4000-8000-000000000002',
    slug: 'alpha-qa-futsal-recruiting',
    title: '(테스트) 참가 모집 중 풋살 오픈',
    status: V1TournamentStatus.open,
    startsInDays: 21,
    entryFee: 120_000,
    promoPriority: 60,
    hasCampaign: true,
  },
  {
    id: 'aa100000-0000-4000-8000-000000000003',
    slug: 'alpha-qa-futsal-roster-lock',
    title: '(테스트) 모집 마감 · 명단 확정 컵',
    status: V1TournamentStatus.closed,
    startsInDays: 7,
    entryFee: 100_000,
    promoPriority: 40,
    hasCampaign: true,
  },
  {
    id: 'aa100000-0000-4000-8000-000000000004',
    slug: 'alpha-qa-futsal-live',
    title: '(테스트) 현재 경기 중 챔피언십',
    status: V1TournamentStatus.in_progress,
    startsInDays: 0,
    entryFee: 150_000,
    promoPriority: 80,
    hasCampaign: true,
  },
  {
    id: 'aa100000-0000-4000-8000-000000000005',
    slug: 'alpha-qa-futsal-completed',
    title: '(테스트) 결과 · 영상 · 개인 시상 컵',
    status: V1TournamentStatus.completed,
    startsInDays: -14,
    entryFee: 150_000,
    promoPriority: 20,
    hasCampaign: true,
  },
  {
    id: 'aa100000-0000-4000-8000-000000000006',
    slug: 'alpha-qa-futsal-cancelled',
    title: '(테스트) 취소된 우천 풋살컵',
    status: V1TournamentStatus.cancelled,
    startsInDays: 10,
    entryFee: 80_000,
    promoPriority: 0,
    hasCampaign: false,
  },
  {
    id: 'ab100000-0000-4000-8000-000000000001',
    slug: 'teameet-summer-futsal-championship',
    title: '팀밋 여름 풋살 챔피언십',
    status: V1TournamentStatus.completed,
    startsInDays: -10,
    entryFee: 150_000,
    promoPriority: 100,
    hasCampaign: true,
    marketing: {
      promoHomeSubtitle: '우승팀과 결승 하이라이트 영상을 확인해보세요',
      announcementTitle: '대회 결과 안내',
      announcementBody: '뜨거웠던 여름, 팀밋 여름 풋살 챔피언십이 성황리에 마무리됐어요. 최종 순위와 하이라이트 영상을 확인해보세요.',
      rulesText: '대회 규정은 대회 상세 페이지에서 안내드려요. 참가 전 꼭 확인해 주세요.',
      refundPolicyText: '대회가 취소되면 참가비는 영업일 기준 3일 이내 신청 시 결제수단으로 환불돼요.',
      bankName: '국민은행',
      bankAccount: '123456-78-901234',
      bankHolder: '팀밋(주)',
      campaignIntroTitle: '팀밋 여름 풋살 챔피언십, 성황리에 마무리됐어요',
      campaignIntroBody: '팀밋이 직접 운영한 시즌 대표 대회예요. 신청부터 대진, 결과, 하이라이트 영상, 참가팀 후기까지 한 곳에서 확인할 수 있어요.',
      campaignHighlightsSectionTitle: '이 대회에서 확인할 수 있어요',
      campaignHighlightBody: '지난 대회의 최종 결과와 참가팀 순위를 그대로 확인할 수 있어요.',
      campaignFaqSectionTitle: '자주 묻는 질문',
      campaignFaq: [
        { question: '다음 시즌 대회는 언제 열리나요?', answer: '대회 목록과 공지사항에서 다음 시즌 일정을 가장 먼저 확인할 수 있어요.' },
        { question: '경기 영상은 어디서 볼 수 있나요?', answer: '대회 결과 페이지의 경기 영상 탭에서 하이라이트 영상을 바로 재생할 수 있어요.' },
        { question: '참가팀 후기는 어떻게 남기나요?', answer: '대회에 참가한 팀 대표는 로그인 후 후기·매너 평가 메뉴에서 리뷰를 남길 수 있어요.' },
      ],
      sponsor: {
        name: '팀밋 파트너스',
        description: '팀밋과 함께하는 공식 파트너입니다.',
        benefitText: '참가팀 전원 사은품 증정',
        eventTitle: '결승 스코어 예측 이벤트',
        eventDescription: 'SNS 댓글로 결승 스코어를 맞히면 추첨을 통해 상품을 드려요.',
        eventResultText: '팀밋fs 우승! 이벤트 당첨자는 개별 안내드렸어요.',
      },
    },
  },
] as const;

const FEATURED_QA_DEFAULT_MARKETING: TournamentMarketingCopy = {
  promoHomeSubtitle: '내부 테스트용 데이터예요',
  announcementTitle: '(테스트) 대회 운영 안내',
  announcementBody: '',
  rulesText: '내부 테스트 전용 데이터입니다. 실제 경기나 결제 효력이 없습니다.',
  refundPolicyText: '내부 테스트 전용 환불 안내입니다. 실제 환불은 발생하지 않습니다.',
  bankName: '테스트은행',
  bankAccount: '000-0000-0000',
  bankHolder: '테스트 계정 · 실제 송금 금지',
  campaignIntroTitle: '대회 상태별 실제 사용자 플로우를 확인해 보세요',
  campaignIntroBody: '이 이벤트는 내부 테스트 전용 목데이터입니다. 신청, 명단, 대진, 결과, 영상, 후기와 개인 시상 화면을 실제 배포 환경에서 점검할 수 있습니다.',
  campaignHighlightsSectionTitle: '이 대회에서 확인할 수 있는 기능',
  campaignHighlightBody: '',
  campaignFaqSectionTitle: '테스트 안내',
  campaignFaq: [],
  sponsor: {
    name: '팀밋 테스트 파트너',
    description: '테스트 전용 가상 스폰서',
    benefitText: '참가팀 전원 테스트 기념품',
    eventTitle: '결승 스코어 맞히기',
    eventDescription: '테스트 화면 검증용 이벤트',
    eventResultText: '우승팀 발표 완료',
  },
};

type PersonaSeed = { readonly id: string; readonly email: string; readonly nickname: string; readonly realName: string; readonly gender: string };
type TeamSeed = { readonly id: string; readonly name: string };

const PERSONAS: readonly PersonaSeed[] = [
  { id: 'aa200000-0000-4000-8000-000000000001', email: 'alpha.qa.red@teameet.test', nickname: '알파레드', realName: '김알파', gender: 'male' },
  { id: 'aa200000-0000-4000-8000-000000000002', email: 'alpha.qa.blue@teameet.test', nickname: '알파블루', realName: '이테스트', gender: 'female' },
  { id: 'aa200000-0000-4000-8000-000000000003', email: 'alpha.qa.green@teameet.test', nickname: '알파그린', realName: '박경기', gender: 'male' },
  { id: 'aa200000-0000-4000-8000-000000000004', email: 'alpha.qa.gold@teameet.test', nickname: '알파골드', realName: '최완료', gender: 'female' },
] as const;

const TEAMS: readonly TeamSeed[] = [
  { id: 'aa300000-0000-4000-8000-000000000001', name: '알파 레드 FC' },
  { id: 'aa300000-0000-4000-8000-000000000002', name: '알파 블루 FC' },
  { id: 'aa300000-0000-4000-8000-000000000003', name: '알파 그린 FC' },
  { id: 'aa300000-0000-4000-8000-000000000004', name: '알파 골드 FC' },
] as const;

// Roster for the one non-QA "featured" scenario (marketing screenshots) — kept
// separate from PERSONAS/TEAMS above so the alpha-QA teams never carry a
// realistic-looking name, and vice versa.
const FEATURED_PERSONAS: readonly PersonaSeed[] = [
  { id: 'ab200000-0000-4000-8000-000000000001', email: 'summer.cup.champion@teameet.alpha', nickname: '민준선수', realName: '김민준', gender: 'male' },
  { id: 'ab200000-0000-4000-8000-000000000002', email: 'summer.cup.runner@teameet.alpha', nickname: '서연선수', realName: '이서연', gender: 'female' },
  { id: 'ab200000-0000-4000-8000-000000000003', email: 'summer.cup.scorer@teameet.alpha', nickname: '도윤선수', realName: '박도윤', gender: 'male' },
  { id: 'ab200000-0000-4000-8000-000000000004', email: 'summer.cup.keeper@teameet.alpha', nickname: '유나선수', realName: '최유나', gender: 'female' },
] as const;

const FEATURED_TEAMS: readonly TeamSeed[] = [
  { id: 'ab300000-0000-4000-8000-000000000001', name: '팀밋fs' },
  { id: 'ab300000-0000-4000-8000-000000000002', name: '팀밋 유나이티드' },
  { id: 'ab300000-0000-4000-8000-000000000003', name: '팀밋 레이너스' },
  { id: 'ab300000-0000-4000-8000-000000000004', name: '팀밋 선라이즈' },
] as const;

function assertAlphaSeedAllowed(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV !== 'production') {
    throw new Error('Alpha tournament QA seed requires the production-mode alpha image.');
  }
  if (env.V1_ALPHA_QA_SEED !== 'true' || env.V1_ALPHA_QA_ORIGIN !== ALPHA_QA_ORIGIN) {
    throw new Error('Alpha tournament QA seed requires the explicit alpha confirmation flags.');
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');

  const databaseUrl = new URL(env.DATABASE_URL);
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ''));
  if (databaseUrl.hostname !== ALPHA_QA_DATABASE_HOST || databaseName !== ALPHA_QA_DATABASE_NAME) {
    throw new Error(
      `Refusing alpha QA seed for ${databaseUrl.hostname}/${databaseName || '(missing)'}.`,
    );
  }
}

function scenarioDate(now: Date, days: number, hour: number) {
  const value = new Date(now);
  value.setUTCDate(value.getUTCDate() + days);
  value.setUTCHours(hour, 0, 0, 0);
  return value;
}

export function buildAlphaTournamentCampaignContent(
  scenario: TournamentScenario,
  scheduledAt: Date,
  registrationDeadlineAt: Date,
): Prisma.InputJsonObject {
  const marketing = scenario.marketing;
  if (marketing) {
    return {
      version: 1,
      hero: {
        title: scenario.title,
        summary: `${scheduledAt.toISOString().slice(0, 10)} · 서울 송파 풋살파크 · 4개 팀`,
        imageUrl: `${ALPHA_QA_ORIGIN}${COVER_IMAGE_URL}`,
      },
      intro: {
        title: marketing.campaignIntroTitle,
        body: marketing.campaignIntroBody,
      },
      highlightsSectionTitle: marketing.campaignHighlightsSectionTitle,
      highlights: [
        { title: '최종 결과', body: marketing.campaignHighlightBody },
        { title: '대진과 결과', body: '확정 참가팀, 조별 순위와 경기별 진행 상태를 함께 확인할 수 있습니다.' },
        { title: '완료 후 기록', body: '완료 대회에는 하이라이트 영상, 후기와 개인 어워드가 연결됩니다.' },
      ],
      faqSectionTitle: marketing.campaignFaqSectionTitle,
      faq: marketing.campaignFaq.map((item) => ({ question: item.question, answer: item.answer })),
    };
  }

  return {
    version: 1,
    hero: {
      title: scenario.title,
      summary: `${scheduledAt.toISOString().slice(0, 10)} · 서울 송파 풋살파크 · 4개 팀`,
      imageUrl: `${ALPHA_QA_ORIGIN}${COVER_IMAGE_URL}`,
    },
    intro: {
      title: FEATURED_QA_DEFAULT_MARKETING.campaignIntroTitle,
      body: FEATURED_QA_DEFAULT_MARKETING.campaignIntroBody,
    },
    highlightsSectionTitle: FEATURED_QA_DEFAULT_MARKETING.campaignHighlightsSectionTitle,
    highlights: [
      { title: '실제 상태 데이터', body: `현재 상태는 ${scenario.status}이며 재배포 시점에 맞춰 일정이 갱신됩니다.` },
      { title: '대진과 결과', body: '확정 참가팀, 조별 순위와 경기별 진행 상태를 함께 확인할 수 있습니다.' },
      { title: '완료 후 기록', body: '완료 대회에는 하이라이트 영상, 후기와 개인 어워드가 연결됩니다.' },
    ],
    faqSectionTitle: FEATURED_QA_DEFAULT_MARKETING.campaignFaqSectionTitle,
    faq: [
      { question: '실제 결제나 송금이 발생하나요?', answer: '아니요. alpha 전용 테스트 데이터이며 실제 결제와 송금은 발생하지 않습니다.' },
      { question: '신청 마감은 언제인가요?', answer: registrationDeadlineAt.toISOString() },
      { question: '이 데이터는 프로덕션으로 이동하나요?', answer: '아니요. alpha 데이터베이스에서만 유지되고 프로덕션으로 역동기화되지 않습니다.' },
    ],
  };
}

async function ensureTeamRoster(
  tx: Prisma.TransactionClient,
  sportId: string,
  regionId: string,
  personas: readonly PersonaSeed[],
  teamSeeds: readonly TeamSeed[],
  userBio: string,
  teamDescription: string,
) {
  const teams = [];
  for (let index = 0; index < personas.length; index += 1) {
    const persona = personas[index];
    const teamSeed = teamSeeds[index];
    const user = await tx.v1User.upsert({
      where: { email: persona.email },
      update: {
        phone: null,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        deletedAt: null,
      },
      create: {
        id: persona.id,
        email: persona.email,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        emailVerifiedAt: new Date(),
      },
    });
    await tx.v1UserProfile.upsert({
      where: { userId: user.id },
      update: {
        nickname: persona.nickname,
        displayName: persona.realName,
        realName: persona.realName,
        gender: persona.gender,
        birthDate: '1995-05-15',
        profileImageUrl: TEAM_IMAGE_URL,
        bio: userBio,
        deletedAt: null,
      },
      create: {
        userId: user.id,
        nickname: persona.nickname,
        displayName: persona.realName,
        realName: persona.realName,
        gender: persona.gender,
        birthDate: '1995-05-15',
        profileImageUrl: TEAM_IMAGE_URL,
        bio: userBio,
      },
    });
    const team = await tx.v1Team.upsert({
      where: { id: teamSeed.id },
      update: {
        ownerUserId: user.id,
        sportId,
        regionId,
        name: teamSeed.name,
        status: 'active',
        memberCount: 1,
        deletedAt: null,
      },
      create: {
        id: teamSeed.id,
        ownerUserId: user.id,
        sportId,
        regionId,
        name: teamSeed.name,
        status: 'active',
        memberCount: 1,
      },
    });
    await tx.v1TeamProfile.upsert({
      where: { teamId: team.id },
      update: {
        logoUrl: TEAM_IMAGE_URL,
        coverImageUrl: COVER_IMAGE_URL,
        description: teamDescription,
        deletedAt: null,
      },
      create: {
        teamId: team.id,
        logoUrl: TEAM_IMAGE_URL,
        coverImageUrl: COVER_IMAGE_URL,
        description: teamDescription,
      },
    });
    await tx.v1TeamMembership.upsert({
      where: { teamId_userId: { teamId: team.id, userId: user.id } },
      update: { role: 'owner', status: 'active', joinedAt: new Date(), leftAt: null },
      create: {
        teamId: team.id,
        userId: user.id,
        role: 'owner',
        status: 'active',
        joinedAt: new Date(),
      },
    });
    teams.push({ team, user, persona });
  }
  return teams;
}

async function createRegistrations(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  teams: Awaited<ReturnType<typeof ensureTeamRoster>>,
  status: V1TournamentRegistrationStatus,
  entryFee: number,
) {
  const registrations = [];
  for (const item of teams) {
    const registration = await tx.v1TournamentRegistration.create({
      data: {
        tournamentId,
        teamId: item.team.id,
        appliedByUserId: item.user.id,
        status,
        depositorName: item.persona.realName,
        agreedRules: true,
        agreedPrivacy: true,
        agreedRefund: true,
        agreedMediaConsent: true,
        confirmedAt: status === V1TournamentRegistrationStatus.confirmed ? new Date() : null,
        rosterLockedAt: status === V1TournamentRegistrationStatus.confirmed ? new Date() : null,
      },
    });
    await tx.v1TournamentPlayer.create({
      data: {
        registrationId: registration.id,
        userId: item.user.id,
        realName: item.persona.realName,
        birthDateSnapshot: '1995-05-15',
        genderSnapshot: item.persona.gender,
        eligibilityStatus: 'non_pro',
      },
    });
    if (status === V1TournamentRegistrationStatus.confirmed && entryFee > 0) {
      await tx.v1TournamentPayment.create({
        data: {
          registrationId: registration.id,
          method: 'bank_transfer',
          provider: 'alpha_qa',
          amount: entryFee,
          status: 'paid',
          paidAt: new Date(),
        },
      });
    }
    registrations.push(registration);
  }
  return registrations;
}

export async function createCompetitionData(
  tx: Prisma.TransactionClient,
  scenario: TournamentScenario,
  registrations: Awaited<ReturnType<typeof createRegistrations>>,
  scheduledAt: Date,
) {
  const group = await tx.v1TournamentGroup.create({
    data: {
      tournamentId: scenario.id,
      name: 'A조',
      phase: 'group',
      sortOrder: 0,
      advanceCount: 2,
    },
  });
  for (let index = 0; index < registrations.length; index += 1) {
    await tx.v1TournamentGroupTeam.create({
      data: { groupId: group.id, registrationId: registrations[index].id, sortOrder: index },
    });
    await tx.v1TournamentStanding.create({
      data: {
        groupId: group.id,
        registrationId: registrations[index].id,
        points: scenario.status === V1TournamentStatus.completed
          ? 9 - index * 2
          : scenario.status === V1TournamentStatus.in_progress && index === 0
            ? 3
            : 0,
        wins: scenario.status === V1TournamentStatus.completed
          ? Math.max(0, 3 - index)
          : scenario.status === V1TournamentStatus.in_progress && index === 0
            ? 1
            : 0,
        draws: scenario.status !== V1TournamentStatus.closed && index === 1 ? 1 : 0,
        losses: scenario.status === V1TournamentStatus.completed
          ? index
          : scenario.status === V1TournamentStatus.in_progress && index > 0
            ? 1
            : 0,
        goalsFor: scenario.status === V1TournamentStatus.completed
          ? 8 - index
          : scenario.status === V1TournamentStatus.in_progress
            ? index === 0 ? 3 : 1
            : 0,
        goalsAgainst: scenario.status === V1TournamentStatus.completed
          ? 2 + index
          : scenario.status === V1TournamentStatus.in_progress
            ? index === 0 ? 1 : 3
            : 0,
        position: index + 1,
        recalculatedAt: new Date(),
      },
    });
  }

  const fixtureStatuses =
    scenario.status === V1TournamentStatus.completed
      ? [V1TournamentFixtureStatus.completed, V1TournamentFixtureStatus.completed, V1TournamentFixtureStatus.completed]
      : scenario.status === V1TournamentStatus.in_progress
        ? [V1TournamentFixtureStatus.completed, V1TournamentFixtureStatus.in_progress, V1TournamentFixtureStatus.scheduled]
        : [V1TournamentFixtureStatus.scheduled, V1TournamentFixtureStatus.scheduled, V1TournamentFixtureStatus.scheduled];
  const pairings = [[0, 1], [2, 3], [0, 2]] as const;
  const fixtures = [];
  for (let index = 0; index < pairings.length; index += 1) {
    const [homeIndex, awayIndex] = pairings[index];
    const fixture = await tx.v1TournamentFixture.create({
      data: {
        tournamentId: scenario.id,
        groupId: group.id,
        round: 'group',
        fixtureNumber: index + 1,
        homeRegistrationId: registrations[homeIndex].id,
        awayRegistrationId: registrations[awayIndex].id,
        scheduledAt: new Date(scheduledAt.getTime() + index * 90 * 60 * 1000),
        venue: `서울 송파 풋살파크 ${index + 1}구장`,
        status: fixtureStatuses[index],
      },
    });
    if (fixtureStatuses[index] === V1TournamentFixtureStatus.completed) {
      await tx.v1TournamentFixtureResult.create({
        data: {
          fixtureId: fixture.id,
          homeScore: index === 0 ? 3 : 2,
          awayScore: index === 0 ? 1 : 2,
          note: 'ALPHA QA 경기 결과',
        },
      });
    }
    fixtures.push(fixture);
  }
  if (scenario.status === V1TournamentStatus.completed) {
    const knockoutPlans = [
      { round: 'semi', fixtureNumber: 1, homeIndex: 0, awayIndex: 3, homeScore: 3, awayScore: 0 },
      { round: 'semi', fixtureNumber: 2, homeIndex: 1, awayIndex: 2, homeScore: 2, awayScore: 1 },
      { round: 'final', fixtureNumber: 1, homeIndex: 0, awayIndex: 1, homeScore: 4, awayScore: 2 },
      { round: 'third_place', fixtureNumber: 1, homeIndex: 2, awayIndex: 3, homeScore: 2, awayScore: 1 },
    ] as const;
    for (let index = 0; index < knockoutPlans.length; index += 1) {
      const plan = knockoutPlans[index];
      const fixture = await tx.v1TournamentFixture.create({
        data: {
          tournamentId: scenario.id,
          round: plan.round,
          fixtureNumber: plan.fixtureNumber,
          homeRegistrationId: registrations[plan.homeIndex].id,
          awayRegistrationId: registrations[plan.awayIndex].id,
          scheduledAt: new Date(scheduledAt.getTime() + (pairings.length + index) * 90 * 60 * 1000),
          venue: '서울 송파 풋살파크 결선구장',
          status: V1TournamentFixtureStatus.completed,
        },
      });
      await tx.v1TournamentFixtureResult.create({
        data: {
          fixtureId: fixture.id,
          homeScore: plan.homeScore,
          awayScore: plan.awayScore,
          note: 'ALPHA QA 결선 결과',
        },
      });
      fixtures.push(fixture);
    }
  }
  return fixtures;
}

async function createScenario(
  tx: Prisma.TransactionClient,
  scenario: TournamentScenario,
  sportId: string,
  teams: Awaited<ReturnType<typeof ensureTeamRoster>>,
  adminUserId: string | null,
  now: Date,
) {
  const marketing = scenario.marketing ?? FEATURED_QA_DEFAULT_MARKETING;
  const scheduledAt = scenario.status === V1TournamentStatus.in_progress
    ? new Date(now.getTime() - 60 * 60 * 1000)
    : scenarioDate(now, scenario.startsInDays, 1);
  const scheduledEndAt = new Date(scheduledAt.getTime() + 8 * 60 * 60 * 1000);
  const registrationDeadlineAt =
    scenario.status === V1TournamentStatus.closed ||
    scenario.status === V1TournamentStatus.in_progress ||
    scenario.status === V1TournamentStatus.completed
    ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
    : scenarioDate(now, scenario.startsInDays - 7, 14);
  await tx.v1Tournament.create({
    data: {
      id: scenario.id,
      sportId,
      title: scenario.title,
      status: scenario.status,
      format: 'group_knockout',
      registrationDeadlineAt,
      rosterDeadlineAt: scenarioDate(now, scenario.startsInDays - 3, 14),
      bracketPublishedAt:
        scenario.status === V1TournamentStatus.closed ||
        scenario.status === V1TournamentStatus.in_progress ||
        scenario.status === V1TournamentStatus.completed
          ? registrationDeadlineAt
          : null,
      scheduledAt,
      scheduledEndAt,
      venue: '서울 송파 풋살파크',
      latitude: 37.5145,
      longitude: 127.1066,
      coverImageUrl: COVER_IMAGE_URL,
      teamCount: 4,
      minPlayers: 1,
      maxPlayers: 12,
      genderCategory: 'mixed',
      genderMinMale: 1,
      genderMaxMale: 8,
      genderMinFemale: 1,
      genderMaxFemale: 8,
      entryFee: scenario.entryFee,
      prizePool: 500_000,
      prizeSummary: '우승 30만원 · 준우승 15만원 · MVP 5만원',
      prizeBreakdown: '1위 300000\n2위 150000\nMVP 50000',
      promoHomeEnabled: scenario.hasCampaign,
      promoHomeTitle: scenario.title,
      promoHomeSubtitle: marketing.promoHomeSubtitle,
      promoHomeImageUrl: COVER_IMAGE_URL,
      promoHomeBadgeText: scenario.status,
      promoHomeDateText: scheduledAt.toISOString().slice(0, 10),
      promoHomeTeamsText: '4개 팀',
      promoHomeLocationText: '서울 송파',
      promoHomePrizeText: '총상금 50만원',
      promoHomePriority: scenario.promoPriority,
      promoListEnabled: scenario.hasCampaign,
      promoListTitle: scenario.title,
      promoListSubtitle: '신청부터 결과·영상·시상까지 확인하세요',
      promoListImageUrl: COVER_IMAGE_URL,
      promoListBadgeText: scenario.status,
      promoListDateText: scheduledAt.toISOString().slice(0, 10),
      promoListTeamsText: '4개 팀',
      promoListLocationText: '서울 송파',
      promoListPrizeText: '총상금 50만원',
      promoListPriority: scenario.promoPriority,
      bankName: marketing.bankName,
      bankAccount: marketing.bankAccount,
      bankHolder: marketing.bankHolder,
      rulesText: marketing.rulesText,
      refundPolicyText: marketing.refundPolicyText,
      createdByAdminUserId: adminUserId,
    },
  });
  if (scenario.hasCampaign) {
    await tx.v1TournamentCampaign.create({
      data: {
        tournamentId: scenario.id,
        slug: scenario.slug,
        status: 'published',
        content: buildAlphaTournamentCampaignContent(scenario, scheduledAt, registrationDeadlineAt),
        publishedAt: now,
      },
    });
  }
  await tx.v1TournamentAnnouncement.create({
    data: {
      tournamentId: scenario.id,
      title: marketing.announcementTitle,
      body: scenario.marketing ? marketing.announcementBody : `현재 ${scenario.status} 상태를 검증하는 가상 대회입니다.`,
      category: scenario.status === V1TournamentStatus.completed ? 'results' : 'general',
      audience: 'public',
      publishedAt: now,
    },
  });

  if (scenario.status === V1TournamentStatus.open) {
    await createRegistrations(
      tx,
      scenario.id,
      teams.slice(0, 2),
      V1TournamentRegistrationStatus.submitted,
      scenario.entryFee,
    );
    return;
  }
  if (
    scenario.status !== V1TournamentStatus.closed &&
    scenario.status !== V1TournamentStatus.in_progress &&
    scenario.status !== V1TournamentStatus.completed
  ) {
    return;
  }

  const registrations = await createRegistrations(
    tx,
    scenario.id,
    teams,
    V1TournamentRegistrationStatus.confirmed,
    scenario.entryFee,
  );
  const fixtures = await createCompetitionData(tx, scenario, registrations, scheduledAt);
  if (scenario.status !== V1TournamentStatus.completed) return;
  const finalFixture = fixtures.find((fixture) => fixture.round === 'final');
  if (!finalFixture) throw new Error('Completed alpha tournament requires a final fixture.');

  await tx.v1TournamentFixtureVideo.createMany({
    data: [
      { fixtureId: finalFixture.id, title: '결승 하이라이트', url: HIGHLIGHT_VIDEO_URL, sortOrder: 0 },
      { fixtureId: finalFixture.id, title: '우승 세리머니', url: HIGHLIGHT_VIDEO_URL, sortOrder: 1 },
    ],
  });
  await tx.v1TournamentAward.createMany({
    data: [
      { tournamentId: scenario.id, awardType: 'mvp', awardLabel: 'MVP', recipientName: teams[0].persona.realName, teamName: teams[0].team.name, note: '결승 2골 1도움', sortOrder: 0 },
      { tournamentId: scenario.id, awardType: 'top_scorer', awardLabel: '득점왕', recipientName: teams[2].persona.realName, teamName: teams[2].team.name, note: '대회 6골', sortOrder: 1 },
      { tournamentId: scenario.id, awardType: 'best_keeper', awardLabel: '베스트 골키퍼', recipientName: teams[1].persona.realName, teamName: teams[1].team.name, note: '선방률 82%', sortOrder: 2 },
    ],
  });
  await tx.v1TournamentReview.createMany({
    data: [
      { tournamentId: scenario.id, authorUserId: teams[0].user.id, teamName: teams[0].team.name, rating: 5, comment: '경기 진행과 결과 안내가 명확했어요.', photoUrls: [COVER_IMAGE_URL] },
      { tournamentId: scenario.id, authorUserId: teams[1].user.id, teamName: teams[1].team.name, rating: 4, comment: '영상과 개인 시상까지 남아 다음 대회 준비에 도움이 됐어요.', photoUrls: [TEAM_IMAGE_URL] },
    ],
  });
  await tx.v1TournamentSponsor.create({
    data: {
      tournamentId: scenario.id,
      name: marketing.sponsor.name,
      description: marketing.sponsor.description,
      logoUrl: TEAM_IMAGE_URL,
      benefitText: marketing.sponsor.benefitText,
      eventTitle: marketing.sponsor.eventTitle,
      eventDescription: marketing.sponsor.eventDescription,
      eventResultText: marketing.sponsor.eventResultText,
      sortOrder: 0,
    },
  });
}

async function main() {
  assertAlphaSeedAllowed(process.env);
  const prisma = new PrismaClient();
  try {
    const [sport, region, admin] = await Promise.all([
      prisma.v1Sport.findFirst({ where: { code: 'futsal', isActive: true }, select: { id: true } }),
      prisma.v1Region.findFirst({ where: { code: 'seoul-songpa', isActive: true }, select: { id: true } }),
      prisma.v1AdminUser.findFirst({ where: { status: 'active' }, orderBy: { createdAt: 'asc' }, select: { id: true } }),
    ]);
    if (!sport) throw new Error('Active futsal sport is required for alpha tournament QA data.');
    if (!region) throw new Error('Active seoul-songpa region is required for alpha tournament QA data.');

    const summary = await prisma.$transaction(async (tx) => {
      const tournamentIds = ALPHA_TOURNAMENT_SCENARIOS.map((scenario) => scenario.id);
      await tx.v1TournamentCampaign.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
      await tx.v1Tournament.deleteMany({ where: { id: { in: tournamentIds } } });
      const qaTeams = await ensureTeamRoster(
        tx,
        sport.id,
        region.id,
        PERSONAS,
        TEAMS,
        'ALPHA 대회 전체 플로우 검증용 가상 사용자입니다.',
        'ALPHA 대회 상태·대진·결과 검증용 가상 팀입니다.',
      );
      const featuredTeams = await ensureTeamRoster(
        tx,
        sport.id,
        region.id,
        FEATURED_PERSONAS,
        FEATURED_TEAMS,
        '팀밋 정식 대회에 참가하는 활동 팀 소속 선수입니다.',
        '팀밋 정식 매치·대회에 참가하는 활동 팀입니다.',
      );
      const now = new Date();
      for (const scenario of ALPHA_TOURNAMENT_SCENARIOS) {
        const teams = scenario.marketing ? featuredTeams : qaTeams;
        await createScenario(tx, scenario, sport.id, teams, admin?.id ?? null, now);
      }
      return {
        tournaments: ALPHA_TOURNAMENT_SCENARIOS.length,
        campaigns: ALPHA_TOURNAMENT_SCENARIOS.filter((scenario) => scenario.hasCampaign).length,
        statuses: ALPHA_TOURNAMENT_SCENARIOS.map((scenario) => scenario.status),
        completedIncludes: ['results', 'videos', 'reviews', 'awards'],
      };
    });
    process.stdout.write(`${JSON.stringify({ status: 'ok', ...summary })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
