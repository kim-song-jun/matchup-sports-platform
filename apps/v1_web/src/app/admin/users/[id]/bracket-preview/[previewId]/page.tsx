'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { AdminEmpty, AdminPageHeader, AdminTableSkeleton } from '@/components/admin';
import { v1Get } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { formatAdminDateTime } from '@/lib/date-utils';
import { BracketPageClient } from '@/app/tournaments/[id]/bracket/bracket-page-client';
import { MemberBracketIdentityProvider, type MemberBracketIdentity } from '@/components/tournaments/member-bracket-identity';
import { V1DataSourceProvider } from '@/components/providers/v1-data-source';
import { memberBracketPublicSource } from '@/lib/member-bracket-public-source';

type Preview = MemberBracketIdentity & { tournamentId: string; expiresAt: string; member: { id: string; name: string | null } };
export default function MemberBracketPreviewPage() {
  const { id, previewId } = useParams<{ id: string; previewId: string }>();
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  useEffect(() => () => client.clear(), [client]);
  return <QueryClientProvider client={client}><PreviewContent userId={id} previewId={previewId} /></QueryClientProvider>;
}
function PreviewContent({ userId, previewId }: { userId: string; previewId: string }) {
  const query = useQuery({ queryKey: ['admin-member-bracket', userId, previewId],
    queryFn: () => v1Get<Preview>(`/admin/users/${userId}/bracket-preview/${previewId}`),
    retry: false, staleTime: 0, gcTime: 0, refetchInterval: 30_000 });
  const [expired, setExpired] = useState(false);
  const [navigationNotice, setNavigationNotice] = useState('');
  useEffect(() => {
    if (!query.data) return;
    const remaining = Date.parse(query.data.expiresAt) - Date.now();
    if (remaining <= 0) { setExpired(true); return; }
    const timer = window.setTimeout(() => setExpired(true), remaining);
    return () => window.clearTimeout(timer);
  }, [query.data]);
  const back = <Link className="tm-btn tm-btn-sm tm-btn-neutral" href={`/admin/users/${userId}`}>회원 상세로 돌아가기</Link>;
  if (query.isPending) return <AdminTableSkeleton rows={5} />;
  if (expired || query.isError || !query.data) return <>
    <AdminPageHeader title="회원 대진표 조회" action={back} />
    <AdminEmpty title={expired ? '조회 시간이 끝났어요' : '대진표를 확인할 수 없어요'}
      description={expired ? '회원 상세에서 다시 열어 주세요.' : extractErrorMessage(query.error, '회원 상세에서 다시 시도해 주세요.')} />
  </>;
  const data = query.data;
  return <>
    <AdminPageHeader title="회원 대진표 조회" action={back} />
    <div role="status" className="mb-4 rounded-xl bg-[var(--surface-soft)] p-4">
      <p className="tm-text-label">{data.member.name ?? '선택한 회원'} 기준 · 조회 전용</p>
      <p className="tm-text-caption">{formatAdminDateTime(data.expiresAt)}까지 확인할 수 있어요. 회원의 기기 상태는 재현하지 않아요. 다른 화면은 회원 상세로 돌아가서 열어 주세요.</p>
    </div>
    {navigationNotice ? <p role="alert" className="mb-4 tm-text-label">{navigationNotice}</p> : null}
    <V1DataSourceProvider source={memberBracketPublicSource(data.tournamentId)}>
      <MemberBracketIdentityProvider value={data}>
        <div onClickCapture={event => { if ((event.target as Element).closest('a')) { event.preventDefault(); setNavigationNotice('대진표만 조회할 수 있어요. 다른 화면은 회원 상세로 돌아가서 열어 주세요.'); } }}>
          <BracketPageClient tournamentId={data.tournamentId} />
        </div>
      </MemberBracketIdentityProvider>
    </V1DataSourceProvider>
  </>;
}
