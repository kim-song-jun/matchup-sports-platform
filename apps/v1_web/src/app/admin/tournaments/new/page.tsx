'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CreateTournamentForm } from './create-tournament-form';

export default function AdminTournamentsNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get('draftId');
  const initialFormat = searchParams.get('format') === 'staged' ? 'staged' : 'group_knockout';

  // draftId 가 붙은 주소는 폼 대신 그 대회 개요로 보내 같은 대회를 또 만들지 않게 한다.
  useEffect(() => {
    if (draftId) router.replace(`/admin/tournaments/${encodeURIComponent(draftId)}/overview`);
  }, [draftId, router]);

  if (draftId) {
    return (
      <p role="status" className="py-8 text-[length:var(--font-size-body-sm)] text-[var(--text-caption)]">
        대회 화면으로 이동하고 있어요.
      </p>
    );
  }
  return <CreateTournamentForm key={initialFormat} initialFormat={initialFormat} />;
}
