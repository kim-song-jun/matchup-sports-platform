const INTERNAL_COPY_MARKER_PATTERN = /\b(?:v1|api|contract|route|fixture|smoke|coverage|seed)\b|계약/i;
const INTERNAL_COPY_MARKER_REPLACE_PATTERN = /\b(?:v1|api|contract|route|fixture|smoke|coverage|seed)\b|계약/gi;
const MIN_SERVICE_COPY_LENGTH = 6;

type ServiceFacingTeamIntroInput = {
  readonly introduction?: string | null;
  readonly regionName: string;
  readonly sportName: string;
  readonly defaultIntro?: string;
};

export function toServiceFacingTeamIntro({
  introduction,
  regionName,
  sportName,
  defaultIntro,
}: ServiceFacingTeamIntroInput): string {
  const generatedIntro = `${regionName}에서 활동하는 ${sportName} 팀입니다. 가입은 팀 운영 정책에 따라 처리됩니다.`;
  const configuredIntro = normalizeServiceIntro(defaultIntro);
  const serviceIntro = normalizeServiceIntro(introduction);

  return serviceIntro ?? configuredIntro ?? generatedIntro;
}

function normalizeServiceIntro(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const cleaned = trimmed.replace(INTERNAL_COPY_MARKER_REPLACE_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length < MIN_SERVICE_COPY_LENGTH) return undefined;
  if (INTERNAL_COPY_MARKER_PATTERN.test(cleaned)) return undefined;

  return cleaned;
}
