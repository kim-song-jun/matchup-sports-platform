'use client';

import { useEffect, useState } from 'react';
import { ErrorState } from '@/components/v1-ui/primitives';
import Link from 'next/link';
import { BlockedAction } from '@/components/v1-ui/blocked-action';
import { v1Get } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1LeagueNextRound, V1LeagueNextSeasonTier, V1PublicLeagueDetail } from '@/types/league-match';

/**
 * 다음 리그 안내가 어디로 보내는지. 다음 시즌이 신청을 받으면 신청 화면(재참가 팀이면 그 팀이 골라진 채 — `?team=`),
 * 다음 시즌은 있는데 신청을 안 받으면 그 리그 상세, 다음 시즌이 없으면 리그 목록이다.
 */
export function nextLeagueInviteAction(nextRound: V1LeagueNextRound | null, returningTeamId: string | null) {
  if (nextRound?.registrationOpen === true) {
    return returningTeamId !== null
      ? {
          href: `/tournaments/${nextRound.leagueId}/apply?team=${encodeURIComponent(returningTeamId)}`,
          label: '다음 시즌 재참가 신청',
          description: '지난 시즌에 함께한 팀이라 바로 재참가 신청할 수 있어요. 지난 시즌 명단도 옮겨 와요.',
        }
      : { href: `/tournaments/${nextRound.leagueId}/apply`, label: '다음 리그 참가 신청', description: '다음 리그 참가 신청을 받고 있어요.' };
  }
  if (nextRound) {
    return {
      href: `/tournaments/${nextRound.leagueId}`,
      label: '다음 시즌 보기',
      description: returningTeamId !== null ? '다음 시즌 신청이 열리면 알려 드릴게요.' : '다음 리그는 아직 신청을 받지 않아요.',
    };
  }
  return { href: '/tournaments?kind=league', label: '다른 리그 둘러보기', description: '다른 리그의 참가 일정도 확인해 보세요.' };
}

/**
 * 리그 체계로 전환한 리그의 다음 시즌 입구. 티어마다 리그가 따로라, 보는 사람의 팀이 편성된 티어로 보내고
 * 편성된 팀이 없으면 첫 티어로 보낸다. 재참가 신청은 없다 — 전환이 팀과 명단을 이미 넣었다.
 */
export function convertedSeasonInviteAction(tiers: readonly V1LeagueNextSeasonTier[], myTeamIds: readonly string[]) {
  const mine = tiers.find((tier) => tier.teamIds.some((teamId) => myTeamIds.includes(teamId)));
  const target = mine ?? tiers[0];
  return {
    href: `/tournaments/${target.leagueId}`,
    label: '다음 시즌 보기',
    description: mine ? `우리 팀은 "${mine.title}"에 편성됐어요.` : '리그 체계 첫 시즌이 시작돼요.',
  };
}

type State = { leagueId: string } & (
  | { status: 'loading' }
  | { status: 'success'; data: V1PublicLeagueDetail }
  | { status: 'error'; message: string }
);

/**
 * 모바일 하단과 데스크톱 우측 레일의 다음 리그 참가 안내.
 * `returningTeamId` — 이 리그에서 참가 확정됐던 내 팀(팀장·매니저). 다음 시즌이 신청을 받으면 그 팀이 골라진 신청 화면으로
 * 보내는 '다음 시즌 재참가 신청'이 된다(독립 리그 → 독립 리그, 2026-11-03 사용자 선택).
 */
type InviteProps = {
  leagueId: string;
  variant?: 'mobile' | 'sidebar';
  returningTeamId?: string | null;
  /** 이 리그에 확정됐던 내 팀 전부(팀원 포함) — 체계로 전환한 리그에서 내 팀의 티어를 찾는다. */
  myTeamIds?: readonly string[];
};

export function LeagueNextRegistrationInvite({ leagueId, variant = 'mobile', returningTeamId = null, myTeamIds = [] }: InviteProps) {
  if (variant === 'sidebar') {
    return <section aria-label="다음 리그 참가 안내" style={{ display: 'grid', gap: 'var(--spacing-2)' }}>
      <h3 className="tm-text-body font-semibold text-[var(--text-strong)]">다음 리그에서 함께 뛰어요</h3>
      <LeagueNextRegistrationInviteContent leagueId={leagueId} variant={variant} returningTeamId={returningTeamId} myTeamIds={myTeamIds} />
    </section>;
  }
  return <LeagueNextRegistrationInviteContent leagueId={leagueId} variant={variant} returningTeamId={returningTeamId} myTeamIds={myTeamIds} />;
}

function LeagueNextRegistrationInviteContent({ leagueId, variant, returningTeamId = null, myTeamIds = [] }: InviteProps) {
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
  const tiers = state.data.nextSeasonTiers ?? [];
  const nextRound = state.data.nextRound ?? null;
  const { href, label, description } = nextRound === null && tiers.length > 0
    ? convertedSeasonInviteAction(tiers, myTeamIds)
    : nextLeagueInviteAction(nextRound, returningTeamId);
  if (variant === 'sidebar') {
    return <div style={{ display: 'grid', gap: 'var(--spacing-2)' }}>
      <p className="tm-text-caption text-[var(--text-muted)]" style={{ margin: 0 }}>{description}</p>
      <Link href={href} className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block">
        {label}
      </Link>
    </div>;
  }
  return <div style={{ display: 'grid', gap: 'var(--spacing-2)' }}>
    <Link
      href={href}
      className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
      style={{ fontSize: 'var(--font-size-body-lg)' }}
    >
      {(returningTeamId !== null && nextRound?.registrationOpen === true) || (nextRound === null && tiers.length > 0) ? label : '다음 리그에서 함께 뛰어요'}
    </Link>
    <p className="tm-text-caption" style={{ margin: 0, color: 'var(--text-muted)', textAlign: 'center' }}>
      {description}
    </p>
  </div>;
}
