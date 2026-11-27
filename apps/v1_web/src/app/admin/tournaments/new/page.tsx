'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CreateTournamentForm } from './create-tournament-form';

export default function AdminTournamentsNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get('draftId');
  const initialFormat = searchParams.get('format') === 'staged' ? 'staged' : 'group_knockout';

  // 예전 마법사가 초안을 만든 뒤 남기던 주소 — 새로고침해도 중복 생성하지 않고 그 대회로 보낸다.
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
