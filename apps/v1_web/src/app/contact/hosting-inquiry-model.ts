import type { V1PublicInquiryPayload } from '@/types/api';

export type HostingCategory = V1PublicInquiryPayload['category'];
export type HostingSport = V1PublicInquiryPayload['sportType'];

export type HostingDraft = {
  category: HostingCategory;
  name: string;
  email: string;
  organization: string;
  sportType: HostingSport;
  expectedSchedule: string;
  message: string;
  consent: boolean;
  /** honeypot — 사람에게는 보이지 않는 칸 */
  website: string;
};

export type HostingField = 'name' | 'email' | 'organization' | 'expectedSchedule' | 'message' | 'consent';

export type HostingFieldError = { field: HostingField; message: string };

/** 화면의 입력 순서. 오류 요약과 첫 오류 포커스가 이 순서를 따른다. */
export const HOSTING_FIELD_ORDER: readonly HostingField[] = [
  'name',
  'email',
  'organization',
  'expectedSchedule',
  'message',
  'consent',
];

/** 서버 DTO(apps/v1_api/src/inquiries/dto/public-inquiry.dto.ts)와 같은 상한. */
export const HOSTING_LIMITS = { name: 40, email: 254, organization: 80, expectedSchedule: 80, message: 2000 } as const;

export const HOSTING_CATEGORY_LABEL: Record<HostingCategory, string> = {
  tournament_hosting: '대회 개설',
  partnership: '제휴',
};

export const HOSTING_SPORT_OPTIONS: readonly { value: HostingSport; label: string }[] = [
  { value: '', label: '선택 안 함' },
  { value: 'soccer', label: '축구' },
  { value: 'futsal', label: '풋살' },
  { value: 'other', label: '그 외 종목' },
];

export function emptyHostingDraft(): HostingDraft {
  return {
    category: 'tournament_hosting',
    name: '',
    email: '',
    organization: '',
    sportType: '',
    expectedSchedule: '',
    message: '',
    consent: false,
    website: '',
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD_MESSAGES: Record<HostingField, { required?: string; tooLong?: string; invalid: string }> = {
  name: { required: '담당자 이름을 적어 주세요.', tooLong: '담당자 이름은 40자까지 적을 수 있어요.', invalid: '담당자 이름을 확인해 주세요.' },
  email: { required: '답변 받을 이메일을 적어 주세요.', tooLong: '이메일이 너무 길어요.', invalid: '이메일 형식을 확인해 주세요.' },
  organization: { tooLong: '단체·대회 이름은 80자까지 적을 수 있어요.', invalid: '단체·대회 이름을 확인해 주세요.' },
  expectedSchedule: { tooLong: '희망 시기는 80자까지 적을 수 있어요.', invalid: '희망 시기를 확인해 주세요.' },
  message: { required: '문의 내용을 적어 주세요.', tooLong: '문의 내용은 2,000자까지 적을 수 있어요.', invalid: '문의 내용을 확인해 주세요.' },
  consent: { required: '개인정보 수집·이용에 동의해 주세요.', invalid: '개인정보 수집·이용에 동의해 주세요.' },
};

export function validateHostingDraft(draft: HostingDraft): HostingFieldError[] {
  const errors: HostingFieldError[] = [];
  const text = (field: Exclude<HostingField, 'consent'>, required: boolean) => {
    const value = draft[field].trim();
    const messages = FIELD_MESSAGES[field];
    if (required && !value) errors.push({ field, message: messages.required ?? messages.invalid });
    else if (value.length > HOSTING_LIMITS[field]) errors.push({ field, message: messages.tooLong ?? messages.invalid });
    else if (field === 'email' && value && !EMAIL_PATTERN.test(value)) errors.push({ field, message: messages.invalid });
  };
  text('name', true);
  text('email', true);
  text('organization', false);
  text('expectedSchedule', false);
  text('message', true);
  if (!draft.consent) errors.push({ field: 'consent', message: FIELD_MESSAGES.consent.invalid });
  return errors;
}

/**
 * 서버 400 `VALIDATION_ERROR` 의 필드를 화면 문구로 바꾼다. 서버 메시지는 class-validator 기본(영문)이라
 * 그대로 보여 주지 않는다. 화면에 없는 필드(category·sportType·formStartedAt 등)는 null.
 */
export function serverFieldError(field: string): HostingFieldError | null {
  if (!(HOSTING_FIELD_ORDER as readonly string[]).includes(field)) return null;
  const known = field as HostingField;
  return { field: known, message: FIELD_MESSAGES[known].invalid };
}

export function toHostingPayload(draft: HostingDraft, formStartedAt: number): V1PublicInquiryPayload {
  return {
    category: draft.category,
    name: draft.name.trim(),
    email: draft.email.trim(),
    organization: draft.organization.trim(),
    sportType: draft.sportType,
    expectedSchedule: draft.expectedSchedule.trim(),
    message: draft.message.trim(),
    consent: true,
    website: draft.website,
    formStartedAt,
  };
}
