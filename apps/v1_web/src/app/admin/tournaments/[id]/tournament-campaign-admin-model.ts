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

export function emptyTournamentCampaignForm(): TournamentCampaignForm {
  return {
    slug: '',
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

  validateRequired(errors, 'heroTitle', form.heroTitle, 120, '히어로 제목');
  validateOptional(errors, 'heroSummary', form.heroSummary, 300, '히어로 요약');
  validateImage(errors, 'heroImageUrl', form.heroImageUrl, '히어로 이미지');
  validateRequired(errors, 'introTitle', form.introTitle, 120, '소개 제목');
  validateRequired(errors, 'introBody', form.introBody, 3000, '소개 내용');
  validateRequired(
    errors,
    'highlightsSectionTitle',
    form.highlightsSectionTitle,
    120,
    '하이라이트 섹션 제목',
  );
  validateRequired(errors, 'faqSectionTitle', form.faqSectionTitle, 120, 'FAQ 섹션 제목');

  if (form.highlights.length > 8) {
    errors.highlights = '하이라이트는 최대 8개까지 추가할 수 있어요.';
  } else if (form.highlights.some((item) => !item.title.trim() || !item.body.trim())) {
    errors.highlights = '각 하이라이트의 제목과 내용을 모두 입력해 주세요.';
  } else if (form.highlights.some((item) => item.title.trim().length > 100 || item.body.trim().length > 500)) {
    errors.highlights = '하이라이트 제목은 100자, 내용은 500자 이하여야 해요.';
  } else if (form.highlights.some((item) => !isValidImage(item.imageUrl))) {
    errors.highlights = '하이라이트 이미지는 HTTPS 주소 또는 /uploads/ 경로여야 해요.';
  }

  if (form.faq.length > 12) {
    errors.faq = 'FAQ는 최대 12개까지 추가할 수 있어요.';
  } else if (form.faq.some((item) => !item.question.trim() || !item.answer.trim())) {
    errors.faq = '각 FAQ의 질문과 답변을 모두 입력해 주세요.';
  } else if (form.faq.some((item) => item.question.trim().length > 200 || item.answer.trim().length > 1000)) {
    errors.faq = 'FAQ 질문은 200자, 답변은 1,000자 이하여야 해요.';
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
  if (!trimmed) errors[key] = `${label}을 입력해 주세요.`;
  else if (trimmed.length > max) errors[key] = `${label}은 ${max.toLocaleString('ko-KR')}자 이하여야 해요.`;
}

function validateOptional(
  errors: TournamentCampaignFormErrors,
  key: keyof TournamentCampaignFormErrors,
  value: string,
  max: number,
  label: string,
): void {
  if (value.trim().length > max) errors[key] = `${label}은 ${max}자 이하여야 해요.`;
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
