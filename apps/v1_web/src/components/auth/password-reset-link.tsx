import Link from 'next/link';
import { sanitizeRedirectPath } from '@/lib/session-storage';

/** 인증번호 발송 상한처럼 "이 메일로는 더 못 받는" 막다른 길에서 비밀번호 재설정으로 가는 출구. */
export function PasswordResetLink({ redirect }: { redirect: string | null }) {
  const safe = sanitizeRedirectPath(redirect);
  const href = `/auth/find-account?mode=reset-password${safe ? `&redirect=${encodeURIComponent(safe)}` : ''}`;
  return <Link className="tm-btn tm-btn-sm tm-btn-outline tm-btn-block" href={href}>비밀번호 재설정하기</Link>;
}
