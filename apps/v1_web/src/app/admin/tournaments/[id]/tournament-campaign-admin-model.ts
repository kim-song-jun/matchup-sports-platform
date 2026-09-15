import type {
  V1CreateTournamentCampaignPayload,
  V1TournamentCampaign,
  V1TournamentCampaignContent,
  V1UpdateTournamentCampaignPayload,
} from '@/types/tournament-campaign';

export type CampaignHighlightForm = {
  readonly title: string;
  readonly body: string;
  readonly imageUrl: string;
};

export type CampaignFaqForm = {
  readonly question: string;
  readonly answer: string;
};

export type TournamentCampaignForm = {
  readonly slug: string;
  readonly heroTitle: string;
  readonly heroSummary: string;
  readonly heroImageUrl: string;
  readonly introTitle: string;
  readonly introBody: string;
  readonly highlightsSectionTitle: string;
  readonly highlights: readonly CampaignHighlightForm[];
  readonly faqSectionTitle: string;
  readonly faq: readonly CampaignFaqForm[];
};

export type TournamentCampaignFormErrors = Partial<Record<
  | 'slug'
  | 'heroTitle'
  | 'heroSummary'
  | 'heroImageUrl'
  | 'introTitle'
  | 'introBody'
  | 'highlightsSectionTitle'
  | 'highlights'
  | 'faqSectionTitle'
  | 'faq',
  string
