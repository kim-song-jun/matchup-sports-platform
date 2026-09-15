import { redirect } from 'next/navigation';

/**
 * 대시보드 통합(B안, 2026-08-25)으로 할 일 인박스가 /admin 최상단 섹션으로 이동했다.
 * 북마크·딥링크가 죽지 않도록 구 URL 은 리다이렉트로 보존한다.
 */
export default function AdminHubRedirect() {
  redirect('/admin');
}
