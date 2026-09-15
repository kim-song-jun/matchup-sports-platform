import { redirect } from 'next/navigation';

/**
 * 콘텐츠 허브 통합(2026-08-25)으로 본문이 /admin/content 의 탭으로 이동했다.
 * 북마크·딥링크가 죽지 않도록 구 URL 은 리다이렉트로 보존한다.
 */
export default function AdminTermsRedirect() {
  redirect('/admin/content?tab=terms');
}
