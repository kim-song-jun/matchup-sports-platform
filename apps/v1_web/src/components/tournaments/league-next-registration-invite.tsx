'use client';

import { useEffect, useState } from 'react';
import { ErrorState } from '@/components/v1-ui/primitives';
import Link from 'next/link';
import { BlockedAction } from '@/components/v1-ui/blocked-action';
import { v1Get } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1PublicLeagueDetail } from '@/types/league-match';

type State = { leagueId: string } & (
  | { status: 'loading' }
  | { status: 'success'; data: V1PublicLeagueDetail }
  | { status: 'error'; message: string }
);

/** 모바일 하단과 데스크톱 우측 레일의 다음 리그 참가 안내. */
type InviteProps = { leagueId: string; variant?: 'mobile' | 'sidebar' };

export function LeagueNextRegistrationInvite({ leagueId, variant = 'mobile' }: InviteProps) {
  if (variant === 'sidebar') {
    return <section aria-label="다음 리그 참가 안내" style={{ display: 'grid', gap: 'var(--spacing-2)' }}>
      <h3 className="tm-text-body font-semibold text-[var(--text-strong)]">다음 리그에서 함께 뛰어요</h3>
      <LeagueNextRegistrationInviteContent leagueId={leagueId} variant={variant} />
    </section>;
  }
  return <LeagueNextRegistrationInviteContent leagueId={leagueId} variant={variant} />;
}

function LeagueNextRegistrationInviteContent({ leagueId, variant }: InviteProps) {
  const [state, setState] = useState<State>({ leagueId, status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ leagueId, status: 'loading' });
    v1Get<V1PublicLeagueDetail>(`/league-matches/${encodeURIComponent(leagueId)}`)
      .then((data) => { if (!cancelled) setState({ leagueId, status: 'success', data }); })
      .catch((error: unknown) => {
        if (!cancelled) setState({ leagueId, status: 'error', message: extractErrorMessage(error, '다음 리그 참가 정보를 불러오지 못했어요.') });
      });
    return () => { cancelled = true; };
  }, [leagueId, attempt]);

  if (state.leagueId !== leagueId || state.status === 'loading') {
    return <BlockedAction label="다음 리그 확인 중" reason="참가 신청 정보를 확인하고 있어요." className={variant === 'sidebar' ? 'tm-btn tm-btn-md tm-btn-neutral tm-btn-block' : 'tm-btn tm-btn-lg tm-btn-primary tm-btn-block'} />;
  }
  if (state.status === 'error') {
    return <ErrorState compact message={state.message} onRetry={() => setAttempt((value) => value + 1)} />;
  }
  const nextRound = state.data.nextRound;
  const nextIsOpen = nextRound?.registrationOpen === true;
  const description = nextIsOpen
    ? '다음 리그 참가 신청을 받고 있어요.'
    : nextRound
      ? '다음 리그는 현재 신청을 받지 않아요. 다른 리그를 둘러보세요.'
      : '다른 리그의 참가 일정도 확인해 보세요.';
  const href = nextIsOpen ? `/tournaments/${nextRound.leagueId}/apply` : '/tournaments?kind=league';
  if (variant === 'sidebar') {
    return <div style={{ display: 'grid', gap: 'var(--spacing-2)' }}>
      <p className="tm-text-caption text-[var(--text-muted)]" style={{ margin: 0 }}>{description}</p>
      <Link href={href} className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block">
        {nextIsOpen ? '다음 리그 참가 신청' : '다른 리그 둘러보기'}
      </Link>
    </div>;
  }
  return <div style={{ display: 'grid', gap: 'var(--spacing-2)' }}>
    <Link
      href={href}
      className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
      style={{ fontSize: 'var(--font-size-body-lg)' }}
    >
      다음 리그에서 함께 뛰어요
    </Link>
    <p className="tm-text-caption" style={{ margin: 0, color: 'var(--text-muted)', textAlign: 'center' }}>
      {description}
    </p>
  </div>;
}
