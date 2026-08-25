import { redirect } from 'next/navigation';

/**
 * 콘텐츠 허브 통합(2026-08-25)으로 본문이 /admin/content 의 탭으로 이동했다.
 * 대회 셸의 '홍보 팝업 만들기' 딥링크가 쓰는 ?targetPath= 프리필은 잃지 않고
 * 그대로 넘긴다(안전성 검증은 PopupsView 쪽 isSafePopupTargetPath 가 계속 담당).
 */
export default async function AdminPopupsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const targetPath = typeof params.targetPath === 'string' ? params.targetPath : undefined;
  redirect(
    targetPath
      ? `/admin/content?tab=popups&targetPath=${encodeURIComponent(targetPath)}`
      : '/admin/content?tab=popups',
  );
}
