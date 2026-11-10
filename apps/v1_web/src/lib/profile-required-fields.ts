import { normalizeSignupDisplayName } from '@/components/auth/signup-profile-validation';
import type { V1Profile } from '@/types/api';

/** 가입(온보딩)에서 필수로 받는 프로필 정보. 프로필 수정·이메일 변경·사진 변경 화면이 같은 기준으로 비어 있는지 본다. */
export type RequiredProfileField = 'realName' | 'nickname' | 'gender' | 'birthDate' | 'phone';

const LABELS: Record<RequiredProfileField, string> = {
  realName: '이름',
  nickname: '닉네임',
  gender: '성별',
  birthDate: '생년월일',
  phone: '휴대폰 번호',
};

/** 서버가 프로필 저장(`PATCH /me/profile`)을 실제로 거절하는 항목. 이 중 하나라도 비면 저장이 안 되므로 화면에서 먼저 막는다. */
const BLOCKING_FIELDS: readonly RequiredProfileField[] = ['realName', 'nickname', 'gender'];

/** 저장된 프로필에서 비어 있는 필수 정보를 화면에 보이는 순서대로 돌려준다. */
export function getMissingRequiredProfileFields(data: Pick<V1Profile, 'phone' | 'profile'>): RequiredProfileField[] {
  const { profile } = data;
  const missing: RequiredProfileField[] = [];
  if (!normalizeSignupDisplayName(profile.realName ?? '')) missing.push('realName');
  if (!profile.nickname?.trim()) missing.push('nickname');
  if (!profile.gender) missing.push('gender');
  if (!profile.birthDate?.trim()) missing.push('birthDate');
  if (!data.phone?.trim()) missing.push('phone');
  return missing;
}

/** 비어 있는 항목 중 서버가 저장을 거절하는 것이 있는지. */
export function hasBlockingMissingField(missing: readonly RequiredProfileField[]): boolean {
  return missing.some((field) => BLOCKING_FIELDS.includes(field));
}

/** "이름, 생년월일"처럼 안내 문구에 넣을 목록. */
export function formatMissingProfileFields(missing: readonly RequiredProfileField[]): string {
  return missing.map((field) => LABELS[field]).join(', ');
}