>>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// apps/v1_api/src/tournaments/dto/tournament-campaign.dto.ts 의 PLAIN_TEXT 와 동일한 규칙.
// 서버 400을 제출 전에 필드별로 미리 잡아내기 위해 그대로 복제해 둔다(단일 소스 불가 — 앱 경계).
const PLAIN_TEXT = /^(?=[\s\S]*\S)(?![\s\S]*(?:javascript\s*:|(?:alert|eval|fetch|Function|setTimeout|setInterval)\s*\(|(?:document|window)\s*\.|on[a-z]+\s*=|(?:^|[;\s])(?:color|background(?:-color)?|font(?:-size|-family|-weight)?|display|position|margin|padding|width|height|border|transform|animation|opacity)\s*:))[^<>{}]*$/iu;

const PLAIN_TEXT_ERROR = '<, >, { }, 자바스크립트 코드, "속성명:" 형태의 문구는 사용할 수 없어요.';

export function emptyTournamentCampaignForm(tournamentId: string): TournamentCampaignForm {
  return {
    slug: `campaign-${tournamentId}`,
    heroTitle: '',
    heroSummary: '',
    heroImageUrl: '',
    introTitle: '',
    introBody: '',
    highlightsSectionTitle: '',
    highlights: [],
    faqSectionTitle: '',
    faq: [],
  };
}

export function tournamentCampaignFormFromCampaign(
  campaign: V1TournamentCampaign,
): TournamentCampaignForm {
  return {
    slug: campaign.slug,
    heroTitle: campaign.content.hero.title,
    heroSummary: campaign.content.hero.summary ?? '',
    heroImageUrl: campaign.content.hero.imageUrl ?? '',
    introTitle: campaign.content.intro.title,
    introBody: campaign.content.intro.body,
    highlightsSectionTitle: campaign.content.highlightsSectionTitle,
    highlights: campaign.content.highlights.map((item) => ({
      title: item.title,
      body: item.body,
      imageUrl: item.imageUrl ?? '',
    })),
    faqSectionTitle: campaign.content.faqSectionTitle,
    faq: campaign.content.faq.map((item) => ({
      question: item.question,
      answer: item.answer,
    })),
  };
}

export function validateTournamentCampaignForm(
  form: TournamentCampaignForm,
): TournamentCampaignFormErrors {
  const errors: TournamentCampaignFormErrors = {};
  const slug = form.slug.trim();

  if (!slug) errors.slug = '캠페인 주소를 입력해 주세요.';
  else if (slug.length < 3 || slug.length > 80 || !SLUG.test(slug)) {
    errors.slug = '주소는 3~80자의 영문 소문자, 숫자, 하이픈만 사용할 수 있어요.';
  }

  validateRequired(errors, 'heroTitle', form.heroTitle, 120, '대제목');
  validateOptional(errors, 'heroSummary', form.heroSummary, 300, '서브 내용');
  validateImage(errors, 'heroImageUrl', form.heroImageUrl, '메인 상단 이미지');
  validateRequired(errors, 'introTitle', form.introTitle, 120, '소개 제목');
  validateRequired(errors, 'introBody', form.introBody, 3000, '소개 내용');
  validateRequired(
    errors,
    'highlightsSectionTitle',
    form.highlightsSectionTitle,
    120,
    '참가할 이유',
  );
  validateRequired(errors, 'faqSectionTitle', form.faqSectionTitle, 120, 'FAQ 섹션 제목');

  if (form.highlights.length > 8) {
    errors.highlights = '참가할 이유는 최대 8개까지 추가할 수 있어요.';
  } else if (form.highlights.some((item) => !item.title.trim() || !item.body.trim())) {
    errors.highlights = '각 참가 이유의 제목과 내용을 모두 입력해 주세요.';
  } else if (form.highlights.some((item) => item.title.trim().length > 100 || item.body.trim().length > 500)) {
    errors.highlights = '참가 이유 제목은 100자, 내용은 500자 이하여야 해요.';
  } else if (form.highlights.some((item) => !PLAIN_TEXT.test(item.title.trim()) || !PLAIN_TEXT.test(item.body.trim()))) {
    errors.highlights = `참가 이유: ${PLAIN_TEXT_ERROR}`;
  } else if (form.highlights.some((item) => !isValidImage(item.imageUrl))) {
    errors.highlights = '참가 이유 이미지는 업로드된 이미지여야 해요.';
  }

  if (form.faq.length > 12) {
    errors.faq = 'FAQ는 최대 12개까지 추가할 수 있어요.';
  } else if (form.faq.some((item) => !item.question.trim() || !item.answer.trim())) {
    errors.faq = '각 FAQ의 질문과 답변을 모두 입력해 주세요.';
  } else if (form.faq.some((item) => item.question.trim().length > 200 || item.answer.trim().length > 1000)) {
    errors.faq = 'FAQ 질문은 200자, 답변은 1,000자 이하여야 해요.';
  } else if (form.faq.some((item) => !PLAIN_TEXT.test(item.question.trim()) || !PLAIN_TEXT.test(item.answer.trim()))) {
    errors.faq = `FAQ: ${PLAIN_TEXT_ERROR}`;
  }

  return errors;
}

export function createTournamentCampaignPayload(
  form: TournamentCampaignForm,
): V1CreateTournamentCampaignPayload {
  return { slug: form.slug.trim(), content: campaignContentFromForm(form) };
}

export function updateTournamentCampaignPayload(
  form: TournamentCampaignForm,
  slugLocked: boolean,
): V1UpdateTournamentCampaignPayload {
  return {
    ...(!slugLocked ? { slug: form.slug.trim() } : {}),
    content: campaignContentFromForm(form),
  };
}

function campaignContentFromForm(form: TournamentCampaignForm): V1TournamentCampaignContent {
  const heroSummary = optionalText(form.heroSummary);
  const heroImageUrl = optionalText(form.heroImageUrl);
  return {
    version: 1,
    hero: {
      title: form.heroTitle.trim(),
      ...(heroSummary ? { summary: heroSummary } : {}),
      ...(heroImageUrl ? { imageUrl: heroImageUrl } : {}),
    },
    intro: { title: form.introTitle.trim(), body: form.introBody.trim() },
    highlightsSectionTitle: form.highlightsSectionTitle.trim(),
    highlights: form.highlights.map((item) => {
      const imageUrl = optionalText(item.imageUrl);
      return {
        title: item.title.trim(),
        body: item.body.trim(),
        ...(imageUrl ? { imageUrl } : {}),
      };
    }),
    faqSectionTitle: form.faqSectionTitle.trim(),
    faq: form.faq.map((item) => ({
      question: item.question.trim(),
      answer: item.answer.trim(),
    })),
  };
}

function validateRequired(
  errors: TournamentCampaignFormErrors,
  key: keyof TournamentCampaignFormErrors,
  value: string,
  max: number,
  label: string,
): void {
  const trimmed = value.trim();
  if (!trimmed) errors[key] = `${label}${objectParticle(label)} 입력해 주세요.`;
  else if (trimmed.length > max) errors[key] = `${label}은 ${max.toLocaleString('ko-KR')}자 이하여야 해요.`;
  else if (!PLAIN_TEXT.test(trimmed)) errors[key] = `${label}: ${PLAIN_TEXT_ERROR}`;
}

function objectParticle(label: string): '을' | '를' {
  const lastCodePoint = label.codePointAt(label.length - 1);
  if (lastCodePoint === undefined || lastCodePoint < 0xac00 || lastCodePoint > 0xd7a3) return '을';
  return (lastCodePoint - 0xac00) % 28 === 0 ? '를' : '을';
}

function validateOptional(
  errors: TournamentCampaignFormErrors,
  key: keyof TournamentCampaignFormErrors,
  value: string,
  max: number,
  label: string,
): void {
  const trimmed = value.trim();
  if (trimmed.length > max) errors[key] = `${label}은 ${max}자 이하여야 해요.`;
  else if (trimmed && !PLAIN_TEXT.test(trimmed)) errors[key] = `${label}: ${PLAIN_TEXT_ERROR}`;
}

function validateImage(
  errors: TournamentCampaignFormErrors,
  key: keyof TournamentCampaignFormErrors,
  value: string,
  label: string,
): void {
  if (!isValidImage(value)) errors[key] = `${label}는 HTTPS 주소 또는 /uploads/ 경로여야 해요.`;
}

function isValidImage(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || trimmed.startsWith('https://') || trimmed.startsWith('/uploads/');
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}
