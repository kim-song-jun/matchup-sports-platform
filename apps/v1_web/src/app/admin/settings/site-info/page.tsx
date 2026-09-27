import { redirect } from 'next/navigation';

/** 설정 허브(/admin/settings)의 탭 본문이다. 이 주소는 공유·북마크용 딥링크로 남긴다. */
export default function AdminSiteInfoSettingsRedirect() {
  redirect('/admin/settings?tab=site-info');
}
