import { redirect } from 'next/navigation';
import { adminLiveBase, legacyResultsRedirectHref } from '@/lib/tournament-live-routes';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** 결과 검토·결과 정정은 「결과」 한 화면으로 합쳐졌다 — 옛 주소는 쿼리를 보존해 그리로 보낸다. */
export default async function AdminResultReviewRedirectPage({ params, searchParams }: Props) {
  const { id } = await params;
  redirect(legacyResultsRedirectHref(adminLiveBase(id), await searchParams));
}
