import type { Prisma } from '@prisma/client';

export const MANAGED_SLUG_PREFIX = 'dev-event-';

const SPORT_ASSET_FILES: Readonly<Record<string, string>> = {
  badminton: 'badminton-club.webp',
  basketball: 'basketball-hardwood.webp',
  futsal: 'futsal-rooftop.webp',
  hockey: 'ice-hockey-arena.webp',
  ice_hockey: 'ice-hockey-arena.webp',
};

export const DEFAULT_CAMPAIGN_ASSET_FILE = 'team-huddle.webp';

export type TournamentCampaignSeedInput = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly format: string;
  readonly genderCategory: string | null;
  readonly scheduledAt: Date | null;
  readonly registrationDeadlineAt: Date | null;
  readonly venue: string | null;
  readonly teamCount: number;
  readonly entryFee: number;
  readonly prizeSummary: string | null;
  readonly sport: {
    readonly code: string;
    readonly name: string;
  };
  readonly campaign: {
    readonly slug: string;
    readonly publishedAt: Date | null;
  } | null;
};

export function campaignAssetFile(sportCode: string) {
  return SPORT_ASSET_FILES[sportCode] ?? DEFAULT_CAMPAIGN_ASSET_FILE;
}

export function createManagedCampaignSlug(tournament: TournamentCampaignSeedInput) {
  const date = tournament.scheduledAt
    ? tournament.scheduledAt.toISOString().slice(0, 10).replaceAll('-', '')
    : 'schedule';
  return `${MANAGED_SLUG_PREFIX}${tournament.sport.code}-${date}-${tournament.id.slice(0, 8)}`;
}

export function createCampaignContent(
  tournament: TournamentCampaignSeedInput,
): Prisma.InputJsonObject {
  const scheduledAt = formatDateKst(tournament.scheduledAt);
  const deadline = formatDateKst(tournament.registrationDeadlineAt);
  const venue = tournament.venue ?? '장소 추후 안내';
  const division = genderLabel(tournament.genderCategory, tournament.title);
  const competitionFormat = formatLabel(tournament.format);
  const entryFee = formatWon(tournament.entryFee);
  const prize =
    tournament.prizeSummary ?? '상금과 참가 혜택은 상세 페이지에서 안내합니다.';

  return {
    version: 1,
    hero: {
      title: `${tournament.title}, 여름의 승부가 시작됩니다`,
      summary: `${scheduledAt} · ${venue} · ${tournament.teamCount}개 팀`,
      imageUrl: `/uploads/dev-events/${campaignAssetFile(tournament.sport.code)}`,
    },
    intro: {
      title: `${division} 참가팀을 모집합니다`,
      body: `${withKoreanObjectParticle(tournament.sport.name)} 좋아하는 팀이 한자리에 모이는 팀밋 공식 대회입니다. ${competitionFormat} 방식으로 운영되며, 경기 일정과 참가 현황은 대회 상세에서 실시간으로 확인할 수 있습니다.`,
    },
    highlightsSectionTitle: '이번 대회를 주목해야 하는 이유',
    highlights: [
      {
        title: `${tournament.teamCount}개 팀 집중 운영`,
        body: `대기 시간을 줄이고 각 경기에 집중할 수 있도록 ${tournament.teamCount}개 팀 규모로 운영합니다.`,
      },
      {
        title: `${division} 기준의 명확한 로스터`,
        body: `${division} 참가 기준과 선수 명단 마감 일정을 신청 단계에서 투명하게 안내합니다.`,
      },
      {
        title: prize,
        body: '최종 순위와 개인 시상 결과는 대회 종료 후 팀밋 결과 페이지에 기록됩니다.',
      },
    ],
    faqSectionTitle: '참가 전 확인해 주세요',
    faq: [
      {
        question: '참가 신청은 언제까지 가능한가요?',
        answer: `현재 신청 마감은 ${deadline}입니다. 정원이 먼저 차면 조기 마감될 수 있습니다.`,
      },
      {
        question: '참가비와 장소는 어떻게 되나요?',
        answer: `팀당 참가비는 ${entryFee}이며, 경기는 ${venue}에서 진행됩니다.`,
      },
      {
        question: '대회 방식은 어떻게 진행되나요?',
        answer: `${competitionFormat} 방식입니다. 세부 대진과 현장 일정은 참가 확정 후 공지에서 안내합니다.`,
      },
    ],
  };
}

function formatDateKst(value: Date | null) {
  if (!value) return '일정 협의 중';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}

function formatWon(value: number) {
  return `${new Intl.NumberFormat('ko-KR').format(value)}원`;
}

function formatLabel(format: string) {
  if (format === 'league') return '리그전';
  if (format === 'knockout') return '토너먼트';
  return '조별리그와 토너먼트';
}

function genderLabel(genderCategory: string | null, title: string) {
  if (genderCategory === 'mixed' || title.includes('혼성')) return '혼성부';
  if (genderCategory === 'female' || title.includes('여자')) return '여자부';
  return '남자부';
}

function withKoreanObjectParticle(value: string) {
  const lastCharacter = value.at(-1);
  if (!lastCharacter) return value;

  const codePoint = lastCharacter.charCodeAt(0);
  const isHangulSyllable = codePoint >= 0xac00 && codePoint <= 0xd7a3;
  const hasFinalConsonant = isHangulSyllable && (codePoint - 0xac00) % 28 !== 0;
  return `${value}${hasFinalConsonant ? '을' : '를'}`;
}
